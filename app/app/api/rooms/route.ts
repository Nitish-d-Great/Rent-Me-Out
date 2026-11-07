import { NextResponse } from "next/server";
import { readRoomIndex } from "@/lib/arkiv/listings";
import { readAllConfiguredRooms, readRootVersion } from "@/lib/chain/registry";

/**
 * Every room the registry knows about, read live from Hedera.
 *
 * Public and unauthenticated by design: anyone can check rights without an account,
 * which is the point of the product.
 */
export async function GET() {
  try {
    const [chainRooms, rootVersion, index] = await Promise.all([
      readAllConfiguredRooms(),
      readRootVersion(),
      // Rights come from Hedera, so an Arkiv outage only loses the city and record links.
      readRoomIndex().catch((error) => {
        console.error("[rooms] Arkiv index unavailable:", error);
        return null;
      }),
    ]);
    const rooms = chainRooms.map((room) => {
      const entry = room.legacyRegistry ? undefined : index?.get(room.listingNumber);
      return {
        ...room,
        city: entry?.city,
        label: entry?.label,
        purchaseTx: entry?.purchaseTx,
        arkivKey: entry?.rightsKey ?? entry?.listingKey,
      };
    });
    return NextResponse.json(
      { rooms, rootVersion, source: "hedera-testnet", indexed: index !== null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[rooms] registry read failed:", error);
    return NextResponse.json({ error: "registry_unavailable" }, { status: 502 });
  }
}
