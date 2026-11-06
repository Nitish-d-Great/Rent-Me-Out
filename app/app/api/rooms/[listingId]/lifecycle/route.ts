import { NextResponse } from "next/server";
import { cancelListing, expireListing } from "@/lib/chain/registry-write";
import { readRoom } from "@/lib/chain/registry";
import { syncListing } from "@/lib/arkiv/sync";
import { isRegistrar } from "@/lib/registrar-auth";

/**
 * Cancel an unsold listing, or expire one whose period has ended.
 *
 * Both burn the room token. Cancelling is the owner withdrawing before a sale;
 * expiring is the period simply running out.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ listingId: string }> },
) {
  if (!isRegistrar(request)) {
    return NextResponse.json({ error: "registrar_only" }, { status: 401 });
  }
  const { listingId: raw } = await context.params;

  let listingId: bigint;
  try {
    listingId = BigInt(raw);
  } catch {
    return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  }

  let action = "expire";
  try {
    const body = (await request.json()) as { action?: string };
    action = body.action === "cancel" ? "cancel" : "expire";
  } catch {
    // An empty body means expire, the harmless default.
  }

  try {
    const hash =
      action === "cancel"
        ? await cancelListing(listingId)
        : await expireListing(listingId);

    await syncListing(listingId).catch((error) => console.error("[lifecycle] not indexed:", error));
    const room = await readRoom(listingId);
    return NextResponse.json({
      ok: true,
      action,
      listingId: raw,
      transactionHash: hash,
      explorer: `https://hashscan.io/testnet/transaction/${hash}`,
      state: room?.state ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[lifecycle] ${action} listing ${raw} failed:`, message);

    if (message.includes("NotYetExpired")) {
      return NextResponse.json({ error: "not_yet_expired" }, { status: 409 });
    }
    if (message.includes("NothingToExpire")) {
      return NextResponse.json({ error: "nothing_to_expire" }, { status: 409 });
    }
    if (message.includes("NotAvailable")) {
      // Cancelling is only possible before a sale.
      return NextResponse.json({ error: "already_sold" }, { status: 409 });
    }
    if (message.includes("NotListingOwnerOrRegistrar")) {
      return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    }
    if (message.includes("NoSuchListing")) {
      return NextResponse.json({ error: "no_such_listing" }, { status: 404 });
    }
    return NextResponse.json({ error: `${action}_failed` }, { status: 502 });
  }
}
