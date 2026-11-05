import { VERIFY_BASE_URL, serverConfig, type WorldEnvironment } from "./config";

/**
 * Server-side World ID 4.0 proof verification.
 *
 * There is no `verifyCloudProof` helper in the 4.x packages -- you call the REST
 * endpoint yourself. The IDKit result is forwarded **as-is** ("No field remapping is
 * required"), with `environment` set explicitly.
 *
 * Two flows:
 *   - uniqueness, at enrollment: carries `action` and a `nullifier` per response
 *   - session, at each viewing:  carries `session_id`, no `action`, and a
 *     `session_nullifier` tuple per response
 */

interface ResponseItemBase {
  identifier: string;
  issuer_schema_id: number;
  expires_at_min: number;
  proof: string[];
  signal_hash?: string;
  sybil_score?: number;
}

export interface UniquenessResult {
  protocol_version: "4.0";
  nonce: string;
  action: string;
  environment?: WorldEnvironment;
  session_id?: string;
  integrity_bundle?: unknown;
  responses: Array<ResponseItemBase & { nullifier: string }>;
}

export interface SessionResult {
  protocol_version: "4.0";
  nonce: string;
  session_id: string;
  environment?: WorldEnvironment;
  integrity_bundle?: unknown;
  /** Tuple [nullifier, action]. Replay protection ONLY -- never an account id. */
  responses: Array<ResponseItemBase & { session_nullifier: [string, string] }>;
}

interface VerifySuccess {
  success: true;
  results: Array<{ identifier: string; success: boolean; code?: string; detail?: string }>;
  action?: string;
  nullifier?: string;
  session_id?: string;
  environment?: WorldEnvironment;
  created_at?: string;
}

interface VerifyError {
  success: false;
  code: string;
  detail: string;
  results?: Array<{ identifier: string; success: boolean; code?: string; detail?: string }>;
}

export type VerifyOutcome =
  | { ok: true; response: VerifySuccess }
  | { ok: false; code: string; detail: string };

async function post(body: unknown): Promise<VerifyOutcome> {
  const { rpId, environment } = serverConfig();

  // Check the environment the client claims before spending a network call: a
  // staging proof must never be accepted by a production deployment.
  const claimed = (body as { environment?: WorldEnvironment }).environment;
  if (claimed !== environment) {
    return {
      ok: false,
      code: "environment_mismatch",
      detail: `Expected environment ${environment}, got ${claimed ?? "none"}`,
    };
  }

  const res = await fetch(`${VERIFY_BASE_URL}/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json()) as VerifySuccess | VerifyError;

  if (!res.ok || json.success !== true) {
    const err = json as VerifyError;
    return {
      ok: false,
      code: err.code ?? `http_${res.status}`,
      detail: err.detail ?? "Verification failed",
    };
  }

  // And again on the way out -- the response echoes the environment it verified in.
  if (json.environment && json.environment !== environment) {
    return {
      ok: false,
      code: "environment_mismatch",
      detail: `Response environment ${json.environment} does not match ${environment}`,
    };
  }

  return { ok: true, response: json };
}

/**
 * Enrollment. Pass `sessionIdMode: "create"` to mint a broker session in the same
 * request, so one verification yields both uniqueness and continuity.
 *
 * NOTE: a successful response does NOT mean the identity is new. World confirms the
 * proof is cryptographically valid; rejecting an already-seen nullifier is our job.
 * See bindings via `contracts/IdentityBinding.sol`.
 */
export async function verifyUniqueness(
  result: UniquenessResult,
  expectedAction: string,
): Promise<VerifyOutcome> {
  if (result.action !== expectedAction) {
    return {
      ok: false,
      code: "action_mismatch",
      detail: `Expected action ${expectedAction}, got ${result.action}`,
    };
  }
  const { environment } = serverConfig();
  return post({ ...result, environment });
}

/**
 * Presence at a viewing. The caller must already have checked the stateless
 * challenge, and must afterwards confirm that `session_id` matches the session bound
 * to the room's current holder on-chain.
 */
export async function verifySessionProof(
  result: SessionResult,
  expectedSessionId: string,
): Promise<VerifyOutcome> {
  if (!result.session_id || result.session_id !== expectedSessionId) {
    return {
      ok: false,
      code: "session_mismatch",
      detail: "Proof was not issued against this account's session",
    };
  }
  const { environment } = serverConfig();
  return post({ ...result, environment });
}

/** Per-proof replay values. Reject any you have accepted before. */
export function replayValues(result: SessionResult): string[] {
  return result.responses.map((r) => r.session_nullifier.join(":"));
}
