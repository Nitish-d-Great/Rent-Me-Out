/**
 * Runs one room through its whole lifecycle against the real ATS on Hedera testnet:
 *   approve -> list (issues the ATS token) -> buy -> resale blocked -> freeze -> unfreeze
 *   -> period ends -> expire (burns the token)
 *
 * After each step it reads the ATS token directly rather than trusting the registry's
 * own view. The unit tests use a mock of ATS, so this is what actually proves the wiring.
 *
 *   node scripts/ats-registry-e2e.mjs            simulate the checks that need no writes
 *   node scripts/ats-registry-e2e.mjs --send     run it (spends test HBAR, takes minutes)
 *
 *   REGISTRY=0x... overrides RENTAL_REGISTRY_ADDRESS from .env.local.
 */
import { readFileSync } from "node:fs";
import { Group, Identity, generateProof } from "@semaphore-protocol/core";
import {
  createPublicClient, createWalletClient, defineChain, encodePacked, http, keccak256,
  parseAbi, parseAbiItem, toFunctionSelector,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const REGISTRY = process.env.REGISTRY ?? env.RENTAL_REGISTRY_ADDRESS;
const send = process.argv.includes("--send");
/**
 * Long enough to buy, freeze and unfreeze before the period ends, even when Hashio is
 * slow: one run took 5.5 minutes just from listing to purchase. The run waits this out
 * to test expiry, so PERIOD_SECONDS can shorten it when the network is healthy.
 */
const PERIOD_SECONDS = Number(process.env.PERIOD_SECONDS ?? 1800);
/** Issuing the ATS token inside a listing measured about 7.9M gas. */
const LISTING_GAS = 10_000_000n;
const GAS = 8_000_000n;

const chain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  // RPC_URL lets a run use another endpoint when Hashio is down.
  rpcUrls: { default: { http: [process.env.RPC_URL ?? env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});

const REG_ABI = parseAbi([
  "function approveProperty(bytes32 applicationId, uint256 commitment)",
  "function createListing((uint256 merkleTreeDepth,uint256 merkleTreeRoot,uint256 nullifier,uint256 message,uint256 scope,uint256[8] points) proof, uint64 start, uint64 end, uint256 price, address payout) returns (uint256)",
  "function buyRoom(uint256 listingId)",
  "function freezeRoom(uint256 listingId, bytes32 reasonHash)",
  "function unfreezeRoom(uint256 listingId, bytes32 reasonHash)",
  "function expire(uint256 listingId)",
  "function approvedRoot() view returns (uint256, uint256)",
  "function listingCount() view returns (uint256)",
  "function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout) view returns (uint256)",
  "function tokenOf(uint256 listingId) view returns (address)",
  "function holderOf(uint256 listingId) view returns (address)",
  "function isValid(uint256 listingId) view returns (bool)",
  "function isFrozen(uint256 listingId) view returns (bool)",
  "function roomState(uint256 listingId) view returns (uint8)",
  "function usdc() view returns (address)",
  "function identity() view returns (address)",
  "error BrokerNotVerified()",
  "error NotAvailable()",
  "error NotYetExpired()",
]);
const ATS_ABI = parseAbi([
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function isFrozen(address) view returns (bool)",
  "function isInControlList(address) view returns (bool)",
  "function getControlListType() view returns (bool)",
  "function isControllable() view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);
const IDENTITY_ABI = parseAbi(["function isVerified(address) view returns (bool)"]);
const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
]);
const APPROVED_EV = parseAbiItem("event PropertyApproved(bytes32 indexed applicationId, uint256 indexed commitment, uint256 rootVersion, uint256 root)");

const BROKER_NOT_VERIFIED = "0x71f75b51";
const NOT_YET_EXPIRED = toFunctionSelector("NotYetExpired()");
const ROLE_AGENT = "0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b";
const ROLE_ADMIN = `0x${"00".repeat(32)}`;
// A recipient only: it does not exist on Hedera, so it cannot send a simulated call.
const STRANGER = "0x00000000000000000000000000000000DeaDBeef";
// Account 0.0.2 exists but is not a verified broker, so it can stand in as a buyer.
const UNVERIFIED_BUYER = "0x0000000000000000000000000000000000000002";

const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
// Hashio returns 502s often enough to matter. Retrying is safe for writes too: the same
// signed transaction has the same hash and nonce, so it cannot execute twice.
const transport = http(undefined, { timeout: 60_000, retryCount: 8, retryDelay: 2_000 });
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });

let failed = 0;
function check(label, ok, detail = "") {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
}

const read = (address, abi, functionName, args = []) =>
  pub.readContract({ address, abi, functionName, args });
const reg = (fn, args) => read(REGISTRY, REG_ABI, fn, args);

/** Passes only if the call reverts, and reports the reason so a wrong revert is visible. */
async function reverts(address, abi, functionName, args, from) {
  try {
    await pub.simulateContract({ address, abi, functionName, args, account: from, gas: GAS });
    return { reverted: false, why: "" };
  } catch (error) {
    // Hashio can return only the error's selector, which viem's short message leaves out,
    // so the decoded name has to be looked for further down the error chain.
    const decoded = error.walk?.((e) => e?.data?.errorName !== undefined)?.data?.errorName;
    const selector = error.walk?.((e) => typeof e?.data === "string")?.data;
    const why = decoded ?? selector ?? String(error.shortMessage ?? error).split("\n")[0];
    return { reverted: true, why: why.slice(0, 80) };
  }
}

async function write(label, address, abi, functionName, args, gas = GAS) {
  await pub.simulateContract({ address, abi, functionName, args, account, gas });
  const hash = await wallet.writeContract({ address, abi, functionName, args, gas, chain });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`   ${label}: ${receipt.status}  gas ${receipt.gasUsed}  ${hash}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

// A viem failure prints its whole ABI, which pushes the actual reason off the screen.
process.on("uncaughtException", (error) => {
  console.error(`\nSTOPPED: ${error.shortMessage ?? error.message}`);
  for (const line of error.metaMessages ?? []) console.error(`  ${line}`);
  process.exit(1);
});

console.log("registry", REGISTRY);
console.log("signer  ", account.address);
if (!send) {
  console.log("listingCount", String(await reg("listingCount")));
  console.log("\n(dry run -- pass --send to run the lifecycle)");
  process.exit(0);
}

// ---------------------------------------------------------------- approve + prove
const seed = `ats-e2e-${Date.now()}`;
const owner = new Identity(seed);
const room = BigInt(keccak256(encodePacked(["string"], [seed])).slice(0, 18));

console.log("\n1. approve the property");
await write("approveProperty", REGISTRY, REG_ABI, "approveProperty", [
  keccak256(encodePacked(["string"], [`app-${seed}`])), owner.commitment,
]);

console.log("\n2. prove and list");
let group;
for (let attempt = 1; ; attempt += 1) {
  const tip = await pub.getBlockNumber();
  const logs = await pub.getLogs({
    address: REGISTRY, event: APPROVED_EV, fromBlock: tip - 100_000n, toBlock: tip,
  });
  group = new Group(logs.map((l) => l.args.commitment.toString()));
  const [root] = await reg("approvedRoot");
  // Log indexing lags consensus, and a proof against a stale tree is rejected.
  if (group.root.toString() === root.toString()) break;
  if (attempt === 15) throw new Error("group never caught up with the chain root");
  await new Promise((r) => setTimeout(r, 2000));
}
// Set only now: approval and the group rebuild can take minutes when Hashio is slow, and
// that time must not come out of the period the rest of the run depends on.
const now = Math.floor(Date.now() / 1000);
const terms = {
  room,
  start: BigInt(now - 60),
  end: BigInt(now + PERIOD_SECONDS),
  price: 1_000_000n,
  payout: account.address,
};
const message = await reg("listingMessage", [terms.room, terms.start, terms.end, terms.price, terms.payout]);
const proof = await generateProof(owner, group, message, terms.room);
const listing = await write("createListing", REGISTRY, REG_ABI, "createListing", [{
  merkleTreeDepth: BigInt(proof.merkleTreeDepth),
  merkleTreeRoot: BigInt(proof.merkleTreeRoot),
  nullifier: BigInt(proof.nullifier),
  message: BigInt(proof.message),
  scope: BigInt(proof.scope),
  points: proof.points.map(BigInt),
}, terms.start, terms.end, terms.price, terms.payout], LISTING_GAS);

const id = await reg("listingCount");
const TOKEN = await reg("tokenOf", [id]);
const ats = (fn, args) => read(TOKEN, ATS_ABI, fn, args);
console.log(`   listing ${id}  ATS token ${TOKEN}`);
console.log(`   https://hashscan.io/testnet/contract/${TOKEN}`);

check("the factory issued a token with code", ((await pub.getCode({ address: TOKEN })) ?? "0x").length > 2);
check("named for this listing", (await ats("name")) === `RentMeOut Room Rights #${id}`, await ats("name"));
check("zero decimals", (await ats("decimals")) === 0);
check("supply is exactly 1", (await ats("totalSupply")) === 1n);
check("held in the registry's escrow", (await ats("balanceOf", [REGISTRY])) === 1n);
check("its control list is an allowlist", await ats("getControlListType"));
check("it is controllable", await ats("isControllable"));
check("registry holds the admin role", await ats("hasRole", [ROLE_ADMIN, REGISTRY]));
check("registry holds the agent role", await ats("hasRole", [ROLE_AGENT, REGISTRY]));
check("the deployer holds no agent role", !(await ats("hasRole", [ROLE_AGENT, account.address])));
check("listed, with no holder yet", (await reg("holderOf", [id])) === "0x0000000000000000000000000000000000000000");

// ------------------------------------------------------------------------- buy
console.log("\n3. an unverified wallet cannot buy");
const identity = await reg("identity");
check(
  "the stand-in buyer really is unverified",
  !(await read(identity, IDENTITY_ABI, "isVerified", [UNVERIFIED_BUYER])),
);
const blocked = await reverts(REGISTRY, REG_ABI, "buyRoom", [id], UNVERIFIED_BUYER);
check(
  "buyRoom reverts with BrokerNotVerified",
  blocked.reverted && (blocked.why === "BrokerNotVerified" || blocked.why.startsWith(BROKER_NOT_VERIFIED)),
  blocked.why,
);

console.log("\n4. a verified broker buys");
const USDC = await reg("usdc");
const balance = await read(USDC, USDC_ABI, "balanceOf", [account.address]);
if (balance < terms.price) {
  await write("mint test USDC", USDC, USDC_ABI, "mint", [account.address, terms.price - balance]);
}
if ((await read(USDC, USDC_ABI, "allowance", [account.address, REGISTRY])) < terms.price) {
  await write("approve USDC", USDC, USDC_ABI, "approve", [REGISTRY, terms.price]);
}
await write("buyRoom", REGISTRY, REG_ABI, "buyRoom", [id]);

check("the broker holds the ATS token", (await ats("balanceOf", [account.address])) === 1n);
check("escrow is empty", (await ats("balanceOf", [REGISTRY])) === 0n);
check("registry reports the broker as holder", (await reg("holderOf", [id])) === account.address);
check("the room is valid", await reg("isValid", [id]));
check("the broker is allowlisted", await ats("isInControlList", [account.address]));
check("the escrow left the allowlist", !(await ats("isInControlList", [REGISTRY])));

console.log("\n5. the holder cannot resell");
const resale = await reverts(TOKEN, ATS_ABI, "transfer", [STRANGER, 1n], account);
check("transfer to a stranger reverts", resale.reverted, resale.why);
const handBack = await reverts(TOKEN, ATS_ABI, "transfer", [REGISTRY, 1n], account);
check("transfer back to the registry reverts", handBack.reverted, handBack.why);

// ---------------------------------------------------------------------- freeze
console.log("\n6. the registrar freezes the room");
const reason = keccak256(encodePacked(["string"], ["e2e dispute"]));
await write("freezeRoom", REGISTRY, REG_ABI, "freezeRoom", [id, reason]);
check("the holder is frozen on the ATS token", await ats("isFrozen", [account.address]));
check("the registry reads it as frozen", await reg("isFrozen", [id]));
check("the token is no longer spendable", (await ats("balanceOf", [account.address])) === 0n);
check("the broker is still the holder", (await reg("holderOf", [id])) === account.address);
check("the room is no longer valid", !(await reg("isValid", [id])));
const whileFrozen = await reverts(TOKEN, ATS_ABI, "transfer", [account.address, 1n], account);
check("the holder cannot move a frozen token", whileFrozen.reverted, whileFrozen.why);

await write("unfreezeRoom", REGISTRY, REG_ABI, "unfreezeRoom", [id, reason]);
check("the holder is unfrozen on the ATS token", !(await ats("isFrozen", [account.address])));
check("the token is spendable again", (await ats("balanceOf", [account.address])) === 1n);
check("the room is valid again", await reg("isValid", [id]));

// ---------------------------------------------------------------------- expire
console.log("\n7. the period ends and the token is burned");
const early = await reverts(REGISTRY, REG_ABI, "expire", [id], account);
check(
  "expire before the end reverts with NotYetExpired",
  early.reverted && (early.why === "NotYetExpired" || early.why.startsWith(NOT_YET_EXPIRED)),
  early.why,
);

const waitMs = (Number(terms.end) + 15) * 1000 - Date.now();
if (waitMs > 0) {
  console.log(`   waiting ${Math.ceil(waitMs / 1000)}s for the period to end …`);
  await new Promise((r) => setTimeout(r, waitMs));
}
await write("expire", REGISTRY, REG_ABI, "expire", [id]);
check("supply is 0", (await ats("totalSupply")) === 0n);
check("the broker holds nothing", (await ats("balanceOf", [account.address])) === 0n);
check("no holder is reported", (await reg("holderOf", [id])) === "0x0000000000000000000000000000000000000000");
check("the room reads as expired", (await reg("roomState", [id])) === 4);

console.log(`\ncreateListing used ${listing.gasUsed} gas against a limit of ${LISTING_GAS}`);
console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
