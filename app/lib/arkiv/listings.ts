import "server-only";
import { ExpirationTime } from "@arkiv-network/sdk";
import { and, eq, gte, lt } from "@arkiv-network/sdk/query";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { getAddress, type Hex } from "viem";
import { registryAddress } from "@/lib/chain/registry";
import { arkivPublic, arkivWallet, arkivWriterAddress, columnValue, serialWrite } from "./client";
import { RightsRecord, RoomListing } from "./schemas";

/**
 * The searchable index of rooms.
 *
 * Arkiv is where rooms are found; Hedera decides who holds them. These writes follow
 * chain events and may lag or fail without affecting rights, so a caller must treat a
 * failure here as "not indexed", never as "the sale did not happen".
 */

/** Arkiv rejects lifetimes beyond about 182.5 days. */
const MAX_LIFETIME_DAYS = 180;
const PAGE_LIMIT = 100;

export type ListingStatus = "available" | "sold" | "frozen" | "cancelled";

export interface IndexedListing {
  entityKey: Hex;
  listingId: string;
  status: string;
  city: string;
  label: string;
  priceUsdc: string;
  startsAt: number;
  endsAt: number;
  payout: `0x${string}`;
  token: `0x${string}`;
}

type Condition = Parameters<typeof and>[number];

const registry = () => addr(getAddress(registryAddress()));

/** Expires with the rental, or at Arkiv's limit for longer ones. */
function expiryFor(endsAt: number) {
  const days = (endsAt * 1000 - Date.now()) / 86_400_000;
  return days > MAX_LIFETIME_DAYS
    ? ExpirationTime.fromDays(MAX_LIFETIME_DAYS)
    : ExpirationTime.atDate(new Date(endsAt * 1000));
}

const COLUMNS = {
  $key: true, listingId: true, status: true, city: true, label: true, priceUsdc: true,
  startsAt: true, endsAt: true, payout: true, token: true,
} as const;

function toListing(entity: Record<string, unknown>): IndexedListing {
  return {
    entityKey: entity.$key as Hex,
    listingId: String(columnValue(entity.listingId)),
    status: columnValue<string>(entity.status) ?? "available",
    city: columnValue<string>(entity.city) ?? "",
    label: columnValue<string>(entity.label) ?? "",
    priceUsdc: String(columnValue(entity.priceUsdc)),
    startsAt: Number(columnValue(entity.startsAt)),
    endsAt: Number(columnValue(entity.endsAt)),
    payout: columnValue<`0x${string}`>(entity.payout) ?? "0x",
    token: columnValue<`0x${string}`>(entity.token) ?? "0x",
  };
}

export async function queryListings(filter?: {
  city?: string;
  status?: string;
  payout?: string;
  listingId?: bigint;
  minPriceUsdc?: bigint;
  maxPriceUsdc?: bigint;
}): Promise<IndexedListing[]> {
  const conditions: Condition[] = [eq("registry", registry())];
  if (filter?.city) conditions.push(eq("city", filter.city));
  if (filter?.status) conditions.push(eq("status", filter.status));
  if (filter?.payout) conditions.push(eq("payout", addr(getAddress(filter.payout))));
  if (filter?.listingId !== undefined) conditions.push(eq("listingId", u64(filter.listingId)));
  if (filter?.minPriceUsdc !== undefined) {
    conditions.push(gte("priceUsdc", u64(filter.minPriceUsdc)));
  }
  if (filter?.maxPriceUsdc !== undefined) {
    conditions.push(lt("priceUsdc", u64(filter.maxPriceUsdc)));
  }

  const { entities } = await arkivPublic()
    .select(COLUMNS)
    .from(RoomListing)
    .ownedBy(arkivWriterAddress())
        // The SDK types where() against a fixed list of columns, so a filter assembled at
    // runtime has to be cast.
    .where(and(...(conditions as [never])) as never)
    .limit(PAGE_LIMIT)
    .fetch();

  return (entities as unknown as Record<string, unknown>[]).map(toListing);
}

export interface NewListing {
  listingId: bigint;
  city: string;
  label: string;
  priceUsdc: bigint;
  startsAt: number;
  endsAt: number;
  payout: `0x${string}`;
  token: `0x${string}`;
  listingTx: string;
}

export async function indexListing(listing: NewListing): Promise<Hex> {
  invalidateRoomIndex();
  const { entityKey } = await serialWrite(() =>
    arkivWallet().createEntity(
      RoomListing,
      {
        registry: registry(),
        listingId: u64(listing.listingId),
        status: "available",
        city: listing.city,
        priceUsdc: u64(listing.priceUsdc),
        startsAt: u64(BigInt(listing.startsAt)),
        endsAt: u64(BigInt(listing.endsAt)),
        payout: addr(getAddress(listing.payout)),
        token: addr(getAddress(listing.token)),
        label: listing.label,
        listingTx: listing.listingTx,
      },
      { expiration: expiryFor(listing.endsAt) },
    ),
  );
  return entityKey;
}

/** Copies a status the chain has already decided. Does nothing if it is not indexed. */
export async function setListingStatus(listingId: bigint, status: ListingStatus): Promise<boolean> {
  invalidateRoomIndex();
  const [listing] = await queryListings({ listingId });
  if (!listing) return false;
  if (listing.status === status) return true;
  await serialWrite(() =>
    arkivWallet().patchEntity(RoomListing, listing.entityKey, { set: { status } }),
  );
  return true;
}

export interface IndexedRights {
  entityKey: Hex;
  listingId: string;
  holder: `0x${string}`;
  validUntil: number;
  purchaseTx: string;
}

export async function queryRights(filter: { listingId?: bigint; holder?: string }): Promise<IndexedRights[]> {
  const conditions: Condition[] = [eq("registry", registry())];
  if (filter.listingId !== undefined) conditions.push(eq("listingId", u64(filter.listingId)));
  if (filter.holder) conditions.push(eq("holder", addr(getAddress(filter.holder))));

  const { entities } = await arkivPublic()
    .select({ $key: true, listingId: true, holder: true, validUntil: true, purchaseTx: true })
    .from(RightsRecord)
    .ownedBy(arkivWriterAddress())
        // The SDK types where() against a fixed list of columns, so a filter assembled at
    // runtime has to be cast.
    .where(and(...(conditions as [never])) as never)
    .limit(PAGE_LIMIT)
    .fetch();

  return (entities as unknown as Record<string, unknown>[]).map((entity) => ({
    entityKey: entity.$key as Hex,
    listingId: String(columnValue(entity.listingId)),
    holder: columnValue<`0x${string}`>(entity.holder) ?? "0x",
    validUntil: Number(columnValue(entity.validUntil)),
    purchaseTx: columnValue<string>(entity.purchaseTx) ?? "",
  }));
}

export async function indexRights(rights: {
  listingId: bigint;
  holder: `0x${string}`;
  validFrom: number;
  validUntil: number;
  token: `0x${string}`;
  purchaseTx: string;
}): Promise<Hex> {
  invalidateRoomIndex();
  const [existing] = await queryRights({ listingId: rights.listingId });
  if (existing) return existing.entityKey;
  const { entityKey } = await serialWrite(() =>
    arkivWallet().createEntity(
      RightsRecord,
      {
        registry: registry(),
        listingId: u64(rights.listingId),
        holder: addr(getAddress(rights.holder)),
        validUntil: u64(BigInt(rights.validUntil)),
        validFrom: u64(BigInt(rights.validFrom)),
        token: addr(getAddress(rights.token)),
        purchaseTx: rights.purchaseTx,
      },
      { expiration: expiryFor(rights.validUntil) },
    ),
  );
  return entityKey;
}

export interface RoomIndexEntry {
  city?: string;
  label?: string;
  listingKey?: Hex;
  rightsKey?: Hex;
  purchaseTx?: string;
}

const INDEX_TTL_MS = 15_000;
let indexCache: { at: number; entries: Map<string, RoomIndexEntry> } | null = null;

/**
 * What Arkiv adds to a room read from Hedera: where it is and its public records. A
 * short cache, because every page that lists rooms asks for this. A room missing here is
 * still a real room: the index can lag the chain, never the other way around.
 */
export async function readRoomIndex(): Promise<Map<string, RoomIndexEntry>> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.entries;

  const { entities } = await arkivPublic()
    .select({ $key: true, listingId: true, purchaseTx: true })
    .from(RightsRecord)
    .ownedBy(arkivWriterAddress())
    .where(eq("registry", registry()))
    .limit(PAGE_LIMIT)
    .fetch();

  const entries = new Map<string, RoomIndexEntry>();
  for (const listing of await queryListings()) {
    entries.set(listing.listingId, {
      city: listing.city,
      label: listing.label,
      listingKey: listing.entityKey,
    });
  }
  for (const rights of entities as unknown as Record<string, unknown>[]) {
    const id = String(columnValue(rights.listingId));
    entries.set(id, {
      ...entries.get(id),
      rightsKey: rights.$key as Hex,
      purchaseTx: columnValue<string>(rights.purchaseTx),
    });
  }
  indexCache = { at: Date.now(), entries };
  return entries;
}

/** Records that come from a chain event are stale in this cache the moment they change. */
export function invalidateRoomIndex(): void {
  indexCache = null;
}
