// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IBrokerIdentity} from "./interfaces/IBrokerIdentity.sol";

/// One token per room-period: supply 1, zero decimals (an NFT-shaped, ERC-3643-inspired
/// permissioned token). It carries the ERC-3643 controls the product needs:
///   - transfer compliance: recipient must be in the broker identity registry
///   - freeze / unfreeze per token (dispute)
///   - forced burn by the agent (cancellation, expiry)
/// Holders cannot move tokens themselves (no resale in the MVP); only the RentalRegistry,
/// acting as the token agent, mints, transfers, freezes and burns.
///
/// This is a self-contained stand-in for an ATS-issued token. If ATS can issue a token per
/// room, RentalRegistry only needs these same calls (mint/transfer/freeze/burn/ownerOf).
contract RoomRights {
    error NotAgent();
    error AlreadyMinted();
    error NoSuchToken();
    error Frozen();
    error NotCompliant(address to);
    error TransfersDisabled();

    string public constant name = "RentMeOut Room Rights";
    string public constant symbol = "RMO";
    uint8 public constant decimals = 0;

    address public immutable agent; // the RentalRegistry
    IBrokerIdentity public immutable identity;

    mapping(uint256 => address) private _holder;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => bool) public isFrozen;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event FrozenSet(uint256 indexed tokenId, bool frozen);

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(IBrokerIdentity identity_, address agent_) {
        identity = identity_;
        agent = agent_;
    }

    function ownerOf(uint256 tokenId) public view returns (address holder) {
        holder = _holder[tokenId];
        if (holder == address(0)) revert NoSuchToken();
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _holder[tokenId] != address(0);
    }

    /// ERC-3643 canTransfer: a verified recipient (or the agent's own escrow) and not frozen.
    function canTransfer(uint256 tokenId, address to) public view returns (bool) {
        if (isFrozen[tokenId]) return false;
        return to == agent || identity.isVerified(to);
    }

    function mint(address to, uint256 tokenId) external onlyAgent {
        if (_holder[tokenId] != address(0)) revert AlreadyMinted();
        _holder[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    /// Agent-initiated transfer (purchase). Enforces freeze and recipient eligibility.
    function agentTransfer(uint256 tokenId, address to) external onlyAgent {
        address from = ownerOf(tokenId);
        if (isFrozen[tokenId]) revert Frozen();
        if (!canTransfer(tokenId, to)) revert NotCompliant(to);
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        _holder[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    /// Forced burn (cancellation or expiry). Works even when frozen.
    function burn(uint256 tokenId) external onlyAgent {
        address from = ownerOf(tokenId);
        balanceOf[from] -= 1;
        delete _holder[tokenId];
        if (isFrozen[tokenId]) {
            delete isFrozen[tokenId];
            emit FrozenSet(tokenId, false);
        }
        emit Transfer(from, address(0), tokenId);
    }

    function setFrozen(uint256 tokenId, bool frozen) external onlyAgent {
        ownerOf(tokenId); // reverts if missing
        isFrozen[tokenId] = frozen;
        emit FrozenSet(tokenId, frozen);
    }

    /// Holders cannot transfer or approve (no broker-to-broker resale in the MVP).
    function transferFrom(address, address, uint256) external pure {
        revert TransfersDisabled();
    }
}
