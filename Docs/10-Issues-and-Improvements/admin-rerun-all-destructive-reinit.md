# Bug: `/admin/rerun-all` destructively re-initialized land 18 in production

**Date discovered / resolved:** 2026-08-20
**Severity:** Was Critical — now resolved (endpoint removed)
**Repo:** NilaSensingAgent (`app/routers/admin.py`)
**Related:** [monitor-union-destructive-reinit-fallback.md](monitor-union-destructive-reinit-fallback.md) — same incident category, still open

---

## Status: RESOLVED — endpoint removed, commit `43dd09f` (2026-08-20)

## What happened

`POST /admin/rerun-all` was used to force-recompute land 18, which already
had a valid record + on-chain hash `0x4714...`. It decided init-vs-update by
calling `services/record_io.load(land_id)` — a node-side module that only
checks local disk and Redis, with **no IPFS-recovery fallback**. The node
container has no persistent disk, so `load()` returned `None`, and rerun-all
concluded "no record" and dispatched a full destructive `init_property`,
which published the reconstructed hash on-chain: tx
`0x688ba45a266b3b4274916cc4956a96f0c9b3f341089452b4f78f19ae203e0fce`, block
92350935, 2026-08-20T13:10:30Z — overwriting the prior commitment.

This is the same *category* of bug as the land-11 `_recover_from_ipfs`
incident fixed earlier the same day: a "no local record" read incorrectly
treated as "record doesn't exist," routed into `init_property`.

## Why this class of bug keeps recurring

Two separate `load()` implementations exist for property records:
`compute/fencing/record.py`'s (agent-compute, has full local→Redis→chain+IPFS
recovery) and `services/record_io.py`'s (node container, deliberately
lightweight per its own docstring — local+Redis only, on purpose). Any
node-side code using `record_io.load()` to make an init-vs-update decision
inherits the "no IPFS recovery" gap.

`beats/scene_monitor.py`'s `MonitorUnionLoans` avoids this because its
decision is driven by `loans_active.ipfs_pinned_name` (a durable DB column)
rather than a live `record_io.load()` call.

## Resolution

Endpoint removed entirely (commit `43dd09f`). The only supported way to
force a property recompute now is:

```
POST /admin/monitor-union/{union_addr}?land_ids=<id>&wait=true
```

**Caveat:** that replacement has its own still-open destructive-reinit risk
under a different trigger condition — see
[monitor-union-destructive-reinit-fallback.md](monitor-union-destructive-reinit-fallback.md).

Before trusting any new node-side admin/debug endpoint that touches
`init_property`/`update_property`, check whether its "does a record already
exist" check goes through `record_io.load()` (unsafe) or
`loans_active.ipfs_pinned_name` (safe). If the former, treat it as unsafe
for existing properties.
