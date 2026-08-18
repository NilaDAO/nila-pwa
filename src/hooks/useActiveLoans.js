import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { setDBitem, readAllItems, deleteItem } from '../utils/db';
import { useProvider } from './useWallet.ts';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
import MulticallAbi from '../components/ABI/MultiCall3.json';
import landTitleArtifact from '../components/ABI/NilaLandTitleWithName.json';

const genericFundViewerAbi = genericFundViewerArtifact.abi;
const genericFundViewerAddress = process.env.REACT_APP_VIEWER_MAIN;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const _ltAbi = landTitleArtifact.abi ?? landTitleArtifact;
const _ltAddr = process.env.REACT_APP_LAND_TITLE_MAIN;
const DECIMALS = 18;
const BATCH_SIZE = 50;

// `staleTime` below only lives in-memory — a full page reload wipes it and
// forces a fresh /loans/sync round-trip every time. Mirror the same cadence
// in localStorage so reloads within the window skip the backend push/pull
// and just read IndexedDB (already the display source of truth).
const SYNC_THROTTLE_MS = 5 * 60 * 1000;
const lastSyncKey = (union) => `nila_loans_lastSync_${union}`;

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
  // chain sync metadata — not yet verified
  chainVerified: false,
  chainClosed: false,
});

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
 */
function syncLoansWithBackend(unionAddress, queryClient) {
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
        for (const item of backendItems) {
          const existing = stored[item.id];
          if (!existing) {
            if (isKnownClosed(unionAddress, item.id)) {
              console.log(`[activeLoans] SKIP re-adding known-closed loan ${item.id.slice(0,8)}`);
              continue;
            }
            // Brand-new loan from backend
            try { await setDBitem(item.id, item, 'ActiveLoans'); } catch (_) {}
            stored[item.id] = item;
            console.log(`[activeLoans] NEW ${item.id.slice(0,8)} landId=${item.landId}`);
          } else if (!existing.chainVerified) {
            // Backend has fresher data than our un-verified local copy
            const merged = { ...existing, ...item };
            try { await setDBitem(item.id, merged, 'ActiveLoans'); } catch (_) {}
            stored[item.id] = merged;
            console.log(`[activeLoans] MERGE (unverified) ${item.id.slice(0,8)} landId=${merged.landId}`);
          } else {
            // Chain-verified — backfill landId/farmName from backend if missing locally
            const patch = {};
            if (item.landId && !existing.landId) patch.landId = item.landId;
            if (item.farmName && !existing.farmName) patch.farmName = item.farmName;
            if (Object.keys(patch).length) {
              const patched = { ...existing, ...patch };
              try { await setDBitem(item.id, patched, 'ActiveLoans'); } catch (_) {}
              stored[item.id] = patched;
              console.log(`[activeLoans] BACKFILL ${item.id.slice(0,8)}`, patch);
            } else {
              console.log(`[activeLoans] SKIP ${item.id.slice(0,8)} landId=${existing.landId} farmName=${existing.farmName}`);
            }
          }
        }
        localStorage.setItem(syncKey, String(Date.now()));
      }
    } catch (_) { /* backend offline — IndexedDB stays the source of truth */ }

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

  useEffect(() => {
    if (!enabled || !unionAddress) return;
    syncLoansWithBackend(unionAddress, queryClient);
    const id = setInterval(() => syncLoansWithBackend(unionAddress, queryClient), SYNC_THROTTLE_MS);
    return () => clearInterval(id);
  }, [enabled, unionAddress, queryClient]);

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

      // Invalidate the main query so UI re-reads from IndexedDB
      queryClient.invalidateQueries({ queryKey: ['activeLoans', unionAddress] });

      return { syncedAt: Date.now(), count: loanIds.length };
    },
    enabled: enabled && !!unionAddress && !!provider && !!genericFundViewerAddress,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
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
