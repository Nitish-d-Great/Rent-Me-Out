import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { BROKER_IDENTITY_ABI, brokerIdentityAddress, publicClient } from "@/lib/world/chain";

/**
 * Whether a wallet is already enrolled, read from the identity registry.
 *
 * World ID allows one verification per person per action, so making someone re-verify
 * on every page load would fail for a real user the second time.
 */
export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }
  try {
    // The registry's identity is a hash of the action and nullifier, so it is safe to show.
    const identity = await publicClient().readContract({
      address: brokerIdentityAddress(),
      abi: BROKER_IDENTITY_ABI,
      functionName: "identityOf",
      args: [wallet],
    });
    return NextResponse.json(
      { verified: identity !== 0n, identity: identity === 0n ? null : `0x${identity.toString(16)}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[world/status] read failed:", error);
    return NextResponse.json({ error: "registry_unavailable" }, { status: 502 });
  }
}
