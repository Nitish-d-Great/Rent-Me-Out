"use client";

import { IDKit, CredentialRequest, any as anyOf } from "@worldcoin/idkit-core";
import {
  WORLD_ACTIONS,
  WORLD_ENVIRONMENT,
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
  anyOf(CredentialRequest("proof_of_human"), CredentialRequest("selfie"));

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
  | "identity_already_linked"
  | "verification_failed"
  | "network";

export class WorldError extends Error {
  constructor(readonly kind: EnrollFailure) {
    super(kind);
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
): Promise<{ sessionId: string | null }> {
  const context = await rpContext(action);

  let result: unknown;
  try {
    const request = await IDKit.request({
      app_id: appId(),
      action,
      rp_context: context,
      // Required to be false when minting a session -- the SDK enforces this.
      allow_legacy_proofs: false,
      session_id: "create",
      environment: WORLD_ENVIRONMENT,
    }).constraints(CREDENTIAL());

    const completion = await request.pollUntilCompletion({
      timeout: POLL_TIMEOUT_MS,
    });
    // pollUntilCompletion never throws -- it returns a discriminated union, so a
    // cancelled or timed-out flow arrives here as success: false.
    if (!completion.success) throw new WorldError("cancelled");
    result = completion.result;
  } catch (error) {
    if (error instanceof WorldError) throw error;
    throw new WorldError("cancelled");
  }

  const res = await fetch("/api/world/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, wallet, result }),
  });

  if (res.status === 409) throw new WorldError("identity_already_linked");
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
