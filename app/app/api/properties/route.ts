import { NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { approveProperty, rejectProperty } from "@/lib/chain/registry-write";
import { readGroup } from "@/lib/chain/group";
import {
  addApplication, getApplication, listApplications, listApplicationsOfOwner, settleApplication,
} from "@/lib/chain/applications";
import { isRegistrar } from "@/lib/registrar-auth";

/** LeafAlreadyExists() from the approved-set tree. Not in our ABI, so it arrives undecoded. */
const LEAF_ALREADY_EXISTS = "0x258a195a";

/** A base64 PDF of this size stays under the 4.5 MB request limit on Vercel. */
const MAX_DEED_BYTES = 3 * 1024 * 1024;

/**
 * Property applications, and the registrar's decisions on them.
 *
 * Status lives on Arkiv and the details are encrypted on Swarm. Decrypted details go
 * only to the registrar, or to an owner who presents their own commitment. Approving
 * adds that commitment to the approved set on Hedera, so the owner can later prove
 * membership when listing a room without revealing which property is theirs.
 */
export async function GET(request: Request) {
  const commitment = new URL(request.url).searchParams.get("commitment")?.trim();
  try {
    if (commitment) {
      if (!/^\d+$/.test(commitment)) {
        return NextResponse.json({ error: "invalid_commitment" }, { status: 400 });
      }
      return NextResponse.json(
        { applications: await listApplicationsOfOwner(commitment) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!isRegistrar(request)) {
      return NextResponse.json({ error: "registrar_only" }, { status: 401 });
    }
    return NextResponse.json(await listApplications(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[properties] read failed:", error);
    return NextResponse.json({ error: "applications_unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  let body: {
    action?: string; applicationId?: string; commitment?: string; reason?: string;
    locationReviewConfirmed?: boolean;
    nickname?: string; locality?: string; city?: string; rooms?: number;
    latitudeE6?: number; longitudeE6?: number;
    deedName?: string; deedBase64?: string;
  };
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
    if (
      !Number.isInteger(body.latitudeE6) || !Number.isInteger(body.longitudeE6) ||
      body.latitudeE6! < -90_000_000 || body.latitudeE6! > 90_000_000 ||
      body.longitudeE6! < -180_000_000 || body.longitudeE6! > 180_000_000
    ) {
      return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
    }
    const deed = Buffer.from(body.deedBase64 ?? "", "base64");
    if (deed.length === 0) {
      return NextResponse.json({ error: "deed_required" }, { status: 400 });
    }
    if (deed.length > MAX_DEED_BYTES) {
      return NextResponse.json({ error: "deed_too_large" }, { status: 413 });
    }
    try {
      const record = await addApplication({
        applicationId,
        commitment,
        nickname: body.nickname?.trim() || "Untitled property",
        locality: body.locality?.trim() ?? "",
        city: body.city?.trim() ?? "",
        latitudeE6: body.latitudeE6!,
        longitudeE6: body.longitudeE6!,
        rooms: Math.max(1, Math.min(20, Math.floor(Number(body.rooms ?? 1)))),
        deedName: body.deedName?.trim() || "deed.pdf",
        deed,
      });
      return NextResponse.json({ ok: true, application: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("duplicate_application")) {
        return NextResponse.json({ error: "duplicate_application" }, { status: 409 });
      }
      console.error("[properties] apply failed:", message);
      return NextResponse.json({ error: "application_not_stored" }, { status: 502 });
    }
  }

  // Every other action spends the registrar key.
  if (!isRegistrar(request)) {
    return NextResponse.json({ error: "registrar_only" }, { status: 401 });
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
      const indexed = await recordDecision(applicationId, "rejected", hash, reason);
      return NextResponse.json({
        ok: true, action: "reject", applicationId: appId, transactionHash: hash, indexed,
        explorer: `https://hashscan.io/testnet/transaction/${hash}`,
      });
    }

    const stored = await getApplication(applicationId);
    if (!Number.isInteger(stored?.latitudeE6) || !Number.isInteger(stored?.longitudeE6)) {
      return NextResponse.json({ error: "location_required" }, { status: 400 });
    }
    if (body.locationReviewConfirmed !== true) {
      return NextResponse.json({ error: "location_review_required" }, { status: 400 });
    }
    const commitment = (body.commitment ?? stored?.commitment ?? "").trim();
    if (!commitment || !/^\d+$/.test(commitment)) {
      // Without the owner's commitment there is nothing to admit to the group.
      return NextResponse.json({ error: "commitment_required" }, { status: 400 });
    }

    const hash = await approveProperty(appId, BigInt(commitment));
    const indexed = await recordDecision(applicationId, "approved", hash);
    const group = await readGroup();
    return NextResponse.json({
      ok: true, action: "approve", applicationId: appId, transactionHash: hash, indexed,
      explorer: `https://hashscan.io/testnet/transaction/${hash}`,
      members: group.members.length, rootVersion: group.rootVersion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[properties] decision failed:", message);
    if (message.includes("NotRegistrar")) {
      return NextResponse.json({ error: "not_registrar" }, { status: 403 });
    }
    // The commitment is already approved on-chain, typically because an earlier attempt
    // landed but never reached Arkiv. The goal is met, so finish recording it.
    if (message.includes("LeafAlreadyExists") || message.includes(LEAF_ALREADY_EXISTS)) {
      const indexed = await recordDecision(applicationId, "approved", "");
      return NextResponse.json({ ok: true, action: "approve", applicationId: appId, indexed, alreadyOnChain: true });
    }
    return NextResponse.json({ error: "decision_failed" }, { status: 502 });
  }
}

/**
 * The chain has already decided by the time this runs, so a failure here must not read
 * as a failed decision. The caller reports it as not indexed.
 */
async function recordDecision(
  applicationId: string,
  status: "approved" | "rejected",
  hash: string,
  reason?: string,
): Promise<boolean> {
  try {
    await settleApplication(applicationId, status, hash, reason);
    return true;
  } catch (error) {
    console.error("[properties] decision not indexed on Arkiv:", error);
    return false;
  }
}
