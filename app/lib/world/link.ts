import type { SignedChallenge } from "./challenge";

/**
 * Transport encoding for the two QR hops. Pure string work -- no secrets and no
 * `node:crypto`, so this is safe in a client bundle (`challenge.ts` is not).
 *
 * Neither payload is confidential. The challenge is unforgeable without the server
 * secret, and the receipt is signed with it, so both can travel in the clear.
 */

function b64urlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeChallenge(challenge: SignedChallenge): string {
  return b64urlEncode(JSON.stringify(challenge));
}

export function decodeChallenge(encoded: string): SignedChallenge | null {
  try {
    const parsed = JSON.parse(b64urlDecode(encoded)) as SignedChallenge;
    if (
      typeof parsed?.roomId !== "string" ||
      typeof parsed?.nonce !== "string" ||
      typeof parsed?.mac !== "string" ||
      typeof parsed?.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** The URL a tenant's QR points at. Scanning it with a phone camera opens the page. */
export function brokerPresenceUrl(challenge: SignedChallenge, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/broker/presence?c=${encodeChallenge(challenge)}`;
}
