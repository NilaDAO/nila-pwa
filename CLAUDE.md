# Project notes

## Known issue: "{LP} collects ₹{amount} cash" task fails to Accept for most leaders

**Status:** Workaround in place. Contract fix staged, not yet deployed.

A union's "filled CashOffer" task (task id `500+` in `useFilterTasks.js`, rendered
via the swipeable card whose Accept button calls `confirmCashOfferDelivered`)
currently only succeeds when the connected wallet's address is *literally* the
union's own on-chain address (`db.union.address`) — not just any of the union's
registered leaders.

Root cause: `NilaFxPool.confirmCashOfferDelivered` checks
`require(o.union == msg.sender && o.status == 1, "invalid")` — a hardcoded
address-equality check — instead of the `RolesRegistry.isLeader(o.union,
msg.sender)` lookup its sibling functions (`cancelCashOffer`,
`confirmCashDelivery`) already use to support multiple leaders per union.

**For "Mother Theresa Union"** (4 leaders): only **Rosalie**'s wallet equals
the union address on-chain, so only she can currently Accept this task. Any
other leader's session will get `execution reverted: "invalid"`. Until the
offer is confirmed, the pending fee/cash amount stays locked/unresolved in the
`FxPool` contract (not lost — just stuck at `status == 1` until someone with
the right wallet calls Accept, or the contract is upgraded).

**If a user reports this task failing to Accept:** have Rosalie accept it from
her session, rather than debugging further — it's not a per-offer bug, it will
fail identically for every offer and every non-Rosalie leader until the
contract is upgraded.

**Fix status:** already written in `ContractDev/contracts/NilaFxPool.sol`
(`confirmCashOfferDelivered`), swapping the address check for
`IRolesRegistry(rolesRegistry).isLeader(...)`. Verified against the test suite
with no regressions. `NilaFxPool` is a UUPS upgradeable proxy, so this doesn't
require a full redeploy — but the fix has **not been deployed** (no upgrade
transaction sent). Until it is, the Rosalie-only workaround above still
applies to every union, not just this one.
