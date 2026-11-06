import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { readPurchases } from "@/lib/chain/purchases";

/**
 * Purchase history, read from the registry's event log.
 * Pass ?broker=0x… to filter; omit it for every purchase.
 */
export async function GET(request: Request) {
  const broker = new URL(request.url).searchParams.get("broker");
  if (broker && !isAddress(broker)) {
    return NextResponse.json({ error: "invalid_broker" }, { status: 400 });
  }

  try {
    const purchases = await readPurchases(
      broker ? (broker as `0x${string}`) : undefined,
    );
    return NextResponse.json(
      { purchases },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[purchases] read failed:", error);
    return NextResponse.json({ error: "registry_unavailable" }, { status: 502 });
  }
}
