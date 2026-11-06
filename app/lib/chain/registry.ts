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
  "function rights() view returns (address)",
  "function rootVersion() view returns (uint256)",
  "function approvedRoot() view returns (uint256, uint256)",
  "function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout) view returns (uint256)",
  "error NoSuchListing()",
]);

/** RoomState, as the registry reports it. */
export const ROOM_STATE = ["none", "available", "held", "frozen", "expired"] as const;
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
 * One call gives the tenant page everything: state, validity, holder, period, price.
 * `verifyRoom` exists for exactly this, so we don't stitch several reads together.
 *
 * Returns null for a listing that does not exist, rather than throwing — an unknown
 * room is a normal thing for a stranger to scan, not an error.
 */
export async function readRoom(listingId: bigint): Promise<RoomRecord | null> {
  const address = registryAddress();
  try {
    const [state, valid, holder, start, end, price, roomTag] =
      await publicClient().readContract({
        address, abi: REGISTRY_ABI, functionName: "verifyRoom", args: [listingId],
      });

    let holderIdentity: bigint = 0n;
    try {
      holderIdentity = await publicClient().readContract({
        address, abi: REGISTRY_ABI, functionName: "holderIdentity", args: [listingId],
      });
    } catch {
      // Optional: an unsold room has no identity bound.
    }

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
    };
  } catch {
    return null;
  }
}

/** Current approved-set root version, shown on the verify page. */
export async function readRootVersion(): Promise<string> {
  const v = await publicClient().readContract({
    address: registryAddress(), abi: REGISTRY_ABI, functionName: "rootVersion",
  });
  return v.toString();
}

/** Every listing the registry knows about. Listing ids are 1-indexed. */
export async function readAllRooms(): Promise<RoomRecord[]> {
  const count = await publicClient().readContract({
    address: registryAddress(), abi: REGISTRY_ABI, functionName: "listingCount",
  });
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const rooms = await Promise.all(ids.map(readRoom));
  return rooms.filter((r): r is RoomRecord => r !== null);
}
