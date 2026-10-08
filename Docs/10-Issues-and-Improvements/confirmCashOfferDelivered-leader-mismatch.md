# Bug: `confirmCashOfferDelivered` only works for the union's exact on-chain address, not any registered leader

**Date discovered:** unknown (documented in project CLAUDE.md prior to this tracker existing)
**Severity:** Blocking for non-owner leaders — workaround in place
**Contract:** `NilaFxPool.confirmCashOfferDelivered` (Polygon)
**Repo:** nila-pwa (contract lives in `ContractDev/contracts/NilaFxPool.sol`)

---

## What is failing

A union's "filled CashOffer" task (task id `500+` in `useFilterTasks.js`,
rendered via the swipeable card whose Accept button calls
`confirmCashOfferDelivered`) only succeeds when the connected wallet's
address is *literally* the union's own on-chain address (`db.union.address`)
— not just any of the union's registered leaders. Any other leader's session
gets `execution reverted: "invalid"`.

## Root cause

```solidity
require(o.union == msg.sender && o.status == 1, "invalid");
```

A hardcoded address-equality check, instead of the `RolesRegistry.isLeader(
o.union, msg.sender)` lookup its sibling functions (`cancelCashOffer`,
`confirmCashDelivery`) already use to support multiple leaders per union.

## Impact

For **Mother Theresa Union** (4 leaders): only **Rosalie**'s wallet equals
the union address on-chain, so only she can currently Accept this task. Until
confirmed, the pending fee/cash amount stays locked/unresolved in the
`FxPool` contract at `status == 1` (not lost — just stuck).

This is not a per-offer bug — it fails identically for every offer and every
non-Rosalie leader, for every union, until the contract is upgraded.

## Workaround

Have Rosalie (or whichever leader's wallet matches the union's on-chain
address) accept the task from her session. Don't debug further per-report —
same root cause every time.

## Fix status

Already written in `ContractDev/contracts/NilaFxPool.sol`
(`confirmCashOfferDelivered`), swapping the address check for
`IRolesRegistry(rolesRegistry).isLeader(...)`. Verified against the test
suite with no regressions. `NilaFxPool` is a UUPS upgradeable proxy, so this
doesn't require a full redeploy — but **no upgrade transaction has been
sent**. Until it is, the Rosalie-only workaround applies to every union.

## What needs to change

Send the UUPS upgrade transaction for `NilaFxPool` with the already-written
fix. No PWA-side change needed — the bug is entirely on-chain.
