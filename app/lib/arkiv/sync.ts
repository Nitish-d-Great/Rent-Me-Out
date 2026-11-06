import "server-only";
import { readPurchaseOf } from "@/lib/chain/purchases";
import { invalidateRooms, readRoom } from "@/lib/chain/registry";
import { indexRights, setListingStatus, type ListingStatus } from "./listings";

/**
 * Copies a room's state from Hedera to Arkiv. Every value written is read from the chain
 * here, so this is safe to run at any time and for any caller.
 *
 * An ended room is left alone: its entities expire at that same moment.
 */
export async function syncListing(listingId: bigint): Promise<{
  state: string | null;
  indexed: boolean;
  rightsIndexed: boolean;
}> {
  invalidateRooms();
  const room = await readRoom(listingId);
  if (!room) return { state: null, indexed: false, rightsIndexed: false };

  const status: ListingStatus | null =
    room.state === "available" ? "available"
    : room.state === "held" ? "sold"
    : room.state === "frozen" ? "frozen"
    : room.state === "cancelled" ? "cancelled"
    : null;

  const indexed = status ? await setListingStatus(listingId, status) : false;

  let rightsIndexed = false;
  if (room.holder && (room.state === "held" || room.state === "frozen")) {
    const purchase = await readPurchaseOf(listingId);
    await indexRights({
      listingId,
      holder: room.holder,
      validFrom: Math.floor(new Date(room.start).getTime() / 1000),
      validUntil: Math.floor(new Date(room.end).getTime() / 1000),
      token: room.token,
      purchaseTx: purchase?.transactionHash ?? "",
    });
    rightsIndexed = true;
  }

  return { state: room.state, indexed, rightsIndexed };
}
