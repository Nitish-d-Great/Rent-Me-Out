"use client";

import { IDKit, CredentialRequest } from "@worldcoin/idkit-core";
import { WORLD_ACTIONS, WORLD_ENVIRONMENT, type WorldAction } from "./config";
import type { SignedChallenge } from "./challenge";

/**
 * Browser-side IDKit flows. Nothing here touches a secret: the RP signature is minted
 * server-side per request, and every proof is posted to our backend for verification.
 * A client-side "success" authorises nothing.
 */

const POLL_TIMEOUT_MS = 120_000;

/**
 * The credential, isolated so it is swappable.
 *
 * Production intent is Proof of Human for both enrollment moments. We ship Selfie Check
 * because PoH requires a physical Orb visit. See the trust-moments table in README.
 *
 * NOTE, and this is narrower than "one line": for OWNER enrollment the swap really is
 * one call — `.preset(proofOfHuman())` instead of `.constraints(...)`. For BROKER
 * enrollment it is not, because the broker needs a session for repeated viewing checks
 * and **session support for PoH is undocumented**. Until World documents it, broker
 * enrollment is pinned to Selfie Check regardless of Orb access.
 */
const CREDENTIAL = () => CredentialRequest("selfie");

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

async function rpContext(action?: WorldAction) {
  const res = await fetch("/api/world/rp-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action ? { action } : {}),
  });
  if (!res.ok) throw new Error("Could not start verification");
  return res.json();
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
  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;
  if (!appId) throw new WorldError("network");

  const context = await rpContext(action);

  let result: unknown;
  try {
    const request = await IDKit.request({
      app_id: appId,
      action,
      rp_context: context,
      allow_legacy_proofs: false,
      session_id: "create",
      environment: WORLD_ENVIRONMENT,
    }).constraints(CREDENTIAL());

    const completion = await request.pollUntilCompletion({
      timeout: POLL_TIMEOUT_MS,
    });
    result = completion.result;
  } catch {
    // User dismissed the World App, or the poll timed out. Not an error state --
    // the bounty asks for cancellation to be a handled path.
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
  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID;
  const sessionId = storedSessionId();

  if (!appId) throw new WorldError("network");
  if (!sessionId) return { match: false, reason: "no_session_on_this_device" };


  const context = await rpContext();

  let result: unknown;
  try {
    const request = await IDKit.proveSession(sessionId, {
      app_id: appId,
      rp_context: context,
      environment: WORLD_ENVIRONMENT,
    }).constraints(CREDENTIAL());

    const completion = await request.pollUntilCompletion({
      timeout: POLL_TIMEOUT_MS,
    });
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
