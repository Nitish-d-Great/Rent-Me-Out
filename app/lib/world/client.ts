"use client";

import { IDKit, CredentialRequest, any as anyOf } from "@worldcoin/idkit-core";
import {
  WORLD_ACTIONS,
  WORLD_ENVIRONMENT,
  actionName,
  type RpContext,
  type WorldAction,
} from "./config";
import type { SignedChallenge } from "./challenge";

/**
 * Browser-side IDKit flows. Nothing here touches a secret: the RP signature is minted
 * server-side per request, and every proof is posted to our backend for verification.
 * A client-side "success" authorises nothing.
 */

const POLL_TIMEOUT_MS = 120_000;

/**
 * Dev-only: have the World ID Simulator complete the request, so enrollment works in
 * the browser with no phone. The server route is guarded on NODE_ENV as well as this
 * flag, so a stray NEXT_PUBLIC value cannot switch it on in production -- it 404s.
 */
const DEV_SIMULATOR = process.env.NEXT_PUBLIC_WORLD_DEV_SIMULATOR === "1";

/**
 * True when the simulator completes requests server-side. The UI must say so: in this
 * mode the connector QR is inert -- the proof arrives without anyone scanning anything,
 * and presenting a scannable code would misrepresent what is happening.
 */
export const isDevSimulator = () => DEV_SIMULATOR;


/**
 * Proof of Human preferred, Selfie Check accepted.
 *
 * The SDK exposes `any()`, which the prose docs never mention: it requests the first
 * credential the user can satisfy. That gives us exactly the proportionality the IDKit
 * bounty asks for without forcing a single choice —
 *
 *   - a user who has been to an Orb proves personhood at the highest assurance;
 *   - a user who has not still enrolls via Selfie Check rather than being turned away.
 *
 * It also covers the bounty's "unavailable credential" alternative path for free: an
 * unavailable PoH degrades instead of failing.
 *
 * The backend learns which credential was actually used from the response item's
 * `identifier`, so the assurance level is never assumed.
 */
const CREDENTIAL = () =>
  DEV_SIMULATOR
    // The World ID Simulator accepts only a plain Proof of Human uniqueness request --
    // it answers `proof_of_human_required` to a constraint tree. Same credential we
    // prefer in production, just without the fallback branch it cannot exercise.
    ? CredentialRequest("proof_of_human")
    : anyOf(CredentialRequest("proof_of_human"), CredentialRequest("selfie"));

/**
 * Fire-and-forget. The connector URI goes to our own server, which forwards it to the
 * simulator; it never reaches a third party from the browser, and it is never logged,
 * because it carries the bridge encryption key.
 *
 * Deliberately not awaited before polling begins: the simulator completes the request
 * out-of-band and `pollUntilCompletion` is what observes the result. A failure here is
 * swallowed -- it just means the proof never arrives and the poll times out, which is
 * the same path a user who walks away produces.
 */
async function completeViaSimulator(connectUrl: string): Promise<void> {
  let verdict: { ok?: boolean; detail?: string } = {};
  try {
    const res = await fetch("/api/dev/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connect_url: connectUrl }),
    });
    verdict = await res.json();
  } catch {
    throw new WorldError("network");
  }
  // The simulator reports failures with error_delivered: false -- it never tells the
  // bridge, so pollUntilCompletion would hang until its timeout. Fail loudly instead.
  if (!verdict.ok) {
    console.error("[dev simulator] request not completed:", verdict.detail);
    throw new WorldError("verification_failed");
  }
}

/** Where the broker's own session handle lives. Never sent to another user. */
const SESSION_STORAGE_KEY = "rmo.world.session";

export function storedSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

function storeSessionId(sessionId: string) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

export function clearSessionId() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Fresh per request -- the docs require a new RP signature for session creation and
 * each subsequent check, and the default TTL is 300s.
 */
function appId(): `app_${string}` {
  const value = process.env.NEXT_PUBLIC_WORLD_APP_ID;
  if (!value?.startsWith("app_")) {
    throw new WorldError("network");
  }
  return value as `app_${string}`;
}

async function rpContext(action?: WorldAction): Promise<RpContext> {
  const res = await fetch("/api/world/rp-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action ? { action } : {}),
  });
  if (!res.ok) throw new Error("Could not start verification");
  return (await res.json()) as RpContext;
}

export type EnrollFailure =
  | "cancelled"
  | "idkit_failed"
  | "identity_already_linked"
  | "wallet_already_bound"
  | "verification_failed"
  | "server_error"
  | "network";

export class WorldError extends Error {
  constructor(
    readonly kind: EnrollFailure,
    /** IDKit's own error code, when the SDK gave us one. */
    readonly code?: string,
  ) {
    super(code ? `${kind}: ${code}` : kind);
  }
}

/**
 * Enrollment for `owner-verify` or `broker-verify`.
 *
 * `session_id: "create"` mints the broker's session in the same request, so one
 * verification yields both uniqueness and the continuity handle used at viewings.
 */
export async function enroll(
  action: WorldAction,
  wallet: string,
  /**
   * Called with IDKit's connector URI as soon as the request exists. Render it as a
   * QR so the World App can scan it -- without this there is nothing for a real
   * device to connect to. Render only: never log it or show it as text, it carries
   * the bridge encryption key.
   */
  onConnectorUri?: (uri: string) => void,
  /** Called once the proof is in hand and we are about to ask our own server. */
  onProofReceived?: () => void,
): Promise<{ sessionId: string | null }> {
  const sentAction = actionName(action);
  const context = await rpContext(sentAction as WorldAction);

  let result: unknown;
  try {
    const request = await IDKit.request({
      app_id: appId(),
      action: sentAction,
      rp_context: context,
      // Required to be false when minting a session -- the SDK enforces this.
      allow_legacy_proofs: false,
      session_id: "create",
      environment: WORLD_ENVIRONMENT,
    }).constraints(CREDENTIAL());

    onConnectorUri?.(request.connectorURI);

    if (DEV_SIMULATOR) await completeViaSimulator(request.connectorURI);

    const completion = await request.pollUntilCompletion({
      timeout: POLL_TIMEOUT_MS,
    });
    // pollUntilCompletion never throws -- it returns a discriminated union. The error
    // code matters: a user dismissing the sheet and the credential being refused both
    // arrive as success: false, and telling the user "cancelled" when their phone said
    // "Failed" sends them looking in the wrong place.
    if (!completion.success) {
      const code = String(completion.error ?? "unknown");
      console.error("[world] IDKit did not complete:", code);
      throw new WorldError(
        code.includes("cancel") || code.includes("dismiss") ? "cancelled" : "idkit_failed",
        code,
      );
    }
    onProofReceived?.();
    result = completion.result;
  } catch (error) {
    if (error instanceof WorldError) throw error;
    console.error("[world] enrollment threw:", error);
    throw new WorldError("idkit_failed", String(error));
  }

  const res = await fetch("/api/world/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: sentAction, wallet, result }),
  });

  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new WorldError(
      body.error === "wallet_already_bound" ? "wallet_already_bound" : "identity_already_linked",
    );
  }
  // Distinguish "World rejected your proof" from "our backend broke". Collapsing them
  // makes a server fault look like a failed verification, which is exactly backwards:
  // the proof may have been perfectly good.
  if (res.status >= 500) throw new WorldError("server_error");
  if (!res.ok) throw new WorldError("verification_failed");

  const sessionId = (result as { session_id?: string }).session_id ?? null;
  if (sessionId) storeSessionId(sessionId);

  return { sessionId };
}

/** Tenant side: open a viewing check. Returns the signed, stateless challenge. */
export async function startViewingCheck(roomId: string): Promise<SignedChallenge> {
  const res = await fetch(`/api/presence/${encodeURIComponent(roomId)}/start`, {
    method: "POST",
  });
  if (!res.ok) throw new WorldError("network");
  return res.json();
}

export interface PresenceOutcome {
  match: boolean;
  reason?: string;
  /** Server-signed. Shown to the tenant, who has the server check it. */
  receipt?: string;
}

export interface TenantResult {
  match: boolean;
  reason?: string;
  checkedAt?: number;
}

/**
 * Broker side: prove the saved session against a tenant's challenge.
 *
 * Runs on the BROKER's device, because that is where the session handle lives. The
 * session ID is never exposed to the tenant: anyone holding it may be able to submit it.
 */
export async function provePresence(
  roomId: string,
  challenge: SignedChallenge,
): Promise<PresenceOutcome> {
  const sessionId = storedSessionId();
  if (!sessionId?.startsWith("session_")) {
    return { match: false, reason: "no_session_on_this_device" };
  }


  const context = await rpContext();

  let result: unknown;
  try {
    const request = await IDKit.proveSession(sessionId as `session_${string}`, {
      app_id: appId(),
      rp_context: context,
      environment: WORLD_ENVIRONMENT,
    }).constraints(CREDENTIAL());

    if (DEV_SIMULATOR) await completeViaSimulator(request.connectorURI);

    const completion = await request.pollUntilCompletion({
      timeout: POLL_TIMEOUT_MS,
    });
    if (!completion.success) return { match: false, reason: "cancelled" };
    result = completion.result;
  } catch {
    return { match: false, reason: "cancelled" };
  }

  const res = await fetch(
    `/api/presence/${encodeURIComponent(roomId)}/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, result }),
    },
  );

  if (!res.ok && res.status !== 200) {
    return { match: false, reason: "network" };
  }
  return res.json();
}

/**
 * Tenant side: hand the receipt read off the broker's phone to the server, along with
 * the nonce this page issued, and get the verdict.
 *
 * The tenant's browser cannot check the MAC itself -- that needs the server secret --
 * which is precisely why the broker cannot forge a receipt. A receipt that fails to
 * verify, or no receipt at all, is a red: absence of proof is never a pass.
 */
export async function submitReceipt(
  roomId: string,
  receipt: string,
  nonce: string,
): Promise<TenantResult> {
  const res = await fetch(
    `/api/presence/${encodeURIComponent(roomId)}/receipt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt, nonce }),
    },
  );
  if (!res.ok && res.status !== 200) {
    return { match: false, reason: "network" };
  }
  return res.json();
}

export { WORLD_ACTIONS };

/* -------------------------------------------------------------------------- */
/* Dev diagnostics                                                             */
/* -------------------------------------------------------------------------- */

export interface ProbeOutcome {
  ok: boolean;
  detail: string;
  credential?: string;
  sessionCreated?: boolean;
}

/**
 * DEV ONLY. Runs an IDKit request with one variable changed and reports what happened,
 * without touching our backend or the chain.
 *
 * Exists because IDKit answers a refused request with `generic_error` and nothing else,
 * so the only way to find the cause is to change one input at a time and see which
 * combination the World App accepts.
 */
export async function probeEnroll(opts: {
  action: string;
  createSession: boolean;
  onConnectorUri?: (uri: string) => void;
}): Promise<ProbeOutcome> {
  const context = await rpContext(opts.action as WorldAction);

  try {
    const request = await IDKit.request({
      app_id: appId(),
      action: opts.action,
      rp_context: context,
      allow_legacy_proofs: false,
      ...(opts.createSession ? { session_id: "create" as const } : {}),
      environment: WORLD_ENVIRONMENT,
    }).constraints(CREDENTIAL());

    opts.onConnectorUri?.(request.connectorURI);

    const completion = await request.pollUntilCompletion({ timeout: POLL_TIMEOUT_MS });
    if (!completion.success) {
      return { ok: false, detail: String(completion.error ?? "unknown") };
    }
    const r = completion.result as { session_id?: string; responses?: Array<{ identifier?: string }> };
    return {
      ok: true,
      detail: "proof received",
      credential: r.responses?.map((x) => x.identifier).join(",") ?? "unknown",
      sessionCreated: Boolean(r.session_id),
    };
  } catch (error) {
    return { ok: false, detail: String(error) };
  }
}
