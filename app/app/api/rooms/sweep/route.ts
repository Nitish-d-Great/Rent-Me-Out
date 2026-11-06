import { NextResponse } from "next/server";
import { expireListings } from "@/lib/chain/registry-write";
import { hasLiveToken, readAllRooms } from "@/lib/chain/registry";

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

    // room.state cannot be used here: it reads "expired" as soon as the period ends,
    // whether or not the token has been burned, which would make every room look done.
    const ended = rooms.filter(
      (room) => new Date(room.end).getTime() <= now && room.state !== "cancelled",
    );
    const live = await Promise.all(
      ended.map((room) => hasLiveToken(BigInt(room.listingId))),
    );
    const due = ended.filter((_, index) => live[index]);

    if (due.length === 0) {
      return NextResponse.json({ ok: true, expired: [], note: "nothing due" });
    }

    // Nothing to sync: the Arkiv entities expired on their own when the period ended.
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
