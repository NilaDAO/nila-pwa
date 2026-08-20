# Bug: `redeemFarmerNin` draws from the wrong USDT pool

**Date discovered:** 2026-06-13  
**Severity:** Blocking — LP cash-out requests fail once `fxTreasuryUsdt` is depleted  
**Contract:** `NilaFxPool` at `0xBaE307FE0A453955c649cD8f81e3DA572dF448eA` (Polygon mainnet)

---

## What is failing

Calling `redeemFarmerNin(farmer, ninAmount)` reverts with:

```
Error: execution reverted: "insufficient fx treasury"
```

This blocks the **LP-brings-cash** redemption flow (`handlePostRedeemRequest` in `CashOutForm.js`).

---

## Two distinct USDT pools in the contract

| Pool | Variable | What it is | Current balance |
|---|---|---|---|
| **FX hedging treasury** | `fxTreasuryUsdt` (global) | Small reserve accumulated to hedge FX rate risk — NOT the LP payout source | **$1.70** |
| **Union deposited USDT** | per-union accounting (via `depositUsdt`) | NIN-backed USDT deposited by the union to fund loan disbursements and LP payouts | **$2,647** |

These are two separate accounting buckets inside the same contract. The raw ERC-20 balance `USDT.balanceOf(FxPool)` = $2,647, which is the union pool. `fxTreasuryUsdt` is a distinct, much smaller counter.

---

## Root cause

`redeemFarmerNin` has a guard:

```solidity
require(fxTreasuryUsdt >= usdtOut, "insufficient fx treasury");
```

It then deducts `usdtOut` from `fxTreasuryUsdt` and locks it for the pending `RedeemOrder`.

**This is the wrong pool for the LP-brings-cash use case.**

When an LP brings physical cash to a farmer and expects USDT from the union's fund in return, the USDT should come from the **union's deposited USDT pool** (the NIN-backed reserves), not from `fxTreasuryUsdt`. The union's pool holds $2,647 and is more than sufficient.

---

## On-chain evidence

All 7 `RedeemOrder` entries are either DELIVERED or CANCELLED — nothing is stuck in an open state consuming USDT. The $1.70 remaining in `fxTreasuryUsdt` is genuine residue after it was exhausted by:

| Event type | Count | Total USDT drawn from `fxTreasuryUsdt` |
|---|---|---|
| `RedeemNin` (direct LP swaps) | 16 events | ~$2,007 |
| `redeemFarmerNin` (LP-brings-cash orders 0–5) | 6 orders | ~$1,951 |

Both flows hit the same `fxTreasuryUsdt` check. The pool was funded at deployment and has now been exhausted.

---

## What needs to change

### Contract fix (primary)

`redeemFarmerNin` must be changed to draw USDT from the **union's deposited USDT pool** rather than `fxTreasuryUsdt`.

Concretely, the guard should check that the union has sufficient available USDT (deposited minus already-promised in open orders), and the lock should debit the union's account, not the global FX treasury.

`fxTreasuryUsdt` should remain untouched by `redeemFarmerNin` — it exists for FX hedging, not LP payouts.

The direct `redeemNin` path (LP deposits USDT, receives NIN) can keep using `fxTreasuryUsdt` if that is the intended design — but this needs confirmation.

### PWA guard (secondary, after contract is fixed)

`CashOutForm.js` (`handlePostRedeemRequest`, line 383) calls `redeemFarmerNin` with no pre-flight check on available liquidity. Once the contract is fixed, add a preflight that reads:

```
systemHealth(fxPool, unionAddr, loanType) → usdtDeposited, usdtPromised
available = usdtDeposited - usdtPromised
```

and blocks the LP-request button if `available < usdtNeededForThisPayout`.

This gives the union leader a clear "insufficient union USDT" error in the UI before hitting the contract, rather than a raw revert.

---

## Workaround (until contract is redeployed)

There is no clean workaround from the PWA side. The contract check is hard-coded against `fxTreasuryUsdt`.

Calling `depositUsdt(unionAddr, amount)` — if it increments `fxTreasuryUsdt` as a side effect — could temporarily unblock redemptions, but this conflates the two pools further and is not recommended as a permanent approach.

The correct path is to redeploy the contract with the pool check fixed.
