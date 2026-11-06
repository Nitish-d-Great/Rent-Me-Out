// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// ERC-3643-style identity registry: is this wallet an eligible (verified) holder?
interface IBrokerIdentity {
    function isVerified(address wallet) external view returns (bool);
}
