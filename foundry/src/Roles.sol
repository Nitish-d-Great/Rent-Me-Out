// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// Minimal two-role access control: one owner (deployer/admin) and a set of
/// registrar wallets (the platform-operated registrar and its backend agent).
abstract contract Roles {
    error NotOwner();
    error NotRegistrar();

    address public owner;
    mapping(address => bool) public isRegistrar;

    event OwnerChanged(address indexed newOwner);
    event RegistrarSet(address indexed account, bool enabled);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRegistrar() {
        if (!isRegistrar[msg.sender]) revert NotRegistrar();
        _;
    }

    constructor(address owner_) {
        owner = owner_;
        isRegistrar[owner_] = true;
        emit OwnerChanged(owner_);
        emit RegistrarSet(owner_, true);
    }

    function setRegistrar(address account, bool enabled) external onlyOwner {
        isRegistrar[account] = enabled;
        emit RegistrarSet(account, enabled);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}
