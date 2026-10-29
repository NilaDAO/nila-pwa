# Bug: `report_hash` could point at content never actually pinned to IPFS

**Date discovered / resolved:** 2026-08-20
**Severity:** Was significant (silent data gap) — now resolved
**Repo:** NilaSensingAgent (`compute/fencing/record.py`, `services/ipfs.py`)
**Consumed by:** nila-pwa's satellite-crop-detection feature
(`useActiveLoans.js` / `useFoodTokenBatches.ts`), served via `/loans/sync`

---

## Status: RESOLVED — fixed commit `4bd8839`, deployed as `sensing_agent_v0.4.11`

## What was failing

`loans_active.report_hash` could point at a hash with no corresponding
pinned content anywhere on IPFS. Discovered while investigating why some
late-loan farms in Mother Theresa Union showed no satellite record.

## Root cause

`compute/fencing/record.py`'s `save()` computed and persisted
`report_hash_bytes32` *before* attempting the Pinata pin. A failed pin
(network blip, rate-limit, timeout) was caught non-fatally and logged, but
never rolled the hash back. `pin_bytes_to_pinata` (`services/ipfs.py`) had
zero retry logic, so any transient failure permanently stranded that
property's `report_hash` pointing at unpinned content.

## Fix

`save()` now only advances `report_hash`/`report_hash_bytes32`/
`ipfs_pinned_name`/`ipfs_file_id` once Pinata confirms the pin; on failure it
keeps the previous (still genuinely pinned) values. `pin_bytes_to_pinata`
retries 3x with exponential backoff first. Local-dev mode (`PINATA_JWT`
unset) is unaffected — intentional no-op, not a failure.

Regression test: `tests/test_record_hash_survives_pin_failure.py` (verified
fails pre-fix, passes post-fix).

## Deployment

Built+pushed as `sensing_agent_v0.4.06`, retagged (no rebuild, same digest
`sha256:9eb55e4b...`) as `sensing_agent_v0.4.11`. `akash_SDL.yml` bumped to
v0.4.11 (agent-compute only — this fix's code path never runs in `node`).
Verified non-regressive against v0.4.10 by diff.

## Note for future diagnosis

If a land's satellite record still 404s after this fix shipped and a fresh
pin attempt has had time to run, that's a real "no record for this land
yet" case, not this bug recurring — don't re-diagnose this same root cause
reflexively.
