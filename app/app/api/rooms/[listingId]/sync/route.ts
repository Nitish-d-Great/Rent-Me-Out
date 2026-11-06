import { NextResponse } from "next/server";
import { syncListing } from "@/lib/arkiv/sync";

/**
 * Brings a room's Arkiv records up to date with Hedera.
 *
 * Open to anyone, because it only copies what the chain already says. The caller can
 * trigger it but cannot influence what gets written. A purchase is signed in the broker's
 * wallet, so the server hears about it from this call.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ listingId: string }> },
) {
  const { listingId: raw } = await context.params;
  if (!/^\d+$/.test(raw)) {
    return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  }
  try {
    const result = await syncListing(BigInt(raw));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[sync] failed:", error);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
