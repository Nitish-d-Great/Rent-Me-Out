import type { Hex } from "viem";

/**
 * Port onto `contracts/IdentityBinding.sol`.
 *
 * Kept as an interface so the World ID routes can be written and tested before the
 * contract lands on the chain branch. Swap `unboundIdentityBindings` for a viem-backed
 * implementation once an address exists.
 */
export interface IdentityBindings {
  /** Has this human already claimed a wallet for this action? */
  isIdentityBound(identityKey: Hex): Promise<boolean>;
  /** The wallet bound to this identity, or null. */
  walletOfIdentity(identityKey: Hex): Promise<`0x${string}` | null>;
  /** Registrar-signed. Reverts if the identity or wallet is already bound. */
  bindIdentity(identityKey: Hex, wallet: `0x${string}`): Promise<{ txId: string }>;

  /** The wallet a broker session belongs to, or null. */
  walletOfSession(sessionKey: Hex): Promise<`0x${string}` | null>;
  /** Registrar-signed. A session may be re-bound to the same wallet, never moved. */
  bindSession(sessionKey: Hex, wallet: `0x${string}`): Promise<{ txId: string }>;
  /** True if the proven session belongs to `holder` (the room's current holder). */
  sessionMatchesHolder(sessionKey: Hex, holder: `0x${string}`): Promise<boolean>;
}

const NOT_WIRED = "IdentityBinding contract is not deployed yet (chain branch pending)";

/**
 * Fail-closed placeholder. Every method throws rather than returning a permissive
 * default, so a missing contract can never be mistaken for a passing check.
 */
export const unboundIdentityBindings: IdentityBindings = {
  isIdentityBound: () => Promise.reject(new Error(NOT_WIRED)),
  walletOfIdentity: () => Promise.reject(new Error(NOT_WIRED)),
  bindIdentity: () => Promise.reject(new Error(NOT_WIRED)),
  walletOfSession: () => Promise.reject(new Error(NOT_WIRED)),
  bindSession: () => Promise.reject(new Error(NOT_WIRED)),
  sessionMatchesHolder: () => Promise.reject(new Error(NOT_WIRED)),
};

/**
 * Port onto the ATS compliance allowlist, which lives on the chain branch too.
 * Owners need it as well as brokers: under option A the owner holds a
 * compliance-restricted token between listing and sale.
 */
export interface Allowlist {
  isAllowed(wallet: `0x${string}`): Promise<boolean>;
  add(wallet: `0x${string}`): Promise<{ txId: string }>;
}

export const unboundAllowlist: Allowlist = {
  isAllowed: () => Promise.reject(new Error("ATS allowlist is not wired yet")),
  add: () => Promise.reject(new Error("ATS allowlist is not wired yet")),
};
