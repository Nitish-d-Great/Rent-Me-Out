import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Hedera testnet access for the World ID identity bindings.
 *
 * Two Hedera habits are deliberate here: explicit gas limits, because
 * `eth_estimateGas` through the relay is unreliable and a bad estimate surfaces as a
 * confusing revert rather than an out-of-gas; and a browser guard, because this module
 * reads the registrar private key.
 */

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] },
  },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

export const WRITE_GAS = 1_000_000n;

/**
 * BrokerIdentityRegistry, as deployed at
 * 0xF3A8f444502A2B9Be6B9AdA344c9A1b07Db4B0dC.
 *
 * Signatures confirmed against the deployed bytecode's selectors, not from a shared
 * file. Note `bindSession(bytes32,address)` takes (sessionKey, wallet) -- the reverse of
 * an earlier handoff note. Swapped silently, it would bind sessions to nothing.
 */
export const BROKER_IDENTITY_ABI = parseAbi([
  "function registerBroker(address wallet, uint256 identity)",
  "function removeBroker(address wallet)",
  "function isVerified(address wallet) view returns (bool)",
  "function identityOf(address wallet) view returns (uint256)",
  "function walletOf(uint256 identity) view returns (address)",
  "function bindSession(bytes32 sessionKey, address wallet)",
  "function sessionOfWallet(address wallet) view returns (bytes32)",
  "function walletOfSession(bytes32 sessionKey) view returns (address)",
  "function sessionMatchesHolder(bytes32 sessionKey, address holder) view returns (bool)",
  "function isRegistrar(address account) view returns (bool)",
  "error IdentityAlreadyBound(address existingWallet)",
  "error WalletAlreadyHasIdentity(bytes32 existingBindingKey)",
  "error SessionAlreadyBound(address existingWallet)",
  "error NotRegistrar()",
  "error ZeroAddress()",
  "error EmptyKey()",
]);

function assertServer(what: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`world/chain: ${what} must not be reached from the browser`);
  }
}

export class ChainNotConfigured extends Error {
  constructor(missing: string) {
    super(`Chain not configured: ${missing} is not set`);
  }
}

export function brokerIdentityAddress(): `0x${string}` {
  const value = process.env.IDENTITY_BINDING_ADDRESS;
  if (!value) throw new ChainNotConfigured("IDENTITY_BINDING_ADDRESS");
  return value as `0x${string}`;
}

export function publicClient() {
  return createPublicClient({ chain: hederaTestnet, transport: http() });
}

/** Registrar-signed writes. The key never leaves the server. */
export function registrarClient() {
  assertServer("registrarClient()");
  const key = process.env.REGISTRAR_PRIVATE_KEY;
  if (!key) throw new ChainNotConfigured("REGISTRAR_PRIVATE_KEY");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  return createWalletClient({ account, chain: hederaTestnet, transport: http() });
}
