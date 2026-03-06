// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NILA is ERC20, Ownable(msg.sender) {
    // Mapping for locked balances
    mapping(address => uint256) public lockedBalances;

    // Valid wrapped token addresses for cross-chain (chainName -> tokenAddress)
    mapping(string => address) public wrappedTokens;

    // Events
    event Locked(address indexed user, uint256 amount, string targetChain);
    event Released(address indexed user, uint256 amount, string sourceChain);
    event Burned(address indexed user, uint256 amount);

    constructor(uint256 initialSupply) ERC20("NILA", "NILA") {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    // ====== Token Management ====== //
    function burn(uint256 amount) public {
        require(amount > 0, "Burn amount must be greater than 0");
        _burn(msg.sender, amount);
        emit Burned(msg.sender, amount);
    }

    // ====== Wrapped Token Management ====== //
    function addWrappedToken(string memory chain, address tokenAddress) public onlyOwner {
        require(tokenAddress != address(0), "Invalid address");
        wrappedTokens[chain] = tokenAddress;
    }

    // Lock base NILA to mint wrapped tokens on other chains
    function lockTokens(uint256 amount, string calldata targetChain) public {
        require(amount > 0, "Amount must be greater than 0");
        require(wrappedTokens[targetChain] != address(0), "Invalid target chain");

        _transfer(msg.sender, address(this), amount);
        lockedBalances[msg.sender] += amount;

        emit Locked(msg.sender, amount, targetChain);
    }

    // Release base NILA when wrapped tokens are burned on another chain
    function releaseTokens(address user, uint256 amount, string calldata sourceChain) external onlyOwner {
        require(wrappedTokens[sourceChain] != address(0), "Invalid source chain");
        require(lockedBalances[user] >= amount, "Insufficient locked balance");

        lockedBalances[user] -= amount;
        _transfer(address(this), user, amount);

        emit Released(user, amount, sourceChain);
    }
}
