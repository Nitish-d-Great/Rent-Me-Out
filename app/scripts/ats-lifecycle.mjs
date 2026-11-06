/**
 * Two lifecycle operations on the ATS-issued room-rights token:
 *   1. mint one unit  (totalSupply 0 -> 1)  — the "issuance" the demo needs
 *   2. grant RentalRegistry ROLE_AGENT      — so the registry can mint and
 *                                             force-transfer on a sale
 *
 *   node scripts/ats-lifecycle.mjs            simulate only
 *   node scripts/ats-lifecycle.mjs --send     execute
 *
 * Signatures come from @hashgraph/asset-tokenization-contracts@8.0.0, the version
 * actually deployed. Building them from `main` produces an unroutable selector.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const TOKEN = env.ATS_ROOM_TOKEN_ADDRESS ?? "0x28aBC0946F97F0b3f5556DeB4B83d645599F29Ac";
const REGISTRY = env.RENTAL_REGISTRY_ADDRESS;
const ROLE_AGENT = "0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b";

const chain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});

const ABI = parseAbi([
  "function mint(address account, uint256 amount)",
  "function grantRole(bytes32 role, address account) returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });
const send = process.argv.includes("--send");

console.log("token   ", TOKEN);
console.log("registry", REGISTRY);
console.log("caller  ", account.address);
console.log("\nbefore:");
console.log("  totalSupply           ", String(await pub.readContract({ address: TOKEN, abi: ABI, functionName: "totalSupply" })));
console.log("  registry has ROLE_AGENT", await pub.readContract({ address: TOKEN, abi: ABI, functionName: "hasRole", args: [ROLE_AGENT, REGISTRY] }));

async function run(label, functionName, args) {
  process.stdout.write(`\n${label} … `);
  try {
    const { request } = await pub.simulateContract({
      address: TOKEN, abi: ABI, functionName, args, account, gas: 8_000_000n,
    });
    process.stdout.write("simulation ok");
    if (!send) { console.log("  (dry run)"); return; }
    const hash = await wallet.writeContract(request);
    // writeContract resolves on submission, so wait for the receipt before believing it.
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    console.log(`  ${receipt.status}  tx ${hash}`);
    if (receipt.status !== "success") process.exitCode = 1;
  } catch (err) {
    console.log("FAILED");
    console.log("  " + String(err).split("\n").filter((l) => l.includes("Error:") || l.includes("reverted")).slice(0, 3).join("\n  "));
    process.exitCode = 1;
  }
}

await run("1. mint 1 unit to the registrar", "mint", [account.address, 1n]);
await run("2. grant RentalRegistry ROLE_AGENT", "grantRole", [ROLE_AGENT, REGISTRY]);

console.log("\nafter:");
console.log("  totalSupply           ", String(await pub.readContract({ address: TOKEN, abi: ABI, functionName: "totalSupply" })));
console.log("  registrar balance     ", String(await pub.readContract({ address: TOKEN, abi: ABI, functionName: "balanceOf", args: [account.address] })));
console.log("  registry has ROLE_AGENT", await pub.readContract({ address: TOKEN, abi: ABI, functionName: "hasRole", args: [ROLE_AGENT, REGISTRY] }));
