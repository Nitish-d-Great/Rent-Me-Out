import type { Metadata } from "next";
import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import { demo, formatDate, marketplaceRooms, property } from "@/lib/data";
import { readAllRooms } from "@/lib/chain/registry";
import { recordToRoom } from "@/lib/chain/to-room";
import type { RoomCardData } from "@/components/marketplace/room-card";

/**
 * Listings from the registry, falling back to the sample set only when the chain is
 * unreachable or empty -- and saying which it showed, so a sample room is never
 * mistaken for one that can actually be bought.
 */
async function loadListings(): Promise<{ rooms: RoomCardData[]; live: boolean }> {
  try {
    const records = await readAllRooms();
    if (records.length) {
      return {
        rooms: records.map((record, index) => ({
          ...recordToRoom(record, index),
          propertyId: property.id,
          propertyName: property.nickname,
          locality: property.locality,
          city: property.city,
          periodLabel: `${formatDate(record.start.slice(0, 10))} – ${formatDate(record.end.slice(0, 10))}`,
          propertyApproved: true,
        })),
        live: true,
      };
    }
  } catch {
    // Fall through to the sample set rather than showing an empty marketplace.
  }
  return {
    rooms: marketplaceRooms.map((room) => ({ ...room, propertyApproved: true })),
    live: false,
  };
}

export const metadata: Metadata = {
  title: "Browse rooms",
  description:
    "Available room-rights listings with a registrar-approved property and one verified broker per room.",
};

export default async function MarketplacePage() {
  const { rooms, live } = await loadListings();

  return (
    <div className="shell section section--tight">
      <div className="page-head">
        <div>
          <p className="eyebrow">Public marketplace</p>
          <h1>One room. One holder.</h1>
          <p>
            Room rights from registrar-approved properties. Prices are one-time
            payments to the owner for the whole period — not monthly rent.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="badge badge--quiet">
            {rooms.length} {rooms.length === 1 ? "listing" : "listings"}
            {live ? " · live from Hedera" : ` · ${demo.periodLabel}`}
          </span>
        </div>
      </div>

      <MarketplaceClient rooms={rooms} />

      {!live && (
        <p className="micro" style={{ color: "crimson", marginTop: 12 }}>
          ● Sample listings — the registry is unreachable or holds none. These
          rooms are illustrative and cannot be bought.
        </p>
      )}

      <p className="verify-footnote" style={{ maxWidth: 720 }}>
        A listing only appears after the property is approved on Hedera and the
        room token exists. Arkiv supplies discovery; Hedera confirms the current
        holder and lifecycle. Tenant rent and lease terms are agreed with the
        broker outside this product.
      </p>
    </div>
  );
}
