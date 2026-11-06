import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { brokerAllowlist } from "@/lib/world";

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
    const verified = await brokerAllowlist.isAllowed(wallet);
    return NextResponse.json({ verified }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[world/status] read failed:", error);
    return NextResponse.json({ error: "registry_unavailable" }, { status: 502 });
  }
}
