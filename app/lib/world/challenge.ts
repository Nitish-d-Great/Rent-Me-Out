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

/* -------------------------------------------------------------------------- */
/* Signed receipts                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The presence check is inherently two-device: the broker's session handle lives on the
 * broker's phone (the tenant must never see it), but the tenant's phone is the screen
 * that has to show green or red. A broker simply showing their own screen is spoofable,
 * which would defeat the point.
 *
 * So the server signs the outcome. The broker's phone carries an opaque receipt to the
 * tenant's phone, and the tenant's page has the server check it. The broker cannot forge
 * one without the secret, and cannot replay an older genuine one because the receipt is
 * bound to the nonce the tenant just issued.
 *
 * Still no stored state: the server recomputes the MAC rather than remembering anything.
 */

const RECEIPT_TTL_SECONDS = 120;
/** 128 bits is ample and keeps the QR small. */
const MAC_HEX_LEN = 32;

export interface Receipt {
  roomId: string;
  nonce: string;
  match: boolean;
  reason?: string;
  issuedAt: number;
}

function receiptMac(secret: string, payload: string): string {
  return createHmac("sha256", secret)
    .update(`receipt|${payload}`)
    .digest("hex")
    .slice(0, MAC_HEX_LEN);
}

/** Compact, URL-safe, QR-friendly: `rmo1.<base64url(json)>.<mac>` */
export function issueReceipt(secret: string, receipt: Receipt): string {
  const payload = Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
  return `rmo1.${payload}.${receiptMac(secret, payload)}`;
}

export type ReceiptFailure =
  | "malformed"
  | "bad-mac"
  | "expired"
  | "room-mismatch"
  | "nonce-mismatch";

/**
 * Verified against the nonce the TENANT issued, so a receipt from an earlier viewing
 * cannot be presented at this one.
 */
export function verifyReceipt(
  secret: string,
  token: string,
  expectedRoomId: string,
  expectedNonce: string,
): { ok: true; receipt: Receipt } | { ok: false; reason: ReceiptFailure } {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "rmo1") {
    return { ok: false, reason: "malformed" };
  }
  const [, payload, mac] = parts;

  const expected = Buffer.from(receiptMac(secret, payload), "hex");
  const actual = Buffer.from(mac, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "bad-mac" };
  }

  let receipt: Receipt;
  try {
    receipt = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Receipt;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (receipt.roomId !== expectedRoomId) return { ok: false, reason: "room-mismatch" };
  if (receipt.nonce !== expectedNonce) return { ok: false, reason: "nonce-mismatch" };
  if (receipt.issuedAt + RECEIPT_TTL_SECONDS < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, receipt };
}
