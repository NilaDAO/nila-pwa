// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title NilaUnion
 * @author Blockchainforcommon
 * @notice 
 *  Improvements V.2x
 *      - add remove from selected list (no interest, return any staked funds OR move to highest stake allocator)
 *      - add stakeToProduce event
 *      - ability to refuse members
 */

contract NilaUnion {
    // ------------------- DATA STRUCTS -------------------
    struct Produce {
        uint256 cropType;
        uint256 amount; // e.g., total produce amount
        uint256 interestRate; // in basis points: 1% = 100
        uint256 harvestDeadline;
        bool isConfirmed;
        uint256 acceptedBlock;
        address winner;
        bool isFrozen;
        uint256 totalDebt; // sum of staked amounts (set during staking)
        uint256 repaid;
        address[] selectedAddresses; // list of addresses eligible for selection
    }

    struct Stake {
        uint256 amount;
        uint256 lastClaimTime;
    }

    // ------------------- STATE -------------------
    address public unionLeader;
    address public masterNode;
    IERC20 public nila;
    IERC20 public usdc;

    Produce[] public products;
    // Triple mapping: produceId => (selected address => (staker address => Stake))
    mapping(uint256 => mapping(address => mapping(address => Stake))) public stakes;
    // Auxiliary array: produceId => (selected address => list of staker addresses)
    mapping(uint256 => mapping(address => address[])) public stakersList;

    uint256 private constant YEAR_IN_SECONDS = 365 * 86400;

    // ------------------- EVENTS -------------------
    event ProduceCreated(uint256 produceId, uint256 cropType, uint256 amount, uint256 interestRate, uint256 harvestDeadline);
    event SelectedListAdded(uint256 produceId, address[] selectedAddresses);
    event ProduceAccepted(uint256 produceId, address acceptedBy);
    event DebtRepaid(uint256 produceId, uint256 totalRepaid);
    event InterestClaimed(uint256 produceId, address staker, uint256 interest);
    event ProduceFrozen(uint256 produceId);
    event ProduceClosed(uint256 produceId);

    // ------------------- CONSTRUCTOR -------------------
    constructor(
        address _unionLeader,
        address _masterNode,
        address _nila,
        address _usdc
    ) {
        unionLeader = _unionLeader;
        masterNode = _masterNode;
        nila = IERC20(_nila);
        usdc = IERC20(_usdc);
    }

    // ------------------- FUNCTIONS -------------------

    // 1) Create a produce.
    function createProduce(
        uint256 _cropType,
        uint256 _amount,
        uint256 _interestRate,
        uint256 _harvestDeadline
        ) external {
        require(msg.sender == unionLeader, "Only unionLeader");
        // Initialize the produce with an empty selectedAddresses array.
        Produce memory p = Produce({
            cropType: _cropType,
            amount: _amount,
            interestRate: _interestRate,
            harvestDeadline: _harvestDeadline,
            isConfirmed: false,
            acceptedBlock: 0,
            winner: address(0),
            isFrozen: false,
            totalDebt: 0,
            repaid: 0,
            selectedAddresses: new address[](0)
        });
        products.push(p);
        emit ProduceCreated(products.length - 1, _cropType, _amount, _interestRate, _harvestDeadline);
    }

    // 2) Add selected addresses to a produce.
    function addSelectedList(uint256 produceId, address[] memory addresses) external {
        require(produceId < products.length, "Invalid produce ID");
        require(addresses.length > 0, "Need at least one address");
        Produce storage p = products[produceId];
        for (uint256 i = 0; i < addresses.length; i++) {
            p.selectedAddresses.push(addresses[i]);
        }
        emit SelectedListAdded(produceId, addresses);
    }

    // 3) Stake to a produce.
    // The staker chooses a particular "selected" address to stake for.
    function stakeToProduce(uint256 produceId, address selected, uint256 amount) external {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];
        require(!p.isConfirmed && !p.isFrozen, "Staking not allowed");
        require(amount > 0, "Amount must be > 0");

        // Verify that the chosen 'selected' address is valid.
        bool validSelected = false;
        for (uint256 i = 0; i < p.selectedAddresses.length; i++) {
            if (p.selectedAddresses[i] == selected) {
                validSelected = true;
                break;
            }
        }
        require(validSelected, "Not a valid selected address");

        // Transfer NILA tokens from staker to contract.
        require(nila.transferFrom(msg.sender, address(this), amount), "NILA transfer failed");

        Stake storage s = stakes[produceId][selected][msg.sender];
        // If it's the first time this staker stakes for this selected address, record them.
        if (s.amount == 0) {
            s.lastClaimTime = block.timestamp;
            stakersList[produceId][selected].push(msg.sender);
        }
        s.amount += amount;

        // Increase the produce's total debt.
        p.totalDebt += amount;
    }

    // 4) Accept produce.
    // Called by a selected address to accept the produce.
    // Refunds any self-stake (if the selected address staked on itself).
    function acceptProduce(uint256 produceId) external {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];

        // Must be one of the selected addresses.
        bool isSelected = false;
        for (uint256 i = 0; i < p.selectedAddresses.length; i++) {
            if (p.selectedAddresses[i] == msg.sender) {
                isSelected = true;
                break;
            }
        }
        require(isSelected, "Not a selected address");
        require(!p.isConfirmed, "Already accepted");

        p.isConfirmed = true;
        p.acceptedBlock = block.timestamp;
        p.winner = msg.sender;

        // Refund any stake where the staker and selected are the same.
        Stake storage selfStake = stakes[produceId][msg.sender][msg.sender];
        uint256 refund = selfStake.amount;
        if (refund > 0) {
            selfStake.amount = 0;
            // Adjust the totalDebt accordingly.
            p.totalDebt -= refund;
            require(nila.transfer(msg.sender, refund), "Refund failed");
        }

        // Transfer the **total staked amount** to the accepted farmer
        uint256 totalStaked = p.totalDebt;
        require(nila.transfer(msg.sender, totalStaked), "Total stake transfer failed");

        emit ProduceAccepted(produceId, msg.sender);
    }

    // 5) Repay debt.
    // When the repaid amount covers the totalDebt plus accrued interest, each staker is paid back.
    // We iterate over each selected address and their stakers via our auxiliary array.
    function repayDebt(uint256 produceId, uint256 paymentAmount, address debtor) external {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];
        require(p.isConfirmed, "Produce not yet accepted");

        require(nila.transferFrom(msg.sender, address(this), paymentAmount), "Nila transfer failed");
        p.repaid += paymentAmount;

        // ✅ Check total repaid vs total owed
        uint256 totalOwed = p.totalDebt + ((p.totalDebt * p.interestRate * (block.timestamp - p.acceptedBlock)) / (YEAR_IN_SECONDS * 10000));

        if (p.repaid >= totalOwed) {
            // ✅ Calculate how much should be distributed on this repayment
            address[] storage stakers = stakersList[produceId][debtor];

            for (uint256 j = 0; j < stakers.length; j++) {
                address staker = stakers[j];
                Stake storage s = stakes[produceId][debtor][staker];

                if (s.amount > 0) {
                    uint256 stakerDuration = block.timestamp - s.lastClaimTime;
                    uint256 accruedInterest = (s.amount * p.interestRate * stakerDuration) / (YEAR_IN_SECONDS * 10000);
                    uint256 payout = s.amount + accruedInterest;

                    s.amount = 0;
                    s.lastClaimTime = block.timestamp;

                    // ✅ Ensure payout includes previous repayments
                    require(nila.transfer(staker, payout), "Payout failed");

                }
            }
            delete stakersList[produceId][debtor];
            
            emit DebtRepaid(produceId, p.repaid);
            // Remove the produce safely
            uint256 lastIndex = products.length - 1;
            if (lastIndex > 0 && produceId != lastIndex) {
                products[produceId] = products[lastIndex]; // Move last element to this slot
            }
            products.pop(); // Always remove last element
        }
    }

    // 6) Claim interest.
    // A staker claims interest accrued on their stake (from a specific selected address).
    function claimInterest(uint256 produceId, address selected) external {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];
        Stake storage s = stakes[produceId][selected][msg.sender];
        require(s.amount > 0, "No stake");

        uint256 timeElapsed = block.timestamp - s.lastClaimTime;
        uint256 interest = (s.amount * p.interestRate * timeElapsed) / (YEAR_IN_SECONDS * 10000);
        s.lastClaimTime = block.timestamp;
        require(nila.transfer(msg.sender, interest), "Interest transfer failed");
        emit InterestClaimed(produceId, msg.sender, interest);
    }

    // 7) noActivitySignal: Called by masterNode to freeze a produce.
    function noActivitySignal(uint256 produceId) external {
        require(msg.sender == masterNode, "Only masterNode");
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];
        require(!p.isFrozen, "Already frozen");

        if (p.isConfirmed && p.repaid < p.totalDebt) {
            p.isFrozen = true;
            emit ProduceFrozen(produceId);
        }
    }

    // 8) removeProduce: Allows unionLeader to cancel a produce.
    // Refunds all stakes (via NILA) and cleans up storage.
    function removeProduce(uint256 produceId) external {
        require(msg.sender == unionLeader, "Only unionLeader");
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];

        // Loop over each selected address.
        for (uint256 i = 0; i < p.selectedAddresses.length; i++) {
            address selected = p.selectedAddresses[i];
            address[] storage stakers = stakersList[produceId][selected];
            // Refund each staker their stake.
            for (uint256 j = 0; j < stakers.length; j++) {
                address staker = stakers[j];
                Stake storage s = stakes[produceId][selected][staker];
                if (s.amount > 0) {
                    uint256 refund = s.amount;
                    s.amount = 0;
                    require(nila.transfer(staker, refund), "Refund failed");
                }
            }
            delete stakersList[produceId][selected];
        }
        delete products[produceId];
        emit ProduceClosed(produceId);
    }

    // ------------------- GETTER FUNCTIONS -------------------

    /// 1️⃣ Get the total number of products
    function getProductsLength() external view returns (uint256) {
        return products.length;
    }

    /// 2️⃣ Get a single product's details
    function getProduct(uint256 produceId) external view returns (
        uint256 cropType,
        uint256 amount,
        uint256 interestRate,
        uint256 harvestDeadline,
        bool isConfirmed,
        uint256 acceptedBlock,
        address winner,
        bool isFrozen,
        uint256 totalDebt,
        uint256 repaid
        ) {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];
        return (
            p.cropType,
            p.amount,
            p.interestRate,
            p.harvestDeadline,
            p.isConfirmed,
            p.acceptedBlock,
            p.winner,
            p.isFrozen,
            p.totalDebt,
            p.repaid
        );
    }

    /// 3️⃣ Get the list of selected addresses for a given produce
    function getSelectedAddresses(uint256 produceId) external view returns (address[] memory) {
        require(produceId < products.length, "Invalid produce ID");
        return products[produceId].selectedAddresses;
    }

    /// 4️⃣ Get all stakes for an investor across all products and selected addresses
    function getInvestorStakes(address investor) external view returns (
        uint256[] memory produceIds,
        address[] memory selectedAddresses,
        uint256[] memory amounts
        ) {
        uint256 count = 0;
        for (uint256 i = 0; i < products.length; i++) {
            for (uint256 j = 0; j < products[i].selectedAddresses.length; j++) {
                address selected = products[i].selectedAddresses[j];
                if (stakes[i][selected][investor].amount > 0) {
                    count++;
                }
            }
        }

        produceIds = new uint256[](count);
        selectedAddresses = new address[](count);
        amounts = new uint256[](count);

        uint256 index = 0;
        for (uint256 i = 0; i < products.length; i++) {
            for (uint256 j = 0; j < products[i].selectedAddresses.length; j++) {
                address selected = products[i].selectedAddresses[j];
                if (stakes[i][selected][investor].amount > 0) {
                    produceIds[index] = i;
                    selectedAddresses[index] = selected;
                    amounts[index] = stakes[i][selected][investor].amount;
                    index++;
                }
            }
        }
    }
    // get the total debt of a farmer (base + interest)
    function getTotalOwedByFarmer(uint256 produceId) external view returns (uint256 totalOwed) {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];

        if (!p.isConfirmed) {
            return 0; // If not confirmed, no repayment needed
        }

        uint256 duration = block.timestamp - p.acceptedBlock;
        uint256 accruedInterest = (p.totalDebt * p.interestRate * duration) / (YEAR_IN_SECONDS * 10000);    
        uint256 roundedInterest = (accruedInterest + 10000000000000); 

        totalOwed = p.totalDebt + roundedInterest;
    }

    function getRemainingDebt(uint256 produceId) external view returns (uint256 remainingDebt) {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];

        if (!p.isConfirmed) {
            return 0; // If produce is not confirmed, no debt exists
        }

        uint256 duration = block.timestamp - p.acceptedBlock;
        uint256 accruedInterest = (p.totalDebt * p.interestRate * duration) / (YEAR_IN_SECONDS * 10000);
        uint256 roundedInterest = (accruedInterest + 10000000000000); 

        uint256 totalOwed = p.totalDebt + roundedInterest;

        if (p.repaid >= totalOwed) {
            return 0; // Debt fully repaid
        }

        return totalOwed - p.repaid;
    }

    // 5️⃣ Get pending claimable interest for an investor
    function getPendingInterest(address investor) external view returns (
        uint256[] memory produceIds,
        address[] memory selectedAddresses,
        uint256[] memory claimableInterests, // Interest since lastClaimTime
        uint256[] memory totalInterests // Total interest since acceptedBlock
        ) {
        uint256 count = 0;

        for (uint256 i = 0; i < products.length; i++) {
            for (uint256 j = 0; j < products[i].selectedAddresses.length; j++) {
                address selected = products[i].selectedAddresses[j];
                Stake storage s = stakes[i][selected][investor];

                if (s.amount > 0) {
                    count++;
                }
            }
        }

        produceIds = new uint256[](count);
        selectedAddresses = new address[](count);
        claimableInterests = new uint256[](count);
        totalInterests = new uint256[](count);

        uint256 index = 0;
        for (uint256 i = 0; i < products.length; i++) {
            Produce storage p = products[i];
            for (uint256 j = 0; j < p.selectedAddresses.length; j++) {
                address selected = p.selectedAddresses[j];
                Stake storage s = stakes[i][selected][investor];

                if (s.amount > 0) {
                    uint256 timeElapsed = block.timestamp - s.lastClaimTime;
                    uint256 claimableInterest = (s.amount * p.interestRate * timeElapsed) /
                        (YEAR_IN_SECONDS * 10000);

                    uint256 fullDuration = block.timestamp - p.acceptedBlock;
                    uint256 totalInterest = (s.amount * p.interestRate * fullDuration) /
                        (YEAR_IN_SECONDS * 10000);

                    produceIds[index] = i;
                    selectedAddresses[index] = selected;
                    claimableInterests[index] = claimableInterest;
                    totalInterests[index] = totalInterest;
                    index++;
                }
            }
        }
    }

    // ✅ Returns time remaining until the harvest deadline (in seconds)
    function getTimeToDeadline(uint256 produceId) external view returns (uint256 timeRemaining) {
        require(produceId < products.length, "Invalid produce ID");
        Produce storage p = products[produceId];

        if (block.timestamp >= p.harvestDeadline) {
            return 0; // Deadline has passed
        }

        return p.harvestDeadline - block.timestamp;
    }

    // ✅ Checks if the produce is frozen (set in `noActivitySignal()`)
    function isProduceFrozen(uint256 produceId) external view returns (bool) {
        require(produceId < products.length, "Invalid produce ID");
        return products[produceId].isFrozen;
    }

}