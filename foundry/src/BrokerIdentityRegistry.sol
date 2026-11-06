// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Roles} from "./Roles.sol";
import {IBrokerIdentity} from "./interfaces/IBrokerIdentity.sol";

/// Verified-holder list (the ERC-3643 "identity registry" role) plus World ID session
/// bindings. The backend validates a World ID proof, then a registrar writes the binding.
///
/// Two things are tracked, for two different jobs:
///
///  1. **Identity** - `identityKey = keccak256(action, nullifier)`, one per human per World
///     action. Bound one-to-one with a wallet, so the same person cannot verify a second
///     wallet ("This identity is already linked to another wallet"). `isVerified` is what
///     `RoomRights` consults for transfer compliance.
///
///  2. **Session** - `sessionKey = keccak256(sessionId)` from World ID's session proof
///     (`IDKit.proveSession`). World 4.0 allows one nullifier per person per action and has
///     no repeat-verification setting, so a broker proving presence at a viewing cannot
///     re-run the enrollment action; they prove the session minted during enrollment
///     instead. `sessionMatchesHolder` is the tenant-side check: does the person standing
///     here own the wallet that currently holds this room's rights?
///
/// The identity API is offered in both shapes: `uint256` for Solidity callers
/// (`RentalRegistry.holderIdentity`) and `bytes32` for the app, which derives its keys with
/// keccak256 in `lib/world/keys.ts`. They are the same 32 bytes and the same storage.
contract BrokerIdentityRegistry is Roles, IBrokerIdentity {
    error ZeroAddress();
    error EmptyKey();
    error IdentityAlreadyBound(address existingWallet);
    error WalletAlreadyHasIdentity(uint256 existingIdentity);
    error SessionAlreadyBound(address existingWallet);
    error NotVerified();

    /// wallet => World ID identity key (0 = not verified)
    mapping(address => uint256) public identityOf;
    /// World ID identity key => wallet
    mapping(uint256 => address) public walletOf;
    /// World ID session key => wallet it was minted for
    mapping(bytes32 => address) public walletOfSession;
    /// wallet => its current session key (0 = none). Only the newest session counts.
    mapping(address => bytes32) public sessionOfWallet;

    event BrokerRegistered(address indexed wallet, uint256 indexed identity);
    event BrokerRemoved(address indexed wallet, uint256 indexed identity);
    event SessionBound(address indexed wallet, bytes32 indexed sessionKey, bytes32 replacedSessionKey);

    constructor(address owner_) Roles(owner_) {}

    // ------------------------------------------------------------- identity
    function isVerified(address wallet) external view returns (bool) {
        return identityOf[wallet] != 0;
    }

    function registerBroker(address wallet, uint256 identity) public onlyRegistrar {
        if (wallet == address(0)) revert ZeroAddress();
        if (identity == 0) revert EmptyKey();
        address linked = walletOf[identity];
        if (linked != address(0)) revert IdentityAlreadyBound(linked);
        uint256 existing = identityOf[wallet];
        if (existing != 0) revert WalletAlreadyHasIdentity(existing);

        identityOf[wallet] = identity;
        walletOf[identity] = wallet;
        emit BrokerRegistered(wallet, identity);
    }

    /// Clears the identity binding and the wallet's session, freeing both for reuse.
    function removeBroker(address wallet) external onlyRegistrar {
        uint256 identity = identityOf[wallet];
        if (identity == 0) revert NotVerified();
        delete identityOf[wallet];
        delete walletOf[identity];

        bytes32 session = sessionOfWallet[wallet];
        if (session != bytes32(0)) {
            delete sessionOfWallet[wallet];
            delete walletOfSession[session];
        }
        emit BrokerRemoved(wallet, identity);
    }

    // ----------------------------------------- identity, bytes32 form (app)
    /// Same as `registerBroker`, in the argument order and key type the app uses.
    function bindIdentity(bytes32 identityKey, address wallet) external {
        registerBroker(wallet, uint256(identityKey));
    }

    function walletOfIdentity(bytes32 identityKey) external view returns (address) {
        return walletOf[uint256(identityKey)];
    }

    function identityOfWallet(address wallet) external view returns (bytes32) {
        return bytes32(identityOf[wallet]);
    }

    function isIdentityBound(bytes32 identityKey) external view returns (bool) {
        return walletOf[uint256(identityKey)] != address(0);
    }

    // ------------------------------------------------------------- sessions
    /// Bind a World ID session to the wallet it was minted for. A session may be re-bound to
    /// the same wallet (idempotent re-enrollment) but never moved to a different one. A wallet
    /// binding a new session drops its previous one, so only the newest session can prove
    /// presence.
    function bindSession(bytes32 sessionKey, address wallet) external onlyRegistrar {
        if (wallet == address(0)) revert ZeroAddress();
        if (sessionKey == bytes32(0)) revert EmptyKey();

        address bound = walletOfSession[sessionKey];
        if (bound != address(0)) {
            if (bound != wallet) revert SessionAlreadyBound(bound);
            return; // already bound to this wallet; nothing to do
        }

        bytes32 previous = sessionOfWallet[wallet];
        if (previous != bytes32(0)) delete walletOfSession[previous];

        walletOfSession[sessionKey] = wallet;
        sessionOfWallet[wallet] = sessionKey;
        emit SessionBound(wallet, sessionKey, previous);
    }

    /// The tenant-side presence check: is this proven session the current holder's?
    /// False for an unknown session, a superseded one, or a zero holder.
    function sessionMatchesHolder(bytes32 sessionKey, address holder) external view returns (bool) {
        if (sessionKey == bytes32(0) || holder == address(0)) return false;
        return walletOfSession[sessionKey] == holder;
    }
}
