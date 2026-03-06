// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract NilaGrant {
    IERC20 public nilaToken;
    IERC721 public requiredNFT;
    address public admin;

    mapping(address => uint256) public userInteractions;

    uint256 public minimumTokens = 5;
    uint256 public monthDuration = 30 days;
    uint256 public currentMonth;

    event GrantClaimed(address indexed user, uint256 indexed month, uint256 reward);
    event MonthlyReset(uint256 newMonth);

    constructor(address _nilaToken, address _requiredNFT) {
        nilaToken = IERC20(_nilaToken);
        requiredNFT = IERC721(_requiredNFT);
        admin = msg.sender;
        currentMonth = getCurrentMonth();
    }

    modifier resetMonthly() {
        uint256 monthNow = getCurrentMonth();
        if (monthNow > currentMonth) {
            currentMonth = monthNow;
            _resetInteractions();
            emit MonthlyReset(currentMonth);
        }
        _;
    }

    function getCurrentMonth() public view returns (uint256) {
        return block.timestamp / monthDuration;
    }

    function recordInteraction(address user) external resetMonthly {
        userInteractions[user]++;
    }

    function calculateRewards(address user) public view returns (uint256) {
        uint256 activityTokens = userInteractions[user];
        uint256 decimals = 10 ** 18; // Assuming 18 decimals for the NILA token
        uint256 scaledMinimumTokens = minimumTokens * decimals;
        return activityTokens < scaledMinimumTokens ? scaledMinimumTokens : activityTokens * decimals;
    }

    function hasRequiredNFT(address user) public view returns (bool) {
        return requiredNFT.balanceOf(user) > 0;
    }

    function claimGrant() external resetMonthly {
        uint256 currentMonthNow = getCurrentMonth();

        if (!hasRequiredNFT(msg.sender)) {
            // Check if user has NilaTokens already; if so, deny claim
            require(nilaToken.balanceOf(msg.sender) == 0, "Already claimed without NFT");
        }

        uint256 reward = calculateRewards(msg.sender);

        // Reset interactions and send tokens, if hasNFT
        if (hasRequiredNFT(msg.sender)) {
            userInteractions[msg.sender] = 0;
        }
        
        require(nilaToken.transfer(msg.sender, reward), "Token transfer failed");

        if (hasRequiredNFT(msg.sender)) {
            emit GrantClaimed(msg.sender, currentMonthNow, reward);
        }
    }

    function _resetInteractions() private {
        // Optional: Reset all user interactions globally if needed
        // Note: Looping through mappings on-chain is gas-intensive and not recommended
    }

    // Admin-only function to change the minimum token reward
    function setMinimumTokens(uint256 newMin) external {
        require(msg.sender == admin, "Not admin");
        minimumTokens = newMin;
    }

    // Admin-only function to withdraw any leftover tokens
    function withdrawTokens(uint256 amount) external {
        require(msg.sender == admin, "Not admin");
        require(nilaToken.transfer(admin, amount), "Token withdrawal failed");
    }

    // Helper function to check the contract's NILA token balance
    function contractBalance() public view returns (uint256) {
        return nilaToken.balanceOf(address(this));
    }
}