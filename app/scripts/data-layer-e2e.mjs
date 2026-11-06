/**
 * Runs the data layer end to end through the app's own HTTP routes, and reads the
 * ciphertext straight from Swarm to confirm nothing private is public:
 *   apply (Swarm + Arkiv) -> registrar reads and decrypts -> approve (Hedera + Arkiv)
 *   -> prove and list (Hedera + Arkiv) -> buy -> sync -> rights record -> freeze -> sync
 *
 * Needs the dev server running. Spends test HBAR and tGLM, and takes a few minutes.
 *   node scripts/data-layer-e2e.mjs
 */
import { readFileSync } from "node:fs";
import { Group, Identity, generateProof } from "@semaphore-protocol/core";
import {
  createPublicClient, createWalletClient, defineChain, encodePacked, getAddress, http,
  keccak256, parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const REGISTRY = getAddress(env.RENTAL_REGISTRY_ADDRESS);
const USDC = getAddress(env.DEMO_USDC_ADDRESS);
const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
const registrarHeaders = env.REGISTRAR_ACCESS_TOKEN ? { "x-registrar-token": env.REGISTRAR_ACCESS_TOKEN } : {};

let failed = 0;
function check(label, ok, detail = "") {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
}
process.on("uncaughtException", (error) => {
  console.error(`\nSTOPPED: ${error.shortMessage ?? error.message}`);
  process.exit(1);
});

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

const hederaChain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});
const transport = http(undefined, { timeout: 60_000, retryCount: 8, retryDelay: 2_000 });
const pub = createPublicClient({ chain: hederaChain, transport });
const wallet = createWalletClient({ account, chain: hederaChain, transport });

const seed = `data-layer-${Date.now()}`;
const owner = new Identity(seed);
const applicationId = `APP-E2E-${Date.now().toString(36).toUpperCase()}`;
const SECRET = `Secret Street ${Date.now()}`;
const deed = Buffer.from("%PDF-1.4\n% e2e deed " + Date.now());

console.log("1. owner applies");
const applied = await api("/api/properties", {
  method: "POST",
  body: JSON.stringify({
    action: "apply", applicationId, commitment: owner.commitment.toString(),
    nickname: "E2E Flat", locality: SECRET, city: "Mumbai", rooms: 2,
    deedName: "e2e.pdf", deedBase64: deed.toString("base64"),
  }),
});
check("application stored", applied.status === 200 && applied.body.ok, `${applied.status} ${applied.body.error ?? ""}`);
const { entityKey, sealedRef } = applied.body.application ?? {};
console.log("   entity", entityKey);
console.log("   swarm ", sealedRef);

console.log("\n2. nothing private is public");
const onSwarm = await fetch(`${env.SWARM_BEE_URL.replace(/\/$/, "")}/bytes/${sealedRef}`, { signal: AbortSignal.timeout(60_000) });
const sealedBytes = Buffer.from(await onSwarm.arrayBuffer());
check("the ciphertext is readable on Swarm", onSwarm.status === 200 && sealedBytes.length > 28, `${sealedBytes.length} bytes`);
check("the address is not in it", !sealedBytes.includes(SECRET));
check("the commitment is not in it", !sealedBytes.includes(owner.commitment.toString()));
const anonymous = await api("/api/properties");
if (env.REGISTRAR_ACCESS_TOKEN) check("anonymous callers cannot list applications", anonymous.status === 401);

console.log("\n3. registrar reads the queue from Arkiv and decrypts it");
const queue = await api("/api/properties", { headers: registrarHeaders });
const mine = (queue.body.applications ?? []).find((a) => a.applicationId === applicationId);
check("application is in the queue", Boolean(mine));
check("details decrypt correctly", mine?.locality === SECRET && mine?.commitment === owner.commitment.toString());
check("status is pending", mine?.status === "pending");
const deedRes = await fetch(`${BASE}/api/properties/${applicationId}/deed`, { headers: registrarHeaders, signal: AbortSignal.timeout(90_000) });
check("deed round-trips", Buffer.from(await deedRes.arrayBuffer()).equals(deed));
const ownerView = await api(`/api/properties?commitment=${owner.commitment}`);
check("the owner finds their own application", ownerView.body.applications?.[0]?.applicationId === applicationId);

console.log("\n4. registrar approves");
const approved = await api("/api/properties", {
  method: "POST", headers: registrarHeaders,
  body: JSON.stringify({ action: "approve", applicationId }),
});
check("approved on Hedera", approved.status === 200 && approved.body.ok, approved.body.error ?? approved.body.transactionHash);
check("decision reached Arkiv", approved.body.indexed === true);
const afterApprove = await api(`/api/properties?commitment=${owner.commitment}`);
check("Arkiv status is approved", afterApprove.body.applications?.[0]?.status === "approved");

console.log("\n5. owner proves and lists");
let members, group;
for (let attempt = 1; ; attempt += 1) {
  const g = await api("/api/group");
  members = g.body.members ?? [];
  group = new Group(members);
  if (members.includes(owner.commitment.toString()) && group.root.toString() === g.body.root) break;
  if (attempt === 30) throw new Error("group never caught up with the chain");
  await new Promise((r) => setTimeout(r, 3000));
}
const REG_ABI = parseAbi([
  "function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout) view returns (uint256)",
  "function buyRoom(uint256 listingId)",
  "function holderOf(uint256 listingId) view returns (address)",
]);
const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
]);
const now = Math.floor(Date.now() / 1000);
const terms = {
  room: BigInt(keccak256(encodePacked(["string"], [seed])).slice(0, 18)),
  start: BigInt(now - 60), end: BigInt(now + 3 * 86_400), price: 1_000_000n, payout: account.address,
};
const message = await pub.readContract({
  address: REGISTRY, abi: REG_ABI, functionName: "listingMessage",
  args: [terms.room, terms.start, terms.end, terms.price, terms.payout],
});
const proof = await generateProof(owner, group, message, terms.room);
const listed = await api("/api/listings", {
  method: "POST",
  body: JSON.stringify({
    proof: {
      merkleTreeDepth: String(proof.merkleTreeDepth), merkleTreeRoot: String(proof.merkleTreeRoot),
      nullifier: String(proof.nullifier), message: String(proof.message), scope: String(proof.scope),
      points: proof.points.map(String),
    },
    start: Number(terms.start), end: Number(terms.end), price: terms.price.toString(), payout: terms.payout,
    city: "Mumbai", label: "E2E room",
  }),
});
check("listed on Hedera", listed.status === 200 && listed.body.ok, listed.body.error ?? `listing ${listed.body.listingId}`);
check("listing reached Arkiv", listed.body.indexed === true);
const listingId = BigInt(listed.body.listingId ?? 0);

console.log("\n6. the listing can be found on Arkiv by city");
const found = await api("/api/arkiv/listings?city=Mumbai&status=available");
const row = (found.body.listings ?? []).find((l) => l.listingId === listingId.toString());
check("found by city and status", Boolean(row));
check("its token matches the chain", row?.token?.toLowerCase() === listed.body.token?.toLowerCase());
const none = await api("/api/arkiv/listings?city=Nowhere");
check("another city does not return it", (none.body.listings ?? []).every((l) => l.listingId !== listingId.toString()));

console.log("\n7. a broker buys, and the index follows the chain");
if ((await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [account.address] })) < terms.price) {
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: USDC, abi: USDC_ABI, functionName: "mint", args: [account.address, terms.price], gas: 8_000_000n, chain: hederaChain }), timeout: 180_000 });
}
if ((await pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "allowance", args: [account.address, REGISTRY] })) < terms.price) {
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: USDC, abi: USDC_ABI, functionName: "approve", args: [REGISTRY, terms.price], gas: 8_000_000n, chain: hederaChain }), timeout: 180_000 });
}
const buyHash = await wallet.writeContract({ address: REGISTRY, abi: REG_ABI, functionName: "buyRoom", args: [listingId], gas: 8_000_000n, chain: hederaChain });
const buyReceipt = await pub.waitForTransactionReceipt({ hash: buyHash, timeout: 180_000 });
check("bought on Hedera", buyReceipt.status === "success", buyHash);
const synced = await api(`/api/rooms/${listingId}/sync`, { method: "POST" });
check("sync copied the sale", synced.body.state === "held" && synced.body.indexed === true && synced.body.rightsIndexed === true, JSON.stringify(synced.body));
const sold = await api("/api/arkiv/listings?city=Mumbai&status=sold");
check("Arkiv shows it as sold", (sold.body.listings ?? []).some((l) => l.listingId === listingId.toString()));
const stillAvailable = await api("/api/arkiv/listings?city=Mumbai&status=available");
check("Arkiv no longer shows it available", (stillAvailable.body.listings ?? []).every((l) => l.listingId !== listingId.toString()));

console.log("\n8. a freeze reaches the index");
const frozen = await api(`/api/rooms/${listingId}/freeze`, {
  method: "POST", headers: registrarHeaders, body: JSON.stringify({ action: "freeze", reason: "e2e dispute" }),
});
check("frozen on Hedera", frozen.status === 200 && frozen.body.ok, frozen.body.error ?? "");
const frozenRows = await api("/api/arkiv/listings?status=frozen");
check("Arkiv shows it as frozen", (frozenRows.body.listings ?? []).some((l) => l.listingId === listingId.toString()));

console.log(`\nArkiv writer ${account.address}`);
console.log(`explorer     https://rabdi.explorer.arkiv.network/address/${account.address}`);
console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
