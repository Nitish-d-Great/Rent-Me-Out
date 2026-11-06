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
  "function getListing(uint256 listingId) view returns (address payout, uint64 start, uint64 end, uint8 status, uint256 price, uint256 roomTag)",
  "function listingCount() view returns (uint256)",
  "function listingsOfRoom(uint256 roomTag) view returns (uint256[])",
  "function usdc() view returns (address)",
  "function tokenOf(uint256 listingId) view returns (address)",
  "function rootVersion() view returns (uint256)",
  "function approvedRoot() view returns (uint256, uint256)",
  "function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout) view returns (uint256)",
  "error NoSuchListing()",
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
}

export function registryAddress(): `0x${string}` {
  const value = process.env.RENTAL_REGISTRY_ADDRESS;
  if (!value) throw new Error("RENTAL_REGISTRY_ADDRESS is not set");
  return value as `0x${string}`;
}

export function publicClient() {
  return createPublicClient({ chain: hederaTestnet, transport: http() });
}

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * A listing's token never changes once issued, so one read is enough for the life of the
 * process. Without this, every room on a page would pay one more RPC call on each load.
 */
const tokenCache = new Map<string, `0x${string}`>();

async function readTokenOf(
  registry: `0x${string}`,
  listingId: bigint,
): Promise<`0x${string}`> {
  const key = `${registry}:${listingId}`;
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const token = await publicClient().readContract({
    address: registry, abi: REGISTRY_ABI, functionName: "tokenOf", args: [listingId],
  });
  tokenCache.set(key, token);
  return token;
}

/**
 * One call gives the tenant page everything: state, validity, holder, period, price.
 * `verifyRoom` exists for exactly this, so we don't stitch several reads together.
 *
 * Returns null for a listing that does not exist, rather than throwing — an unknown
 * room is a normal thing for a stranger to scan, not an error.
 */
export async function readRoom(listingId: bigint): Promise<RoomRecord | null> {
  const address = registryAddress();
  try {
    // Both reads go out together: done in sequence this costs two round trips per
    // room, which multiplies across a page that lists several.
    const [room, identity, token] = await Promise.all([
      publicClient().readContract({
        address, abi: REGISTRY_ABI, functionName: "verifyRoom", args: [listingId],
      }),
      publicClient()
        .readContract({
          address, abi: REGISTRY_ABI, functionName: "holderIdentity", args: [listingId],
        })
        // Optional: an unsold room has no identity bound.
        .catch(() => 0n),
      readTokenOf(address, listingId),
    ]);

    const [state, valid, holder, start, end, price, roomTag] = room;
    const holderIdentity = identity;

    return {
      listingId: listingId.toString(),
      state: ROOM_STATE[state] ?? "none",
      valid,
      holder: holder === ZERO ? null : holder,
      holderIdentity: holderIdentity === 0n ? null : holderIdentity.toString(),
      start: new Date(Number(start) * 1000).toISOString(),
      end: new Date(Number(end) * 1000).toISOString(),
      priceRaw: price.toString(),
      price: (Number(price) / 1e6).toFixed(2),
      roomTag: roomTag.toString(),
      token,
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
let roomsCache: { at: number; rooms: RoomRecord[] } | null = null;
let roomsInFlight: Promise<RoomRecord[]> | null = null;

/** Drops the cache, for use straight after a write. */
export function invalidateRooms(): void {
  roomsCache = null;
  rootVersionCache = null;
}

/** Every listing the registry knows about. Listing ids are 1-indexed. */
export async function readAllRooms(): Promise<RoomRecord[]> {
  if (roomsCache && Date.now() - roomsCache.at < ROOMS_TTL_MS) {
    return roomsCache.rooms;
  }
  if (roomsInFlight) return roomsInFlight;

  roomsInFlight = readAllRoomsUncached()
    .then((rooms) => {
      roomsCache = { at: Date.now(), rooms };
      return rooms;
    })
    .finally(() => {
      roomsInFlight = null;
    });
  return roomsInFlight;
}

async function readAllRoomsUncached(): Promise<RoomRecord[]> {
  const count = await publicClient().readContract({
    address: registryAddress(), abi: REGISTRY_ABI, functionName: "listingCount",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const rooms = await Promise.all(ids.map(readRoom));
  return rooms.filter((r): r is RoomRecord => r !== null);
}
