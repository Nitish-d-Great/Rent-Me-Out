/**
 * World ID 4.0 configuration. Server-only values must never be imported into a
 * client component -- nothing in this file is safe to ship to the browser except
 * `WORLD_ACTIONS` and `WORLD_ENVIRONMENT`.
 */

/**
 * Two actions, not three.
 *
 * World ID 4.0 enforces one nullifier per person per action, and there is no
 * "allow repeat verifications" setting. A broker proving presence at every
 * viewing is a *returning user*, which World handles with session proofs
 * (`IDKit.proveSession`) rather than a repeated action. So there is no
 * `broker-presence` action -- presence reuses the session created during
 * `broker-verify`.
 */
export const WORLD_ACTIONS = {
  ownerVerify: "owner-verify",
  brokerVerify: "broker-verify",
} as const;

export type WorldAction = (typeof WORLD_ACTIONS)[keyof typeof WORLD_ACTIONS];

/** `staging` is what the World ID Simulator issues against. */
export type WorldEnvironment = "production" | "staging" | "sandbox";

export const WORLD_ENVIRONMENT: WorldEnvironment =
  (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT as WorldEnvironment) ?? "staging";

/**
 * The full rp_context the client sends to IDKit. Assembled server-side and returned
 * whole by /api/world/rp-context, so the client cannot mis-name a field -- note it is
 * `signature`, not `sig`, which is what signRequest() returns.
 */
export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: string;
  expires_at: string;
  signature: string;
}

/** Selfie Check. Requires `integrity_bundle` in the verify body. */
export const ISSUER_SCHEMA_SELFIE = 11;
/** Proof of Human. */
export const ISSUER_SCHEMA_PROOF_OF_HUMAN = 1;

export const VERIFY_BASE_URL = "https://developer.world.org";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Server-only. Throws if called in a browser bundle. */
export function serverConfig() {
  if (typeof window !== "undefined") {
    throw new Error("world/config: serverConfig() must not be called in the browser");
  }
  return {
    /** RP ID (`rp_...`). `app_...` is accepted for backward compatibility. */
    rpId: required("WORLD_RP_ID"),
    appId: required("WORLD_APP_ID"),
    /** Used by signRequest. Never expose; never sign on the client. */
    signingKeyHex: required("WORLD_SIGNING_KEY_HEX"),
    /** Secret for stateless viewing-challenge MACs. */
    challengeSecret: required("PRESENCE_CHALLENGE_SECRET"),
    environment: WORLD_ENVIRONMENT,
  };
}
