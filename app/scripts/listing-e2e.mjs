/**
 * Proves the full owner path on-chain, with no fixture:
 *   1. a fresh owner identity           (as an owner's device would create)
 *   2. registrar approves its commitment (approveProperty)
 *   3. group rebuilt from chain events
 *   4. Semaphore proof over the owner's listing terms
 *   5. createListing                     (the proof authorises it; no owner key needed)
 *
 *   node scripts/listing-e2e.mjs            simulate only
 *   node scripts/listing-e2e.mjs --send     execute
 */
import { readFileSync } from "node:fs";
import { Group, Identity, generateProof } from "@semaphore-protocol/core";
import {
  createPublicClient, createWalletClient, defineChain, http,
  keccak256, encodePacked, parseAbi, parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const REGISTRY = env.RENTAL_REGISTRY_ADDRESS;
const chain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});

const ABI = parseAbi([
  "function approveProperty(bytes32 applicationId, uint256 commitment)",
  "function createListing((uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points) proof, uint64 start, uint64 end, uint256 price, address payout) returns (uint256)",
  "function approvedRoot() view returns (uint256,uint256)",
  "function listingCount() view returns (uint256)",
  "function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout) view returns (uint256)",
]);
const APPROVED_EV = parseAbiItem("event PropertyApproved(bytes32 indexed applicationId, uint256 indexed commitment, uint256 rootVersion, uint256 root)");
const REVOKED_EV  = parseAbiItem("event PropertyRevoked(uint256 indexed commitment, uint256 rootVersion, uint256 root)");

const GAS = 8_000_000n;
const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });
const send = process.argv.includes("--send");

async function settle(hash, label) {
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 150_000 });
  console.log(`   ${label}: ${r.status}  ${hash}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
  return r;
}

// 1. A fresh owner. On a real device this seed never leaves the browser.
const seed = process.env.OWNER_SEED ?? `rentmeout-owner-${Date.now()}`;
const owner = new Identity(seed);
console.log("owner seed      ", seed);
console.log("commitment      ", owner.commitment.toString().slice(0, 30) + "…");

// Terms: a room tag unique to this owner, spanning now so the tenant page reads valid.
const room = BigInt("0x" + keccak256(encodePacked(["string"], [seed])).slice(2, 18));
const now = Math.floor(Date.now() / 1000);
const terms = {
  room,
  start: BigInt(now - 86_400),            // started yesterday
  end: BigInt(now + 300 * 86_400),        // runs ~10 months
  price: 1_500_000_000n,                  // 1500 USDC (6dp)
  payout: account.address,
};
console.log("room tag        ", room.toString().slice(0, 24) + "…");
console.log("period          ", new Date(Number(terms.start) * 1000).toISOString().slice(0, 10),
            "->", new Date(Number(terms.end) * 1000).toISOString().slice(0, 10));

const applicationId = keccak256(encodePacked(["string"], [`app-${seed}`]));

if (!send) { console.log("\n(dry run -- pass --send to approve and list)"); process.exit(0); }

async function readMembers() {
  const tip = await pub.getBlockNumber();
  const from = tip > 200_000n ? tip - 200_000n : 0n;
  const [aLogs, rLogs] = await Promise.all([
    pub.getLogs({ address: REGISTRY, event: APPROVED_EV, fromBlock: from, toBlock: tip }),
    pub.getLogs({ address: REGISTRY, event: REVOKED_EV,  fromBlock: from, toBlock: tip }),
  ]);
  const gone = new Set(rLogs.map((l) => l.args.commitment.toString()));
  return aLogs.map((l) => l.args.commitment.toString()).filter((c) => !gone.has(c));
}

// 2. Registrar approves the property -- unless this owner is already a member.
const existing = await readMembers();
if (existing.includes(owner.commitment.toString())) {
  console.log("\n2. approveProperty … already approved, skipping");
} else {
  console.log("\n2. approveProperty …");
  const { request: approveReq } = await pub.simulateContract({
    address: REGISTRY, abi: ABI, functionName: "approveProperty",
    args: [applicationId, owner.commitment], account, gas: GAS,
  });
  await settle(await wallet.writeContract(approveReq), "approveProperty");
}

// 3. Rebuild the group from events -- the same way the app will.
//    Hashio indexes logs a moment behind consensus, so a tree built immediately after
//    approval can still be missing the new leaf. Only proceed once the rebuilt root
//    matches the chain's: that is the invariant a valid proof depends on.
console.log("\n3. rebuilding group from chain events …");
let group, members, onChainRoot;
for (let attempt = 1; attempt <= 15; attempt++) {
  [onChainRoot] = await pub.readContract({ address: REGISTRY, abi: ABI, functionName: "approvedRoot" });
  members = await readMembers();
  group = new Group(members);
  if (group.root.toString() === onChainRoot.toString()) {
    console.log(`   members: ${members.length}  root matches chain (attempt ${attempt})`);
    break;
  }
  if (attempt === 15) throw new Error("group never caught up with the chain root");
  await new Promise((r) => setTimeout(r, 2000));
}

// 4. Prove membership, bound to these exact terms.
console.log("\n4. generating Semaphore proof …");
const message = await pub.readContract({
  address: REGISTRY, abi: ABI, functionName: "listingMessage",
  args: [terms.room, terms.start, terms.end, terms.price, terms.payout],
});
const proof = await generateProof(owner, group, message, terms.room);
console.log("   nullifier (room tag on-chain):", proof.nullifier.toString().slice(0, 24) + "…");

// 5. List. Anyone may submit this transaction: the proof is the authorisation.
console.log("\n5. createListing …");
const { request: listReq } = await pub.simulateContract({
  address: REGISTRY, abi: ABI, functionName: "createListing",
  args: [{
    merkleTreeDepth: BigInt(proof.merkleTreeDepth),
    merkleTreeRoot: BigInt(proof.merkleTreeRoot),
    nullifier: BigInt(proof.nullifier),
    message: BigInt(proof.message),
    scope: BigInt(proof.scope),
    points: proof.points.map(BigInt),
  }, terms.start, terms.end, terms.price, terms.payout],
  account, gas: GAS,
});
await settle(await wallet.writeContract(listReq), "createListing");

const count = await pub.readContract({ address: REGISTRY, abi: ABI, functionName: "listingCount" });
console.log(`\nlistingCount now ${count}  -> new listing id ${count}`);
