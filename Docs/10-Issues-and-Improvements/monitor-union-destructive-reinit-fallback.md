# Bug: `monitor-union` can destructively re-init a property on transient record-recovery failure

**Date discovered:** 2026-08-20
**Severity:** Critical — live in production, unpatched
**Repo:** NilaSensingAgent (`beats/scene_monitor.py`, ~line 640)
**Related:** [admin-rerun-all-destructive-reinit.md](admin-rerun-all-destructive-reinit.md) (same incident category, different root cause)

---

## Status: OPEN — do not push further Docker Hub images for this repo until fixed

## What is failing

`/admin/monitor-union/{union_addr}` is the endpoint recommended as the safe
replacement for the removed `/admin/rerun-all` (see the resolved issue
above) — its init-vs-update decision correctly reads the durable
`loans_active.ipfs_pinned_name` DB column rather than the unsafe
`record_io.load()`.

But once it correctly routes into `update_property`, if *that* call's
record recovery transiently returns `None` (root cause not yet found,
possibly IPFS/RPC flakiness), this fallback in `beats/scene_monitor.py`
treats "recovery failed right now" as "record doesn't exist":

```python
if report is None:
    print(f"...falling back to init_property")
    _run_init_and_writeback("record.json missing despite ipfs_pinned_name set")
```

...and destructively rebuilds the property from an 8-year satellite
lookback, overwriting the existing on-chain commitment.

## Impact

Happened twice to land 11 on 2026-08-20 — once via the (now-removed)
rerun-all bug, and again via this fallback hours later, tx
`0xa69d9c64...` at 13:29:12 UTC, after the first incident was already
believed fixed. Any future `monitor-union` call — manual or the scheduled
daily beat — can hit this on any property whenever record-recovery has a
transient failure.

## Why it keeps recurring

Two separate `load()` implementations exist for property records:
`compute/fencing/record.py`'s (agent-compute, full local→Redis→chain+IPFS
recovery, already fixed once this session) and `services/record_io.py`'s
(node container, deliberately lightweight, local+Redis only — fine in
isolation). Anything that treats "local read came back empty" as "record
doesn't exist" inherits this gap.

## What needs to change

Proposed fix: skip-and-retry next cycle instead of rebuild — mirroring how
the neighboring `ipfs_pinned_name`-missing branch already treats a Pinata
outage as "not done yet," not "doesn't exist."

Before implementing that fix, first root-cause why `update_property`
returned `None` for land 11 despite the three `_recover_from_ipfs()` fixes
already being live (v0.4.14) — if `None` can still happen under normal (not
just that day's unusual) conditions, skip-and-retry alone could leave
records perpetually stale.

Also proposed, not started: a local test stack (FastAPI+Celery against a
local sqlite copy, `chain_writer.py` in `dry_run`, testnet or stubbed record
I/O) so this fallback path can be exercised and the fix verified without
testing directly against production — no local env exists yet, which is why
testing so far has been prod-only.

## Workaround

None from the caller side. Avoid running `monitor-union` (manually or via
the daily beat) as routine/safe until this is addressed.
