/**
 * BrokerIdentityRegistry admin, for development.
 *
 *   node scripts/registry-admin.mjs status <address> [...]   show bindings
 *   node scripts/registry-admin.mjs remove <address> [...]   free a wallet
 *
 * Why this exists: the registry binds one identity per wallet PERMANENTLY, which is
 * correct in production and awkward in rehearsal -- a wallet that has enrolled once can
 * never enroll again. `removeBroker` clears it so the address is reusable.
 *
 * It frees the identity too, so the same human can re-register on a different wallet.
 * That is the ban-evasion door the handoff doc warns about: fine for a testnet reset,
 * not something to leave reachable in production.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const chain = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});

const ABI = parseAbi([
  "function isVerified(address) view returns (bool)",
  "function identityOf(address) view returns (uint256)",
  "function walletOf(uint256) view returns (address)",
  "function sessionOfWallet(address) view returns (bytes32)",
  "function removeBroker(address wallet)",
  "error NotVerified()",
  "error NotRegistrar()",
]);

const REGISTRY = env.IDENTITY_BINDING_ADDRESS;
const pub = createPublicClient({ chain, transport: http() });
const ZERO32 = "0x" + "00".repeat(32);

const [mode, ...addresses] = process.argv.slice(2);
if (!["status", "remove"].includes(mode) || addresses.length === 0) {
  console.error("usage: registry-admin.mjs status|remove <address> [...]");
  process.exit(1);
}

async function show(address) {
  const [verified, identity, session] = await Promise.all([
    pub.readContract({ address: REGISTRY, abi: ABI, functionName: "isVerified", args: [address] }),
    pub.readContract({ address: REGISTRY, abi: ABI, functionName: "identityOf", args: [address] }),
    pub.readContract({ address: REGISTRY, abi: ABI, functionName: "sessionOfWallet", args: [address] }),
  ]);
  return { verified, identity, session };
}

console.log(`registry ${REGISTRY}\n`);

for (const address of addresses) {
  const before = await show(address);
  console.log(address);
  console.log(`  verified  ${before.verified}`);
  console.log(`  identity  ${before.identity === 0n ? "none" : "0x" + before.identity.toString(16).padStart(64, "0")}`);
  console.log(`  session   ${before.session === ZERO32 ? "none" : before.session}`);

  if (mode !== "remove") { console.log(); continue; }
  if (!before.verified) { console.log("  -> nothing to remove\n"); continue; }

  const wallet = createWalletClient({
    account: privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY),
    chain,
    transport: http(),
  });
  const hash = await wallet.writeContract({
    address: REGISTRY, abi: ABI, functionName: "removeBroker", args: [address], gas: 1_000_000n,
  });
  // writeContract resolves on SUBMISSION. Without this a reverted removal looks like
  // a successful one.
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") {
    console.log(`  -> REVERTED (tx ${hash})\n`);
    continue;
  }
  const after = await show(address);
  console.log(`  -> removed, tx ${hash}`);
  console.log(`     now verified=${after.verified} identity=${after.identity === 0n ? "none" : "STILL SET"} session=${after.session === ZERO32 ? "none" : "STILL SET"}\n`);
}
