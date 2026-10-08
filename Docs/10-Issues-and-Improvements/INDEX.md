# Issue tracker — nila-pwa & NilaSensingAgent

Lightweight file-based tracker. One markdown file per issue in this folder.
No GitHub remote is configured for either repo, so this is the source of
truth until/unless that changes.

**Adding an issue:** copy the format of an existing file (title, date
discovered, severity, repo/contract, root cause, what needs to change,
workaround/status). Add a row below and keep this index in sync — it's the
only file that should ever be a *summary*, never duplicate the full writeup.

**Closing an issue:** update its Status line in the file itself (don't
delete the file — it's the incident record), then update the row here.

## Open

| Issue | Repo | Severity | Status |
|---|---|---|---|
| [redeemFarmerNin draws from wrong USDT pool](redeemFarmerNin-wrong-pool.md) | nila-pwa / NilaFxPool contract | Blocking | Root-caused; contract fix not yet written or deployed |
| [confirmCashOfferDelivered fails for non-owner union leaders](confirmCashOfferDelivered-leader-mismatch.md) | nila-pwa / NilaFxPool contract | Blocking (workaround exists) | Fix written & test-verified, **not deployed** |
| [monitor-union destructive re-init on transient recovery failure](monitor-union-destructive-reinit-fallback.md) | NilaSensingAgent | Critical — live in prod | Root cause not fully found; fix not started; **no further Docker Hub pushes until fixed** |

## Resolved

| Issue | Repo | Resolved | Notes |
|---|---|---|---|
| [admin/rerun-all destructive re-init](admin-rerun-all-destructive-reinit.md) | NilaSensingAgent | 2026-08-20 | Endpoint removed (commit `43dd09f`); safe replacement is `/admin/monitor-union`, but see the still-open monitor-union issue above |
| [report_hash could point at unpinned IPFS content](report-hash-pin-failure.md) | NilaSensingAgent | 2026-08-20 | Fixed commit `4bd8839`, deployed as `sensing_agent_v0.4.11` |
