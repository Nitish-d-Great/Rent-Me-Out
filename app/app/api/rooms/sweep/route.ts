import { NextResponse } from "next/server";
import { expireListings } from "@/lib/chain/registry-write";
import { readAllRooms } from "@/lib/chain/registry";

/**
 * Expires every listing whose period has ended.
 *
 * This is the keeper job the design calls for: step 36 of flow.md planned a Hedera
 * Scheduled Transaction per listing, but a sweep is simpler and needs no scheduling
 * window. expireMany skips entries that are not due, so calling this is always safe.
 *
 * Returns which listings were due rather than claiming work it did not do.
 */
export async function POST() {
  try {
    const rooms = await readAllRooms();
    const now = Date.now();

    // Only Available or Sold listings can expire; the registry reports both as a
    // state that is not already expired or cancelled.
    const due = rooms.filter(
      (room) =>
        new Date(room.end).getTime() <= now &&
        room.state !== "expired" &&
        room.state !== "cancelled",
    );

    if (due.length === 0) {
      return NextResponse.json({ ok: true, expired: [], note: "nothing due" });
    }

    const hash = await expireListings(due.map((room) => BigInt(room.listingId)));
    return NextResponse.json({
      ok: true,
      expired: due.map((room) => room.listingId),
      transactionHash: hash,
      explorer: `https://hashscan.io/testnet/transaction/${hash}`,
    });
  } catch (error) {
    console.error("[sweep] failed:", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 502 });
  }
}
