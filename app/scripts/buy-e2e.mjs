/**
 * Exercises the same sequence components/marketplace/buy-panel.tsx performs, so the
 * broker path can be verified without driving MetaMask:
 *   mint test USDC (if short) -> approve the registry -> buyRoom -> read the holder
 *
 *   node scripts/buy-e2e.mjs <listingId> [--send]
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const listingId = BigInt(process.argv[2] ?? "2");
const send = process.argv.includes("--send");
const REGISTRY = env.RENTAL_REGISTRY_ADDRESS;
const USDC = env.DEMO_USDC_ADDRESS;

const chain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});
const GAS = 8_000_000n;

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
]);
const REG_ABI = parseAbi([
  "function buyRoom(uint256)",
  "function getListing(uint256) view returns (address,uint64,uint64,uint8,uint256,uint256)",
  "function holderOf(uint256) view returns (address)",
  "error BrokerNotVerified()", "error NotAvailable()", "error PaymentFailed()",
]);

const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });

const settle = async (hash, label) => {
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 150_000 });
  console.log(`   ${label}: ${r.status}  ${hash}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
};

const [, , , status, price] = await pub.readContract({
  address: REGISTRY, abi: REG_ABI, functionName: "getListing", args: [listingId],
});
console.log(`listing ${listingId}  status ${status}  price ${(Number(price) / 1e6).toFixed(2)} dUSDC`);
console.log("broker ", account.address);
if (status !== 1) { console.log("not available -- nothing to buy"); process.exit(0); }

const balance = await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [account.address] });
console.log("balance", (Number(balance) / 1e6).toFixed(2), "dUSDC");
if (!send) { console.log("\n(dry run -- pass --send to buy)"); process.exit(0); }

if (balance < price) {
  console.log("\n1. mint test USDC …");
  await settle(await wallet.writeContract({
    address: USDC, abi: USDC_ABI, functionName: "mint",
    args: [account.address, price - balance], gas: GAS, chain,
  }), "mint");
}

const allowance = await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "allowance", args: [account.address, REGISTRY] });
if (allowance < price) {
  console.log("\n2. approve the registry …");
  await settle(await wallet.writeContract({
    address: USDC, abi: USDC_ABI, functionName: "approve",
    args: [REGISTRY, price], gas: GAS, chain,
  }), "approve");
}

console.log("\n3. buyRoom …");
const { request } = await pub.simulateContract({
  address: REGISTRY, abi: REG_ABI, functionName: "buyRoom", args: [listingId], account, gas: GAS,
});
await settle(await wallet.writeContract(request), "buyRoom");

console.log("\nholder now", await pub.readContract({ address: REGISTRY, abi: REG_ABI, functionName: "holderOf", args: [listingId] }));
console.log("balance   ", (Number(await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [account.address] })) / 1e6).toFixed(2), "dUSDC");
