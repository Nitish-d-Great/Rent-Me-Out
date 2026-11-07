import type { Metadata } from "next";
import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import { demo, formatDate, marketplaceRooms, property } from "@/lib/data";
import Link from "next/link";
import { queryListings, readRoomIndex } from "@/lib/arkiv/listings";
import { readAllConfiguredRooms, registryAddress, type RoomRecord } from "@/lib/chain/registry";
import { recordToRoom } from "@/lib/chain/to-room";
import type { RoomCardData } from "@/components/marketplace/room-card";

const CHAIN_WAIT_MS = 4_000;

/** The Arkiv index in the shape the page renders. Status only: holders come from Hedera. */
async function recordsFromArkiv(): Promise<RoomRecord[]> {
  const states: Record<string, RoomRecord["state"]> = {
    available: "available", sold: "held", frozen: "frozen", cancelled: "cancelled",
  };
  const listings = await queryListings().catch(() => []);
  return listings
    .sort((a, b) => Number(a.listingId) - Number(b.listingId))
    .map((listing) => ({
      listingId: listing.listingId,
      listingNumber: listing.listingId,
      registryAddress: registryAddress(),
      legacyRegistry: false,
      state: states[listing.status] ?? "available",
      valid: false,
      holder: null,
      holderIdentity: null,
      start: new Date(listing.startsAt * 1000).toISOString(),
      end: new Date(listing.endsAt * 1000).toISOString(),
      priceRaw: listing.priceUsdc,
      price: (Number(listing.priceUsdc) / 1e6).toFixed(2),
      roomTag: "",
      token: listing.token,
      payout: listing.payout,
    }));
}

/**
 * Rooms and their rights come from Hedera, with the city and search from Arkiv. Falls
 * back to the sample set only when the registry is unreachable or empty, and says so,
 * so a sample room is never mistaken for one that can be bought.
 */
async function loadListings(city?: string, availability?: string, priceBand?: string): Promise<{
  rooms: RoomCardData[];
  live: boolean;
  cities: string[];
  indexed: boolean;
  fromIndex: boolean;
}> {
  let index: Awaited<ReturnType<typeof readRoomIndex>> | null = null;
  let matching: Set<string> | null = null;
  try {
    index = await readRoomIndex();
    // The city filter is an Arkiv query, not a filter over rooms already in memory.
    const arkivFilter = {
      city,
      status: availability === "available" ? "available" : availability === "held" ? "sold" : undefined,
      minPriceUsdc: priceBand === "900plus" ? 900_000_000n : undefined,
      maxPriceUsdc: priceBand === "under900" ? 900_000_000n : undefined,
    };
    if (city || arkivFilter.status || arkivFilter.minPriceUsdc || arkivFilter.maxPriceUsdc) {
      matching = new Set((await queryListings(arkivFilter)).map((l) => l.listingId));
    }
  } catch (error) {
    console.error("[marketplace] Arkiv index unavailable:", error);
  }

  try {
    // A cold read from Hedera can take most of a minute, so don't hold the page for it.
    // It keeps running and fills the cache for the next visitor.
    const fromChain = await Promise.race([
      readAllConfiguredRooms(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CHAIN_WAIT_MS)),
    ]);
    let records = fromChain ?? (await recordsFromArkiv());
    // Nothing on Arkiv either, so the chain's answer is the only one there is.
    if (fromChain === null && records.length === 0) records = await readAllConfiguredRooms();
    if (records.length) {
      const cities = [
        ...new Set([...(index?.values() ?? [])].map((e) => e.city).filter((c): c is string => Boolean(c))),
      ].sort();
      return {
        rooms: records
          .filter((record) => !matching || matching.has(record.listingId))
          .map((record, index_) => {
            const entry = record.legacyRegistry ? undefined : index?.get(record.listingNumber);
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
        fromIndex: fromChain === null,
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
    fromIndex: false,
  };
}

export const metadata: Metadata = {
  title: "Browse rooms",
  description:
    "Available room-rights listings with a registrar-approved property and one verified broker per room.",
};

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; availability?: string; price?: string }>;
}) {
  const { city, availability, price } = await searchParams;
  const selectedAvailability = availability === "available" || availability === "held" ? availability : "all";
  const selectedPrice = price === "under900" || price === "900plus" ? price : "any";
  const { rooms, live, cities, indexed, fromIndex } = await loadListings(
    city,
    selectedAvailability,
    selectedPrice,
  );
  const cityHref = (nextCity?: string) => {
    const params = new URLSearchParams();
    if (nextCity) params.set("city", nextCity);
    if (selectedAvailability !== "all") params.set("availability", selectedAvailability);
    if (selectedPrice !== "any") params.set("price", selectedPrice);
    const query = params.toString();
    return query ? `/marketplace?${query}` : "/marketplace";
  };

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
            {live
              ? fromIndex
                ? " · from Arkiv · open a room to confirm on Hedera"
                : ` · rights from Hedera${indexed ? " · search from Arkiv" : ""}`
              : ` · ${demo.periodLabel}`}
          </span>
        </div>
      </div>

      {cities.length > 0 && (
        <div className="flex wrap gap-8" style={{ marginBottom: 16 }}>
          <Link href={cityHref()} className="demo-chip" data-active={!city}>
            All cities
          </Link>
          {cities.map((name) => (
            <Link
              key={name}
              href={cityHref(name)}
              className="demo-chip"
              data-active={city === name}
            >
              {name}
            </Link>
          ))}
        </div>
      )}

      <MarketplaceClient
        rooms={rooms}
        city={city}
        availability={selectedAvailability}
        price={selectedPrice}
      />

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
        City, price and availability filters query Arkiv&apos;s indexed listing
        records. A listing only appears after the property is approved on Hedera
        and the room token exists. Arkiv supplies discovery; Hedera confirms the current
        holder and lifecycle. Tenant rent and lease terms are agreed with the
        broker outside this product.
      </p>
    </div>
  );
}
