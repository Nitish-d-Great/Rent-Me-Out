/**
 * Demonstrates ERC-3643 compliance on the ATS-issued token, which is what the Hedera
 * track means by "compliance controls: KYC, freezes, transfer restrictions, pauses".
 *
 * The token is deployed with isWhiteList true, so its control list is an ALLOWLIST:
 * only addresses the registrar has added may hold or receive it. Deployed with
 * isWhiteList false the same list is a DENYLIST and addToControlList blocks instead --
 * the opposite behaviour, and not something that can be changed after issuance.
 *
 *   node scripts/ats-compliance.mjs
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const TOKEN = process.env.ATS_TOKEN ?? "0x556240ebebEd496458c64085Be3E788cE07B88f3";
const chain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});
const GAS = 8_000_000n;

const ABI = parseAbi([
  "function mint(address,uint256)",
  "function addToControlList(address)",
  "function removeFromControlList(address)",
  "function setAddressFrozen(address,bool)",
  "function isFrozen(address) view returns (bool)",
  "function pause()",
  "function unpause()",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function getControlListType() view returns (bool)",
]);

const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });

/** Hashio times out on submission under load even when the transaction lands. */
async function send(functionName, args, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const hash = await wallet.writeContract({
        address: TOKEN, abi: ABI, functionName, args, gas: GAS, chain,
      });
      const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
      console.log(`   ${label}: ${r.status}  ${hash}`);
      return r.status === "success";
    } catch (err) {
      const msg = String(err);
      const transient = msg.includes("took too long") || msg.includes("timed out") || msg.includes("502");
      if (!transient || attempt === 3) {
        console.log(`   ${label}: failed — ${msg.split("\n")[0].slice(0, 70)}`);
        return false;
      }
      console.log(`   ${label}: transport timeout, retrying (${attempt}/3)…`);
    }
  }
  return false;
}

const can = async (functionName, args) => {
  try {
    await pub.simulateContract({ address: TOKEN, abi: ABI, functionName, args, account, gas: GAS });
    return true;
  } catch {
    return false;
  }
};

const read = (fn, args = []) => pub.readContract({ address: TOKEN, abi: ABI, functionName: fn, args });

console.log("ATS token  ", TOKEN);
console.log("control list is an", (await read("getControlListType")) ? "ALLOWLIST" : "DENYLIST");
console.log("supply     ", String(await read("totalSupply")));

const broker = account.address;

console.log("\n1. transfer restriction — mint to a non-allowlisted address");
console.log("   allowed?", (await can("mint", [ "0x00000000000000000000000000000000DeaDBeef", 1n ])) ? "yes" : "NO — blocked by compliance ✓");

console.log("\n2. KYC — registrar allowlists the verified broker");
if (!(await can("mint", [broker, 1n]))) await send("addToControlList", [broker], "addToControlList");
else console.log("   already allowlisted");

console.log("\n3. mint to the allowlisted broker");
await send("mint", [broker, 1n], "mint");
console.log("   supply", String(await read("totalSupply")), "· balance", String(await read("balanceOf", [broker])));

console.log("\n4. freeze — registrar freezes the holder");
await send("setAddressFrozen", [broker, true], "setAddressFrozen");
console.log("   isFrozen:", await read("isFrozen", [broker]));
await send("setAddressFrozen", [broker, false], "unfreeze");

console.log("\n5. pause — registrar halts the whole token");
if (await send("pause", [], "pause")) {
  console.log("   mint while paused allowed?", (await can("mint", [broker, 1n])) ? "yes" : "NO — blocked ✓");
  await send("unpause", [], "unpause");
}
console.log("\ndone");
