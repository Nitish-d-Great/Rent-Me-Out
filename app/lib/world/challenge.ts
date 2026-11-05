import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stateless viewing challenges.
 *
 * `architecture.md:293` requires the presence proof to be bound to a challenge nonce
 * with a short expiry. Rather than persist challenges, we sign them: the payload
 * carries its own expiry and the MAC makes it unforgeable, so verification needs no
 * storage. That keeps the private-state surface at "environment variables only".
 *
 * The nonce travels to World as part of `rp_context`, and comes back on the verify
 * response, which is how a proof gets tied to one specific viewing.
 */

const TTL_SECONDS = 300; // matches World's default RP signature TTL

export interface Challenge {
  roomId: string;
  nonce: string;
  expiresAt: number;
}

export interface SignedChallenge extends Challenge {
  mac: string;
}

function macOf(secret: string, c: Challenge): string {
  return createHmac("sha256", secret)
    .update(`${c.roomId}|${c.nonce}|${c.expiresAt}`)
    .digest("hex");
}

export function issueChallenge(secret: string, roomId: string): SignedChallenge {
  const challenge: Challenge = {
    roomId,
    nonce: `0x${randomBytes(32).toString("hex")}`,
    expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  return { ...challenge, mac: macOf(secret, challenge) };
}

export type ChallengeFailure = "bad-mac" | "expired" | "room-mismatch";

export function verifyChallenge(
  secret: string,
  signed: SignedChallenge,
  expectedRoomId: string,
): { ok: true } | { ok: false; reason: ChallengeFailure } {
  const expected = Buffer.from(macOf(secret, signed), "hex");
  const actual = Buffer.from(signed.mac, "hex");

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "bad-mac" };
  }
  if (signed.roomId !== expectedRoomId) {
    return { ok: false, reason: "room-mismatch" };
  }
  if (signed.expiresAt < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}
