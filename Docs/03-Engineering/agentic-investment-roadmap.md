# GenericFundCore → Agentic-Ready Vault Roadmap

**Author:** Nila Engineering  
**Date:** April 2026  
**Audience:** Internal dev team  
**Contract:** GenericFundCore (UUPS proxy, Polygon)

---

## Goal

Make GenericFundCore discoverable and investable by autonomous capital allocators (AI agents, yield aggregators, DAO treasury managers) to grow AUM beyond Nila's organic user base — while preserving union governance and protecting the protocol from untested exposure.

The core thesis: Nila pools generate **real yield from agricultural loan repayments**, not from recursive DeFi or token emissions. That's a genuinely differentiated yield source. But no agentic allocator can access it today because the contract interface is bespoke. This roadmap fixes that in four phases.

---

## Critical Constraint: Core Bytecode Size

GenericFundCore currently has **63 functions, 20 events, and 34 custom errors** (117 ABI entries). It is at or near the 24,576-byte Spurious Dragon limit. Every change to Core must be justified in bytecode cost.

**Design principle:** Core gets only what *must* live there (state-changing hooks, immutable safety checks). Everything else — view functions, health metrics, deposit cap calculations, delegation — goes to **Viewer** (38 functions, plenty of room) or **new standalone contracts** (vaults, registry, delegation manager).

### Bytecode Budget for Core Changes (All Phases)

| Change | Location | Bytecode Cost |
|--------|----------|---------------|
| `viewer.onLoanRepaid()` callback in `repayLoan` | Core | ~100 bytes |
| `viewer.onLoanDefaulted()` callback in `markDefault` | Core | ~100 bytes |
| `MIN_SAFETY_BP` constant + require in `setReserveConfigForUnion` | Core | ~50 bytes |
| Extra param on `LoanRepaid` event (remainingPrincipal) | Core | ~30 bytes |
| **Total Core additions across all phases** | | **~280 bytes** |

Everything else lives in Viewer, ERC-4626 vault contracts, or standalone contracts. The vaults themselves are new deployments — they don't touch Core's size budget.

---

## Architecture Context

### What we have today

```
GenericFundCore (UUPS proxy) — 63 functions, ~24KB limit
├── depositJunior(unionAddr, loanType, amount, member)
├── depositSenior(unionAddr, amount)
├── claimJunior / claimSenior
├── requestUnbondJunior / requestUnbondSenior
├── drawLoanWithVoucher(... 18 params, oracle-signed)
├── repayLoan / markDefault / removeLoan
├── setRateParams / setBucketThresholds / setReserveConfigForUnion
├── bucketMaxAmount(union, loanType)
├── bucketTresholds(union, loanType)   ← EXISTING ratio cap
├── getJuniorMarket / getSeniorMarket  ← EXISTING market state
└── Accounting: RAY (1e27) index math, share-based
     └── Shares are INTERNAL LEDGER ENTRIES (InvestorLite struct)
         NOT ERC-20 tokens — no transfer, no balanceOf, no approve
```

```
GenericFundViewer (UUPS proxy) — 38 functions, room to grow
├── getFundTotalsByTranche / getLiquidityBuffer / previewRateBP
├── getBorrowerInfo / getMaturityMilestone / getBucketRatio
├── onLoanCreated / onLoanClosed       ← EXISTING lifecycle hooks from Core
├── CreateUnion / ActivateUnion / DeactivateUnion
└── AddFundType / RemoveFundType
```

### Key insight: Core shares are not tokens

Core's `InvestorLite` struct tracks `shares`, `entryIndex`, `pending`, etc. per investor — but these are storage mappings, not ERC-20 balances. There is no `transfer()`, no `balanceOf()`, no `approve()`. Investors cannot move their position to another address, trade it on a DEX, or use it as collateral.

For agentic capital, this is a hard blocker. Agents need:
- Liquid, tradeable position tokens (to manage portfolio risk)
- Standard ERC-20 balances (for wallet/aggregator discovery)
- Composability (to use positions as collateral in other protocols)

### Key existing mechanism: bucketThresholds

The AUM cap for external deposits **already exists** in `bucketTresholds(union, loanType)`. This WAD value (e.g., `0.1e18` = 10%) defines the minimum ratio of junior (member) equity to total pool size. At 0.1, junior must be ≥10% of the pool, meaning senior (+ agent) deposits can be at most **9× the junior equity**.

```
maxSeniorDeposit = (juniorEquity / bucketThreshold) - juniorEquity - currentSeniorDeposits
```

This is already the trust model: **union members put skin in the game (junior), the ratio controls how much external capital can sit on top**. No new state variable needed.

### Target architecture

```
NilaSeniorVault (ERC-4626 + ERC-20)     ← NEW standalone contract, per union
├── deposit(assets, receiver) → shares    ← mints liquid nSR tokens
├── redeem(shares, receiver, owner)       ← burns nSR, withdraws from Core
├── transfer / approve / balanceOf        ← standard ERC-20, freely tradeable
├── totalAssets()                          ← reads Core's getSeniorMarket
├── maxDeposit(receiver)                  ← reads bucketThreshold via Viewer
└── Vault is ONE depositor in Core's eyes
    └── Core sees: vault address → InvestorLite { shares, entryIndex, ... }
    └── Vault ERC-20 subdivides that position among individual holders

NilaJuniorVault (ERC-4626 + ERC-20)     ← NEW standalone, per union+loanType
└── same pattern, scoped to junior tranche

GenericFundViewer (upgraded)              ← EXISTING proxy
├── effectiveMaxDeposit(union, loanType)  ← NEW view, no Core change
├── getPoolHealth(union, loanType)        ← NEW view, uses hook counters
└── all existing functions preserved
```

### How the vault-as-single-depositor pattern works

```
User A deposits 100 NILA into NilaSeniorVault
  → Vault calls core.depositSenior(union, 100)
  → Core records: vault address has 100 internal shares
  → Vault mints 100 nSR tokens (ERC-20) to User A

User A transfers 50 nSR to User B on Uniswap
  → Core state: UNCHANGED (vault still has 100 internal shares)
  → Vault ERC-20: A has 50 nSR, B has 50 nSR

User B redeems 50 nSR
  → Vault burns 50 nSR from User B
  → Vault calls core.requestUnbondSenior(union, 50 internal shares)
  → After unbond period: vault calls core.claimSenior(union, 50)
  → Vault sends 50 NILA (+ accrued yield) to User B
  → Core state: vault now has 50 internal shares
```

Zero Core changes for this pattern. Core's `depositSenior(unionAddr, amount)` uses `msg.sender` as the investor — the vault IS the investor. The vault's ERC-20 is the liquid layer on top.

---

## Phase 1: Liquid Vaults + Trust Infrastructure (Weeks 1–4)

**Objective:** Deploy liquid ERC-4626 vault tokens and harden the protocol for external scrutiny. Core changes: ~50 bytes.

### 1.1 NilaSeniorVault — Liquid ERC-4626

This is the primary vessel for agentic capital. One vault per union.

```solidity
contract NilaSeniorVault is ERC4626 {
    IGenericFundCore public immutable core;
    IGenericFundViewer public immutable viewer;
    address public immutable union;
    IERC20 public immutable nin; // underlying asset (NILA/NIN token)

    uint256 internal constant RAY = 1e27;

    constructor(
        IGenericFundCore _core,
        IGenericFundViewer _viewer,
        address _union,
        IERC20 _nin
    )
        ERC4626(_nin)
        ERC20(
            "Nila Senior Vault",  // name  (can include union name)
            "nSR"                 // symbol (can include union short ID)
        )
    {
        core = _core;
        viewer = _viewer;
        union = _union;
        nin = _nin;
    }

    // --- ERC-4626 Core ---

    function totalAssets() public view override returns (uint256) {
        // Vault is a single depositor in Core. Read its position.
        ICore.MarketLite memory m = core.getSeniorMarket(union);
        ICore.InvestorLite memory inv = core.getInvestorSenior(union, address(this));
        // principal = shares × index / RAY
        return (inv.shares * m.index) / RAY;
    }

    function maxDeposit(address) public view override returns (uint256) {
        // Delegates to Viewer's bucket-ratio calculation
        (uint256 maxSenior, ) = viewer.effectiveMaxDeposit(union, bytes32(0));
        return maxSenior;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal override
    {
        // 1. Pull NIN from caller
        SafeERC20.safeTransferFrom(nin, caller, address(this), assets);
        // 2. Approve Core to pull from vault
        nin.approve(address(core), assets);
        // 3. Deposit into Core — vault is the investor (msg.sender)
        core.depositSenior(union, assets);
        // 4. Mint liquid vault tokens to receiver
        _mint(receiver, shares);
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        // Burn vault tokens
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }
        _burn(owner, shares);

        // Check if instant exit is possible from idle cash
        // If not, revert — user must use requestAsyncRedeem() instead
        uint256 idleCash = _getIdleCash();
        require(assets <= idleCash, "UseAsyncRedeem");

        // Request unbond + immediate claim if cash available
        core.requestUnbondSenior(union, shares);
        core.claimSenior(union, shares);

        // Transfer underlying to receiver
        SafeERC20.safeTransfer(nin, receiver, assets);
    }

    // --- Async Redemption (for amounts exceeding idle cash) ---

    mapping(address => uint256) public pendingRedemptions;

    function requestAsyncRedeem(uint256 shares) external {
        _burn(msg.sender, shares);
        core.requestUnbondSenior(union, shares);
        pendingRedemptions[msg.sender] += shares;
    }

    function claimAsyncRedeem() external {
        uint256 shares = pendingRedemptions[msg.sender];
        require(shares > 0, "NoPending");
        pendingRedemptions[msg.sender] = 0;
        core.claimSenior(union, shares);
        // Transfer claimed assets to user
        uint256 bal = nin.balanceOf(address(this));
        SafeERC20.safeTransfer(nin, msg.sender, bal);
    }

    // --- Helpers ---

    function _getIdleCash() internal view returns (uint256) {
        (, , , , uint256 idleCash, , ) = viewer.getPoolHealth(union, bytes32(0));
        return idleCash;
    }
}
```

**Key properties of this vault:**
- nSR is a standard ERC-20: `transfer`, `approve`, `balanceOf` all work
- nSR can be traded on Uniswap, used as collateral, held in any wallet
- Agents discover it via standard ERC-4626 calls: `totalAssets()`, `maxDeposit()`, `previewDeposit()`
- The bucket ratio cap is enforced via `maxDeposit()` → agents can't over-deposit
- Synchronous withdraw from idle cash; async path for larger positions
- **Zero Core bytecode impact**

### 1.2 NilaJuniorVault — Liquid ERC-4626

One vault per `(union, loanType)` pair. Same pattern, but:
- Calls `core.depositJunior(union, loanType, amount, address(this))` — vault is the `member`
- `totalAssets()` reads from `core.getJuniorMarket(union, loanType)`
- `maxDeposit()` reads `maxJunior` from `viewer.effectiveMaxDeposit()`
- Token symbol: `nJR`

**Authorization question:** `depositJunior` takes a `member` param. If Core checks `msg.sender == member` or requires the member to hold a land NFT (`NftRequired` error exists in the ABI), the vault address needs whitelisting. Two options:
- If Core uses the `roles` contract for access control, grant the vault a deposit role. No Core code change.
- If Core hardcodes the check, add a one-line whitelist check. ~80 bytes.
- **Decision:** Check the actual `depositJunior` implementation. If it just does `transferFrom(msg.sender, ...)`, the vault works as-is.

### 1.3 Vault Factory (EIP-1167 Minimal Clones)

Rather than deploying the full vault bytecode per union, use a clone factory:

```solidity
contract NilaVaultFactory {
    address public immutable seniorImpl;
    address public immutable juniorImpl;

    // Registry built into factory
    struct VaultInfo {
        address vault;
        address union;
        bytes32 loanType;
        uint8   tranche;
    }
    VaultInfo[] public vaults;

    function createSeniorVault(address union) external returns (address vault) {
        vault = Clones.clone(seniorImpl);
        NilaSeniorVault(vault).initialize(core, viewer, union, nin);
        vaults.push(VaultInfo(vault, union, bytes32(0), 1));
    }

    function createJuniorVault(address union, bytes32 loanType) external returns (address vault) {
        vault = Clones.clone(juniorImpl);
        NilaJuniorVault(vault).initialize(core, viewer, union, loanType, nin);
        vaults.push(VaultInfo(vault, union, loanType, 0));
    }

    function allVaults() external view returns (VaultInfo[] memory) {
        return vaults;
    }
}
```

Each clone is **~45 bytes** of deployed bytecode (just a `delegatecall` forwarder). The implementation is deployed once. Creating a vault for a new union costs minimal gas. The factory doubles as the vault registry — agents call `allVaults()` to discover pools.

Note: with clones, the vault constructors become `initialize()` functions (initializer pattern, same as your UUPS contracts).

### 1.4 effectiveMaxDeposit (in Viewer)

Add to GenericFundViewer so vaults (and agents) can read the cap in one call:

```solidity
function effectiveMaxDeposit(address union, bytes32 loanType)
    external view returns (uint256 maxSenior, uint256 maxJunior)
{
    // Junior equity = totalShares * index / RAY
    ICore.MarketLite memory jr = core.getJuniorMarket(union, loanType);
    uint256 juniorEquity = (jr.totalShares * jr.index) / RAY;

    // Threshold: minimum junior ratio (WAD). 0.1e18 = 10% → 10x leverage
    uint256 threshold = core.bucketTresholds(union, loanType);

    // Max total pool = juniorEquity / threshold
    uint256 maxTotal = threshold > 0
        ? (juniorEquity * 1e18) / threshold
        : juniorEquity;

    // Senior capacity
    ICore.MarketLite memory sr = core.getSeniorMarket(union);
    uint256 seniorEquity = (sr.totalShares * sr.index) / RAY;

    maxSenior = maxTotal > juniorEquity + seniorEquity
        ? maxTotal - juniorEquity - seniorEquity
        : 0;

    // Junior capped by bucketMaxAmount if set
    uint256 manualCap = core.bucketMaxAmount(union, loanType);
    maxJunior = manualCap > 0
        ? (manualCap > juniorEquity ? manualCap - juniorEquity : 0)
        : type(uint256).max;
}
```

**Core bytecode impact: 0 bytes.** Pure Viewer addition.

### 1.5 Admin Timelock

Deploy OpenZeppelin `TimelockController` (48h minimum delay). Transfer ownership of Core and Viewer. No code change — just ownership transfer.

**Core bytecode impact: 0 bytes.**

### 1.6 Immutable Safety Floor

```solidity
// In Core (upgrade)
uint32 public constant MIN_SAFETY_BP = 500; // 5% floor

// In setReserveConfigForUnion, add:
require(safetyBP >= MIN_SAFETY_BP, "BelowFloor");
```

**Core bytecode impact: ~50 bytes.**

### Phase 1 Effort Summary

| Deliverable | Effort | Core Impact |
|-------------|--------|-------------|
| NilaSeniorVault implementation | 4 days | 0 bytes |
| NilaJuniorVault implementation | 3 days | 0–80 bytes (auth) |
| VaultFactory + registry | 2 days | 0 bytes |
| effectiveMaxDeposit in Viewer | 2 days | 0 bytes |
| TimelockController deploy | 1 day | 0 bytes |
| MIN_SAFETY_BP in Core | 0.5 days | ~50 bytes |
| Integration tests on Amoy | 3 days | — |
| **Total** | **~15 days** | **~50–130 bytes** |

---

## Phase 2: On-Chain Performance Attestation (Weeks 4–6)

**Objective:** Give agents verifiable data to assess pool quality before depositing. Counters maintained in Viewer via Core→Viewer hooks.

### 2.1 Loan Lifecycle Hooks (Core → Viewer)

Core already calls `viewer.onLoanCreated()` and `viewer.onLoanClosed()`. Add two hooks:

**In Core's `repayLoan`:**
```solidity
viewer.onLoanRepaid(unionAddr, loanId, principalPaid, interestPaid);
```

**In Core's `markDefault`:**
```solidity
viewer.onLoanDefaulted(unionAddr, loanId, juniorApplied + seniorApplied);
```

**Core bytecode impact: ~200 bytes** (two external calls in existing function bodies).

### 2.2 Pool Health Counters and View (in Viewer)

```solidity
struct HealthCounters {
    uint64  loansOriginated;
    uint64  loansRepaidFull;
    uint64  loansDefaulted;
    uint64  activeLoans;
    uint128 cumulativePrincipalLent;
    uint128 cumulativePrincipalRepaid;
    uint128 cumulativeInterestEarned;
    uint128 cumulativeLossFromDefaults;
}
mapping(address => mapping(bytes32 => HealthCounters)) public healthByPool;

function onLoanCreated(address union, bytes32 loanId, address borrower) external onlyCore {
    // existing logic...
    bytes32 loanType = _loanTypeOf(union, loanId);
    healthByPool[union][loanType].loansOriginated++;
    healthByPool[union][loanType].activeLoans++;
}

function onLoanRepaid(address union, bytes32 loanId, uint256 principal, uint256 interest)
    external onlyCore
{
    bytes32 loanType = _loanTypeOf(union, loanId);
    HealthCounters storage h = healthByPool[union][loanType];
    h.cumulativePrincipalRepaid += uint128(principal);
    h.cumulativeInterestEarned += uint128(interest);
    if (_isLoanClosed(union, loanId)) {
        h.loansRepaidFull++;
        h.activeLoans--;
    }
}

function onLoanDefaulted(address union, bytes32 loanId, uint256 lossAmount)
    external onlyCore
{
    bytes32 loanType = _loanTypeOf(union, loanId);
    HealthCounters storage h = healthByPool[union][loanType];
    h.loansDefaulted++;
    h.activeLoans--;
    h.cumulativeLossFromDefaults += uint128(lossAmount);
}

function getPoolHealth(address union, bytes32 loanType)
    external view returns (
        HealthCounters memory counters,
        uint16 currentUtilizationBP,
        uint16 currentRateBP,
        uint256 juniorEquity,
        uint256 seniorEquity,
        uint256 idleCash,
        uint256 maxSeniorDeposit
    )
{
    counters = healthByPool[union][loanType];
    // ... read utilization, rate, equity from Core's existing views
}
```

**Why this matters for AUM growth:** An agent evaluating whether to deposit into a Nila vault computes:
- **Default rate:** `loansDefaulted / loansOriginated`
- **Loss severity:** `cumulativeLossFromDefaults / cumulativePrincipalLent`
- **Yield quality:** `cumulativeInterestEarned / cumulativePrincipalLent` — real yield from real agricultural loans, not token emissions
- **Pool capacity:** `maxSeniorDeposit` based on current junior equity and bucket ratio

All on-chain, all verifiable. This is what separates a serious protocol from a yield farm.

### 2.3 Enhanced LoanRepaid Event

```solidity
// Enhanced with remaining balance:
event LoanRepaid(
    address indexed union,
    bytes32 indexed loanId,
    uint256 interestPaid,
    uint256 principalPaid,
    uint256 remainingPrincipal  // NEW
);
```

**Core bytecode impact: ~30 bytes.**

### Phase 2 Effort Summary

| Deliverable | Effort | Core Impact |
|-------------|--------|-------------|
| onLoanRepaid + onLoanDefaulted hooks in Core | 1 day | ~200 bytes |
| HealthCounters + getPoolHealth in Viewer | 3 days | 0 bytes |
| Enhanced LoanRepaid event | 0.5 days | ~30 bytes |
| Tests | 2 days | — |
| **Total** | **~7 days** | **~230 bytes** |

---

## Phase 3: Mechanical Security & Verification Layer (Weeks 6–12)

**Objective:** Make the senior tranche *mechanically secured* — enforceable by smart contract code, not by trust in Nila or the union — while making off-chain loan data verifiable on-chain.

This phase is where Nila moves from "RWA protocol with good indicators" to "DeFi protocol with mechanically-enforced senior protection plus verifiable off-chain backing." The distinction matters because mechanical security is what makes a vault legible to sophisticated agentic capital beyond RWA specialists.

### Why this phase is non-negotiable for Nila

Most "agentic yield" protocols today — Zyfai, Clawpump, Orbs, OpenLedger — don't actually verify the security of the loans generating their profits. They route capital *between* existing venues (Aave, Morpho, Ethena) and trust those venues' liquidation engines. In pure crypto-collateral DeFi, the security model is mechanical — over-collateralization + automated liquidation = guaranteed senior protection.

Nila's loans are not mechanically secured at origination (a sugarcane harvest is a real-world event no contract can guarantee), but the **senior tranche can be**. The key insight: stack mechanical backstops such that no matter what happens to individual loans, the contract guarantees senior principal through an enforceable coverage inequality:

```
seniorPrincipal ≤ junior + treasury + insurance + foodTokens + landCollateral
```

Every term on the right is made readable and, where relevant, auto-actionable by the smart contract. If the inequality is about to break, new senior deposits revert, new loans block, and in worst case the backstop waterfall auto-executes. This is how Nila becomes *mechanical enough* for generalist agents, not just RWA specialists.

### 3.1 Loan Voucher Collateral Commitments

Your `drawLoanWithVoucher` already accepts an oracle-signed voucher. Extend the voucher schema to commit to collateral metadata:

```solidity
// Extended voucher payload (hashed into paramsHash, signed off-chain by oracle)
struct LoanCollateralCommitment {
    bytes32 cropType;              // e.g., keccak256("sugarcane")
    uint32  areaHectares;          // land area under cultivation (×100 for 2 decimals)
    uint32  expectedYieldPerHa;    // kg/ha expected yield (seasonal benchmark)
    uint32  cropPriceEstimate;     // INR/kg at voucher time (Chainlink or oracle-attested)
    uint40  harvestDate;           // expected harvest timestamp
    bytes32 landTitleId;           // NFT token ID if land-collateralized (0 if not)
    bytes32 foodTokenId;           // harvest-backed token ID if used (0 if not)
    uint16  insuranceCoverageBP;   // % of principal covered by crop insurance
    bytes32 underwritingDigest;    // hash of off-chain underwriting document
}
```

**Key property:** The voucher signature covers the collateral commitment. An oracle attesting to a loan is also attesting to the security profile. If the oracle signs loans where the commitment is false (e.g., no land actually exists at that title ID), they're on record.

**Where it lives:** The commitment is encoded into the existing `paramsHash` field (no new Core function, no bytecode cost). The raw struct is stored by an off-chain indexer and served alongside loan events. Agents verify by hashing the struct and checking against the on-chain `paramsHash`.

**Core bytecode impact: 0 bytes.** Uses existing voucher mechanism.

### 3.2 AttestationRegistry (Standalone Contract)

Tracks identified oracles and their attestation history so agents can score oracle reliability.

```solidity
contract NilaAttestationRegistry {
    struct OracleInfo {
        string  name;               // "MT-001 Field Officer"
        address unionAddr;          // which union this oracle serves
        uint40  registeredAt;
        bool    active;
        // Track record (updated via hooks from Core's loan lifecycle)
        uint64  loansAttested;
        uint64  loansRepaidFull;
        uint64  loansDefaulted;
        uint128 cumulativePrincipalAttested;
        uint128 cumulativeLossOnAttested;
    }

    mapping(address => OracleInfo) public oracles;   // signer address → info
    mapping(bytes32 => address) public loanOracle;   // loanId → signer

    // Called from Core's drawLoanWithVoucher (new hook, adds ~80 bytes to Core)
    function recordAttestation(
        address oracle,
        bytes32 loanId,
        uint256 principal
    ) external onlyCore {
        OracleInfo storage o = oracles[oracle];
        require(o.active, "OracleInactive");
        o.loansAttested++;
        o.cumulativePrincipalAttested += uint128(principal);
        loanOracle[loanId] = oracle;
    }

    // Called from existing Viewer.onLoanRepaid / onLoanDefaulted
    function recordLoanOutcome(
        bytes32 loanId,
        bool repaidFull,
        uint256 lossAmount
    ) external onlyViewer { /* ... */ }

    // Agent-facing view: oracle's default rate and loss severity
    function oracleScore(address oracle) external view returns (
        uint16 defaultRateBP,
        uint16 lossGivenDefaultBP,
        uint64 loansAttested,
        uint40 ageSeconds
    );
}
```

**Why this matters:** Agents don't have to trust the union or Nila. They look at the specific oracle(s) that signed the loans in the pool and check their track record. An oracle with 200 loans attested, 5% default rate, and 18 months of history is a much stronger signal than "trust the union."

**Core bytecode impact: ~80 bytes** for one `attestationRegistry.recordAttestation()` call in `drawLoanWithVoucher`. This is the only new Core change in Phase 3.

### 3.3 Collateral Verification View (in Viewer)

Single function for agents to audit the collateral backing of a pool's outstanding loans:

```solidity
function getPoolCollateralSnapshot(address union, bytes32 loanType)
    external view returns (
        uint256 totalPrincipalOutstanding,
        uint256 landCollateralized,     // principal backed by land titles
        uint256 foodTokenCollateralized,// principal backed by harvest tokens
        uint256 insuranceCovered,       // principal covered by crop insurance
        uint256 expectedHarvestRevenue, // sum of commitments × current crop prices
        uint256 oracleCount,            // distinct oracles attesting to active loans
        uint16  coverageRatioBP         // expectedRevenue / totalPrincipal
    );
```

The critical output is `coverageRatioBP`. If expected harvest revenue at current crop prices is 150% of outstanding loan principal, the pool has substantial economic cushion before the junior tranche is touched. An agent monitors this continuously — if it drops below 110%, they consider reducing exposure.

This is the **agricultural equivalent of an LTV ratio**, computed from on-chain commitments and crop prices. It's a better coverage signal than anything Morpho or Aave can offer because it's tied to real economic output, not to the volatile market price of crypto collateral.

### 3.4 Land Title Escrow Integration

Your `NilaLandTitle` NFT contract already exists but isn't wired as loan collateral. Add an escrow contract that locks land NFTs when loans are drawn and releases them on repayment:

```solidity
contract NilaLandEscrow {
    INilaLandTitle public immutable landTitle;
    IGenericFundCore public immutable core;

    mapping(bytes32 => uint256) public loanToTitleId;  // loanId → NFT id
    mapping(uint256 => bytes32) public titleToLoanId;  // NFT id → loanId

    // Called by Core on drawLoanWithVoucher when voucher commits a landTitleId
    function lockCollateral(bytes32 loanId, uint256 titleId, address borrower)
        external onlyCore
    {
        require(landTitle.ownerOf(titleId) == borrower, "NotOwner");
        landTitle.transferFrom(borrower, address(this), titleId);
        loanToTitleId[loanId] = titleId;
        titleToLoanId[titleId] = loanId;
    }

    // Called by Core on repayLoan when loan is fully repaid
    function releaseCollateral(bytes32 loanId, address borrower) external onlyCore {
        uint256 titleId = loanToTitleId[loanId];
        require(titleId != 0, "NoCollateral");
        landTitle.transferFrom(address(this), borrower, titleId);
        delete loanToTitleId[loanId];
        delete titleToLoanId[titleId];
    }

    // Called by Core on markDefault — title can be auctioned by union governance
    function triggerLiquidation(bytes32 loanId) external onlyCore {
        // Transfer to union treasury for governance-led liquidation
    }
}
```

**Why this is the strongest layer:** Land titles are the most durable collateral in the agricultural context — forfeiting land is a far higher economic and social cost than forfeiting a crop. An agent seeing that 60% of a pool's outstanding principal is land-collateralized has a materially different risk profile than a pool with no hard collateral.

**Core bytecode impact: ~100 bytes** for `escrow.lockCollateral()` and `escrow.releaseCollateral()` calls added to `drawLoanWithVoucher` and `repayLoan`. Guard with an `if (commitment.landTitleId != 0)` check so loans without land collateral incur no overhead.

### 3.5 Mechanical Coverage Invariant (Strategy 1)

The vault enforces a continuous coverage inequality at deposit time and via keeper. No matter the source of a potential loss, senior principal is covered 1.2×–1.5× by mechanically-accessible backstops.

**Location:** Added to `NilaSeniorVault.maxDeposit()` and as a standalone view in Viewer.

```solidity
// In NilaSeniorVault
function mechanicalCoverage() public view returns (
    uint256 seniorPrincipal,
    uint256 juniorBackstop,
    uint256 treasuryBackstop,
    uint256 insuranceBackstop,
    uint256 foodTokenBackstop,
    uint256 landBackstop,
    uint256 reinsuranceBackstop,
    uint256 totalCoverage,
    uint16  coverageRatioBP,
    bool    mechanicallySecured
) {
    seniorPrincipal     = _seniorPrincipal();
    juniorBackstop      = _juniorEquity();
    treasuryBackstop    = core.unionTreasury(union);
    insuranceBackstop   = insurancePool.getUnionCoverage(union);
    foodTokenBackstop   = foodTokenEscrow.totalValueLocked(union);
    landBackstop        = landEscrow.totalAppraisedValue(union) * 7000 / 10000; // haircut
    reinsuranceBackstop = reinsurancePool.getUnionCover(union);

    totalCoverage = juniorBackstop + treasuryBackstop + insuranceBackstop
                  + foodTokenBackstop + landBackstop + reinsuranceBackstop;

    coverageRatioBP = seniorPrincipal > 0
        ? uint16((totalCoverage * 10000) / seniorPrincipal)
        : type(uint16).max;

    mechanicallySecured = coverageRatioBP >= MIN_COVERAGE_BP; // e.g., 12000 = 120%
}

function maxDeposit(address) public view override returns (uint256) {
    // Standard bucket-ratio cap
    (uint256 bucketCap, ) = viewer.effectiveMaxDeposit(union, bytes32(0));
    // Additional mechanical-coverage cap
    uint256 coverageCap = _maxDepositForCoverage();
    return bucketCap < coverageCap ? bucketCap : coverageCap;
}
```

**Agent use:** A single call to `mechanicalCoverage()` returns everything an agent needs to know about senior protection. `mechanicallySecured` is the boolean gate — if true, this pool meets the protocol's declared safety invariant. If false, new senior deposits are auto-paused at the contract level.

**Haircuts on illiquid collateral:** Land has a 70% haircut (fast liquidation of agricultural land doesn't achieve full appraised value). Food tokens have a 85% haircut (auction slippage). Junior and treasury and insurance count at 100% because they're liquid on-chain. These haircuts are immutable constants — agents can audit them.

**Core bytecode impact: 0 bytes.** All vault-level.

### 3.6 Union Treasury Auto-Tap (Strategy 2)

Your `unionTreasury` mapping and `withdrawUnionTreasury` function already exist. Wire the treasury as an automatic first-line absorber on default, ahead of even the junior tranche. This transforms the treasury from a passive reserve into a mechanical backstop.

**Change in Core's `markDefault`:**

```solidity
// Inside existing markDefault, before applying loss to tranches:
uint256 remainingLoss = lossAmount;
uint256 treasuryAvail = unionTreasury[unionAddr];

if (treasuryAvail > 0) {
    uint256 tapped = treasuryAvail < remainingLoss ? treasuryAvail : remainingLoss;
    unionTreasury[unionAddr] -= tapped;
    remainingLoss -= tapped;
    emit TreasuryAutoTapped(unionAddr, loanId, tapped);
}

// Only apply remainder to junior (and then senior waterfall if junior exhausted)
if (remainingLoss > 0) {
    // existing junior absorption logic
}
```

**Treasury floor invariant:** Core enforces a minimum treasury ratio to prevent over-draining. If treasury falls below a threshold (e.g., 10% of outstanding senior), new loans revert and new senior deposits auto-pause until treasury is topped up (either via accrued fees or union manual top-up).

```solidity
uint256 public constant MIN_TREASURY_RATIO_BP = 1000; // 10%

function _checkTreasuryFloor(address unionAddr) internal view returns (bool healthy) {
    uint256 senior = _seniorOutstanding(unionAddr);
    uint256 requiredTreasury = (senior * MIN_TREASURY_RATIO_BP) / 10000;
    return unionTreasury[unionAddr] >= requiredTreasury;
}
```

**Why this matters:** The union has skin in the game through the treasury, not just through junior deposits. A union that lets its treasury drain out is mechanically blocked from operating until it's refilled. This aligns union incentives with senior protection in an enforceable way.

**Core bytecode impact: ~150 bytes** (auto-tap logic + floor check + one event).

### 3.7 Food Token Collateral with Dutch Auction Liquidation (Strategy 3)

Your `foodTokenCollateral` is marked "not operational" in `shared.jsx`. Operationalize it as a mechanically-liquidable collateral layer. This is the single biggest step toward "DeFi-mechanical" that Nila can take.

**Architecture:** A standalone `NilaFoodTokenEscrow` contract that manages ERC-1155 food tokens (harvest-backed claims) as loan collateral, with on-chain Dutch auction liquidation on default.

```solidity
contract NilaFoodTokenEscrow {
    IERC1155 public immutable foodToken;
    IGenericFundCore public immutable core;
    IPriceOracle public immutable cropPriceOracle;

    struct Commitment {
        uint256 tokenId;         // food token ID
        uint256 amount;          // quantity (e.g., kg)
        uint40  harvestDate;
        uint16  haircutBP;       // auction haircut (e.g., 8500 = 15% haircut)
    }
    mapping(bytes32 => Commitment) public loanCommitments; // loanId → commitment

    struct Auction {
        bytes32 loanId;
        uint256 startPrice;      // oracle price × amount at auction start
        uint40  startTs;
        uint40  duration;        // Dutch auction decay window (e.g., 48h)
        uint16  floorBP;         // price floor (e.g., 5000 = 50% of start)
        bool    settled;
    }
    mapping(bytes32 => Auction) public auctions;

    // Called by Core on drawLoanWithVoucher when foodTokenId is committed
    function lockCollateral(
        bytes32 loanId,
        address borrower,
        uint256 tokenId,
        uint256 amount
    ) external onlyCore {
        foodToken.safeTransferFrom(borrower, address(this), tokenId, amount, "");
        loanCommitments[loanId] = Commitment(tokenId, amount, 0, 8500);
    }

    // Called on repayLoan — return collateral to borrower
    function releaseCollateral(bytes32 loanId, address borrower) external onlyCore {
        Commitment memory c = loanCommitments[loanId];
        require(c.amount > 0, "NoCollateral");
        foodToken.safeTransferFrom(address(this), borrower, c.tokenId, c.amount, "");
        delete loanCommitments[loanId];
    }

    // Called on markDefault — auto-start Dutch auction
    function startAuction(bytes32 loanId) external onlyCore {
        Commitment memory c = loanCommitments[loanId];
        uint256 marketPrice = cropPriceOracle.priceFor(c.tokenId);
        uint256 startPrice = (marketPrice * c.amount * c.haircutBP) / 10000;
        auctions[loanId] = Auction({
            loanId: loanId,
            startPrice: startPrice,
            startTs: uint40(block.timestamp),
            duration: 48 hours,
            floorBP: 5000,
            settled: false
        });
        emit AuctionStarted(loanId, startPrice);
    }

    // Anyone can bid at the current decayed price
    function bid(bytes32 loanId) external returns (uint256 pricePaid) {
        Auction storage a = auctions[loanId];
        require(!a.settled, "Settled");
        pricePaid = _currentPrice(a);
        // Pull stablecoin from bidder
        IERC20(stablecoin).transferFrom(msg.sender, address(core), pricePaid);
        // Transfer food tokens to bidder
        Commitment memory c = loanCommitments[loanId];
        foodToken.safeTransferFrom(address(this), msg.sender, c.tokenId, c.amount, "");
        // Core receives proceeds and applies to senior recovery
        core.applyAuctionProceeds(loanId, pricePaid);
        a.settled = true;
        emit AuctionSettled(loanId, msg.sender, pricePaid);
    }

    function _currentPrice(Auction memory a) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - a.startTs;
        if (elapsed >= a.duration) {
            // At floor for rest of auction
            return (a.startPrice * a.floorBP) / 10000;
        }
        // Linear decay from 100% → floor over duration
        uint256 decayRange = 10000 - a.floorBP;
        uint256 currentBP = 10000 - ((decayRange * elapsed) / a.duration);
        return (a.startPrice * currentBP) / 10000;
    }
}
```

**Why this is the critical piece:** This is what makes Nila's loan security mechanical in the DeFi sense. On default, the contract doesn't need human intervention — it starts an auction, anyone can bid, the highest bid within 48 hours wins, proceeds flow to senior recovery. Agents can audit this entire flow in code. No trust in union governance to execute liquidation, no reliance on off-chain auction houses.

**Bootstrap dependency:** A market of food token buyers must exist. This is a go-to-market problem, not a contract problem. Early on, Nila (or an affiliated trading entity) may need to be the market-maker of last resort at the auction floor. Over time, commodity traders, off-takers, and agri-focused DAOs arbitrage discounts. The auction mechanism is mechanical regardless.

**Core bytecode impact: ~150 bytes** for three hooks (`foodTokenEscrow.lockCollateral` in `drawLoanWithVoucher`, `foodTokenEscrow.releaseCollateral` in `repayLoan`, `foodTokenEscrow.startAuction` in `markDefault`, plus an `applyAuctionProceeds` entry point). The escrow itself is a standalone contract — no bytecode impact there.

### 3.8 Time-Tranched Mechanical Escalation (Strategy 5)

Use your existing milestone reporting (`reportMilestone` already in Core) as the basis for programmatic crisis response. If milestones aren't reported on time, pre-defined mechanical actions trigger automatically.

**Architecture:** A standalone `NilaLoanEnforcer` keeper contract that anyone can call (incentivized by small bounty from union treasury) to execute escalation actions on overdue loans.

```solidity
contract NilaLoanEnforcer {
    struct EscalationSchedule {
        uint32 milestone1Deadline;    // days after drawdown
        uint32 milestone3Deadline;
        uint32 harvestDeadline;
        uint16 escalationBountyBP;    // bounty for keeper (e.g., 10 BP = 0.1%)
    }

    mapping(address => EscalationSchedule) public schedules; // per union

    function enforce(address union, bytes32 loanId) external returns (uint256 bounty) {
        ICore.Loan memory loan = core.loans(union, loanId);
        EscalationSchedule memory s = schedules[union];
        uint256 age = block.timestamp - loan.drawdownTs;

        // Stage 1: Milestone 1 overdue → auto-tap treasury for risk buffer
        if (loan.milestone < 1 && age > s.milestone1Deadline * 1 days) {
            core.tapTreasuryForRiskBuffer(union, loanId);
            emit Stage1Triggered(union, loanId);
        }

        // Stage 2: Milestone 3 overdue → lock collateral + pause new loans of this type
        if (loan.milestone < 3 && age > s.milestone3Deadline * 1 days) {
            core.lockBorrowerCollateral(union, loanId);
            core.pauseLoanType(union, loan.loanType);
            emit Stage2Triggered(union, loanId);
        }

        // Stage 3: Harvest overdue → auto-mark default + start food token auction
        if (loan.milestone < 5 && age > s.harvestDeadline * 1 days && !loan.defaulted) {
            core.markDefault(union, loanId);  // triggers auction via Strategy 3
            emit Stage3Triggered(union, loanId);
        }

        // Pay keeper bounty from treasury
        bounty = _payBounty(union, s.escalationBountyBP);
    }
}
```

**Keeper economics:** Anyone can call `enforce()`. If an escalation stage actually triggers, the caller receives a small bounty from union treasury (e.g., 10 BP). This incentivizes monitoring — specialized keeper bots will scan for overdue loans and trigger escalations. In DeFi this is the standard pattern (Aave keepers, Compound liquidators) applied to agricultural milestone enforcement.

**Why this is mechanical:** Agents depositing into the vault can audit exactly what happens if any individual loan deviates from the expected path — every trigger is in code, every timeout is configurable per union, every outcome is deterministic. There's no "and then the union figures it out" gap. The contract handles the escalation.

**Core bytecode impact: ~100 bytes** — three new entry points (`tapTreasuryForRiskBuffer`, `lockBorrowerCollateral`, `pauseLoanType`) that are callable by the enforcer contract. These are thin wrappers around logic that partly exists (pause, treasury tap).

### 3.9 Crop Price Oracle Integration

For `expectedHarvestRevenue` to be live and trustworthy, crop prices must come from a verifiable source. Options:

- **Chainlink agricultural commodity feeds** where available (sugarcane, wheat, rice are covered on some chains; Indian-specific crops may not be)
- **Off-chain oracle with on-chain attestation** — a signed feed from a reputable data source (APMC mandi prices, NCDEX futures) posted periodically on-chain
- **Union-reported with staking** — the union stakes NILA against reported prices; large discrepancies with post-harvest actual sale prices trigger slashing

The oracle choice doesn't require Core changes — prices are read by the Viewer's `getPoolCollateralSnapshot` function. This can evolve over time.

### Phase 3 Effort Summary

| Deliverable | Effort | Core Impact |
|-------------|--------|-------------|
| Extended voucher schema + off-chain indexer | 3 days | 0 bytes |
| AttestationRegistry standalone contract | 4 days | ~80 bytes (one hook) |
| getPoolCollateralSnapshot in Viewer | 3 days | 0 bytes |
| NilaLandEscrow + Core integration | 4 days | ~100 bytes (two hooks) |
| **mechanicalCoverage view on vault** | 2 days | 0 bytes |
| **Treasury auto-tap + floor invariant** | 3 days | ~150 bytes |
| **NilaFoodTokenEscrow + Dutch auction + Core integration** | 8 days | ~150 bytes |
| **NilaLoanEnforcer + keeper hooks in Core** | 5 days | ~100 bytes |
| Crop price oracle (v1, off-chain signed feed) | 3 days | 0 bytes |
| Tests + integration | 5 days | — |
| **Total** | **~40 days** | **~580 bytes** |

Updated total Core bytecode across all phases: **~860–940 bytes**. Still within any reasonable margin — GenericFundCore has headroom for under 1KB of additions, which this stays well beneath.

---

## Phase 4: Agent Infrastructure (Weeks 12–16)

**Objective:** Reduce friction for autonomous systems. All standalone contracts — zero Core changes. Prepares the infrastructure (especially the stablecoin router) that Phase 5's LST market depends on.

### 4.1 DelegationManager

Allows a DAO or fund to grant an agent limited permissions to deposit/withdraw via the vault on their behalf.

```solidity
contract NilaDelegationManager {
    struct Delegation {
        uint256 maxPerTx;
        uint256 cumulativeCap;
        uint256 cumulativeUsed;
        uint40  expiry;
        bool    canDeposit;
        bool    canWithdraw;
    }

    mapping(address => mapping(address => Delegation)) public delegations;

    function setDelegation(address agent, Delegation calldata d) external;

    function depositVaultFor(
        address vault,
        address owner,
        uint256 assets
    ) external returns (uint256 shares) {
        Delegation storage d = delegations[owner][msg.sender];
        require(d.canDeposit && block.timestamp < d.expiry, "Unauthorized");
        require(assets <= d.maxPerTx, "ExceedsTxLimit");
        d.cumulativeUsed += assets;
        require(d.cumulativeUsed <= d.cumulativeCap, "ExceedsCap");

        // Pull tokens from owner, deposit into vault, send shares to owner
        IERC20 asset = IERC4626(vault).asset();
        asset.transferFrom(owner, address(this), assets);
        asset.approve(vault, assets);
        shares = IERC4626(vault).deposit(assets, owner);
    }
}
```

The delegation manager interacts with the vault (not Core directly), so it automatically inherits all the vault's caps and safety checks.

**Core bytecode impact: 0 bytes.**  
**Effort:** ~5 days.

### 4.2 Stablecoin Router

```solidity
contract NilaStableRouter {
    function depositWithStable(
        address vault,
        IERC20 stablecoin,
        uint256 stableAmount,
        uint256 minNilaOut,
        address receiver
    ) external returns (uint256 shares) {
        // 1. Pull stablecoins from caller
        // 2. Swap via fxPool or DEX aggregator → NIN
        // 3. Deposit NIN into vault
        // 4. Vault mints shares to receiver
    }
}
```

**Core bytecode impact: 0 bytes.**  
**Effort:** ~5 days.

### 4.3 Subgraph for Agent Discovery

Deploy a subgraph (The Graph, Polygon) indexing events from Core, Viewer, vaults, and the factory. Agents query via GraphQL.

**Key indexed entities:**
- `Vault` → address, union, tranche, TVL, APY
- `Pool` → utilization, rate, health counters, bucket ratio
- `Loan` → full lifecycle (drawn → milestones → repaid/defaulted)
- `VaultTransfer` → nSR/nJR token transfers (tracks who holds positions)

**Core bytecode impact: 0 bytes.**  
**Effort:** ~5 days.

---

## Phase 5: LST Market (Weeks 16–22)

**Objective:** Deploy a dedicated market for nSR/nJR liquid staking tokens with two entry paths — secondary AMM for immediate liquidity, and a discounted USDT→NIN→LST primary mint for net-new capital commitment. This is the apex product that ties vaults, mechanical security, and agent infrastructure together into a single legible venue.

### 5.1 Design Rationale

DeFi LST markets typically face a bootstrapping problem: no secondary market without holders, no holders without an attractive entry. Phase 5's two-path design solves this by making the paths *structurally different products* with different economics.

**Path A — Secondary AMM.** Buy existing nSR/nJR on a dedicated liquidity pool. Pay market price (floats around NAV based on supply/demand). Instant execution, no cooldown. Used by agents who want exposure now, in any size, without the friction of primary mint.

**Path B — Discounted Primary Mint.** USDT → NIN (via Phase 4 router) → vault deposit → nSR/nJR at a discount vs. secondary price. Discount compensates for multi-step execution and rewards capital that's actually new to the protocol (rather than traded between existing holders). Vesting period prevents instant arbitrage between the two paths.

Both paths target different participants, both are useful, and together they create a continuous price signal on pool health. If nSR trades above NAV on Path A, demand exceeds primary-mint capacity. If nSR trades below NAV, the market is pricing in risk the counter-parties don't.

### 5.2 The Market Contract

```solidity
contract NilaLSTMarket {
    IERC20 public immutable usdt;
    IERC20 public immutable nin;
    INilaStableRouter public immutable router;  // from Phase 4
    INilaVaultFactory public immutable factory;

    // Per-LST liquidity pool (Uniswap V2 style)
    struct Pool {
        address vault;          // the nSR/nJR token
        uint256 lstReserve;
        uint256 ninReserve;
        uint256 totalShares;    // LP shares (Nila or MM-owned initially)
    }
    mapping(address => Pool) public pools;    // vault address → pool

    // Vesting for Path B mints
    struct Vesting {
        address holder;
        uint256 shares;
        uint40  unlockTs;
    }
    mapping(address => Vesting[]) public vestings;  // holder → pending mints
    uint40 public constant PATH_B_VESTING = 48 hours;

    // --- Path A: Secondary AMM swap ---

    function swapNinForLST(address vault, uint256 ninIn, uint256 minLstOut)
        external returns (uint256 lstOut)
    {
        Pool storage p = pools[vault];
        nin.transferFrom(msg.sender, address(this), ninIn);
        // Constant product math
        lstOut = (p.lstReserve * ninIn) / (p.ninReserve + ninIn);
        require(lstOut >= minLstOut, "Slippage");
        p.lstReserve -= lstOut;
        p.ninReserve += ninIn;
        IERC20(vault).transfer(msg.sender, lstOut);
    }

    function swapLSTForNin(address vault, uint256 lstIn, uint256 minNinOut) external;
    // Also: swapUSDTForLST (routes USDT→NIN via Phase 4 router, then NIN→LST)

    // --- Path B: Discounted primary mint ---

    function mintPathB(
        address vault,
        uint256 usdtIn,
        uint256 minLstOut
    ) external returns (uint256 lstOut) {
        // 1. USDT → NIN via Phase 4 router
        usdt.transferFrom(msg.sender, address(this), usdtIn);
        usdt.approve(address(router), usdtIn);
        uint256 ninAmount = router.swap(usdt, nin, usdtIn, 0, address(this));

        // 2. Compute discount based on headroom
        uint256 discountBP = _computeDiscount(vault);

        // 3. Deposit NIN into vault — get vault shares
        nin.approve(vault, ninAmount);
        uint256 shares = IERC4626(vault).deposit(ninAmount, address(this));

        // 4. Apply discount bonus from incentive pool
        uint256 bonusShares = (shares * discountBP) / 10000;
        if (bonusShares > 0) {
            require(incentivePool[vault] >= bonusShares, "IncentiveExhausted");
            incentivePool[vault] -= bonusShares;
            shares += bonusShares;
        }

        lstOut = shares;
        require(lstOut >= minLstOut, "Slippage");

        // 5. Vest the shares — hold in this contract until unlock
        vestings[msg.sender].push(Vesting({
            holder: msg.sender,
            shares: lstOut,
            unlockTs: uint40(block.timestamp + PATH_B_VESTING)
        }));

        emit PathBMinted(msg.sender, vault, usdtIn, lstOut, discountBP);
    }

    function claimVested(uint256 index) external {
        Vesting storage v = vestings[msg.sender][index];
        require(block.timestamp >= v.unlockTs, "NotUnlocked");
        uint256 amount = v.shares;
        v.shares = 0;
        IERC20(vault).transfer(msg.sender, amount);
    }
}
```

### 5.3 Discount Formula

The discount on Path B must come from a specific economic source. Three components combine:

**FX pool efficiency (structural, 0–50 BP).** Large USDT → NIN swaps through the FX pool get better execution than small spot swaps because of bulk-pricing. Path B captures this natural efficiency and passes it on as discount.

**Bucket ratio headroom (dynamic, 0–200 BP).** When `effectiveMaxDeposit.maxSenior` shows significant unused capacity relative to junior equity, the protocol is capital-hungry and can afford to incentivize inflow. Discount scales inversely with utilization of the bucket cap:

```
headroomUtilizationBP = (currentSenior * 10000) / maxSenior
discountBP = max(0, MAX_HEADROOM_DISCOUNT * (10000 - headroomUtilizationBP) / 10000)
```

At 0% utilization → full discount. At 100% utilization → 0 discount (no need to incentivize, pool is at capacity).

**Treasury-funded incentive pool (capped, 0–100 BP).** Each union's treasury allocates up to 2% of annual fee inflow into an incentive pool that funds Path B discount bonus shares. Programmatically capped so the incentive can't drain reserves. Unions that want to attract more agentic capital can vote (through timelock) to increase their allocation.

**Total discount = FX efficiency + Headroom + Incentive**, capped at 350 BP (3.5%). The discount is quoted live in `previewMintPathB(vault, usdtIn)` so agents can check before committing.

### 5.4 Anti-Arbitrage Vesting

Without vesting, a bot could:

1. Mint 100K nSR via Path B at 2% discount
2. Immediately dump on Path A at NAV
3. Extract 2% as pure MEV with zero capital commitment

The 48-hour vesting makes Path B genuinely about capital commitment. You can exit via Path A at any time, but the LSTs you just minted via Path B are locked for 48h. Markets fluctuate in 48h — the "discount" isn't a guaranteed profit, it's compensation for time preference plus genuine exposure to pool economics.

Vesting window is configurable per-vault (behind timelock). High-stability pools (post-harvest) might set shorter vesting (24h). Lower-stability pools (ground-up cropspecific) might set longer (72h).

### 5.5 Liquidity Provision for the Secondary AMM

Path A only functions as a secondary market if the AMM pool has depth. Three liquidity sources:

**Protocol-owned liquidity.** Nila seeds each pool with an initial LP position using treasury USDT and freshly-minted nSR/nJR. The LP position earns swap fees but isn't speculatively motivated — it's market-making infrastructure. Over time, as third-party LPs join, Nila can withdraw some of this.

**LP rewards (initial phase only).** First 6 months after pool launch, LP deposits to Path A earn a portion of the union's treasury fees. This bootstraps third-party liquidity. Rewards taper off as pool depth grows organically.

**Market maker contracts.** A specialized MM agent (or multiple competing agents) can be incentivized through volume rebates to make tight markets. This is how most DeFi LST markets achieve deep liquidity — agent-run MMs with continuous quote streaming.

### 5.6 What Agents See

For an agentic allocator, Phase 5 transforms the Nila experience. Before Phase 5, an agent had one option: deposit into vaults, wait for yield, unbond to exit. After Phase 5, the same agent has:

- **Instant entry, any size:** Path A swap.
- **Optimized entry, committed capital:** Path B mint with discount.
- **Instant exit:** Path A swap out.
- **Continuous price discovery:** secondary market quotes nSR/nJR against NAV every block.
- **Arbitrage opportunities:** If market price diverges from NAV, specialized agents arbitrage the gap, keeping the system honest.

This is approximately the experience of investing in a Yearn vault or a Morpho vault — but backed by agricultural loans with mechanical senior security and oracle-attested real-world activity. That's the positioning the market has never seen.

### 5.7 Risks Specific to Phase 5

**Thin secondary market in early days.** Until liquidity provision gets going, Path A spreads will be wide. Agents transacting small amounts see 2–5% slippage, which is worse than just minting via Path B. Mitigation: Nila-owned liquidity floor, MM partnerships, LP incentive program.

**Discount formula exploits.** Any parameterized discount is a potential attack vector. If the formula can be manipulated by temporarily affecting headroom (e.g., flash-loan-driven junior deposits), arbitrageurs extract value. Mitigation: time-weighted averages for headroom calculation, strict caps on max discount, vesting prevents most MEV extraction.

**Oracle dependence.** The FX efficiency discount depends on reliable `fxPoolAddr` pricing. If the FX oracle is stale or manipulated, Path B quotes could be off. Mitigation: staleness checks, oracle dispute mechanism, fallback to spot price with zero FX discount.

**Regulatory consideration.** A discount on a token mint could be characterized as a promotional offering in some jurisdictions. Get legal review before mainnet launch — the "discount" framing may need to become "efficiency-based pricing" for compliance.

### Phase 5 Effort Summary

| Deliverable | Effort | Core Impact |
|-------------|--------|-------------|
| NilaLSTMarket (AMM + Path B + vesting) | 10 days | 0 bytes |
| Discount formula + headroom calculation | 4 days | 0 bytes |
| Protocol-owned liquidity seeding scripts | 3 days | 0 bytes |
| LP rewards program (time-limited incentive) | 3 days | 0 bytes |
| MM partnership integration (if used) | 5 days | 0 bytes |
| Frontend integration for Path A/B UI | 5 days | — |
| Tests + audit prep | 10 days | — |
| **Total** | **~40 days** | **0 bytes** |

---

## Phase 6: Land NFT Productivity Market (Weeks 22–30)

**Objective:** Transform `NilaLandTitle` NFTs from static proof-of-ownership tokens into **productive financial assets** with three decoupled income streams: collateral yield (when backing loans), data access fees (from proprietary remote sensing data), and appraisal appreciation. Enable fractional ownership with farmer-protective safeguards. Integrate with the LST market so fractional land shares trade alongside LSTs in the same venue.

### 6.1 Economic Model — Three Income Streams

Each land NFT accumulates value from three independent sources:

| Stream | Source | Triggered By | Contract |
|--------|--------|--------------|----------|
| Collateral yield | Portion of loan interest attributable to collateral layer | Land backs a loan, borrower repays | Core hook in `repayLoan` |
| Data access fees | Agents paying to view 8-year remote sensing history | On-chain purchase of view or subscription | `NilaLandDataMarket` |
| Appraisal appreciation | Market price discovery on fractional shares | Secondary market trades | Phase 5 LST Market AMM |

The combination is novel. Collateral yield ties to loan activity. Data access fees flow continuously regardless of loan state (agents evaluate parcels whether or not they're currently backing loans). Appreciation reflects aggregate market sentiment. Three decoupled streams smooth cash flow for holders and create a genuinely new asset class.

### 6.2 LandProvenance Registry

On-chain history of every meaningful event for each land NFT. Updated via hooks from Core (loan lifecycle) and from the data market (revenue accrual).

```solidity
contract NilaLandProvenance {
    struct LandHistory {
        // Loan history
        uint64  loansSecured;           // count of loans where this land was collateral
        uint64  loansRepaidFull;
        uint64  loansDefaulted;
        uint128 cumulativePrincipalSecured;
        uint128 cumulativeInterestPaid;  // that flowed from loans backed by this land
        uint128 cumulativeLossFromDefaults;
        bytes32 currentActiveLoanId;     // 0 if free
        
        // Data market history
        uint64  dataViewCount;
        uint64  subscriptionCount;
        uint128 cumulativeDataRevenue;
        
        // Appraisal history (latest snapshot)
        uint128 currentAppraisedValue;
        uint40  lastAppraisalTs;
        address lastAppraiser;
        
        // Crop history
        bytes32 dominantCropType;
        uint16  seasonsUsed;
    }
    mapping(uint256 => LandHistory) public history; // tokenId → history
    
    // Called by Core on repayLoan when loan was land-collateralized
    function recordLoanRepayment(uint256 tokenId, bytes32 loanId, uint256 principal, uint256 interest) external onlyCore;
    
    // Called by Core on markDefault
    function recordLoanDefault(uint256 tokenId, bytes32 loanId, uint256 lossAmount) external onlyCore;
    
    // Called by NilaLandDataMarket on each view/subscription purchase
    function recordDataRevenue(uint256 tokenId, uint256 amount) external onlyDataMarket;
    
    // Called by a registered appraiser (off-chain signed attestation verified on-chain)
    function recordAppraisal(uint256 tokenId, uint128 newValue, bytes calldata signature) external;
    
    // Agent-facing view: everything an evaluator needs
    function getLandValueMetrics(uint256 tokenId) external view returns (
        uint256 annualizedCollateralYield,  // projected from last 12 months
        uint256 annualizedDataRevenue,      // projected from last 12 months
        uint16  defaultRateBP,              // defaulted / secured
        uint128 currentAppraisedValue,
        uint16  dataQualityScoreBP          // 10000 = perfect, slashed on falsification
    );
}
```

**Why on-chain, not indexer:** For fractional share pricing and agent decisions, the data must be trustlessly verifiable. An indexer can lie; an on-chain registry updated via Core hooks cannot.

**Core bytecode impact: ~100 bytes** — one hook call in `repayLoan` and one in `markDefault` when the loan has a committed `landTitleId`. Guard with `if (loan.landTitleId != 0)` so non-land-collateralized loans skip it.

### 6.3 NilaLandFractionalizer — With Farmer Protections

The fractionalizer locks the NFT and mints ERC-20 economic-rights shares. Critical design choice: **economic rights are transferable, control rights are not**.

```solidity
contract NilaLandFractionalizer {
    IERC721 public immutable landTitle;
    ILandFarmerIdentity public immutable farmerIdentity;  // soulbound ID contract
    
    struct FractionalVault {
        uint256 tokenId;
        address farmer;               // original owner, retains control rights
        uint256 totalShares;          // e.g., 10000
        uint256 farmerShares;         // must stay ≥ 5100 (51% floor)
        uint256 buybackPriceFloor;    // minimum buyback price per share
        bool    liquidated;           // true if loan default forced liquidation
    }
    mapping(address => FractionalVault) public vaults; // vault address → info
    
    uint16 public constant MIN_FARMER_SHARE_BP = 5100;  // 51% floor, immutable
    
    function fractionalize(uint256 tokenId, uint256 totalShares, string calldata name, string calldata symbol)
        external returns (address vault)
    {
        require(landTitle.ownerOf(tokenId) == msg.sender, "NotOwner");
        require(farmerIdentity.isVerified(msg.sender), "NotVerifiedFarmer");
        
        // Deploy minimal proxy ERC-20 vault
        vault = _deployShareVault(name, symbol, totalShares);
        landTitle.transferFrom(msg.sender, vault, tokenId);
        
        vaults[vault] = FractionalVault({
            tokenId: tokenId,
            farmer: msg.sender,
            totalShares: totalShares,
            farmerShares: totalShares,       // starts at 100%, can go down to 51%
            buybackPriceFloor: 0,
            liquidated: false
        });
        
        // Mint 100% of shares to farmer; they sell portions via LST Market
        IERC20(vault).transfer(msg.sender, totalShares);
    }
    
    // Called by LST Market (or any DEX) to track farmer share balance
    function onShareTransfer(address vault, address from, address to, uint256 amount) external onlyShareVault {
        if (from == vaults[vault].farmer) {
            vaults[vault].farmerShares -= amount;
            uint256 minShares = (vaults[vault].totalShares * MIN_FARMER_SHARE_BP) / 10000;
            require(vaults[vault].farmerShares >= minShares, "Below51Floor");
        }
        if (to == vaults[vault].farmer) {
            vaults[vault].farmerShares += amount;
        }
    }
    
    // Farmer-initiated buyback at fair market price from LST Market
    function buybackShares(address vault, uint256 amount) external;
    
    // Distribute incoming collateral yield and data revenue proportionally
    function distributeIncome(address vault, uint256 amount) external;
}
```

**The 51% floor is structural.** Any share transfer that would drop the farmer below 51% reverts at the token level. This prevents land-grabs through gradual accumulation — a hostile party cannot buy enough shares to take control because the farmer's share sales are capped at 49%.

**Voting rights are soulbound.** Decisions like "consent to use as loan collateral," "choose crop for next season," and "set data access price" are controlled by the farmer's identity token, which is non-transferable. Holding shares gets you economic exposure, not operational control.

**Buyback rights are perpetual.** The farmer can repurchase shares at any time from the LST Market at prevailing price, re-consolidating economic ownership as their situation improves. Accumulated income from collateral yield and data revenue flows partially to the farmer even while fractionalized, giving them capital to eventually buy back.

**Default protection is proportional.** If the land is liquidated due to loan default, fractional share holders face pro-rata loss. The farmer loses too — they don't walk away intact while holders take the hit. This keeps incentives aligned.

### 6.4 Collateral Yield Routing

When a loan backed by land NFT #X is repaid, a portion of the interest must flow to the land's productivity address (the fractionalizer vault if fractionalized, else the NFT owner directly). This is a new economic flow.

**Change in Core's `repayLoan`:**

```solidity
// After existing interest distribution to tranches, add:
if (loan.landTitleId != 0) {
    uint256 collateralYield = (interestPaid * COLLATERAL_YIELD_BP) / 10000; // e.g., 500 BP = 5%
    // Route to fractionalizer if fractionalized, else NFT owner
    address recipient = landFractionalizer.vaultForToken(loan.landTitleId);
    if (recipient == address(0)) {
        recipient = landTitle.ownerOf(loan.landTitleId);
    }
    IERC20(nin).transfer(recipient, collateralYield);
    // Notify fractionalizer to trigger distribution
    if (recipient != landTitle.ownerOf(loan.landTitleId)) {
        landFractionalizer.distributeIncome(recipient, collateralYield);
    }
    landProvenance.recordLoanRepayment(loan.landTitleId, loanId, principalPaid, collateralYield);
}
```

The `COLLATERAL_YIELD_BP` parameter (suggested 300–500 BP, i.e., 3–5% of interest) is set per union via timelock. It reduces the net yield flowing to LST holders by a small amount (they get 95–97% of interest instead of 100%), in exchange for improved mechanical coverage on their senior tranche (because land-collateralized loans are structurally safer). Net economic effect on LST holders is positive: slightly lower gross yield, materially lower default risk.

**Core bytecode impact: ~150 bytes** for the conditional routing and fractionalizer notification.

### 6.5 NilaLandDataMarket — Paywalled Remote Sensing

Agents pay to access the 8-year remote sensing JSON. Revenue flows to NFT holders (or fractional share holders). Pricing set by Nila, with free tier for basic metadata.

```solidity
contract NilaLandDataMarket {
    IERC721 public immutable landTitle;
    ILandFractionalizer public immutable fractionalizer;
    ILandProvenance public immutable provenance;
    IERC20 public immutable paymentToken;  // USDT or NIN
    
    struct DataConfig {
        bytes32 ipfsHash;              // encrypted JSON reference
        bytes32 freeMetadataHash;      // unencrypted public summary
        uint256 pricePerView;          // Nila-set, in payment token
        uint256 subscriptionPricePerMonth;
        uint40  dataQualityScoreBP;    // 10000 initial, slashable (Phase 6.5)
        bool    active;
    }
    mapping(uint256 => DataConfig) public configs;
    
    // Nila governance (behind timelock) sets prices
    uint256 public defaultPricePerView;           // e.g., 10 USDT
    uint256 public defaultSubscriptionMonthly;    // e.g., 100 USDT/month for unlimited
    
    // Revenue split (immutable constants)
    uint32 public constant PAYOUT_HOLDER_BP     = 7500; // 75% to NFT/fractional holders
    uint32 public constant PAYOUT_TREASURY_BP   = 1500; // 15% to Nila treasury
    uint32 public constant PAYOUT_ORIGINATOR_BP = 1000; // 10% to data origination service
    
    mapping(uint256 => address) public originators;
    mapping(uint256 => mapping(address => uint40)) public subscriptions;
    
    function buyView(uint256 tokenId) external returns (bytes32 accessHandle) {
        DataConfig memory c = configs[tokenId];
        require(c.active, "Inactive");
        uint256 price = c.pricePerView > 0 ? c.pricePerView : defaultPricePerView;
        
        paymentToken.transferFrom(msg.sender, address(this), price);
        _distribute(tokenId, price);
        
        // Access handle expires in 1 hour — delivered to Lit Protocol or backend for decryption
        accessHandle = keccak256(abi.encodePacked(tokenId, msg.sender, block.timestamp, blockhash(block.number - 1)));
        emit AccessGranted(tokenId, msg.sender, accessHandle, uint40(block.timestamp + 1 hours));
    }
    
    function buySubscription(uint256 tokenId, uint32 months) external {
        uint256 price = (configs[tokenId].subscriptionPricePerMonth > 0 
            ? configs[tokenId].subscriptionPricePerMonth 
            : defaultSubscriptionMonthly) * months;
        paymentToken.transferFrom(msg.sender, address(this), price);
        _distribute(tokenId, price);
        subscriptions[tokenId][msg.sender] = uint40(block.timestamp + months * 30 days);
        emit SubscriptionPurchased(tokenId, msg.sender, months, price);
    }
    
    function hasAccess(uint256 tokenId, address viewer) external view returns (bool) {
        return subscriptions[tokenId][viewer] > block.timestamp;
    }
    
    // --- Free tier ---
    function getFreeMetadata(uint256 tokenId) external view returns (bytes32 freeMetadataHash) {
        return configs[tokenId].freeMetadataHash;
    }
    
    function _distribute(uint256 tokenId, uint256 amount) internal {
        uint256 toHolder     = (amount * PAYOUT_HOLDER_BP) / 10000;
        uint256 toTreasury   = (amount * PAYOUT_TREASURY_BP) / 10000;
        uint256 toOriginator = (amount * PAYOUT_ORIGINATOR_BP) / 10000;
        
        // Holder payout — to fractionalizer if fractionalized, else to NFT owner
        address fractionalVault = fractionalizer.vaultForToken(tokenId);
        if (fractionalVault != address(0)) {
            paymentToken.transfer(fractionalVault, toHolder);
            fractionalizer.distributeIncome(fractionalVault, toHolder);
        } else {
            paymentToken.transfer(landTitle.ownerOf(tokenId), toHolder);
        }
        
        paymentToken.transfer(treasury, toTreasury);
        paymentToken.transfer(originators[tokenId], toOriginator);
        
        provenance.recordDataRevenue(tokenId, amount);
    }
}
```

#### Nila-Set Pricing

Pricing is not farmer-configurable. Nila sets `defaultPricePerView` and `defaultSubscriptionMonthly` via timelock governance, with optional per-NFT overrides (also timelock-gated) for exceptional cases. This ensures consistency across the data catalog — agents aren't navigating a chaotic pricing landscape, and low-value data can't be mis-priced high by uninformed farmers.

Initial suggested pricing ladder:

- Single view: $10–15 in USDT per parcel per access
- Monthly subscription (unlimited views of one parcel): $80–120
- Basket subscription (all parcels in a union): $500–800/month
- API-key bulk access (institutional): negotiated, minimum $2000/month

These numbers are calibrated against commercial agricultural analytics services (Orbital Insight, Descartes Labs, etc.) at the low end, reflecting that Nila's data is already tied to loan performance context that those services don't provide.

#### Free Tier — Public Metadata

Every NFT has a `freeMetadataHash` pointing to an unencrypted IPFS JSON with:

```json
{
  "cropType": "sugarcane",
  "regionCode": "TN-MT-001",
  "yearsOfData": 8,
  "observationFrequency": "weekly",
  "dataQualityScore": 0.92,
  "lastUpdateTimestamp": 1713225600,
  "yieldRangeLast3Years": { "min": 65, "max": 78, "unit": "t/ha" },
  "hasRainfallSeries": true,
  "hasNDVISeries": true,
  "hasSoilMoistureSeries": true,
  "sampleDataPreviewHash": "Qm..."
}
```

This serves as an **open catalog**. Agents can browse every NFT's basic profile for free, compare parcels, and decide which ones warrant paying for full access. Discovery is frictionless; monetization happens at the point of deep evaluation.

The free tier also serves a trust function: agents can verify that claims about data quality and coverage are consistent with what they see in the paid data, reducing "bait and switch" concerns.

#### Encryption Architecture

**Phase 6 launch (Approach 1):** Symmetric encryption with Nila backend as key custodian. JSON encrypted with AES-256, IPFS hash stored on-chain, AES key held by Nila. On `AccessGranted` event, backend delivers the key via signed message to the buyer's address. Simple, ships fast, trust Nila's key custody.

**Phase 6.5 upgrade (Approach 2):** Migrate to Lit Protocol threshold encryption. Access control conditions (has paid, within subscription window) encoded on-chain; Lit's decentralized node network releases decryption shares automatically. Removes Nila key-custody trust requirement.

The upgrade path is clean — the IPFS hash and metadata structure don't change, only the key delivery mechanism. Existing access tokens continue to work during migration.

#### Watermarking and Piracy Mitigation

Each decrypted response is uniquely fingerprinted through benign variations in the JSON structure — timestamp precision, field ordering, whitespace patterns, ignorable metadata fields. A Nila service records which buyer received which fingerprint. If leaked data surfaces publicly, Nila traces back to the source buyer, blacklists them from future access, records the violation on-chain (affecting their reputation in any ERC-8004 agent registry that checks it).

This doesn't prevent piracy, but it makes it costly enough that agents with ongoing protocol access won't risk sharing decrypted payloads.

### 6.6 Data Quality Attestation (Later Stage)

Once the data market is operational, add accountability for data quality. A `dataQualityScoreBP` on each NFT starts at 10,000 (perfect) and can be slashed based on:

- **Post-harvest yield reconciliation.** After harvest, the actual yield (attested by an independent verifier) is compared to what the remote sensing data predicted. Large deviations slash the score for the relevant season's data.
- **External audit attestations.** Registered auditors can submit signed attestations challenging specific data points. If a challenge is upheld by governance review (or a dispute resolution process), the score is slashed.
- **Data freshness decay.** If the latest data is older than expected observation frequency (e.g., weekly data that hasn't updated in 3 weeks), the score passively decays until fresh data arrives.

Slashed scores reduce the data's perceived value in the market — agents pay less, revenue drops, NFT holders lose income. This creates accountability for data providers to maintain quality.

**Timing:** This is a Phase 6.5 or Phase 7 addition, not needed at initial launch. The baseline system works with constant `dataQualityScoreBP = 10000`. Quality slashing is layered on once the market is mature enough to sustain auditor economics.

### 6.7 Integration with Phase 5 LST Market

Fractional land shares (from the fractionalizer's ERC-20 tokens) become tradeable on the same LST Market AMM deployed in Phase 5. The `NilaLSTMarket` contract supports any ERC-20 that represents productive on-chain value — LSTs, fractional land shares, future derived tokens. This creates a unified trading venue for all Nila productivity tokens.

Specifically:
- Each fractionalized land NFT gets its own liquidity pool paired against NIN (similar to LST pools).
- Agents can swap between LSTs and land shares directly, switching between diversified and concentrated exposure.
- Protocol-owned liquidity seeds initial pools for major lands (e.g., top 20 highest-performing by collateral yield).

No changes to the `NilaLSTMarket` contract are needed — it already accepts arbitrary ERC-20s. The fractionalizer just registers each newly fractionalized NFT as a new pool.

### Phase 6 Effort Summary

| Deliverable | Effort | Core Impact |
|-------------|--------|-------------|
| LandProvenance registry + Core hooks in repayLoan/markDefault | 5 days | ~100 bytes |
| LandFractionalizer with 51% floor + soulbound voting | 8 days | 0 bytes |
| Collateral yield routing in Core's repayLoan | 3 days | ~150 bytes |
| NilaLandDataMarket (pay-per-view + subscription + free tier) | 6 days | 0 bytes |
| Encryption backend (Approach 1 — Nila-held AES key) | 5 days | 0 bytes |
| Free metadata schema + IPFS tooling | 3 days | 0 bytes |
| LST Market pool integration for fractional shares | 3 days | 0 bytes |
| Watermarking + piracy mitigation | 4 days | 0 bytes |
| Farmer identity contract (soulbound) | 3 days | 0 bytes |
| Legal review for fractional rights + data licensing | 5 days | — |
| Tests + audit prep | 7 days | — |
| **Total** | **~52 days** | **~250 bytes** |

Updated total Core bytecode across all phases: **~1,110–1,190 bytes**. Still within margin — GenericFundCore can absorb just over a kilobyte of additions total.

**Phase 6.5 (later):** Migrate encryption to Lit Protocol (~7 days). Add data quality slashing (~10 days). These can happen in parallel or after Phase 6 operates in production.

---

## Phase Summary

| Phase | Weeks | Core Bytecode | Key Deliverable |
|-------|-------|---------------|-----------------|
| 1 | 1–4 | ~50–130 bytes | **Liquid ERC-4626 vaults** (nSR/nJR tokens), factory, timelock, safety floor |
| 2 | 4–6 | ~230 bytes | Pool health attestation, loan lifecycle hooks |
| 3 | 6–12 | ~580 bytes | **Mechanical security stack**: coverage invariant, treasury auto-tap, food token Dutch auction, time-tranched escalation, land escrow, oracle registry, crop price oracle |
| 4 | 12–16 | 0 bytes | DelegationManager, stablecoin router, subgraph |
| 5 | 16–22 | 0 bytes | **LST Market**: secondary AMM + discounted Path B primary mint, vesting, protocol-owned liquidity |
| 6 | 22–30 | ~250 bytes | **Land NFT Productivity Market**: provenance registry, fractionalizer with farmer protections, collateral yield routing, paywalled remote sensing data, free metadata tier, LST market integration |
| **Total** | | **~1,110–1,190 bytes** | |

---

## How the Bucket Ratio Caps Agentic Capital

This is the central safety mechanism and it already exists. A worked example:

```
Union: Thanjavur Rice Farmers Cooperative
bucketThreshold: 0.1e18 (10%)
Junior equity (member deposits): 50,000 NILA
Current senior deposits: 200,000 NILA

Max total pool = 50,000 / 0.10 = 500,000 NILA
Max senior = 500,000 - 50,000 - 200,000 = 250,000 NILA remaining

→ Agent calls NilaSeniorVault.maxDeposit() → returns 250,000
→ Agent calls NilaSeniorVault.deposit(300,000) → REVERTS
→ Agent calls NilaSeniorVault.deposit(250,000) → succeeds, receives 250,000 nSR

Members deposit another 50,000 to junior (now 100,000):
Max total pool = 100,000 / 0.10 = 1,000,000 NILA
Max senior = 1,000,000 - 100,000 - 450,000 = 450,000 NILA

→ Agent cap grew because members added more skin-in-the-game
→ Agent can now deposit another 450,000 via the vault
```

Unions control the threshold via `setBucketThresholds` (behind timelock after Phase 1). Conservative union: 0.2 (5× leverage). Aggressive union with strong repayment history: 0.05 (20×).

**No new mechanism needed.** The ERC-4626 vault reads and enforces the existing constraint.

---

## The nSR Token Economy

Once liquid vault tokens exist, secondary dynamics emerge:

**DEX Liquidity:** nSR/NILA or nSR/USDC pairs on QuickSwap/Uniswap allow agents to enter and exit positions without waiting for the unbond period. The market price reflects the pool's perceived quality — a well-performing union's nSR trades at or above NAV; a risky one trades at a discount.

**Collateral Composability:** nSR (backed by the senior tranche, which is itself backed by agricultural loan repayments) could be accepted as collateral on Polygon lending protocols. This creates capital efficiency — an agent deposits into Nila, gets nSR, borrows against nSR, and deploys the borrowed capital elsewhere.

**Price Discovery:** If nSR trades below NAV, it signals the market thinks the pool is riskier than its on-chain metrics suggest (or liquidity is thin). If it trades above NAV, demand exceeds the bucket ratio cap. Both are useful signals for unions and for Nila governance.

**Portfolio Aggregation:** An agent holding nSR across multiple unions can rebalance by trading on the secondary market without touching the vault contracts at all. This is only possible with liquid tokens.

---

## Strategic Positioning: Non-Mechanical RWA Yield

A critical honest framing that shapes everything in this roadmap: **Nila is not competing with Morpho or Aave for generalist agentic capital.** Those protocols offer crypto-collateralized, liquidation-driven yield where the security model is mechanical. An agent scanning for yield across Morpho's $11B in vaults doesn't need to verify loan security — Morpho's liquidation engine guarantees it or the position gets unwound. That's a fundamentally different product than what Nila offers.

### What we actually are

Nila is a **Real-World Asset (RWA) protocol with non-mechanical security**. Our loans are secured by:

- Agricultural economic activity (harvest revenue generation)
- Social capital within cooperative unions
- Union-level first-loss tranches (on-chain, mechanical)
- Optional land-title and food-token collateral (on-chain once wired in)
- Oracle-attested cultivation and cropping data (off-chain, verifiable via commitments)

The "non-mechanical" part is the point: our yield doesn't come from automated liquidations in a volatile crypto market. It comes from sugarcane harvests in Tamil Nadu, paid back at the end of the crop cycle. That's a genuinely different yield source — uncorrelated with DeFi market risk — and it requires a different evaluation framework.

### Why this matters for agent targeting

The implication for Phase 1–4 execution: **we are not trying to win the broad "ERC-4626 vault scanner" market.** That market belongs to Morpho and similar protocols. Chasing it would be a mistake — a generalist yield optimizer scanning for the highest Polygon APY will always prefer a mechanically liquidated lending vault to an agriculturally backed one, regardless of our indicators.

We are targeting three specific agent archetypes:

1. **RWA-focused allocator agents.** Purpose-built for real-world asset yield (think Centrifuge-integrating agents, Maple Finance analogues, Goldfinch-successor allocators). This market is small today but has almost no well-built protocols to choose from. Centrifuge sits at ~$450M TVL — the whole category is thin. If we execute the verification layer properly, we become a credible option in a category with few credible options, rather than a marginal option in a category (generalist DeFi yield) with dozens of dominant players.

2. **Impact-oriented DAO treasuries.** DAOs with explicit impact or ESG mandates (climate-focused DAOs, cooperative finance DAOs, regenerative finance treasuries) are operated increasingly by autonomous agents with curation criteria beyond raw APY. Our agricultural yield and farmer outcomes create a narrative and a measurable impact that matters to this audience — something Morpho cannot offer.

3. **Specialty institutional agents.** Family offices, impact investors, and ESG-mandated funds increasingly use autonomous systems to allocate the non-core portion of their treasury. They value uncorrelated yield sources specifically *because* they reduce portfolio-level crypto market risk. A 8–12% yield from Indian agricultural lending with audited first-loss protection is an asset allocation most institutional portfolios don't have access to elsewhere.

### What this means for the roadmap

Every phase is calibrated to this target audience, not to generalist yield agents:

- **Phase 1 (vaults):** ERC-4626 for standardization, but we don't expect aggregator auto-discovery to drive material flows. It's for agent-readable composability, not generalist allocation.
- **Phase 2 (health metrics):** Default rates, loss severity, real yield quality. These matter to RWA and impact agents who need to underwrite the loan book, not to generalist agents who trust the liquidation engine.
- **Phase 3 (attestation layer):** The core differentiator. A generalist DeFi protocol doesn't need land title escrow or oracle reputation scoring because it doesn't have off-chain economic security to verify. We do.
- **Phase 4 (infrastructure):** Delegation and stablecoin paths matter for institutional agents with specific access patterns, not for on-chain yield scanners.

### Go-to-market sequence: lead with post-harvest (Strategy 7)

Not all of Nila's fund types are equally mechanical. The `postharvest` fund type is structurally closest to DeFi mechanical lending, because post-harvest loans are backed by **grain that already exists** — stored in warehouses, gradable, sellable. This is exactly how commodity trade finance has always worked globally.

Post-harvest loans map cleanly onto DeFi primitives:
- Warehouse receipts tokenized as food tokens (ERC-1155, Strategy 3)
- Storage facility acts as oracle-attested custodian
- Loan-to-value is a clean ratio: loan amount / current grain value
- Liquidation is mechanical via Dutch auction (Strategy 3)
- Crop cycle is short (3 months max), so exit liquidity is near
- No cultivation risk — the harvest already happened

An agent looking at a post-harvest vault sees something almost indistinguishable from Aave or Morpho lending, except the collateral is grain instead of ETH. LTV ratio, liquidation threshold, verifiable collateral — all standard DeFi concepts, just applied to commodity-backed lending.

**The sequencing implication:** When the mechanical security stack (Phase 3) goes live, deploy **post-harvest vaults first**. Market them to agentic capital as mechanically-secured commodity-backed lending. Let ground-up, cropspecific, and shared-cropping vaults follow later — they remain the primary vehicles for PWA users and impact-oriented capital, but aren't the right entry point for generalist agents.

This lets Nila offer two distinct risk/return profiles to the market:

| Vault Type | Mechanical Security | Target Depositor | Expected Yield |
|------------|--------------------|-----------------|----------------|
| Post-harvest | High (food token escrow, 3mo cycle) | Generalist + RWA agents | Lower, stable |
| Ground-up / Cropspecific | Medium (milestone escalation, 8mo cycle) | RWA + impact agents | Higher, seasonal |
| Machinery | Low (24mo equipment collateral) | Impact capital only | Highest |

An agent portfolio can hold a weighted mix of these based on risk tolerance. The post-harvest vault becomes the "gateway" product — agents earn yield there first, observe the protocol work, then consider scaling up to longer-duration vaults.

### The realistic TVL trajectory

Based on comparable RWA protocols and the current thin state of agentic RWA capital: a successful Phase 1–4 execution might capture $2–10M in agentic TVL within 12 months of completion. That's not the $11B Morpho scale the Surf article describes — but it's also 10–50× more than Nila's current AUM, achieved from a capital source that doesn't require acquiring individual farmer-investors through the PWA.

The goal isn't to become the Morpho of RWA. The goal is to become the *first credible ERC-4626 vault with verifiable agricultural collateralization*, in a category where that combination doesn't currently exist. That's a defensible position worth building toward, rather than a losing race against crypto-collateral incumbents.

---

## Dependencies & Risks

### Upgrade safety
All Core/Viewer changes go through UUPS proxy upgrades. Run OpenZeppelin's `@openzeppelin/upgrades-core` storage layout checker against existing deployed bytecode before every upgrade. New state variables in Viewer (the `healthByPool` mapping) must append to storage layout — never insert between existing slots.

### Vault-Core interaction model
The vault calls `core.depositSenior(union, amount)` where `msg.sender` is the vault address. Core must accept the vault as a valid depositor. If `depositSenior` simply does a `transferFrom(msg.sender, ...)` with no additional auth checks, this works out of the box. If there are NFT or role requirements, the vault needs whitelisting (via the `roles` contract or a minimal Core change).

### Share price accuracy
The vault's `convertToShares` / `convertToAssets` calculations must precisely match Core's RAY math. Any rounding discrepancy creates arbitrage or loss. The vault should use the same `shares × index / RAY` formula used in `loadfund_helpers.ts`, reading index from `getSeniorMarket().index`.

### Audit requirement
The ERC-4626 vault contracts and factory should be audited before mainnet. They handle token transfers and are the primary attack surface. Phase 2 additions (view functions, hook additions) can go live after internal review.

### Backward compatibility
Existing PWA users continue calling `depositJunior`/`depositSenior` directly on Core. Direct depositors and vault depositors coexist — both paths write to the same underlying state. The vault is just one more investor address in Core's mappings.

### Union governance preserved
Agents deposit permissionlessly (via vaults) into the senior tranche. Loan origination remains oracle-signed and union-governed (`drawLoanWithVoucher`). The bucket ratio ensures capital inflow can't outpace member equity. Unions are the credit underwriting layer; agents are the capital supply layer.

### The honest unknown
Whether agentic allocators will actively seek Polygon-based agricultural yield. The ERC-4626 interface makes discovery possible, the liquid token makes position management practical, but adoption depends on yield competitiveness, protocol maturity (tracked by Phase 2 health counters), and audit status.

---

## Success Metrics

- **Phase 1 complete:** nSR and nJR tokens minting on deposits. Vaults enforce bucket ratio caps. Tradeable on testnet DEX. Admin functions behind 48h timelock.
- **Phase 2 complete:** `getPoolHealth` returns live data for all active unions. At least 3 months of counter history accumulated.
- **Phase 3 complete:** First external agent deposit via DelegationManager. Subgraph live and queryable. TVL growth from non-PWA sources exceeds 10% of total AUM.

---

## Getting Started: Week 1

1. **Vault implementation:** Write `NilaSeniorVault` inheriting OpenZeppelin's `ERC4626`. Test deposit/redeem cycle against a mock Core on Hardhat.
2. **Auth check:** Read actual `depositSenior` / `depositJunior` source to determine if vault address needs whitelisting. This determines whether Core needs an upgrade in Phase 1.
3. **Viewer upgrade:** Write `effectiveMaxDeposit` in GenericFundViewer. Test against existing unions on Amoy fork.
4. **Clone factory:** Write `NilaVaultFactory` using `Clones.clone()`. Test vault deployment + registry.
5. **Timelock:** Deploy `TimelockController` on Amoy. Transfer ownership of Core + Viewer.

All vault contracts are standalone deployments. The only Core change in Phase 1 is the `MIN_SAFETY_BP` constant (~50 bytes). No new function selectors on Core.
