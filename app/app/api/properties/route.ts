import { NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { approveProperty, rejectProperty } from "@/lib/chain/registry-write";
import { readGroup } from "@/lib/chain/group";
import {
  addApplication, getApplication, listApplications, settleApplication,
} from "@/lib/chain/applications";

/**
 * Registrar decisions on property applications, written to Hedera.
 *
 * Approving adds the owner's Semaphore commitment to the approved set; the owner can
 * then prove membership when listing a room without revealing which property is theirs.
 */
/** Pending and decided applications, for the registrar console. */
export async function GET() {
  return NextResponse.json(
    { applications: listApplications() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: { action?: string; applicationId?: string; commitment?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.action === "apply") {
    const commitment = body.commitment?.trim();
    const applicationId = body.applicationId?.trim();
    if (!applicationId || !commitment || !/^\d+$/.test(commitment)) {
      return NextResponse.json({ error: "invalid_application" }, { status: 400 });
    }
    try {
      const record = addApplication({
        applicationId,
        commitment,
        nickname: (body as { nickname?: string }).nickname ?? "Untitled property",
        locality: (body as { locality?: string }).locality ?? "",
        city: (body as { city?: string }).city ?? "",
        rooms: Number((body as { rooms?: number }).rooms ?? 1),
      });
      return NextResponse.json({ ok: true, application: record });
    } catch {
      return NextResponse.json({ error: "duplicate_application" }, { status: 409 });
    }
  }

  const applicationId = body.applicationId?.trim();
  if (!applicationId) {
    return NextResponse.json({ error: "application_id_required" }, { status: 400 });
  }
  // Accept either a bytes32 or a human reference, hashing the latter.
  const appId = /^0x[0-9a-fA-F]{64}$/.test(applicationId)
    ? (applicationId as `0x${string}`)
    : keccak256(toBytes(applicationId));

  try {
    if (body.action === "reject") {
      const reason = (body.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json({ error: "reason_required" }, { status: 400 });
      }
      const hash = await rejectProperty(appId, reason);
      settleApplication(applicationId, "rejected", hash, reason);
      return NextResponse.json({
        ok: true, action: "reject", applicationId: appId, transactionHash: hash,
        explorer: `https://hashscan.io/testnet/transaction/${hash}`,
      });
    }

    const stored = getApplication(applicationId);
    const commitment = (body.commitment ?? stored?.commitment ?? "").trim();
    if (!commitment || !/^\d+$/.test(commitment)) {
      // Without the owner's commitment there is nothing to admit to the group.
      return NextResponse.json({ error: "commitment_required" }, { status: 400 });
    }

    const hash = await approveProperty(appId, BigInt(commitment));
    settleApplication(applicationId, "approved", hash);
    const group = await readGroup();
    return NextResponse.json({
      ok: true, action: "approve", applicationId: appId, transactionHash: hash,
      explorer: `https://hashscan.io/testnet/transaction/${hash}`,
      members: group.members.length, rootVersion: group.rootVersion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[properties] decision failed:", message);
    if (message.includes("NotRegistrar")) {
      return NextResponse.json({ error: "not_registrar" }, { status: 403 });
    }
    if (message.includes("LeafAlreadyExists")) {
      return NextResponse.json({ error: "already_approved" }, { status: 409 });
    }
    return NextResponse.json({ error: "decision_failed" }, { status: 502 });
  }
}
