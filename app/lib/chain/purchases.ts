import { createPublicClient, http, parseAbiItem } from "viem";
import { hederaTestnet, registryAddress } from "./registry";

/**
 * A broker's purchases, read from RoomPurchased events.
 *
 * The registry does not keep a per-broker index, so the history comes from the event
 * log rather than a table the app maintains -- which means it cannot disagree with
 * what actually happened on-chain.
 */

// payout is indexed as well -- taken from foundry/deployments/abi/RentalRegistry.json.
// Getting the indexed flags wrong silently misdecodes the non-indexed args rather than
// throwing, so price came back as 0.00.
const PURCHASED = parseAbiItem(
  "event RoomPurchased(uint256 indexed listingId, address indexed broker, address indexed payout, uint256 price)",
);

const LOOKBACK = 200_000n;

export interface Purchase {
  listingId: string;
  broker: `0x${string}`;
  payout: `0x${string}`;
  /** USDC, 6 decimals, formatted. */
  price: string;
  transactionHash: `0x${string}`;
  blockNumber: string;
}

/** Purchases by one broker, newest first. Empty when they have bought nothing. */
export async function readPurchases(broker?: `0x${string}`): Promise<Purchase[]> {
  const pub = createPublicClient({ chain: hederaTestnet, transport: http() });
  const tip = await pub.getBlockNumber();
  const fromBlock = tip > LOOKBACK ? tip - LOOKBACK : 0n;

  const logs = await pub.getLogs({
    address: registryAddress(),
    event: PURCHASED,
    args: broker ? { broker } : undefined,
    fromBlock,
    toBlock: tip,
  });

  return logs
    .map((log) => ({
      listingId: log.args.listingId?.toString() ?? "0",
      broker: (log.args.broker ?? "0x") as `0x${string}`,
      payout: (log.args.payout ?? "0x") as `0x${string}`,
      price: (Number(log.args.price ?? 0n) / 1e6).toFixed(2),
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber?.toString() ?? "0",
    }))
    .reverse();
}

/** The purchase of one room, or null if nobody has bought it. */
export async function readPurchaseOf(listingId: bigint): Promise<Purchase | null> {
  const pub = createPublicClient({ chain: hederaTestnet, transport: http() });
  const tip = await pub.getBlockNumber();
  const logs = await pub.getLogs({
    address: registryAddress(),
    event: PURCHASED,
    args: { listingId },
    fromBlock: tip > LOOKBACK ? tip - LOOKBACK : 0n,
    toBlock: tip,
  });
  const log = logs.at(-1);
  if (!log) return null;
  return {
    listingId: listingId.toString(),
    broker: (log.args.broker ?? "0x") as `0x${string}`,
    payout: (log.args.payout ?? "0x") as `0x${string}`,
    price: (Number(log.args.price ?? 0n) / 1e6).toFixed(2),
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber.toString(),
  };
}
