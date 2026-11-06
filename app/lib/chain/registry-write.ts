import "server-only";
import { createWalletClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet, publicClient, REGISTRY_ABI, registryAddress } from "./registry";

/**
 * Registrar-signed writes against RentalRegistry.
 *
 * The registrar key lives on the server and never reaches the browser, so these run
 * here rather than through a wallet. Freezing is a supervisory act: the registrar is
 * the party the contract authorises, not the room's holder.
 */

const FREEZE_ABI = [
  ...REGISTRY_ABI,
  ...([
    { type: "function", name: "freezeRoom", stateMutability: "nonpayable",
      inputs: [{ name: "listingId", type: "uint256" }, { name: "reasonHash", type: "bytes32" }],
      outputs: [] },
    { type: "function", name: "unfreezeRoom", stateMutability: "nonpayable",
      inputs: [{ name: "listingId", type: "uint256" }, { name: "reasonHash", type: "bytes32" }],
      outputs: [] },
    { type: "function", name: "approveProperty", stateMutability: "nonpayable",
      inputs: [{ name: "applicationId", type: "bytes32" }, { name: "commitment", type: "uint256" }],
      outputs: [] },
    { type: "function", name: "rejectProperty", stateMutability: "nonpayable",
      inputs: [{ name: "applicationId", type: "bytes32" }, { name: "reasonHash", type: "bytes32" }],
      outputs: [] },
    { type: "error", name: "AlreadyFrozen", inputs: [] },
    { type: "error", name: "NotFrozen", inputs: [] },
    { type: "error", name: "NotRegistrar", inputs: [] },
    { type: "error", name: "NotAvailable", inputs: [] },
  ] as const),
] as const;

/**
 * Hedera's relay rejects a transaction on its gas *limit*, not on gas actually used,
 * and eth_estimateGas is unreliable here -- a freeze that burns ~60k failed outright
 * at a 3M limit. Set the limit generously; unused gas is not charged.
 */
const WRITE_GAS = 8_000_000n;

function registrar() {
  const key = process.env.REGISTRAR_PRIVATE_KEY;
  if (!key) throw new Error("REGISTRAR_PRIVATE_KEY is not set");
  return privateKeyToAccount(key as `0x${string}`);
}

export interface FreezeResult {
  hash: `0x${string}`;
  reasonHash: `0x${string}`;
}

/** Reason text is hashed on-chain; the words themselves stay off-chain. */
export function hashReason(reason: string): `0x${string}` {
  return keccak256(toBytes(reason));
}

async function write(
  functionName: "freezeRoom" | "unfreezeRoom",
  listingId: bigint,
  reason: string,
): Promise<FreezeResult> {
  const account = registrar();
  const address = registryAddress();
  const reasonHash = hashReason(reason);

  // Simulate first so a revert surfaces as a decoded error instead of a mined failure.
  await publicClient().simulateContract({
    address, abi: FREEZE_ABI, functionName, args: [listingId, reasonHash],
    account, gas: WRITE_GAS,
  });

  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
  const hash = await wallet.writeContract({
    address, abi: FREEZE_ABI, functionName, args: [listingId, reasonHash],
    gas: WRITE_GAS, chain: hederaTestnet,
  });

  // writeContract resolves when the transaction is submitted, not when it succeeds.
  // Without this wait a reverted freeze would be reported to the registrar as done.
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new Error(`transaction ${hash} reverted on-chain`);
  }
  return { hash, reasonHash };
}

export const freezeRoom = (listingId: bigint, reason: string) =>
  write("freezeRoom", listingId, reason);

export const unfreezeRoom = (listingId: bigint, reason: string) =>
  write("unfreezeRoom", listingId, reason);

/**
 * Admits a property to the approved set.
 *
 * The commitment is the owner's Semaphore identity commitment, generated on their own
 * device: the registrar approves a commitment without learning which listings it will
 * later produce, which is what keeps the owner's listings unlinkable.
 */
export async function approveProperty(
  applicationId: `0x${string}`,
  commitment: bigint,
): Promise<`0x${string}`> {
  const account = registrar();
  const address = registryAddress();

  await publicClient().simulateContract({
    address, abi: FREEZE_ABI, functionName: "approveProperty",
    args: [applicationId, commitment], account, gas: WRITE_GAS,
  });

  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
  const hash = await wallet.writeContract({
    address, abi: FREEZE_ABI, functionName: "approveProperty",
    args: [applicationId, commitment], gas: WRITE_GAS, chain: hederaTestnet,
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`approveProperty ${hash} reverted`);
  return hash;
}

/** Declines an application. Only the reason's hash is recorded on-chain. */
export async function rejectProperty(
  applicationId: `0x${string}`,
  reason: string,
): Promise<`0x${string}`> {
  const account = registrar();
  const address = registryAddress();
  const reasonHash = hashReason(reason);

  await publicClient().simulateContract({
    address, abi: FREEZE_ABI, functionName: "rejectProperty",
    args: [applicationId, reasonHash], account, gas: WRITE_GAS,
  });

  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
  const hash = await wallet.writeContract({
    address, abi: FREEZE_ABI, functionName: "rejectProperty",
    args: [applicationId, reasonHash], gas: WRITE_GAS, chain: hederaTestnet,
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`rejectProperty ${hash} reverted`);
  return hash;
}
