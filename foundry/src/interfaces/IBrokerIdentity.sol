// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// ERC-3643-style identity registry: is this wallet an eligible (verified) holder?
interface IBrokerIdentity {
    function isVerified(address wallet) external view returns (bool);

    /// World ID nullifier hash bound to the wallet (0 = not verified). Used by the tenant
    /// check: the proof of presence presented on site must carry this same nullifier.
    function identityOf(address wallet) external view returns (uint256);
}
