// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// Testnet stand-in for USDC: a 6-decimal ERC-20 with an OPEN faucet.
///
/// `mint` is deliberately unpermissioned so the demo can fund any broker wallet without a
/// treasury key, and so brokers skip the HTS token-association step that real USDC on Hedera
/// requires. It emits the standard events, so HashScan and wallets render the payments.
///
/// Never deploy this on a network where the balances are meant to mean anything.
contract DemoUSDC {
    string public constant name = "RentMeOut Demo USDC";
    string public constant symbol = "dUSDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// Open faucet. Anyone may mint to anyone; testnet only.
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
