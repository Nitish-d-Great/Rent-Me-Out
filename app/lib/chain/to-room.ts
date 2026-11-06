import type { Room, RoomState } from "@/lib/data";
import type { RoomRecord } from "./registry";

/**
 * Maps a registry listing onto the shape the existing UI renders.
 *
 * Pure and framework-free, so the server pages and the client hook present a listing
 * identically -- a room must not look different depending on where it was read.
 */

const TINTS = ["tint-a", "tint-b", "tint-c"];

export function recordToRoom(r: RoomRecord, index = 0): Room {
  // "none" means the listing does not exist; everything else maps straight through.
  // Cancelled is kept distinct from expired: both burn the token, but a registrar
  // needs to tell "withdrawn before sale" from "period ran out".
  const state: RoomState =
    r.state === "held" ||
    r.state === "frozen" ||
    r.state === "expired" ||
    r.state === "cancelled"
      ? (r.state as RoomState)
      : "available";

  return {
    id: r.listingId,
    tokenId: shortAddress(r.token),
    tokenAddress: r.token,
    payout: r.payout,
    name: `Room ${r.listingId}`,
    note: r.city ? `Registrar-approved room in ${r.city}` : "on-chain listing",
    city: r.city,
    arkivKey: r.arkivKey,
    transactionId: r.purchaseTx,
    price: Number(r.price),
    state,
    holder: r.holder ?? undefined,
    holderName: r.holder ? "Verified broker" : undefined,
    // A hash of the World ID identity, never a raw nullifier.
    holderNullifier: r.holderIdentity
      ? `0x${BigInt(r.holderIdentity).toString(16).slice(0, 12)}…`
      : undefined,
    // formatDate() appends "T00:00:00Z", so it needs a bare YYYY-MM-DD.
    validFrom: r.start.slice(0, 10),
    validUntil: r.end.slice(0, 10),
    tint: TINTS[index % TINTS.length],
  };
}

/** 0x1234…abcd — the short form the UI uses. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
