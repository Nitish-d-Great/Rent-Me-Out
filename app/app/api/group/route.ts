import { NextResponse } from "next/server";
import { readGroup } from "@/lib/chain/group";
import { publicClient, registryAddress, REGISTRY_ABI } from "@/lib/chain/registry";

/**
 * The approved-property set, so an owner's browser can rebuild the Merkle tree and
 * prove membership locally. Membership is public on-chain; only the owner's secret is
 * private, and that never leaves their device.
 */
export async function GET() {
  try {
    const group = await readGroup();
    const [root] = await publicClient().readContract({
      address: registryAddress(), abi: REGISTRY_ABI, functionName: "approvedRoot",
    });
    return NextResponse.json(
      { members: group.members, rootVersion: group.rootVersion, root: root.toString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[group] read failed:", error);
    return NextResponse.json({ error: "group_unavailable" }, { status: 502 });
  }
}
