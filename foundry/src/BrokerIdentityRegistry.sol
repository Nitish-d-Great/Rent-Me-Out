// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Roles} from "./Roles.sol";
import {IBrokerIdentity} from "./interfaces/IBrokerIdentity.sol";

/// Verified-holder list (the ERC-3643 "identity registry" role). The backend validates a
/// World ID proof, then a registrar calls registerBroker with the proof's nullifier hash.
/// The nullifier <-> wallet binding is enforced one-to-one here, so the same person cannot
/// verify a second wallet ("This identity is already linked to another wallet").
contract BrokerIdentityRegistry is Roles, IBrokerIdentity {
    error ZeroValue();
    error IdentityAlreadyLinked(address existingWallet);
    error WalletAlreadyVerified(uint256 existingIdentity);
    error NotVerified();

    /// wallet => World ID nullifier hash (0 = not verified)
    mapping(address => uint256) public identityOf;
    /// World ID nullifier hash => wallet
    mapping(uint256 => address) public walletOf;

    event BrokerRegistered(address indexed wallet, uint256 indexed identity);
    event BrokerRemoved(address indexed wallet, uint256 indexed identity);

    constructor(address owner_) Roles(owner_) {}

    function isVerified(address wallet) external view returns (bool) {
        return identityOf[wallet] != 0;
    }

    function registerBroker(address wallet, uint256 identity) external onlyRegistrar {
        if (wallet == address(0) || identity == 0) revert ZeroValue();
        address linked = walletOf[identity];
        if (linked != address(0)) revert IdentityAlreadyLinked(linked);
        uint256 existing = identityOf[wallet];
        if (existing != 0) revert WalletAlreadyVerified(existing);

        identityOf[wallet] = identity;
        walletOf[identity] = wallet;
        emit BrokerRegistered(wallet, identity);
    }

    function removeBroker(address wallet) external onlyRegistrar {
        uint256 identity = identityOf[wallet];
        if (identity == 0) revert NotVerified();
        delete identityOf[wallet];
        delete walletOf[identity];
        emit BrokerRemoved(wallet, identity);
    }
}
