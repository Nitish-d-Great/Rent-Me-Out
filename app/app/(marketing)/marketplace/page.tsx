import type { Metadata } from "next";
import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import { demo, formatDate, marketplaceRooms, property } from "@/lib/data";
import Link from "next/link";
import { queryListings, readRoomIndex } from "@/lib/arkiv/listings";
import { readAllRooms } from "@/lib/chain/registry";
import { recordToRoom } from "@/lib/chain/to-room";
import type { RoomCardData } from "@/components/marketplace/room-card";

/**
 * Rooms and their rights come from Hedera, with the city and search from Arkiv. Falls
 * back to the sample set only when the registry is unreachable or empty, and says so,
 * so a sample room is never mistaken for one that can be bought.
 */
async function loadListings(city?: string): Promise<{
  rooms: RoomCardData[];
  live: boolean;
  cities: string[];
  indexed: boolean;
}> {
  let index: Awaited<ReturnType<typeof readRoomIndex>> | null = null;
  let matching: Set<string> | null = null;
  try {
    index = await readRoomIndex();
    // The city filter is an Arkiv query, not a filter over rooms already in memory.
    if (city) matching = new Set((await queryListings({ city })).map((l) => l.listingId));
  } catch (error) {
    console.error("[marketplace] Arkiv index unavailable:", error);
  }

  try {
    const records = await readAllRooms();
    if (records.length) {
      const cities = [
        ...new Set([...(index?.values() ?? [])].map((e) => e.city).filter((c): c is string => Boolean(c))),
      ].sort();
      return {
        rooms: records
          .filter((record) => !matching || matching.has(record.listingId))
          .map((record, index_) => {
            const entry = index?.get(record.listingId);
            return {
              ...recordToRoom({ ...record, city: entry?.city, arkivKey: entry?.listingKey }, index_),
              propertyId: property.id,
              propertyName: "Registrar-approved property",
              locality: "Address shared by the broker",
              city: entry?.city ?? "City not indexed",
              periodLabel: `${formatDate(record.start.slice(0, 10))} – ${formatDate(record.end.slice(0, 10))}`,
              propertyApproved: true,
            };
          }),
        live: true,
        cities,
        indexed: index !== null,
      };
    }
  } catch {
    // Fall through to the sample set rather than showing an empty marketplace.
  }
  return {
    rooms: marketplaceRooms.map((room) => ({ ...room, propertyApproved: true })),
    live: false,
    cities: [],
    indexed: false,
  };
}

export const metadata: Metadata = {
  title: "Browse rooms",
  description:
    "Browse public room-rights listings from Arkiv and verify current rights on Hedera.",
};

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const { rooms, live, cities, indexed } = await loadListings(city);

  return (
    <div className="shell section section--tight">
      <div className="page-head">
        <div>
          <p className="eyebrow">Public marketplace</p>
          <h1>One room. One holder.</h1>
          <p>
            Room-right listings are discovered through Arkiv. Prices are
            one-time payments to the owner for the whole period — not monthly rent.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="badge badge--quiet">
            {rooms.length} {rooms.length === 1 ? "listing" : "listings"}
            {live
              ? ` · rights from Hedera${indexed ? " · search from Arkiv" : ""}`
              : ` · ${demo.periodLabel}`}
          </span>
        </div>
      </div>

      {cities.length > 0 && (
        <div className="flex wrap gap-8" style={{ marginBottom: 16 }}>
          <Link href="/marketplace" className="demo-chip" data-active={!city}>
            All cities
          </Link>
          {cities.map((name) => (
            <Link
              key={name}
              href={`/marketplace?city=${encodeURIComponent(name)}`}
              className="demo-chip"
              data-active={city === name}
            >
              {name}
            </Link>
          ))}
        </div>
      )}

      <MarketplaceClient rooms={rooms} />

      {live && !indexed && (
        <p className="micro" style={{ color: "crimson", marginTop: 12 }}>
          ● Arkiv is unreachable, so cities and search are unavailable. Rights above still
          come from Hedera.
        </p>
      )}

      {!live && (
        <p className="micro" style={{ color: "crimson", marginTop: 12 }}>
          ● Sample listings — the registry is unreachable or holds none. These
          rooms are illustrative and cannot be bought.
        </p>
      )}

      <p className="verify-footnote" style={{ maxWidth: 720 }}>
        Arkiv records are public discovery data and can be written by anyone.
        Confirm property approval, token ownership, and lifecycle on Hedera before
        relying on a listing. Tenant rent and lease terms are agreed with the broker
        outside this product.
      </p>
    </div>
  );
}
