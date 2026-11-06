// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IATSFactory, IATSToken} from "../../src/interfaces/IATS.sol";

/// Test double for an ATS 8.0.0 equity, keeping the rules RentalRegistry depends on:
///   - mint, burn, forced transfer and freeze need the agent role
///   - editing the allowlist needs its own role, which the agent role does not cover
///   - minting and ordinary transfers check the allowlist; forced transfers do not
///   - isFrozen reports only freezePartialTokens, which also empties the spendable balance
///   - setAddressFrozen only edits the allowlist, and isFrozen does not see it
///   - a holder can redeem their own token
/// It only stands in for ATS in unit tests. Real behaviour is checked on testnet by
/// app/scripts/ats-registry-e2e.mjs.
contract MockATSToken is IATSToken {
    bytes32 private constant ROLE_AGENT = 0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b;
    bytes32 private constant ROLE_CONTROL_LIST = 0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d;

    error MissingRole(bytes32 role);
    error NotCompliant(address account);
    error MaxSupplyExceeded();
    error InsufficientBalance();

    string public name;
    uint8 public decimals;
    uint256 public maxSupply;
    uint256 public totalSupply;
    bool public isWhiteList;
    bool public isControllable;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public isInControlList;
    mapping(address => uint256) public getFrozenTokens;
    mapping(bytes32 => mapping(address => bool)) public hasRole;

    modifier onlyRole(bytes32 role) {
        if (!hasRole[role][msg.sender]) revert MissingRole(role);
        _;
    }

    constructor(IATSFactory.SecurityData memory data) {
        name = data.erc20MetadataInfo.name;
        decimals = data.erc20MetadataInfo.decimals;
        maxSupply = data.maxSupply;
        isWhiteList = data.isWhiteList;
        isControllable = data.isControllable;
        for (uint256 i = 0; i < data.rbacs.length; i++) {
            for (uint256 j = 0; j < data.rbacs[i].members.length; j++) {
                hasRole[data.rbacs[i].role][data.rbacs[i].members[j]] = true;
            }
        }
    }

    function mint(address to, uint256 amount) external onlyRole(ROLE_AGENT) {
        if (!isInControlList[to]) revert NotCompliant(to);
        if (totalSupply + amount > maxSupply) revert MaxSupplyExceeded();
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external onlyRole(ROLE_AGENT) {
        _burn(from, amount);
    }

    function redeem(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function forcedTransfer(address from, address to, uint256 amount) external onlyRole(ROLE_AGENT) returns (bool) {
        _move(from, to, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (!isInControlList[msg.sender]) revert NotCompliant(msg.sender);
        if (!isInControlList[to]) revert NotCompliant(to);
        _move(msg.sender, to, amount);
        return true;
    }

    function addToControlList(address account) external onlyRole(ROLE_CONTROL_LIST) returns (bool) {
        isInControlList[account] = true;
        return true;
    }

    function removeFromControlList(address account) external onlyRole(ROLE_CONTROL_LIST) returns (bool) {
        isInControlList[account] = false;
        return true;
    }

    function isFrozen(address account) external view returns (bool) {
        return getFrozenTokens[account] > 0;
    }

    function freezePartialTokens(address account, uint256 amount) external onlyRole(ROLE_AGENT) {
        if (balanceOf[account] < amount) revert InsufficientBalance();
        balanceOf[account] -= amount;
        getFrozenTokens[account] += amount;
    }

    function unfreezePartialTokens(address account, uint256 amount) external onlyRole(ROLE_AGENT) {
        if (getFrozenTokens[account] < amount) revert InsufficientBalance();
        getFrozenTokens[account] -= amount;
        balanceOf[account] += amount;
    }

    /// The trap the registry must avoid: it reports success, yet isFrozen stays false.
    function setAddressFrozen(address account, bool frozen) external onlyRole(ROLE_AGENT) {
        isInControlList[account] = !frozen;
    }

    function _burn(address from, uint256 amount) private {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function _move(address from, address to, uint256 amount) private {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract MockATSFactory is IATSFactory {
    uint256 public issued;

    function deployEquity(EquityData calldata equityData, RegulationData calldata) external returns (address token) {
        issued += 1;
        token = address(new MockATSToken(equityData.security));
    }
}
