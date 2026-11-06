# Handoff — `IdentityBinding.sol`

For whoever owns the chain layer. The World ID flow needs this deployed; everything
else about it is self-contained.

## What it is

On-chain World ID state, so identity uniqueness is publicly verifiable rather than
asserted by our backend. Two registrar-written mappings, both storing **only keccak
hashes** — the contract never sees a raw nullifier or session ID.

- `bindIdentity(identityKey, wallet)` — enrollment uniqueness. One human, one wallet,
  per action. Permanent: an expiring binding would reopen ban evasion.
- `bindSession(sessionKey, wallet)` — broker continuity at viewings. Re-bindable to the
  same wallet (device loss), never movable to another.

Reads are free and used by the tenant verify page, so a green result doesn't depend on
trusting our API.

## What I need from you

1. **Deploy it**, constructor takes the registrar address.
2. **Grant the backend's registrar key** write access (it's the constructor arg).
3. **An adapter** implementing the `IdentityBindings` and `RoomRights` interfaces in
   `app/lib/world/bindings.ts`. They currently ship fail-closed stubs that reject rather
   than returning a permissive default, so an unwired contract can't be mistaken for a
   passing check. Swap the stubs for your implementation.
4. **Confirm `holderOf`'s signature.** I need "who holds rights to this room, or zero".
   README says `holderOf(propertyId, roomIndex)`; `architecture.md` uses one opaque room
   ID. I did not guess — `RoomRights` takes a `roomId: string` and the translation is
   yours to define.
   **Important:** an unsold room must return **zero**, even though the owner holds the
   token. Holding the token is not holding rental rights, and the tenant verify page
   must never show the owner as a rights holder.
5. **The ATS allowlist call.** `Allowlist` in the same file is also a stub. ERC-3643
   support in ATS is recent and partial-by-default, so I didn't want to guess the
   control-list ABI and have it fail silently at demo time. Owners need allowlisting too,
   not just brokers — under mint-at-listing the owner holds a compliance-restricted token
   between listing and sale.

## Notes

- ABI is in `app/lib/world/abi.ts` (data only, no client).
- Key derivation lives in `app/lib/world/keys.ts` and is **tested against
  `abi.encodePacked` computed independently** — a TS↔Solidity encoding mismatch wouldn't
  throw, every lookup would just silently miss. If you change the contract's encoding,
  re-run those tests.
- Hedera: `eth_estimateGas` through the relay is unreliable. Set explicit gas limits.
