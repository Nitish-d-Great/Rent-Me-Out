// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// SUPERSEDED — do not deploy without reading this first.
//
// The chain branch already has `foundry/src/BrokerIdentityRegistry.sol`, which covers
// enrollment with the same one-to-one guarantee. Deploying this alongside it would give
// the project two identity registries disagreeing about who is verified.
//
// The agreed path is `contracts/SESSION_BINDING_ADDITION.md`: keep their registry and add
// session binding to it. This file is kept as the reference implementation of the session
// half and as the rationale for hashing keys rather than storing raw nullifiers.

/// @title IdentityBinding
/// @notice On-chain, publicly verifiable World ID bindings, so identity uniqueness and
///         broker continuity are enforced on-chain rather than in a private database.
///
/// @dev The contract never sees a raw World ID value. The backend submits keccak256
///      hashes. World ID nullifiers are high-entropy and session IDs are 128 hex
///      characters, so the hashes are not brute-forceable, but anyone holding a
///      candidate value can hash it and check the binding themselves. That buys public
///      verifiability without publishing a persistent identity handle.
///
///      Two independent bindings, written only by the registrar after it has validated
///      the proof server-side:
///
///      1. IDENTITY (enrollment uniqueness).
///         identityKey = keccak256(abi.encodePacked(action, nullifier))
///         One human may claim exactly one wallet per action. Folding the action into
///         the key keeps `owner-verify` and `broker-verify` bindings for the same human
///         unlinkable on-chain, matching World ID's own action-scoped nullifiers.
///
///      2. SESSION (broker continuity at a viewing).
///         sessionKey = keccak256(abi.encodePacked(sessionId))
///         World ID 4.0 proves a returning user via a session proof rather than a
///         repeated action. A session proof returns `session_nullifier` for replay
///         protection only -- the World docs state plainly that it must NOT be used as
///         an account identifier -- so continuity is established by matching the
///         session ID itself. Storing only its hash lets the tenant's browser confirm
///         the match against `holderOf()` without the backend being trusted, and
///         without the session ID ever becoming public.
///
///      Bindings are permanent by design. A binding that could expire or be deleted
///      would reopen ban evasion: wait for it to lapse, then re-register the same human
///      on a fresh wallet.
///
///      LIMITATION, stated deliberately: the World ID docs do not guarantee that a
///      session proof is cryptographically bound to the credential holder who created
///      the session. This contract proves that a given session is bound to a given
///      wallet. It does not by itself prove the person presenting that session is the
///      human who enrolled it. Do not describe it as doing so.
contract IdentityBinding {
    mapping(bytes32 => address) private _walletByIdentity;
    mapping(address => bytes32) private _identityByWallet;

    mapping(bytes32 => address) private _walletBySession;
    mapping(address => bytes32) private _sessionByWallet;

    address public registrar;

    event IdentityBound(bytes32 indexed identityKey, address indexed wallet);
    event SessionBound(bytes32 indexed sessionKey, address indexed wallet);
    event RegistrarChanged(address indexed previous, address indexed next);

    error NotRegistrar();
    error ZeroAddress();
    error EmptyKey();
    error IdentityAlreadyBound(address existingWallet);
    error WalletAlreadyHasIdentity(bytes32 existingKey);
    error SessionAlreadyBound(address existingWallet);

    constructor(address registrar_) {
        if (registrar_ == address(0)) revert ZeroAddress();
        registrar = registrar_;
    }

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    // --- enrollment uniqueness -------------------------------------------------

    /// @param identityKey keccak256(abi.encodePacked(action, nullifier))
    function bindIdentity(bytes32 identityKey, address wallet) external onlyRegistrar {
        if (identityKey == bytes32(0)) revert EmptyKey();
        if (wallet == address(0)) revert ZeroAddress();

        address existingWallet = _walletByIdentity[identityKey];
        if (existingWallet != address(0)) revert IdentityAlreadyBound(existingWallet);

        bytes32 existingKey = _identityByWallet[wallet];
        if (existingKey != bytes32(0)) revert WalletAlreadyHasIdentity(existingKey);

        _walletByIdentity[identityKey] = wallet;
        _identityByWallet[wallet] = identityKey;

        emit IdentityBound(identityKey, wallet);
    }

    function walletOfIdentity(bytes32 identityKey) external view returns (address) {
        return _walletByIdentity[identityKey];
    }

    function identityOfWallet(address wallet) external view returns (bytes32) {
        return _identityByWallet[wallet];
    }

    /// @notice True if this human has already claimed a wallet for this action. Backs
    ///         the "this identity is already linked to another wallet" rejection.
    function isIdentityBound(bytes32 identityKey) external view returns (bool) {
        return _walletByIdentity[identityKey] != address(0);
    }

    // --- broker session continuity ---------------------------------------------

    /// @param sessionKey keccak256(abi.encodePacked(sessionId))
    /// @dev A wallet may re-bind a session (device loss means re-enrollment produces a
    ///      new session ID), but a session may never move to a different wallet.
    function bindSession(bytes32 sessionKey, address wallet) external onlyRegistrar {
        if (sessionKey == bytes32(0)) revert EmptyKey();
        if (wallet == address(0)) revert ZeroAddress();

        address existingWallet = _walletBySession[sessionKey];
        if (existingWallet != address(0) && existingWallet != wallet) {
            revert SessionAlreadyBound(existingWallet);
        }

        _walletBySession[sessionKey] = wallet;
        _sessionByWallet[wallet] = sessionKey;

        emit SessionBound(sessionKey, wallet);
    }

    function walletOfSession(bytes32 sessionKey) external view returns (address) {
        return _walletBySession[sessionKey];
    }

    function sessionOfWallet(address wallet) external view returns (bytes32) {
        return _sessionByWallet[wallet];
    }

    /// @notice True if the proven session belongs to `holder`. The tenant's verify page
    ///         calls this with the room's current holder from `holderOf()`, so a green
    ///         result does not rest on trusting an API that merely says `verified: true`.
    function sessionMatchesHolder(bytes32 sessionKey, address holder)
        external
        view
        returns (bool)
    {
        return holder != address(0) && _walletBySession[sessionKey] == holder;
    }

    // --- admin ------------------------------------------------------------------

    function setRegistrar(address next) external onlyRegistrar {
        if (next == address(0)) revert ZeroAddress();
        emit RegistrarChanged(registrar, next);
        registrar = next;
    }
}
