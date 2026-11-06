"use client";

import {
  createPublicClient, createWalletClient, custom, http, parseAbi,
  type EIP1193Provider, type Hex,
} from "viem";
import { hederaTestnet } from "./registry";

/**
 * The broker's purchase, driven from their own wallet.
 *
 * This one runs in the browser rather than on the server: the broker is spending their
 * own money, so they sign it. The registrar key must never be able to buy on a broker's
 * behalf.
 *
 * Hedera's relay rejects a transaction on its gas limit rather than on gas used, and
 * eth_estimateGas is unreliable there, so every write sets an explicit generous limit.
 */

const GAS = 8_000_000n;

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

const REGISTRY_BUY_ABI = parseAbi([
  "function buyRoom(uint256 listingId)",
  "function getListing(uint256 listingId) view returns (address payout, uint64 start, uint64 end, uint8 status, uint256 price, uint256 roomTag)",
  "error BrokerNotVerified()",
  "error NotAvailable()",
  "error PaymentFailed()",
  "error ListingEnded()",
  "error NoSuchListing()",
]);

export type BuyStage =
  | "checking"
  | "funding"
  | "approving"
  | "buying"
  | "confirming"
  | "done";

export interface BuyProgress {
  stage: BuyStage;
  /** Set once the purchase transaction is known. */
  hash?: Hex;
  note?: string;
}

/** Same access pattern as components/providers.tsx: no global augmentation needed. */
function ethereum(): EIP1193Provider {
  const provider = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("no_wallet");
  return provider;
}

function clients(account: Hex) {
  return {
    pub: createPublicClient({ chain: hederaTestnet, transport: http() }),
    wallet: createWalletClient({
      account, chain: hederaTestnet, transport: custom(ethereum()),
    }),
  };
}

export interface BuyParams {
  listingId: bigint;
  broker: Hex;
  usdc: Hex;
  registry: Hex;
  onProgress?: (progress: BuyProgress) => void;
}

/**
 * Buys a room, topping the broker up from the test faucet if they are short.
 * Returns the purchase transaction hash once it has actually succeeded.
 */
export async function buyRoom({
  listingId, broker, usdc, registry, onProgress,
}: BuyParams): Promise<Hex> {
  const say = (p: BuyProgress) => onProgress?.(p);
  const { pub, wallet } = clients(broker);

  const settle = async (hash: Hex, label: string) => {
    // writeContract resolves on submission; without this wait a reverted step would
    // look like it had worked and the next step would fail confusingly.
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 150_000 });
    if (receipt.status !== "success") throw new Error(`${label}_reverted`);
    return receipt;
  };

  say({ stage: "checking" });
  const [, , , status, price] = await pub.readContract({
    address: registry, abi: REGISTRY_BUY_ABI, functionName: "getListing",
    args: [listingId],
  });
  if (status !== 1) throw new Error("not_available");

  const balance = await pub.readContract({
    address: usdc, abi: USDC_ABI, functionName: "balanceOf", args: [broker],
  });

  // DemoUSDC's mint() is deliberately open on testnet, so a broker can fund themselves
  // rather than wait on the registrar. This would not exist against real USDC.
  if (balance < price) {
    say({ stage: "funding", note: "Minting test USDC" });
    const hash = await wallet.writeContract({
      address: usdc, abi: USDC_ABI, functionName: "mint",
      args: [broker, price - balance], gas: GAS, chain: hederaTestnet,
    });
    await settle(hash, "mint");
  }

  const allowance = await pub.readContract({
    address: usdc, abi: USDC_ABI, functionName: "allowance", args: [broker, registry],
  });
  if (allowance < price) {
    say({ stage: "approving", note: "Approving the registry to collect the price" });
    const hash = await wallet.writeContract({
      address: usdc, abi: USDC_ABI, functionName: "approve",
      args: [registry, price], gas: GAS, chain: hederaTestnet,
    });
    await settle(hash, "approve");
  }

  say({ stage: "buying" });
  // Simulate first so a revert (an unverified broker, say) surfaces as a decoded error
  // before the broker is asked to sign anything.
  await pub.simulateContract({
    address: registry, abi: REGISTRY_BUY_ABI, functionName: "buyRoom",
    args: [listingId], account: broker, gas: GAS,
  });

  const hash = await wallet.writeContract({
    address: registry, abi: REGISTRY_BUY_ABI, functionName: "buyRoom",
    args: [listingId], gas: GAS, chain: hederaTestnet,
  });
  say({ stage: "confirming", hash });
  await settle(hash, "buyRoom");

  say({ stage: "done", hash });
  return hash;
}

/** Turns a contract or wallet failure into something a broker can act on. */
export function explainBuyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("BrokerNotVerified")) {
    return "This wallet is not a verified broker. Complete World ID verification first.";
  }
  if (message.includes("NotAvailable") || message.includes("not_available")) {
    return "This room is no longer available.";
  }
  if (message.includes("ListingEnded")) return "This listing has ended.";
  if (message.includes("PaymentFailed")) return "The USDC transfer failed.";
  if (message.includes("no_wallet")) return "No wallet found. Install MetaMask to buy.";
  if (message.includes("User rejected") || message.includes("4001")) {
    return "You rejected the transaction.";
  }
  return "The purchase did not go through. Nothing was charged.";
}
