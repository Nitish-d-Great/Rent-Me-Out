import { createPublicClient, defineChain, http, parseAbi } from "viem";

/**
 * Reads against the deployed RentalRegistry.
 *
 * Read-only and public: the tenant verify page is meant to be checkable by anyone with
 * no account, so these need no wallet, no key and no gas. That property is the product
 * claim, not an implementation detail.
 */

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] },
  },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

export const REGISTRY_ABI = parseAbi([
  "function verifyRoom(uint256 listingId) view returns (uint8 state, bool valid, address holder, uint64 start, uint64 end, uint256 price, uint256 roomTag)",
  "function holderIdentity(uint256 listingId) view returns (uint256)",
  "function getListing(uint256 listingId) view returns (address payout, uint64 start, uint64 end, uint8 status, uint256 price, uint256 roomTag, int32 latitudeE6, int32 longitudeE6)",
  "function listingCount() view returns (uint256)",
  "function listingsOfRoom(uint256 roomTag) view returns (uint256[])",
  "function usdc() view returns (address)",
  "function tokenOf(uint256 listingId) view returns (address)",
  "function rootVersion() view returns (uint256)",
  "function approvedRoot() view returns (uint256, uint256)",
  "function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout, int32 latitudeE6, int32 longitudeE6) view returns (uint256)",
  "error NoSuchListing()",
]);

/** ABI of the previous deployment retained for its currently active room rights. */
export const LEGACY_REGISTRY_ABI = parseAbi([
  "function verifyRoom(uint256 listingId) view returns (uint8 state, bool valid, address holder, uint64 start, uint64 end, uint256 price, uint256 roomTag)",
  "function holderIdentity(uint256 listingId) view returns (uint256)",
  "function getListing(uint256 listingId) view returns (address payout, uint64 start, uint64 end, uint8 status, uint256 price, uint256 roomTag)",
  "function listingCount() view returns (uint256)",
  "function tokenOf(uint256 listingId) view returns (address)",
]);

/**
 * RoomState, in the contract's own order:
 * Unknown, Available, Held, Frozen, Expired, Cancelled.
 * Omitting "cancelled" made a cancelled listing decode as undefined, fall through to
 * "available", and offer a buy button on a burned token.
 */
export const ROOM_STATE = [
  "none", "available", "held", "frozen", "expired", "cancelled",
] as const;
export type RoomState = (typeof ROOM_STATE)[number];

export interface RoomRecord {
  listingId: string;
  listingNumber: string;
  registryAddress: `0x${string}`;
  legacyRegistry: boolean;
  state: RoomState;
  valid: boolean;
  /** The broker holding rights, or null when nobody does. */
  holder: `0x${string}` | null;
  /** World ID identity bound to the holder, or null. Never a raw nullifier — the
   *  registry stores a hash, so this is safe to show. */
  holderIdentity: string | null;
  start: string;
  end: string;
  priceRaw: string;
  /** DemoUSDC uses 6 decimals, like real USDC. */
  price: string;
  roomTag: string;
  /** The room's own ATS security token, issued when it was listed. */
  token: `0x${string}`;
  /** The owner's wallet, which the sale pays. */
  payout: `0x${string}`;
  latitude?: number;
  longitude?: number;
  /** From the Arkiv index, when the room has been indexed. */
  city?: string;
  label?: string;
  purchaseTx?: string;
  arkivKey?: string;
}

export function registryAddress(legacy = false): `0x${string}` {
  const value = legacy
    ? process.env.LEGACY_RENTAL_REGISTRY_ADDRESS
    : process.env.RENTAL_REGISTRY_ADDRESS;
  if (!value) throw new Error(legacy
    ? "LEGACY_RENTAL_REGISTRY_ADDRESS is not set"
    : "RENTAL_REGISTRY_ADDRESS is not set");
  return value as `0x${string}`;
}

export function legacyRegistryAddress(): `0x${string}` | null {
  return process.env.LEGACY_RENTAL_REGISTRY_ADDRESS ? registryAddress(true) : null;
}

export function publicClient() {
  return createPublicClient({ chain: hederaTestnet, transport: http() });
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * A listing's token and payout never change, so one read is enough for the life of the
 * process. Without this, every room on a page would pay extra RPC calls on each load.
 */
const fixedFactsCache = new Map<string, {
  token: `0x${string}`; payout: `0x${string}`; latitudeE6: number; longitudeE6: number;
}>();

async function readFixedFacts(registry: `0x${string}`, listingId: bigint, legacy = false) {
  const key = `${registry}:${listingId}`;
  const cached = fixedFactsCache.get(key);
  if (cached) return cached;
  const [token, listing] = await Promise.all([
    publicClient().readContract({
      address: registry, abi: legacy ? LEGACY_REGISTRY_ABI : REGISTRY_ABI,
      functionName: "tokenOf", args: [listingId],
    }),
    publicClient().readContract({
      address: registry, abi: legacy ? LEGACY_REGISTRY_ABI : REGISTRY_ABI,
      functionName: "getListing", args: [listingId],
    }),
  ]);
  const facts = {
    token,
    payout: listing[0],
    latitudeE6: legacy ? 0 : Number(listing[6]),
    longitudeE6: legacy ? 0 : Number(listing[7]),
  };
  fixedFactsCache.set(key, facts);
  return facts;
}

/**
 * One call gives the tenant page everything: state, validity, holder, period, price.
 * `verifyRoom` exists for exactly this, so we don't stitch several reads together.
 *
 * Returns null for a listing that does not exist, rather than throwing — an unknown
 * room is a normal thing for a stranger to scan, not an error.
 */
export async function readRoom(
  listingId: bigint,
  address = registryAddress(),
  legacy = false,
): Promise<RoomRecord | null> {
  const abi = legacy ? LEGACY_REGISTRY_ABI : REGISTRY_ABI;
  try {
    // Both reads go out together: done in sequence this costs two round trips per
    // room, which multiplies across a page that lists several.
    const [room, identity, facts] = await Promise.all([
      publicClient().readContract({
        address, abi, functionName: "verifyRoom", args: [listingId],
      }),
      publicClient()
        .readContract({
          address, abi, functionName: "holderIdentity", args: [listingId],
        })
        // Optional: an unsold room has no identity bound.
        .catch(() => 0n),
      readFixedFacts(address, listingId, legacy),
    ]);

    const [state, valid, holder, start, end, price, roomTag] = room;
    const holderIdentity = identity;

    return {
      listingId: listingId.toString(),
      listingNumber: listingId.toString(),
      registryAddress: address,
      legacyRegistry: legacy,
      state: ROOM_STATE[state] ?? "none",
      valid,
      holder: holder === ZERO ? null : holder,
      holderIdentity: holderIdentity === 0n ? null : holderIdentity.toString(),
      start: new Date(Number(start) * 1000).toISOString(),
      end: new Date(Number(end) * 1000).toISOString(),
      priceRaw: price.toString(),
      price: (Number(price) / 1e6).toFixed(2),
      roomTag: roomTag.toString(),
      token: facts.token,
      payout: facts.payout,
      ...(legacy ? {} : {
        latitude: facts.latitudeE6 / 1_000_000,
        longitude: facts.longitudeE6 / 1_000_000,
      }),
    };
  } catch {
    return null;
  }
}

/** The contract's Status enum: Available and Sold still hold a token. */
const STATUS_AVAILABLE = 1;
const STATUS_SOLD = 2;

/**
 * Whether a listing still has a token to burn.
 *
 * This reads the stored status on purpose. verifyRoom reports "expired" as soon as a
 * period ends, before anyone has called expire(), so it cannot tell a burned token from
 * one still waiting to be burned.
 */
export async function hasLiveToken(listingId: bigint): Promise<boolean> {
  const listing = await publicClient().readContract({
    address: registryAddress(), abi: REGISTRY_ABI, functionName: "getListing", args: [listingId],
  });
  const status = listing[3];
  return status === STATUS_AVAILABLE || status === STATUS_SOLD;
}

/**
 * Current approved-set root version, shown on the verify page.
 *
 * Cached on the same terms as the listings: /api/rooms asks for both on every request,
 * so leaving this uncached meant each call still paid one RPC round trip and warm
 * responses stayed as variable as cold ones.
 */
let rootVersionCache: { at: number; value: string } | null = null;

export async function readRootVersion(): Promise<string> {
  if (rootVersionCache && Date.now() - rootVersionCache.at < ROOMS_TTL_MS) {
    return rootVersionCache.value;
  }
  const v = await publicClient().readContract({
    address: registryAddress(), abi: REGISTRY_ABI, functionName: "rootVersion",
  });
  const value = v.toString();
  rootVersionCache = { at: Date.now(), value };
  return value;
}

/**
 * A very short cache over the full listing read.
 *
 * Reading every room costs listingCount + two calls per listing, and several
 * components ask for it on the same page load. Uncached, those multiply into dozens of
 * RPC calls that Hashio throttles -- a page took 27s to settle while a single warm
 * request took 2s. The window is small enough that a freeze or purchase shows up
 * almost immediately, and write responses carry the new state anyway.
 *
 * In-flight requests share one promise, so concurrent callers never stack reads.
 */
// 3s expired between page loads, so every navigation paid a cold read -- 10-20s when
// Hashio is slow. Writes call invalidateRooms(), so a state change still appears at
// once; this window only affects a listing someone else changed.
const ROOMS_TTL_MS = 20_000;
const roomsCaches = new Map<string, { at: number; rooms: RoomRecord[] }>();
const roomsInFlights = new Map<string, Promise<RoomRecord[]>>();

/** Drops the cache, for use straight after a write. */
export function invalidateRooms(): void {
  roomsCaches.clear();
  rootVersionCache = null;
}

/**
 * Every listing the registry knows about. Listing ids are 1-indexed.
 *
 * Reading them all took 29-47s on Hashio with only three rooms, so nobody should have to
 * wait for it twice. Once the window passes, callers get the last answer immediately
 * while a refresh runs behind them. A write calls invalidateRooms(), which drops the
 * cache, so a change someone just made is never hidden by the stale copy.
 */
export async function readAllRooms(): Promise<RoomRecord[]> {
  return readAllRoomsFrom(registryAddress());
}

export async function readAllConfiguredRooms(): Promise<RoomRecord[]> {
  const legacy = legacyRegistryAddress();
  if (!legacy) return readAllRooms();
  const [current, old] = await Promise.all([
    readAllRoomsFrom(registryAddress()),
    readAllRoomsFrom(legacy, true),
  ]);
  return [
    ...current,
    ...old.map((room) => ({ ...room, listingId: `legacy-${room.listingNumber}` })),
  ];
}

function refreshRooms(address: `0x${string}`, legacy: boolean): Promise<RoomRecord[]> {
  const key = address.toLowerCase();
  const pending = roomsInFlights.get(key);
  if (pending) return pending;
  const request = readAllRoomsUncached(address, legacy)
    .then((rooms) => {
      roomsCaches.set(key, { at: Date.now(), rooms });
      return rooms;
    })
    .finally(() => {
      roomsInFlights.delete(key);
    });
  roomsInFlights.set(key, request);
  return request;
}

async function readAllRoomsFrom(address: `0x${string}`, legacy = false): Promise<RoomRecord[]> {
  const key = address.toLowerCase();
  const cached = roomsCaches.get(key);
  if (cached) {
    if (Date.now() - cached.at >= ROOMS_TTL_MS) void refreshRooms(address, legacy).catch(() => undefined);
    return cached.rooms;
  }
  return refreshRooms(address, legacy);
}

async function readAllRoomsUncached(address: `0x${string}`, legacy: boolean): Promise<RoomRecord[]> {
  const count = await publicClient().readContract({
    address,
    abi: legacy ? LEGACY_REGISTRY_ABI : REGISTRY_ABI,
    functionName: "listingCount",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const rooms = await Promise.all(ids.map((id) => readRoom(id, address, legacy)));
  return rooms.filter((r): r is RoomRecord => r !== null);
}
