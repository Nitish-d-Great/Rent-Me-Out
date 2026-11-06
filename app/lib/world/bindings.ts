import { BaseError, ContractFunctionRevertedError, parseAbi, type Hex } from "viem";
import {
  BROKER_IDENTITY_ABI,
  ChainNotConfigured,
  WRITE_GAS,
  brokerIdentityAddress,
  publicClient,
  registrarClient,
} from "./chain";

/**
 * Port onto `contracts/IdentityBinding.sol`.
 *
 * Kept as an interface so the World ID routes can be written and tested before the
 * contract lands on the chain branch. Swap `unboundIdentityBindings` for a viem-backed
 * implementation once an address exists.
 */
export interface IdentityBindings {
  /**
   * Whether the DEPLOYED contract has the session functions.
   *
   * Declared capability rather than inferred from a thrown error on purpose: catching
   * everything around `bindSession` would swallow a genuine `SessionAlreadyBound` --
   * someone moving a proven session to another wallet -- as "not supported". That is a
   * security signal, not a capability gap, and it must still surface.
   *
   * Lets enrollment ship against `BrokerIdentityRegistry` as it stands today, with the
   * viewing presence check arriving when the session functions are added.
   */
  supportsSessions(): Promise<boolean>;

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
  // Not a rejection: "no contract" genuinely means "no session support", and answering
  // honestly here keeps the capability check separate from the wiring check.
  supportsSessions: () => Promise.resolve(false),
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

/**
 * Port onto room rights on Hedera (`RentalRegistry`). Presence needs the room's
 * current holder from the chain -- never from the client, which could claim any wallet.
 */
export interface RoomRights {
  /** The broker holding valid rights, or null. Unsold rooms return null even though
   *  the owner holds the token: holding the token is not holding rental rights. */
  holderOf(roomId: string): Promise<`0x${string}` | null>;
  /** Sold, unfrozen, and within the period. */
  isValid(roomId: string): Promise<boolean>;
}

export const unboundRoomRights: RoomRights = {
  holderOf: () => Promise.reject(new Error("RentalRegistry is not wired yet")),
  isValid: () => Promise.reject(new Error("RentalRegistry is not wired yet")),
};

/* -------------------------------------------------------------------------- */
/* Live adapter — BrokerIdentityRegistry on Hedera testnet                      */
/* -------------------------------------------------------------------------- */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Thrown when a bind loses a race. The route turns this into a 409. */
export class AlreadyBound extends Error {
  constructor(readonly kind: "identity" | "wallet" | "session") {
    super(`already bound: ${kind}`);
  }
}

/**
 * Submit a write and WAIT for it to execute.
 *
 * `writeContract` resolves when the transaction is submitted, not when it succeeds. A
 * reverted transaction still returns a hash, so without this a failed on-chain write
 * is indistinguishable from a successful one -- the API answers 200 and the chain
 * never changed.
 */
async function settle(hash: `0x${string}`, what: string): Promise<{ txId: string }> {
  const receipt = await publicClient().waitForTransactionReceipt({
    hash,
    timeout: 60_000,
  });
  if (receipt.status !== "success") {
    throw new Error(`${what} reverted on-chain (tx ${hash})`);
  }
  return { txId: hash };
}

function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError
    ? (reverted.data?.errorName ?? null)
    : null;
}

/**
 * The registry stores the identity as a `uint256`, so our 32-byte
 * keccak256(action, nullifier) goes in as a number. No contract change was needed for
 * that, and it keeps a persistent identity handle off-chain while staying checkable.
 */
const asUint = (key: Hex) => BigInt(key);

export const brokerIdentityRegistry: IdentityBindings = {
  // The deployed contract has all four session selectors; verified against its bytecode.
  supportsSessions: () => Promise.resolve(true),

  async isIdentityBound(identityKey) {
    const wallet = await publicClient().readContract({
      address: brokerIdentityAddress(),
      abi: BROKER_IDENTITY_ABI,
      functionName: "walletOf",
      args: [asUint(identityKey)],
    });
    return wallet !== ZERO_ADDRESS;
  },

  async walletOfIdentity(identityKey) {
    const wallet = await publicClient().readContract({
      address: brokerIdentityAddress(),
      abi: BROKER_IDENTITY_ABI,
      functionName: "walletOf",
      args: [asUint(identityKey)],
    });
    return wallet === ZERO_ADDRESS ? null : wallet;
  },

  /**
   * `registerBroker` both binds the identity AND makes the wallet eligible to hold a
   * room token -- `isVerified()` is just `identityOf != 0`. One call, not two.
   *
   * Reading first is a courtesy, not the guard: two requests can pass that check
   * concurrently. The contract is the arbiter, so a revert is translated rather than
   * treated as a failure.
   */
  async bindIdentity(identityKey, wallet) {
    try {
      // Simulate first: a revert surfaced here carries the decoded custom error, while
      // one discovered in the receipt is just "reverted" with no reason attached.
      await publicClient().simulateContract({
        address: brokerIdentityAddress(),
        abi: BROKER_IDENTITY_ABI,
        functionName: "registerBroker",
        args: [wallet, asUint(identityKey)],
        account: registrarClient().account,
      });
      const hash = await registrarClient().writeContract({
        address: brokerIdentityAddress(),
        abi: BROKER_IDENTITY_ABI,
        functionName: "registerBroker",
        args: [wallet, asUint(identityKey)],
        gas: WRITE_GAS,
      });
      return await settle(hash, "registerBroker");
    } catch (error) {
      const name = revertName(error);
      if (name === "IdentityAlreadyBound" || name === "IdentityAlreadyLinked") {
        throw new AlreadyBound("identity");
      }
      if (name === "WalletAlreadyHasIdentity" || name === "WalletAlreadyVerified") {
        throw new AlreadyBound("wallet");
      }
      throw error;
    }
  },

  async walletOfSession(sessionKey) {
    const wallet = await publicClient().readContract({
      address: brokerIdentityAddress(),
      abi: BROKER_IDENTITY_ABI,
      functionName: "walletOfSession",
      args: [sessionKey],
    });
    return wallet === ZERO_ADDRESS ? null : wallet;
  },

  /** NOTE the argument order: (sessionKey, wallet), confirmed from the selector. */
  async bindSession(sessionKey, wallet) {
    try {
      const hash = await registrarClient().writeContract({
        address: brokerIdentityAddress(),
        abi: BROKER_IDENTITY_ABI,
        functionName: "bindSession",
        args: [sessionKey, wallet],
        gas: WRITE_GAS,
      });
      return await settle(hash, "bindSession");
    } catch (error) {
      if (revertName(error) === "SessionAlreadyBound") throw new AlreadyBound("session");
      throw error;
    }
  },

  async sessionMatchesHolder(sessionKey, holder) {
    return publicClient().readContract({
      address: brokerIdentityAddress(),
      abi: BROKER_IDENTITY_ABI,
      functionName: "sessionMatchesHolder",
      args: [sessionKey, holder],
    });
  },
};

/* -------------------------------------------------------------------------- */
/* Live adapter — RentalRegistry on Hedera testnet                              */
/* -------------------------------------------------------------------------- */

const ROOM_RIGHTS_ABI = parseAbi([
  "function holderOf(uint256 listingId) view returns (address)",
  "function isValid(uint256 listingId) view returns (bool)",
  "error NoSuchListing()",
]);

/** Listing ids are numbers. Sample rooms use ids like "r2", which are not on-chain. */
function listingIdOf(roomId: string): bigint | null {
  return /^\d+$/.test(roomId) ? BigInt(roomId) : null;
}

function rentalRegistryAddress(): `0x${string}` {
  const value = process.env.RENTAL_REGISTRY_ADDRESS;
  if (!value) throw new ChainNotConfigured("RENTAL_REGISTRY_ADDRESS");
  return value as `0x${string}`;
}

/**
 * Only a room that does not exist reads as having no holder. Any other failure still
 * throws: a tenant must never be told a broker holds no rights because an RPC call failed.
 */
export const rentalRegistryRights: RoomRights = {
  async holderOf(roomId) {
    const listingId = listingIdOf(roomId);
    if (listingId === null) return null;
    try {
      const holder = await publicClient().readContract({
        address: rentalRegistryAddress(),
        abi: ROOM_RIGHTS_ABI,
        functionName: "holderOf",
        args: [listingId],
      });
      return holder === ZERO_ADDRESS ? null : holder;
    } catch (error) {
      if (revertName(error) === "NoSuchListing") return null;
      throw error;
    }
  },

  async isValid(roomId) {
    const listingId = listingIdOf(roomId);
    if (listingId === null) return false;
    return publicClient().readContract({
      address: rentalRegistryAddress(),
      abi: ROOM_RIGHTS_ABI,
      functionName: "isValid",
      args: [listingId],
    });
  },
};

/**
 * `registerBroker` already makes the wallet eligible, so the allowlist is a read, and
 * `add` is a no-op rather than a second transaction.
 */
export const brokerAllowlist: Allowlist = {
  async isAllowed(wallet) {
    return publicClient().readContract({
      address: brokerIdentityAddress(),
      abi: BROKER_IDENTITY_ABI,
      functionName: "isVerified",
      args: [wallet],
    });
  },
  add: () => Promise.resolve({ txId: "noop:registerBroker already marks eligible" }),
};
