/**
 * Issue a room-rights token on the ATS factory already deployed to Hedera testnet.
 *
 *   node scripts/ats-issue.mjs            simulate only (no transaction)
 *   node scripts/ats-issue.mjs --send     simulate, then send
 *
 * We call the EXISTING factory rather than standing up ATS ourselves. The whole
 * infrastructure (factory, resolver, 91 facets) is already live, so issuance is one
 * transaction instead of a monorepo deployment.
 *
 * Addresses from packages/ats/contracts/deployments/hedera-testnet/
 * newBlr-2026-06-12T11-19-42-198.json, verified to have bytecode on-chain.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const FACTORY = "0xd1F118A40f3b02883D35909eF2517e7EDd78379d";
const BLR     = "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a";
const EQUITY_CONFIG_ID = "0x0000000000000000000000000000000000000000000000000000000000000001";

// contracts/constants/roles.sol
const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);
const ROLE_AGENT      = "0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b";
const ROLE_ISSUER     = "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f";
const ROLE_CONTROLLER = "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e";

const chain = defineChain({
  id: 296, name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
});

/**
 * ABI taken from @hashgraph/asset-tokenization-contracts@8.0.0 — the version actually
 * deployed to testnet. `main` has since changed the structs (ResolverProxyConfiguration
 * gained `replacementEnabled`, ERC20Metadata lost `isin`), which shifts the selector and
 * makes the call unroutable: the proxy answers FunctionNotFound.
 */
const ABI = JSON.parse(
  readFileSync(new URL("./ats-factory-abi.json", import.meta.url), "utf8"),
);

const account = privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });

const equityData = {
  security: {
    resolver: BLR,
    maxSupply: 1n,                       // one token per room-period
    resolverProxyConfiguration: { key: EQUITY_CONFIG_ID, version: 1n },
    erc20MetadataInfo: {
      name: process.env.TOKEN_NAME ?? "RentMeOut Room Rights",
      symbol: process.env.TOKEN_SYMBOL ?? "RMO",
      isin: "US0378331005",   // checksum-valid ISIN; the factory rejects an empty one
      decimals: 0,
    },
    rbacs: [
      { role: DEFAULT_ADMIN_ROLE, members: [account.address] },
      { role: ROLE_AGENT,         members: [account.address] },
      { role: ROLE_ISSUER,        members: [account.address] },
      { role: ROLE_CONTROLLER,    members: [account.address] },
    ],
    externalPauses: [], externalControlLists: [], externalKycLists: [],
    compliance: "0x0000000000000000000000000000000000000000",
    identityRegistry: "0x0000000000000000000000000000000000000000",
    arePartitionsProtected: false,
    isMultiPartition: false,
    isControllable: true,                // needed for forced transfer on sale
    // An allowlist, not a denylist. getControlListType() returns false for a denylist,
    // where addToControlList() BLOCKS an address -- the opposite of a KYC gate. With
    // this true, only addresses the registrar has added can hold or receive the token,
    // which is what "verified brokers only" means in ERC-3643 terms.
    isWhiteList: true,
    clearingActive: false,
    internalKycActivated: false,
    erc20VotesActivated: false,
  },
  equityDetails: {
    votingRight: false, informationRight: false, liquidationRight: false,
    subscriptionRight: false, conversionRight: false, redemptionRight: false,
    putRight: false,
    dividendRight: 0,                    // DividendType.NONE
    currency: "0x555344",                // "USD"
    nominalValue: 0n,
    nominalValueDecimals: 0,             // uint8 in v8.0.0
  },
};

const regulationData = {
  regulationType: 1,                     // REG_S
  regulationSubType: 0,                  // NONE  (REG_S + NONE is the valid pair)
  additionalSecurityData: {
    countriesControlListType: false, listOfCountries: "", info: "RentMeOut room rights",
  },
};

console.log("factory ", FACTORY);
console.log("caller  ", account.address);
console.log("\nsimulating deployEquity …\n");

try {
  const { result, request } = await pub.simulateContract({
    address: FACTORY, abi: ABI, functionName: "deployEquity",
    args: [equityData, regulationData], account, gas: 15_000_000n,
  });
  console.log("SIMULATION PASSED");
  console.log("would deploy token at:", result);

  if (!process.argv.includes("--send")) {
    console.log("\n(dry run — pass --send to issue for real)");
    process.exit(0);
  }

  const wallet = createWalletClient({ account, chain, transport: http() });
  const hash = await wallet.writeContract(request);
  console.log("\ntx", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log("status  ", receipt.status);
  console.log("gas used", receipt.gasUsed.toString());
  if (receipt.status === "success") {
    console.log("\nTOKEN ADDRESS:", result);
    console.log("hashscan https://hashscan.io/testnet/contract/" + result);
  }
} catch (err) {
  console.log("SIMULATION FAILED\n");
  console.log(String(err).split("\n").slice(0, 25).join("\n"));
  process.exit(1);
}
