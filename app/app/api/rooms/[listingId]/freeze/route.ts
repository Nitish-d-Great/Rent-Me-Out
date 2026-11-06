import { NextResponse } from "next/server";
import { freezeRoom, unfreezeRoom } from "@/lib/chain/registry-write";
import { readRoom } from "@/lib/chain/registry";
import { syncListing } from "@/lib/arkiv/sync";
import { isRegistrar } from "@/lib/registrar-auth";

/**
 * Freeze or unfreeze a room, signed by the registrar.
 *
 * The caller supplies a reason; only its hash goes on-chain. The response carries the
 * transaction hash so the console can link to HashScan rather than asserting success.
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

  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action === "unfreeze" ? "unfreeze" : "freeze";
  const reason = (body.reason ?? "").trim();
  if (!reason) {
    // The contract takes any bytes32, but an unexplained freeze is not reviewable.
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  try {
    const result =
      action === "freeze"
        ? await freezeRoom(listingId, reason)
        : await unfreezeRoom(listingId, reason);

    // The freeze is final on Hedera, so a failed index update must not report it as failed.
    await syncListing(listingId).catch((error) => console.error("[freeze] not indexed:", error));
    const room = await readRoom(listingId);
    return NextResponse.json({
      ok: true,
      action,
      listingId: raw,
      transactionHash: result.hash,
      reasonHash: result.reasonHash,
      explorer: `https://hashscan.io/testnet/transaction/${result.hash}`,
      state: room?.state ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[freeze] ${action} listing ${raw} failed:`, message);

    // Map the contract's own errors onto something the console can show verbatim.
    if (message.includes("AlreadyFrozen")) {
      return NextResponse.json({ error: "already_frozen" }, { status: 409 });
    }
    if (message.includes("NotFrozen")) {
      return NextResponse.json({ error: "not_frozen" }, { status: 409 });
    }
    if (message.includes("NotRegistrar")) {
      return NextResponse.json({ error: "not_registrar" }, { status: 403 });
    }
    if (message.includes("NoSuchListing")) {
      return NextResponse.json({ error: "no_such_listing" }, { status: 404 });
    }
    return NextResponse.json({ error: "freeze_failed" }, { status: 502 });
  }
}
