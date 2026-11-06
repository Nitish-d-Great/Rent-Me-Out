# Addition to `foundry/src/BrokerIdentityRegistry.sol`

For the chain branch. Adds broker **session** binding, which the viewing presence check
needs and the current contract has no way to express. Written against your pragma
(0.8.23), your `Roles` base, and your error/event conventions. Enrollment is unchanged —
`registerBroker` already does exactly what we need.

---

## First: one line in the interface is no longer achievable

`IBrokerIdentity.identityOf` currently says:

> *"Used by the tenant check: the proof of presence presented on site must carry this same nullifier."*

**Under World ID 4.0 that comparison can never match.** There is no repeatable
`broker-presence` action — World enforces one nullifier per person per action and has no
"max verifications" setting. A returning broker proves continuity with a **session
proof** instead, which returns `session_nullifier`, and the docs state plainly:

> *"Per-proof replay protection ... do not use this value as the account identifier."*

It is also fresh per proof, so it will never equal a stored value. Hence this addition:
continuity is established by matching the **session**, not the nullifier.

(Verified end to end — `pnpm --filter app verify:e2e` runs a real staging proof through
the simulator.)

---

## 1. Interface — `src/interfaces/IBrokerIdentity.sol`

```solidity
    /// keccak256 of the World ID session id bound to this wallet (0 = none).
    /// The tenant check matches THIS, not the nullifier: a session proof returns a
    /// fresh per-proof value that is explicitly not an account identifier.
    function sessionOfWallet(address wallet) external view returns (bytes32);

    /// True if `sessionKey` is bound to `holder`. The tenant's verify page calls this
    /// with the room's current holder, so a green result never depends on trusting an
    /// API response.
    function sessionMatchesHolder(bytes32 sessionKey, address holder) external view returns (bool);
```

Replace the obsolete sentence on `identityOf` with:

```solidity
    /// World ID nullifier binding (0 = not verified). Enrollment uniqueness only —
    /// the on-site presence check uses sessionMatchesHolder, not this value.
```

---

## 2. Registry — `src/BrokerIdentityRegistry.sol`

**Errors** — alongside the existing ones:

```solidity
    error SessionAlreadyLinked(address existingWallet);
```

**Storage** — after `walletOf`:

```solidity
    /// keccak256(sessionId) => wallet
    mapping(bytes32 => address) public walletOfSession;
    /// wallet => keccak256(sessionId)
    mapping(address => bytes32) public sessionOfWallet;
```

**Event** — alongside `BrokerRegistered`:

```solidity
    event SessionBound(address indexed wallet, bytes32 indexed sessionKey);
```

**Functions:**

```solidity
    /// Bind a broker's World ID session so viewings can prove continuity.
    /// `sessionKey` is keccak256(abi.encodePacked(sessionId)) — never the raw session id.
    ///
    /// Re-binding the SAME wallet is allowed: a broker who loses their device re-enrolls
    /// and receives a new session. Moving a session to a DIFFERENT wallet is not, or a
    /// broker could hand their proven presence to someone else.
    function bindSession(address wallet, bytes32 sessionKey) external onlyRegistrar {
        if (wallet == address(0) || sessionKey == bytes32(0)) revert ZeroValue();
        if (identityOf[wallet] == 0) revert NotVerified();

        address linked = walletOfSession[sessionKey];
        if (linked != address(0) && linked != wallet) revert SessionAlreadyLinked(linked);

        bytes32 previous = sessionOfWallet[wallet];
        if (previous != bytes32(0) && previous != sessionKey) {
            delete walletOfSession[previous];
        }

        walletOfSession[sessionKey] = wallet;
        sessionOfWallet[wallet] = sessionKey;
        emit SessionBound(wallet, sessionKey);
    }

    function sessionMatchesHolder(bytes32 sessionKey, address holder)
        external
        view
        returns (bool)
    {
        return holder != address(0) && walletOfSession[sessionKey] == holder;
    }
```

**`removeBroker` must also clear the session** — otherwise a removed broker keeps a
binding that still answers true at a viewing:

```solidity
    function removeBroker(address wallet) external onlyRegistrar {
        uint256 identity = identityOf[wallet];
        if (identity == 0) revert NotVerified();

        bytes32 sessionKey = sessionOfWallet[wallet];
        if (sessionKey != bytes32(0)) {
            delete walletOfSession[sessionKey];
            delete sessionOfWallet[wallet];
        }

        delete identityOf[wallet];
        delete walletOf[identity];
        emit BrokerRemoved(wallet, identity);
    }
```

---

## Why a hash, not the session id

Session ids are `session_` + 128 hex characters, and the World docs treat them as
sensitive: *"anyone holding it may be able to submit it."* Storing
`keccak256(sessionId)` keeps the preimage off-chain while staying checkable — the value
is high-entropy, so it cannot be brute-forced, but anyone holding a candidate can hash it
and verify the binding themselves.

The same reasoning applies to `registerBroker`'s `identity`: the backend passes
`uint256(keccak256(abi.encodePacked(action, nullifier)))` rather than the raw nullifier.
That needs **no change to your contract** — it is still a `uint256` — but it keeps a
persistent identity handle from being published on-chain, and folding the action in keeps
`owner-verify` and `broker-verify` bindings for the same human unlinkable.

Key derivation lives in `app/lib/world/keys.ts` and is tested against `abi.encodePacked`
computed independently. A TS↔Solidity encoding mismatch would not revert — every lookup
would silently miss — so if you change the encoding, re-run those tests.

---

## One thing to be aware of: `removeBroker` reopens ban evasion

Delete a binding and the same human can re-register on a fresh wallet. Registrar-only, so
it is a deliberate act, but it is the one path around the uniqueness guarantee. Worth
either dropping it for the demo or logging it loudly.

---

## What the backend will call

| Moment | Call |
|---|---|
| Owner or broker enrolls | `registerBroker(wallet, uint256(identityKey))` |
| Broker enrolls (same tx flow) | `bindSession(wallet, sessionKey)` |
| Duplicate identity attempt | reverts `IdentityAlreadyLinked(existingWallet)` → surfaced as 409 |
| Tenant checks a broker at a viewing | `sessionMatchesHolder(sessionKey, holderOf(roomId))` |

Once this is deployed, give me the address and I will swap
`app/lib/world/bindings.ts` off its fail-closed stubs and onto this contract.
