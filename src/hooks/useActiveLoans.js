import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { setDBitem, readAllItems, deleteItem } from '../utils/db';
import { useProvider } from './useWallet.ts';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
import MulticallAbi from '../components/ABI/MultiCall3.json';
import landTitleArtifact from '../components/ABI/NilaLandTitleWithName.json';
import foodTokenArtifact from '../components/ABI/FoodTokens.json';
import { fetchRecordFromIPFS } from '../utils/ipfsCid.ts';
import { cropFamilyFromSatelliteType } from './useFoodTokenBatches.ts';

const genericFundViewerAbi = genericFundViewerArtifact.abi;
const genericFundViewerAddress = process.env.REACT_APP_VIEWER_MAIN;
const genericFundCoreAbi = genericFundCoreArtifact.abi;
const genericFundCoreAddress = process.env.REACT_APP_CORE_MAIN;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const _ltAbi = landTitleArtifact.abi ?? landTitleArtifact;
const _ltAddr = process.env.REACT_APP_LAND_TITLE_MAIN;
const _ftAbi = foodTokenArtifact.abi ?? foodTokenArtifact;
const _ftAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;
const DECIMALS = 18;
const BATCH_SIZE = 50;
// How often useActiveLoansChainSync re-reads getBorrowerInfo on-chain. Interest
// is interpolated client-side (see liveOutstanding) between syncs, so this only
// needs to be frequent enough to catch repayments/closures, not to keep the
// displayed number itself live.
const CHAIN_SYNC_INTERVAL_MS = 20 * 60 * 1000;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60; // matches GenericFundCore's `YEAR = 365 days`

// `staleTime` below only lives in-memory — a full page reload wipes it and
// forces a fresh /loans/sync round-trip every time. Mirror the same cadence
// in localStorage so reloads within the window skip the backend push/pull
// and just read IndexedDB (already the display source of truth).
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
const lastSyncKey = (union) => `nila_loans_lastSync_${union}`;

// Tracks which unions currently have the backgrounded food-token/IPFS
// enrichment step (below) in flight, so the refresh spinner can reflect it —
// added 2026-08-24 (refresh spinner stopped as soon as the chain-sync query
// finished, while this background step — often the slower of the two — kept
// running unobserved). First cut used react-query's useIsFetching, but that
// hook subscribes to fetch-state changes across the ENTIRE query cache (any
// query anywhere in the app starting/settling triggers a re-render, which it
// then filters internally) — in an app with this many concurrent queries
// (union funds, balances, chain sync, ...) that produced dozens of redundant
// re-renders per second, visible as StatusIcon logging the same two loans
// over and over with no new data between them. A plain module-level Set +
// useSyncExternalStore only notifies the specific hook instances that care
// about this specific union, decoupled from every other query's activity.
const enrichmentPending = new Set();
const enrichmentSubscribers = new Set();
function setEnrichmentPending(unionAddress, isPending) {
  if (isPending) enrichmentPending.add(unionAddress);
  else enrichmentPending.delete(unionAddress);
  for (const cb of enrichmentSubscribers) cb();
}

/**
 * True while this union's backgrounded post-sync enrichment (food-token
 * batch id resolution + satellite record/crop resolution) is still running.
 * Combine with useActiveLoansChainSync's own isFetching for a refresh
 * button that accurately reflects when a refresh is FULLY done, not just
 * when the faster chain-sync half finished.
 */
export function useLoansEnrichmentPending(unionAddress) {
  return useSyncExternalStore(
    (onChange) => {
      enrichmentSubscribers.add(onChange);
      return () => enrichmentSubscribers.delete(onChange);
    },
    () => enrichmentPending.has(unionAddress),
  );
}

/** Force the next useActiveLoans run to hit /loans/sync regardless of throttle. */
export function forceLoansResync(unionAddress) {
  try { localStorage.removeItem(lastSyncKey(unionAddress)); } catch (_) {}
}

// Loan closure is terminal on-chain (repaid/defaulted loans can't reopen —
// removeLoan is only for pre-drawdown cancellation). The backend's own copy
// of a closed loan can linger for a while (close_loans' event-scan hard-delete
// is opportunistic; LoanCloser's soft-close beat only runs every 3 days and
// never deletes the row), so once we've locally reviewed a closed loan and
// let it age out of IndexedDB, remember its id here permanently — otherwise
// the next backend merge re-inserts it as "new" (chainClosed reset to false,
// closedAt cleared) and the retention window restarts forever.
const closedLoanIdsKey = (union) => `nila_loans_closedIds_${union}`;

export function markLoanClosedForever(unionAddress, loanId) {
  try {
    const key = closedLoanIdsKey(unionAddress);
    const ids = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    ids.add(loanId);
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch (_) {}
}

export function isKnownClosed(unionAddress, loanId) {
  try {
    const ids = JSON.parse(localStorage.getItem(closedLoanIdsKey(unionAddress)) || '[]');
    return ids.includes(loanId);
  } catch (_) { return false; }
}

/**
 * Manually remove a loan the UI still shows but that's already gone on-chain
 * (e.g. a stuck "awaiting" row) — no on-chain call, just local cleanup.
 * Also permanently suppresses it so a lagging backend /loans/sync merge
 * can't resurrect it (see closedLoanIdsKey comment above).
 */
export async function dismissLoanLocally(unionAddress, loanId, queryClient) {
  try { await deleteItem(loanId, 'ActiveLoans'); } catch (_) {}
  markLoanClosedForever(unionAddress, loanId);
  queryClient.invalidateQueries({ queryKey: ['activeLoans', unionAddress] });
}

const parseAmount = (raw) => {
  try {
    return Number(ethers.formatUnits(raw ?? '0', 18));
  } catch (e) {
    const fallback = Number(raw);
    return Number.isFinite(fallback) ? fallback : 0;
  }
};

/**
 * Client-side projection of a loan's current outstanding balance, interpolated
 * between chain syncs using the same simple-interest formula the contract
 * itself uses (GenericFundMathLib.accruedInterest — see GenericFundCore.sol):
 *   interest = principalDue * rateBP * elapsedSeconds / (10_000 * YEAR)
 *
 * Anchor point depends on repayment history, because the contract re-anchors
 * `lastAccrualTs` (and bumps interestAccrued/interestPaid) on every repayment
 * (GenericFundCore.sol repayLoan, ~line 1026) — fields getBorrowerInfo doesn't
 * expose, so we can't reconstruct them client-side once a repayment happened:
 *   - Never repaid (principalRepaid === 0): lastAccrualTs == drawdownTs and
 *     interestAccrued/interestPaid are still 0 on-chain, so the formula is
 *     exact from drawdownTs — no chain call ever needed for these.
 *   - Repaid at least once: anchor to the last chain-synced `amount`
 *     (= on-chain `outstanding` at sync time) and `chainSyncedAt` instead,
 *     interpolating forward from that known-good snapshot.
 *
 * Requires the loan to have gone through at least one chain sync
 * (chainVerified) — before that we don't have `principal`/`rateBP` split out
 * from the backend's raw `amount`, so this just returns the cached amount.
 */
export function liveOutstanding(loan, nowMs = Date.now()) {
  if (!loan?.chainVerified) return loan?.amount ?? 0;

  const principalDue = Math.max(0, (loan.principal ?? 0) - (loan.principalRepaid ?? 0));
  const rateBP = loan.rateBP ?? 0;
  if (!principalDue || !rateBP) return loan.amount ?? loan.principal ?? 0;

  const hasRepayment = (loan.principalRepaid ?? 0) > 0;
  const anchorTs = hasRepayment
    ? loan.chainSyncedAt
    : (loan.drawdownTs ? loan.drawdownTs * 1000 : loan.chainSyncedAt);
  const anchorOutstanding = hasRepayment ? (loan.amount ?? principalDue) : loan.principal;

  if (!anchorTs) return loan.amount ?? principalDue;

  const elapsedSec = Math.max(0, (nowMs - anchorTs) / 1000);
  const interestSinceAnchor = (principalDue * rateBP * elapsedSec) / (10_000 * SECONDS_PER_YEAR);
  return anchorOutstanding + interestSinceAnchor;
}

const mapBackendItem = (i, union) => ({
  id: i.loan_id ?? i.id,
  borrower: i.borrower,
  fund: i.fund?.startsWith('0x') ? i.fund : i.fund ? `0x${i.fund}` : '',
  activity_stage: i.activity_stage,
  activity_checked_at: i.activity_checked_at,
  activity_stage_id: i.activity_stage_id,
  active: Boolean(i.active),
  amount: parseAmount(i.amount),
  rateBP: Number(i.rate_bp ?? i.rateBP ?? 0),
  maturityTs: i.maturity_ts,
  drawdownTs: i.drawdown_ts,
  milestone: i.milestone,
  milestoneDigest: i.milestone_digest,
  withincarryover: i.withincarryover ?? i.within_carryover ?? null,
  txHash: i.tx_hash,
  union: i.union_addr ?? union,
  fastDraw: Boolean(i.fast_draw ?? i.fastDraw ?? false),
  landId: i.land_id ?? null,
  farmName: i.farm_name ?? null,
  farmerScore: i.farmer_score ?? null,
  foodTokenId: i.food_token_id ?? null,
  recordHash: i.report_hash ?? null,
  // chain sync metadata — not yet verified
  chainVerified: false,
  chainClosed: false,
});

/**
 * Resolves foodTokenBatchId for a specific list of loans via one Multicall3
 * tokenBatch() batch call — shared by both the periodic chain sync's backstop
 * pass (Step 4 below) and syncLoansWithBackend's fast path, which calls this
 * immediately when a loan's foodTokenId first lands from the backend instead
 * of waiting for the next scheduled chain sync. `candidates` must already be
 * filtered to loans with a foodTokenId and no foodTokenBatchId yet. Batch ids
 * are 1-indexed (FoodTokenUpgradeable.createBatch), so a stored 0 unambiguously
 * means "not in a batch" — still cached as-is so it isn't re-queried forever.
 */
async function resolveFoodTokenBatchIds(candidates, provider) {
  if (!_ftAddr || !provider || !candidates?.length) return;
  const mc = new ethers.Contract(MULTICALL3, MulticallAbi, provider);
  const ftIface = new ethers.Interface(_ftAbi);
  const batchCalls = candidates.map(l => [_ftAddr, ftIface.encodeFunctionData('tokenBatch', [l.foodTokenId])]);
  const batchResults = await mc.tryAggregate.staticCall(false, batchCalls);
  const fresh = await readAllItems('ActiveLoans') ?? {};
  for (let k = 0; k < candidates.length; k++) {
    const l = candidates[k];
    if (!batchResults[k].success) continue;
    try {
      const [batchIdRaw] = ftIface.decodeFunctionResult('tokenBatch', batchResults[k].returnData);
      const foodTokenBatchId = Number(batchIdRaw);
      const updated = { ...(fresh[l.id] ?? l), foodTokenBatchId };
      await setDBitem(l.id, updated, 'ActiveLoans');
    } catch (e) {
      console.warn(`[foodTokenBatchId] tokenBatch decode failed for ${l.id}:`, e.message);
    }
  }
}

/**
 * Resolves a projected harvest date, the matched cycle's own start date
 * (satSos), and (for loans with no food-token crop data) cropFamily too,
 * from the satellite record.json. Fetched via loan.recordHash (backend's
 * report_hash) straight from Pinata — a free, content-addressed IPFS read,
 * NOT the fee-gated on-chain getRecordHash() path in useRecordHash.ts.
 *
 * Picks the *open* cycle whose sos is closest to the loan's drawdownTs.
 * (Previously preferred the food token's own sosTs as the anchor when
 * present, on the theory that an on-chain-committed sowing date beats a
 * drawdown-date proxy — reverted 2026-08-21: sosTs turned out to often be a
 * system-suggested default the farmer/leader just accepted rather than a
 * verified date, so it's not a trustworthy anchor. ActiveLoansCard.js's
 * `enriched` memo now validates the resulting satSos against drawdownTs
 * itself — see the ±20-day trust window there — rather than trying to
 * pick a better anchor here.) Runs for EVERY loan with a recordHash, food-token
 * or not — food-token loans already have an
 * authoritative cropFamily (Step 3's unpackTokenId), so this only adds
 * satProjectedEos/satSos for them, never overwriting cropFamily/cropSource.
 * For loans with no food token, the matched cycle's detected crop_type also
 * maps onto the same `cropFamily` field, so CropIcon consumes it identically
 * regardless of source.
 *
 * satProjectedEos — the cycle's `projection.projected_eos_date` when the
 * model has produced one (derived from the cycle's actual observed
 * NDVI/weather trajectory) — is what ActiveLoansCard's harvest-date
 * priority now uses ahead of the removed flat cycle-days estimate; see the
 * 2026-08-20 harvest-column redesign (the frontend's own CROP_CYCLE_DAYS
 * table was removed in favor of this backend-computed value exclusively).
 * `candidates` must already be filtered to loans with a recordHash and no
 * satProjectedEos yet.
 */
// Small bounded-concurrency pool — resolveCropFromRecords used to fetch
// each loan's IPFS record sequentially (one Pinata gateway round-trip at a
// time, no timeout/retry, 20-60s each under load per fetchRecordFromIPFS's
// own docs), so a sync touching even a handful of loans took minutes even
// once backgrounded (see the 2026-08-21 mobile-slow-load fix). Runs up to
// `limit` fetches at once instead of one at a time, without unbounded
// Promise.all hammering the free-tier gateway with dozens of simultaneous
// requests.
async function runWithConcurrency(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

export async function resolveCropFromRecords(candidates) {
  if (!candidates?.length) return;
  const fresh = await readAllItems('ActiveLoans') ?? {};
  await runWithConcurrency(candidates, 5, async (l) => {
    try {
      const record = await fetchRecordFromIPFS(l.recordHash);
      // record.cycles has been an object keyed by cycle_N (not an array)
      // since NilaSensingAgent's list→dict schema migration — this used to
      // silently fall through to [] for any such record, meaning `best`
      // was always null and NOTHING got extracted (satSos, satProjectedEos,
      // cropFamily, health, stage, yield) for essentially every active land.
      // See the 2026-08-21 land-53 investigation: a loan showing
      // satProjectedEos but no satSos was a stale leftover from before its
      // land's record migrated to the dict schema, frozen in place by the
      // conditional-merge write below plus resolvedRecordHash gating out
      // any retry.
      const cycles = Array.isArray(record?.cycles)
        ? record.cycles
        : (record?.cycles && typeof record.cycles === 'object' ? Object.values(record.cycles) : []);
      const drawdownMs = Number(l.drawdownTs) * 1000;
      let best = null;
      let bestDiff = Infinity;
      for (const c of cycles) {
        if (!c.is_open || !c.sos) continue;
        const diff = Math.abs(new Date(c.sos).getTime() - drawdownMs);
        if (diff < bestDiff) { best = c; bestDiff = diff; }
      }

      // current_cycle carries the live, continuously-reclassified state for
      // this zone — crop_type AND health/health_summary/health_description
      // are only ever populated there in practice. cycles[] carries its own
      // (good/moderate/poor) health enum too, but it's always null on real
      // data as of the 2026-08-20 health-field investigation.
      const live = (best && Array.isArray(record?.current_cycle))
        ? record.current_cycle.find((cc) => cc.cluster_id === best.zone_id)
        : null;

      const satProjectedEos = best?.projection?.projected_eos_date ?? null;
      const satSos = best?.sos ?? null;

      // Crop identity only for non-food-token loans — food tokens already
      // carry an authoritative, on-chain-attested cropFamily (Step 3) that a
      // probabilistic satellite guess must never override.
      let cropFamily = null;
      let confidence = null;
      if (best && !l.foodTokenId) {
        // A freshly-open cycle's own entry often hasn't been classified yet
        // (crop_type: null) — current_cycle carries the live re-classification
        // for the same zone, so prefer that when the raw cycle lacks one.
        let cropType = best.crop_type;
        confidence = best.crop_confidence ?? null;
        if (!cropType && live) { cropType = live.crop_type; confidence = live.crop_confidence ?? null; }
        cropFamily = cropFamilyFromSatelliteType(cropType);
      }

      // Health applies regardless of food-token status — knowing whether a
      // committed crop is on track matters even more once it's tokenised.
      const health = live?.health ?? null;
      const healthSummary = live?.health_summary ?? null;
      const healthDescription = live?.health_description ?? null;
      // Growth-stage classification — same `current_cycle` entry as health,
      // same "only populated on the live zone" caveat. Raw pass-through,
      // whatever vocabulary NilaSensingAgent uses — the frontend doesn't
      // invent or normalize this string.
      const stage = live?.stage ?? null;
      const stageDescription = live?.stage_description ?? null;
      // Yield estimate — lives on the matched *cycle* itself (cycles[]),
      // not current_cycle/live. Real field, confirmed present in actual
      // record.json output during the 2026-08-21 investigation, but null on
      // every open/in-progress cycle seen so far — likely only populated
      // once a cycle closes (or once the yield model has enough signal).
      const yieldKgPerAcre = best?.yield_kg_per_acre ?? null;

      const updated = {
        ...(fresh[l.id] ?? l),
        ...(cropFamily != null ? { cropFamily, cropSource: 'satellite', cropConfidence: confidence } : {}),
        ...(satProjectedEos != null ? { satProjectedEos } : {}),
        ...(satSos != null ? { satSos } : {}),
        ...(stage != null ? { stage, stageDescription } : {}),
        ...(yieldKgPerAcre != null ? { yieldKgPerAcre } : {}),
        ...(health != null ? { health, healthSummary, healthDescription } : {}),
        // Stamped even when nothing new was extracted (no matching open
        // cycle, no health yet) so this loan isn't re-fetched every sync —
        // only once the backend publishes a *different* recordHash. See the
        // two newlyGotRecordHash call sites and the Step 3b filter, both of
        // which gate on recordHash !== resolvedRecordHash rather than "have
        // we resolved anything yet" (the latter meant a loan whose hash
        // changed after its first successful resolve was never re-fetched).
        resolvedRecordHash: l.recordHash,
      };
      await setDBitem(l.id, updated, 'ActiveLoans');
      fresh[l.id] = updated;
    } catch (e) {
      console.warn(`[cropFromRecord] failed for ${l.id}:`, e.message);
    }
  });
}

// unionAddress -> in-flight Promise. Ensures concurrent triggers (mount +
// periodic timer + manual refresh + chainSync's own invalidate, all firing
// close together) coalesce into a single real /loans/sync round-trip instead
// of racing each other and clobbering IndexedDB with whichever finishes last.
const inFlightSync = new Map();

/**
 * Push local active loans to node, pull the merged list back, upsert into
 * IndexedDB (without overwriting chain-enriched records), then invalidate
 * the useActiveLoans query so the UI re-reads the refreshed data.
 *
 * Throttled via localStorage (survives reloads, unlike React Query's
 * in-memory staleTime) and deduped via inFlightSync — safe to call from
 * multiple places without worrying about double-fetching.
 *
 * Also resolves foodTokenBatchId immediately for any loan whose foodTokenId
 * just arrived from the backend in this run — not every loan goes through
 * useActiveLoansChainSync's own foodTokenId discovery, so without this a
 * backend-sourced foodTokenId would sit unresolved for up to
 * CHAIN_SYNC_INTERVAL_MS before the periodic backstop pass caught it.
 * `provider` is optional (read-only, from useProvider()) — if unavailable,
 * this step is skipped and the periodic chain sync backstop still catches it.
 */
function syncLoansWithBackend(unionAddress, queryClient, provider) {
  if (inFlightSync.has(unionAddress)) return inFlightSync.get(unionAddress);

  const run = (async () => {
    const syncKey = lastSyncKey(unionAddress);
    const lastSyncedAt = Number(localStorage.getItem(syncKey) || 0);
    if (Date.now() - lastSyncedAt < SYNC_THROTTLE_MS) {
      console.log(`[activeLoans] skip backend sync — last synced ${Math.round((Date.now() - lastSyncedAt) / 1000)}s ago`);
      return;
    }

    const API = process.env.REACT_APP_API_BASE_URL;
    let stored = {};
    try {
      stored = await readAllItems('ActiveLoans') ?? {};
    } catch (_) { /* first run */ }

    try {
      // Build push payload from local active loans
      const localActive = Object.values(stored)
        .filter((l) => l.active && !l.chainClosed && l.drawdownTs)
        .map((l) => ({
          loan_id: l.id,
          borrower: l.borrower || '',
          fund: l.fund || '',
          amount: String(l.amount ?? '0'),
          rate_bp: l.rateBP ?? 0,
          maturity_ts: l.maturityTs ?? 0,
          drawdown_ts: l.drawdownTs ?? 0,
          active: true,
          land_id: l.landId ?? null,
          farm_name: l.farmName ?? null,
          farmer_score: l.farmerScore ?? null,
          food_token_id: l.foodTokenId ?? null,
        }));

      const res = await fetch(`${API}/loans/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ union: unionAddress, loans: localActive }),
      });

      if (res.ok) {
        const json = await res.json();
        const backendItems = Array.isArray(json.items)
          ? json.items.map((i) => mapBackendItem(i, unionAddress))
          : [];

        // Upsert new loans AND refresh stale ones (but don't overwrite chain-synced records)
        console.log(`[activeLoans] backend returned ${backendItems.length} items, landIds:`,
          backendItems.filter(i => i.landId).map(i => `${i.id.slice(0,8)}→${i.landId}`));
        // Loans whose foodTokenId is new-to-us as of this sync — resolved
        // immediately below rather than waiting for the next chain sync.
        const newlyGotFoodTokenId = [];
        // Loans whose recordHash is new-to-us this sync, OR changed from what
        // we last resolved — candidates for satProjectedEos/health (and, for
        // non-food-token loans, cropFamily too). A changed hash means the
        // backend published a fresh data point; re-resolve so health in
        // particular (a live, changing signal) doesn't go stale. Not mutually
        // exclusive with newlyGotFoodTokenId — a food-token loan still needs
        // its own satellite projection resolved.
        const newlyGotRecordHash = [];
        // Re-read current IndexedDB state rather than trusting `stored`
        // (captured before the /loans/sync round-trip above) — a concurrent
        // useActiveLoansChainSync run can land its own write (e.g. flagging
        // a loan chainClosed) anywhere during that gap. Merging against the
        // stale `stored` snapshot below would silently overwrite that with
        // backend data — mapBackendItem always hardcodes
        // chainVerified/chainClosed to false — resurrecting a just-closed
        // loan as active. See the 2026-08-21 closed-loan-resurrection
        // report (mobile: closed loans reappeared active after a sync).
        const storedNow = await readAllItems('ActiveLoans').catch(() => null) ?? stored;
        for (const item of backendItems) {
          const existing = storedNow[item.id];
          // Debug: unconditional per-item trace of what the backend sent vs
          // what's already local, ahead of the NEW/MERGE/BACKFILL/SKIP branch
          // below — added 2026-08-24 to debug reports of a loan's updated
          // satellite record (new report_hash on-chain) not showing up in the
          // PWA after refresh. Answers "was this loan even in the /loans/sync
          // response this time" and "did its recordHash actually change from
          // the backend's point of view" without having to cross-reference
          // the landIds summary line above by truncated id prefix.
          console.log(
            `[activeLoans][sync-trace] id=${item.id.slice(0, 10)} landId=${item.landId} ` +
            `chainVerified=${existing?.chainVerified ?? '(new)'} ` +
            `recordHash: local=${existing?.recordHash ?? 'none'} backend=${item.recordHash ?? 'none'} ` +
            `changed=${!existing ? 'n/a-new' : existing.recordHash !== item.recordHash}`
          );
          if (!existing) {
            if (isKnownClosed(unionAddress, item.id)) {
              console.log(`[activeLoans] SKIP re-adding known-closed loan ${item.id.slice(0,8)}`);
              continue;
            }
            // Brand-new loan from backend
            try { await setDBitem(item.id, item, 'ActiveLoans'); } catch (_) {}
            stored[item.id] = item;
            if (item.foodTokenId) newlyGotFoodTokenId.push(item);
            if (item.recordHash) newlyGotRecordHash.push(item);
            console.log(`[activeLoans] NEW ${item.id.slice(0,8)} landId=${item.landId}`);
          } else if (!existing.chainVerified) {
            // Backend has fresher data than our un-verified local copy — but
            // mapBackendItem always hardcodes chainVerified/chainClosed to
            // false (the backend has no on-chain closure authority, only
            // useActiveLoansChainSync does). Even reading `existing` from the
            // re-read storedNow above, a chain sync write can still land in
            // the few ms between that re-read and this one item's write —
            // the ||-preserve is belt-and-suspenders so a backend merge can
            // never flip a closed loan back to open either way. See the
            // 2026-08-21 closed-loan resurrection report (mobile: closed
            // loans reappeared active after a sync).
            const merged = {
              ...existing,
              ...item,
              chainVerified: existing.chainVerified || item.chainVerified,
              chainClosed: existing.chainClosed || item.chainClosed,
            };
            try { await setDBitem(item.id, merged, 'ActiveLoans'); } catch (_) {}
            stored[item.id] = merged;
            if (item.foodTokenId && !existing.foodTokenId) newlyGotFoodTokenId.push(merged);
            if (item.recordHash && item.recordHash !== existing.recordHash) newlyGotRecordHash.push(merged);
            console.log(`[activeLoans] MERGE (unverified) ${item.id.slice(0,8)} landId=${merged.landId}`);
          } else {
            // Chain-verified — backfill landId/farmName from backend if missing locally
            const patch = {};
            if (item.landId && !existing.landId) patch.landId = item.landId;
            if (item.farmName && !existing.farmName) patch.farmName = item.farmName;
            if (item.foodTokenId && !existing.foodTokenId) patch.foodTokenId = item.foodTokenId;
            if (item.recordHash && item.recordHash !== existing.recordHash) patch.recordHash = item.recordHash;
            if (Object.keys(patch).length) {
              const patched = { ...existing, ...patch };
              try { await setDBitem(item.id, patched, 'ActiveLoans'); } catch (_) {}
              stored[item.id] = patched;
              if (patch.foodTokenId) newlyGotFoodTokenId.push(patched);
              if (patch.recordHash) newlyGotRecordHash.push(patched);
              console.log(`[activeLoans] BACKFILL ${item.id.slice(0,8)}`, patch);
            } else {
              console.log(`[activeLoans] SKIP ${item.id.slice(0,8)} landId=${existing.landId} farmName=${existing.farmName}`);
            }
          }
        }
        localStorage.setItem(syncKey, String(Date.now()));

        // Food-token/IPFS enrichment, backgrounded — it used to run
        // awaited, in sequence, BEFORE the invalidate below ever fired:
        // fetchRecordFromIPFS has no timeout or retry and the Pinata
        // gateway routinely takes 20-60s under load, so with even a
        // handful of loans needing re-resolution the whole active-loans
        // list would sit blank/stale for minutes on a slow mobile
        // connection — exactly the "takes forever, mash refresh" report
        // from 2026-08-21. Fires its own invalidate on completion so the
        // UI picks up health/stage/crop/EOS as they arrive, but nothing
        // below waits on it. setEnrichmentPending brackets it purely so its
        // in-flight state is observable via useLoansEnrichmentPending — the
        // refresh button used to stop spinning as soon as the (often
        // faster) chain-sync query finished, while this step kept running
        // unobserved in the background (2026-08-24).
        if (newlyGotFoodTokenId.length || newlyGotRecordHash.length) {
          setEnrichmentPending(unionAddress, true);
          (async () => {
            try {
              if (newlyGotFoodTokenId.length) {
                console.log(`[activeLoans] ${newlyGotFoodTokenId.length} loans got a new foodTokenId this sync — resolving batch id now`);
                await resolveFoodTokenBatchIds(newlyGotFoodTokenId, provider);
              }
              if (newlyGotRecordHash.length) {
                const landIds = newlyGotRecordHash.map(l => l.landId ?? '?').join(', ');
                console.log(`[activeLoans] ${newlyGotRecordHash.length} loans got a new recordHash this sync (landId: ${landIds}) — resolving satellite projection now`);
                await resolveCropFromRecords(newlyGotRecordHash);
              }
            } catch (_) { /* best-effort background enrichment */ }
            queryClient.invalidateQueries({ queryKey: ['activeLoans', unionAddress] });
            setEnrichmentPending(unionAddress, false);
          })();
        }
      }
    } catch (_) { /* backend offline — IndexedDB stays the source of truth */ }

    // Fast path — the backend-synced list itself is already upserted into
    // IndexedDB above. Fires unconditionally (success or failure) so the UI
    // re-reads current IndexedDB state either way, same as before this
    // enrichment was backgrounded.
    queryClient.invalidateQueries({ queryKey: ['activeLoans', unionAddress] });
  })();

  inFlightSync.set(unionAddress, run);
  run.finally(() => inFlightSync.delete(unionAddress));
  return run;
}

/**
 * Primary hook: reads from IndexedDB (source of truth after chain sync).
 * Resolves immediately from local data — never blocks on the network.
 *
 * Backend reconciliation (push local active loans, pull merged list,
 * upsert into IndexedDB) happens separately via syncLoansWithBackend,
 * fired on mount and on a periodic timer, both throttled + deduped so a
 * reload or remount can't trigger a flurry of concurrent round-trips.
 *
 * Returns { activeLoans, allItems, count, synced }
 */
export function useActiveLoans(unionAddress, enabled) {
  const queryClient = useQueryClient();
  // Read-only provider (no wallet decrypt, ready immediately) — just needed
  // for syncLoansWithBackend's foodTokenBatchId fast path. See its docstring.
  const { provider } = useProvider();

  useEffect(() => {
    if (!enabled || !unionAddress) return;
    syncLoansWithBackend(unionAddress, queryClient, provider);
    const id = setInterval(() => syncLoansWithBackend(unionAddress, queryClient, provider), SYNC_THROTTLE_MS);
    return () => clearInterval(id);
  }, [enabled, unionAddress, queryClient, provider]);

  return useQuery({
    queryKey: ['activeLoans', unionAddress],
    queryFn: async () => {
      // Local-only read — IndexedDB IS the display source, so this resolves
      // fast regardless of whether a backend sync is due/in flight.
      let stored = {};
      try {
        stored = await readAllItems('ActiveLoans') ?? {};
      } catch (_) { /* first run */ }

      const allItems = Object.values(stored);
      const activeLoans = allItems.filter(
        (l) => l.drawdownTs && l.active && !l.chainClosed
      );
      console.log('[activeLoans] loaded:', activeLoans.length, 'active /', allItems.length, 'total');

      return {
        activeLoans,
        allItems,
        count: allItems.length,
        localCount: allItems.length,
        synced: true,
      };
    },
    enabled: enabled && !!unionAddress,
    staleTime: 5 * 60 * 1000,
  });
}

// How often the displayed interest figure re-renders between chain syncs.
// Pure client-side arithmetic (liveOutstanding), no network — cheap even at
// this cadence for a union's worth of loans. A currency display rounded to
// whole rupees won't visibly change every tick, but it's always correct
// whenever the user actually looks at it.
const INTEREST_TICK_MS = 5 * 1000;

/**
 * Sum of liveOutstanding(loan) - principal across active loans — the gross,
 * total interest borrowers currently owe (not just the union's fee share —
 * see useLiveTreasuryEarningsPending for that). "Total interest pending" in
 * the full Union Cash Reserve panel; a union-wide reporting figure, distinct
 * from the leader-facing "Treasury earnings pending" on the collapsed card.
 * Re-renders every INTEREST_TICK_MS to tick forward.
 */
export function useLiveCumulativeInterest(activeLoans) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), INTEREST_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!activeLoans?.length) return 0;
    return activeLoans.reduce((sum, l) => {
      const principal = l.principal ?? l.amount ?? 0;
      return sum + Math.max(0, liveOutstanding(l, now) - principal);
    }, 0);
  }, [activeLoans, now]);
}

/**
 * The union's actual share of one loan's currently-pending (unpaid) interest —
 * not the gross borrower-owed interest. Mirrors GenericFundCore._distributeInterest:
 * on any real repayment, the contract skims (treasuryFeeBP + rainyFeeBP) / rateBP
 * of the interest into unionTreasury + unionRainyDay before the remainder goes
 * to LPs — a proportional slice of the interest amount, not a flat percentage
 * of principal, and it scales inversely with the loan's own rate. Loans whose
 * rateBP doesn't clear totalFeeBP earn the union nothing on that loan at all
 * (the "union forfeits" case in _distributeInterest).
 */
function treasuryShareOfPendingInterest(loan, nowMs, totalFeeBP) {
  const principal = loan.principal ?? loan.amount ?? 0;
  const pendingInterest = Math.max(0, liveOutstanding(loan, nowMs) - principal);
  const rateBP = loan.rateBP ?? 0;
  if (!pendingInterest || !totalFeeBP || rateBP <= totalFeeBP) return 0;
  return (pendingInterest * totalFeeBP) / rateBP;
}

/**
 * Sum of the union's pending treasury+rainy-day share across active loans —
 * "treasury earnings pending" as a continuously-interpolated figure rather
 * than a snapshot from the last chain sync. Re-renders every INTEREST_TICK_MS
 * to tick forward. `treasuryFeeBP`/`rainyFeeBP` come from useUnionCashReserve
 * (read live from GenericFundCore — admin-configurable via setFeeBps, so not
 * safe to hardcode).
 */
export function useLiveTreasuryEarningsPending(activeLoans, treasuryFeeBP, rainyFeeBP, unionAddress) {
  const [now, setNow] = useState(() => Date.now());
  const [lowerRateById, setLowerRateById] = useState({});
  const totalFeeBP = (treasuryFeeBP ?? 0) + (rainyFeeBP ?? 0);
  const { provider } = useProvider();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), INTEREST_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Ground-truth lowerRate flag (rateBP < minRateBP at drawdown, straight off
  // GenericFundCore.loans(), see getBorrowerInfo's pending viewer fix) — used
  // by shareOf below to zero out a forfeited loan's share regardless of
  // whether rateBP still clears totalFeeBP. Runs once per loan-id set, not on
  // every INTEREST_TICK_MS tick — do not fold this into
  // useActiveLoansChainSync's own recurring Multicall3 batch.
  const loanIdsKey = (activeLoans ?? []).map(l => l.id).join(',');
  useEffect(() => {
    if (!activeLoans?.length || !provider || !unionAddress) return;
    let cancelled = false;
    (async () => {
      const mc = new ethers.Contract(MULTICALL3, MulticallAbi, provider);
      const coreIface = new ethers.Interface(genericFundCoreAbi);
      const calls = activeLoans.map(l => [
        genericFundCoreAddress,
        coreIface.encodeFunctionData('loans', [unionAddress, l.id]),
      ]);
      const results = await mc.tryAggregate.staticCall(false, calls);
      if (cancelled) return;
      const map = {};
      activeLoans.forEach((l, i) => {
        const [success, data] = results[i];
        map[l.id] = success ? coreIface.decodeFunctionResult('loans', data).lowerRate : null;
      });
      setLowerRateById(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanIdsKey, provider, unionAddress]);

  // Forfeit on lowerRate, not just the rateBP<=totalFeeBP cutoff below: a
  // leader-accepted below-floor rate is a manual call to waive the union's
  // cut on that loan (see GenericFundCore.sol:917's own "fees waived"
  // comment), independent of whether rateBP still clears totalFeeBP. Note
  // this is a display-only override — _distributeInterest itself doesn't
  // consult lowerRate, so the on-chain treasury will still receive its
  // proportional cut from these loans on actual repayment; this just keeps
  // the "pending" figure from crediting a share the leader has committed to
  // not collect.
  const shareOf = useCallback((l) =>
    lowerRateById[l.id] ? 0 : treasuryShareOfPendingInterest(l, now, totalFeeBP),
    [lowerRateById, now, totalFeeBP]
  );

  return useMemo(() => {
    if (!activeLoans?.length || !totalFeeBP) return 0;
    return activeLoans.reduce((sum, l) => sum + shareOf(l), 0);
  }, [activeLoans, totalFeeBP, shareOf]);
}

/**
 * Chain sync: calls getBorrowerInfo via Multicall3 for every loan in IndexedDB.
 * Updates IndexedDB with fresh on-chain state, then invalidates useActiveLoans
 * so the UI re-reads the enriched data.
 *
 * Flags loans as chainClosed if the contract says closed/defaulted.
 */
export function useActiveLoansChainSync(unionAddress, enabled) {
  const { provider } = useProvider();
  const queryClient = useQueryClient();

  const chainSync = useQuery({
    queryKey: ['activeLoansChainSync', unionAddress],
    queryFn: async () => {
      let stored = {};
      try {
        stored = await readAllItems('ActiveLoans') ?? {};
      } catch (_) { return null; }

      const loanIds = Object.keys(stored);
      if (!loanIds.length) return null;

      const mc = new ethers.Contract(MULTICALL3, MulticallAbi, provider);
      const viewerIface = new ethers.Interface(genericFundViewerAbi);

      for (let i = 0; i < loanIds.length; i += BATCH_SIZE) {
        const batch = loanIds.slice(i, i + BATCH_SIZE);
        const calls = batch.map((id) => [
          genericFundViewerAddress,
          viewerIface.encodeFunctionData('getBorrowerInfo', [unionAddress, id]),
        ]);

        // tryAggregate(false, calls) — don't revert on per-call failure
        const results = await mc.tryAggregate.staticCall(false, calls);

        for (let j = 0; j < batch.length; j++) {
          const [success, returnData] = results[j];
          const id = batch[j];
          const existing = stored[id] ?? {};

          if (!success) {
            // Call reverted (LoanNotExist) — delete ghost. Record permanently so a
            // lagging backend /loans/sync merge can't resurrect it (closedLoanIdsKey).
            try { await deleteItem(id, 'ActiveLoans'); } catch (_) {}
            markLoanClosedForever(unionAddress, id);
            continue;
          }

          // lowerRate (rateBP < minRateBP at drawdown — leader manually accepted a
          // below-floor rate) isn't in this tuple yet: the GenericFundViewer.sol
          // fix adding it has been written (mirrors ln.lowerRate off the existing
          // core.loans() read inside getBorrowerInfo) but not deployed. Once it is,
          // add `lowerRate` here and to genericFundViewer.json's ABI — do NOT add a
          // second Multicall3 call to fetch it in the meantime.
          const {
            borrower,
            principal,
            principalRepaid,
            rateBP,
            dueDate,
            closed,
            defaulted,
            outstanding,
            milestone,
            milestoneDigest,
            digestTs,
            drawdownTs,
          } = viewerIface.decodeFunctionResult('getBorrowerInfo', returnData);

          // Ghost row: no principal, no drawdown — expired voucher pre-insert.
          // Record permanently so a lagging backend /loans/sync merge can't
          // resurrect it (closedLoanIdsKey) — this is exactly the "awaiting"
          // loan that's already gone on-chain but was still stuck locally.
          if (principal === 0n && drawdownTs === 0n && !closed) {
            try { await deleteItem(id, 'ActiveLoans'); } catch (_) {}
            markLoanClosedForever(unionAddress, id);
            continue;
          }

          if (closed || defaulted) {
            // Flag as closed — keep for 1 day so UI can show warning, then auto-delete
            const flagged = {
              ...existing,
              chainVerified: true,
              chainClosed: true,
              active: false,
              defaulted: Boolean(defaulted),
              closedAt: existing.closedAt || Date.now(),
            };
            try { await setDBitem(id, flagged, 'ActiveLoans'); } catch (_) {}
            continue;
          }

          // Update with fresh chain data
          const updated = {
            ...existing,
            borrower,
            amount: Number(ethers.formatUnits(outstanding, DECIMALS)),
            principal: Number(ethers.formatUnits(principal, DECIMALS)),
            principalRepaid: Number(ethers.formatUnits(principalRepaid, DECIMALS)),
            rateBP: Number(rateBP),
            maturityTs: Number(dueDate),
            drawdownTs: Number(drawdownTs),
            milestone: Number(milestone),
            milestoneDigest,
            digestTs: Number(digestTs),
            active: true,
            chainVerified: true,
            chainClosed: false,
            // Anchor for liveOutstanding()'s client-side interpolation between
            // chain syncs — see comment there for why this (not drawdownTs)
            // is the right anchor once a loan has had a repayment.
            chainSyncedAt: Date.now(),
          };

          try { await setDBitem(id, updated, 'ActiveLoans'); } catch (_) {}
        }
      }

      // Delete stale closed loans older than 1 day — just long enough to
      // review that a loan actually closed, no reason to keep it longer.
      const STALE_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();
      for (const id of loanIds) {
        const item = stored[id];
        if (item?.chainClosed && item.closedAt && (now - item.closedAt) > STALE_MS) {
          try { await deleteItem(id, 'ActiveLoans'); } catch (_) {}
          markLoanClosedForever(unionAddress, id);
        }
      }

      // Resolve landId + farmName from chain for active loans missing them
      console.log('[chainSync] farm name resolution — _ltAddr:', _ltAddr);
      if (_ltAddr) {
        const lt = new ethers.Contract(_ltAddr, _ltAbi, provider);
        const ltIface = new ethers.Interface(_ltAbi);
        const mc = new ethers.Contract(MULTICALL3, MulticallAbi, provider);
        const fresh = await readAllItems('ActiveLoans') ?? {};
        const allLoans = Object.values(fresh).filter(l => !l.chainClosed);
        const needLandId = allLoans.filter(l => !l.landId && l.borrower);
        const needName = allLoans.filter(l => l.landId && !l.farmName);
        console.log(`[chainSync] ${allLoans.length} active loans, ${needLandId.length} need landId, ${needName.length} need farmName`);

        // Step 1a: batch balanceOf to find loans whose borrower has a land title
        if (needLandId.length > 0) {
          const balCalls = needLandId.map(l => [_ltAddr, ltIface.encodeFunctionData('balanceOf', [l.borrower])]);
          const balResults = await mc.tryAggregate.staticCall(false, balCalls);
          const hasTitle = needLandId.filter((_, i) => {
            if (!balResults[i].success) return false;
            const [bal] = ltIface.decodeFunctionResult('balanceOf', balResults[i].returnData);
            return bal > 0n;
          });

          // Step 1b: batch tokenOfOwnerByIndex for borrowers who have a title
          if (hasTitle.length > 0) {
            const tidCalls = hasTitle.map(l => [_ltAddr, ltIface.encodeFunctionData('tokenOfOwnerByIndex', [l.borrower, 0])]);
            const tidResults = await mc.tryAggregate.staticCall(false, tidCalls);
            for (let k = 0; k < hasTitle.length; k++) {
              const l = hasTitle[k];
              if (!tidResults[k].success) continue;
              const [tid] = ltIface.decodeFunctionResult('tokenOfOwnerByIndex', tidResults[k].returnData);
              const updated = { ...l, landId: Number(tid) };
              await setDBitem(l.id, updated, 'ActiveLoans');
              fresh[l.id] = updated;
              console.log(`[chainSync] resolved landId: ${l.borrower.slice(0,8)}… → ${Number(tid)}`);
            }
          } else {
            console.log('[chainSync] no borrowers have a land title');
          }
        }

        // Step 2: batch getTitleName for loans with landId but no farmName
        const needName2 = Object.values(fresh).filter(l => l.landId && !l.farmName && !l.chainClosed);
        console.log(`[chainSync] ${needName2.length} loans need farmName after landId resolution`);
        if (needName2.length > 0) {
          const nameCalls = needName2.map(l => [_ltAddr, ltIface.encodeFunctionData('getTitleName', [l.landId])]);
          const nameResults = await mc.tryAggregate.staticCall(false, nameCalls);
          for (let k = 0; k < needName2.length; k++) {
            const l = needName2[k];
            if (!nameResults[k].success) continue;
            const [name] = ltIface.decodeFunctionResult('getTitleName', nameResults[k].returnData);
            if (name) {
              const updated = { ...fresh[l.id] ?? l, farmName: name };
              await setDBitem(l.id, updated, 'ActiveLoans');
              console.log(`[chainSync] ✓ ${l.id.slice(0,8)} landId=${l.landId} → "${name}"`);
            }
          }
        }
      } else {
        console.warn('[chainSync] _ltAddr not set — skipping farm name resolution');
      }

      // Step 3: batch unpackTokenId for every loan carrying a foodTokenId but
      // missing cropFamily and/or sosTs. Resolved once for the whole list
      // here (not lazily per-expanded-row) so the harvest-column
      // crop-adjusted cycle-days estimate — and the portfolio Gantt's start
      // date — are correct for every food-token loan, not just whichever one
      // the user happens to click open. unpackTokenId already returns sosTs
      // alongside cropCode (see ActiveLoansCard.js's per-row ftData fetch);
      // it used to be decoded and discarded here — now persisted so the
      // portfolio view doesn't need its own separate on-chain round-trip.
      if (_ftAddr) {
        const freshForCrop = await readAllItems('ActiveLoans') ?? {};
        const needCropFamily = Object.values(freshForCrop)
          .filter(l => l.foodTokenId && (l.cropFamily == null || l.sosTs == null) && !l.chainClosed);
        console.log(`[chainSync] ${needCropFamily.length} loans need cropFamily/sosTs resolution`);
        if (needCropFamily.length > 0) {
          const mc = new ethers.Contract(MULTICALL3, MulticallAbi, provider);
          const ftIface = new ethers.Interface(_ftAbi);
          const cropCalls = needCropFamily.map(l => [_ftAddr, ftIface.encodeFunctionData('unpackTokenId', [l.foodTokenId])]);
          const cropResults = await mc.tryAggregate.staticCall(false, cropCalls);
          for (let k = 0; k < needCropFamily.length; k++) {
            const l = needCropFamily[k];
            if (!cropResults[k].success) continue;
            try {
              const unpacked = ftIface.decodeFunctionResult('unpackTokenId', cropResults[k].returnData);
              const combined = Number(unpacked.cropCode ?? unpacked[1] ?? 0);
              const cropFamily = Math.floor(combined / 1000);
              const sosTs = Number(unpacked.sosTs ?? unpacked[2] ?? 0) || null;
              const updated = { ...(freshForCrop[l.id] ?? l), cropFamily, ...(sosTs != null ? { sosTs } : {}) };
              await setDBitem(l.id, updated, 'ActiveLoans');
            } catch (e) {
              console.warn(`[chainSync] unpackTokenId decode failed for ${l.id}:`, e.message);
            }
          }
        }
      } else {
        console.warn('[chainSync] _ftAddr not set — skipping cropFamily resolution');
      }

      // Step 3b: resolve satProjectedEos/health (and, for non-food-token
      // loans, cropFamily too) from the satellite record — free Pinata fetch
      // via recordHash, no wallet/contract call involved, unlike the
      // fee-gated useRecordHash path. Runs for every loan whose recordHash
      // hasn't been resolved yet OR has changed since the last resolve
      // (resolvedRecordHash, stamped by resolveCropFromRecords) — gating on
      // satProjectedEos == null instead would mean a loan's health (a live,
      // changing signal, unlike the largely-static cropFamily/satProjectedEos)
      // never refreshes past its first resolution. Runs for every loan with a
      // recordHash, food-token or not — ActiveLoansCard's harvest date now
      // relies on satProjectedEos exclusively as its estimate tier (the
      // frontend's own flat cycle-days table was removed 2026-08-20), so
      // food-token loans need this too, not just their attested cropFamily.
      {
        const freshForSatCrop = await readAllItems('ActiveLoans') ?? {};
        const needSatCrop = Object.values(freshForSatCrop)
          .filter(l => l.recordHash && !l.chainClosed && (
            l.recordHash !== l.resolvedRecordHash
            // Self-heal loans stuck with satProjectedEos but no satSos — a
            // state a single successful resolveCropFromRecords run can never
            // produce (both come off the same matched cycle), so it only
            // means an earlier run against this exact resolvedRecordHash
            // silently under-extracted (e.g. the cycles-as-object bug fixed
            // 2026-08-21) and got stamped "done" anyway. Re-running against
            // the same hash is safe and cheap (one Pinata read).
            || (l.satProjectedEos != null && l.satSos == null)
          ));
        console.log(`[chainSync] ${needSatCrop.length} loans need satellite projection resolution`);
        await resolveCropFromRecords(needSatCrop);
      }

      // Step 4: resolve foodTokenBatchId for every loan carrying a foodTokenId
      // but no foodTokenBatchId yet. This is the periodic backstop — the fast
      // path (resolving it the moment a loan's foodTokenId first lands from
      // the backend, not up to 20 min later) lives in syncLoansWithBackend,
      // which calls the same resolveFoodTokenBatchIds() helper directly.
      if (_ftAddr) {
        const freshForBatch = await readAllItems('ActiveLoans') ?? {};
        const needBatchId = Object.values(freshForBatch)
          .filter(l => l.foodTokenId && l.foodTokenBatchId == null && !l.chainClosed);
        console.log(`[chainSync] ${needBatchId.length} loans need foodTokenBatchId resolution`);
        await resolveFoodTokenBatchIds(needBatchId, provider);
      } else {
        console.warn('[chainSync] _ftAddr not set — skipping foodTokenBatchId resolution');
      }

      // Invalidate the main query so UI re-reads from IndexedDB
      queryClient.invalidateQueries({ queryKey: ['activeLoans', unionAddress] });

      return { syncedAt: Date.now(), count: loanIds.length };
    },
    enabled: enabled && !!unionAddress && !!provider && !!genericFundViewerAddress,
    staleTime: CHAIN_SYNC_INTERVAL_MS,
    refetchInterval: CHAIN_SYNC_INTERVAL_MS,
  });

  // Manual refresh: bypass the sync throttle and explicitly kick off a
  // backend sync + chain sync. This is the one path that should always hit
  // the network, since the user explicitly asked for fresh data.
  const refreshFromChain = useCallback(() => {
    forceLoansResync(unionAddress);
    syncLoansWithBackend(unionAddress, queryClient);
    queryClient.invalidateQueries({ queryKey: ['activeLoansChainSync', unionAddress] });
  }, [queryClient, unionAddress]);

  return { ...chainSync, refreshFromChain };
}
