import { NextResponse } from "next/server";
import { readAllRooms, readRootVersion } from "@/lib/chain/registry";

/**
 * Every room the registry knows about, read live from Hedera.
 *
 * Public and unauthenticated by design: anyone can check rights without an account,
 * which is the point of the product.
 */
export async function GET() {
  try {
    const [rooms, rootVersion] = await Promise.all([readAllRooms(), readRootVersion()]);
    return NextResponse.json(
      { rooms, rootVersion, source: "hedera-testnet" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[rooms] registry read failed:", error);
    return NextResponse.json({ error: "registry_unavailable" }, { status: 502 });
  }
}
