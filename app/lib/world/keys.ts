import { keccak256, encodePacked, pad, type Hex } from "viem";

/**
 * Key derivation for `contracts/IdentityBinding.sol`.
 *
 * These MUST mirror the Solidity encoding exactly or the on-chain lookups silently
 * miss. The contract expects:
 *
 *   identityKey = keccak256(abi.encodePacked(string action, bytes32 nullifier))
 *   sessionKey  = keccak256(abi.encodePacked(string sessionId))
 *
 * Only hashes ever reach the chain. Nullifiers are high-entropy and session IDs are
 * 128 hex characters, so the preimages are not brute-forceable, but anyone holding a
 * candidate value can hash it and check the binding themselves.
 */

/** World returns the nullifier as a hex string; normalise to 32 bytes. */
function toBytes32(nullifier: string): Hex {
  const hex = (nullifier.startsWith("0x") ? nullifier : `0x${nullifier}`) as Hex;
  return pad(hex, { size: 32 });
}

export function identityKey(action: string, nullifier: string): Hex {
  return keccak256(
    encodePacked(["string", "bytes32"], [action, toBytes32(nullifier)]),
  );
}

export function sessionKey(sessionId: string): Hex {
  return keccak256(encodePacked(["string"], [sessionId]));
}
