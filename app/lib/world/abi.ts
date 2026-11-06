/**
 * ABI for `contracts/IdentityBinding.sol`, written alongside the contract.
 *
 * Kept here as a handoff artifact for whoever wires the chain layer. This module is
 * intentionally data only — no client, no keys, no chain config. The Hedera client,
 * gas conventions, and registrar key live on the chain branch so there is exactly one
 * of each in the repo.
 */
export const identityBindingAbi = [
  "function bindIdentity(bytes32 identityKey, address wallet)",
  "function bindSession(bytes32 sessionKey, address wallet)",
  "function walletOfIdentity(bytes32 identityKey) view returns (address)",
  "function identityOfWallet(address wallet) view returns (bytes32)",
  "function isIdentityBound(bytes32 identityKey) view returns (bool)",
  "function walletOfSession(bytes32 sessionKey) view returns (address)",
  "function sessionOfWallet(address wallet) view returns (bytes32)",
  "function sessionMatchesHolder(bytes32 sessionKey, address holder) view returns (bool)",
  "error NotRegistrar()",
  "error ZeroAddress()",
  "error EmptyKey()",
  "error IdentityAlreadyBound(address existingWallet)",
  "error WalletAlreadyHasIdentity(bytes32 existingBindingKey)",
  "error SessionAlreadyBound(address existingWallet)",
] as const;
