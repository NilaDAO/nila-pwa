import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { setDBitem, readAllItems, deleteItem } from '../utils/db';
import { useProvider } from './useWallet.ts';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
import MulticallAbi from '../components/ABI/MultiCall3.json';
import landTitleArtifact from '../components/ABI/NilaLandTitleWithName.json';
import { decodeMetadataUri } from '../utils/decodeMetadataUri.ts';

const genericFundViewerAbi = genericFundViewerArtifact.abi;
const genericFundViewerAddress = process.env.REACT_APP_VIEWER_MAIN;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const _ltAbi = landTitleArtifact.abi ?? landTitleArtifact;
const _ltAddr = process.env.REACT_APP_LAND_TITLE_MAIN;
const DECIMALS = 18;
const BATCH_SIZE = 50;

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
  // chain sync metadata — not yet verified
  chainVerified: false,
  chainClosed: false,
});

/**
 * Primary hook: reads from IndexedDB (source of truth after chain sync).
 *
 * Sync model (like contacts):
 *   1. Read local IndexedDB
 *   2. Push local active loans to /loans/sync (leader → node merge)
 *   3. Pull merged list back (other leaders' loans included)
 *   4. Upsert new loans into IndexedDB (don't overwrite chain-enriched data)
 *
 * Returns { activeLoans, allItems, count, synced }
 */
export function useActiveLoans(unionAddress, enabled) {
  return useQuery({
    queryKey: ['activeLoans', unionAddress],
    queryFn: async () => {
      const API = process.env.REACT_APP_API_BASE_URL;

      // 1. Read IndexedDB — this IS the display source
      let stored = {};
      try {
        stored = await readAllItems('ActiveLoans') ?? {};
      } catch (_) { /* first run */ }

      // 2. Push local active loans to node, pull merged list back
      let backendCount = 0;
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
          }));

        const res = await fetch(`${API}/loans/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ union: unionAddress, loans: localActive }),
        });

        if (res.ok) {
          const json = await res.json();
          backendCount = json.total ?? 0;
          const backendItems = Array.isArray(json.items)
            ? json.items.map((i) => mapBackendItem(i, unionAddress))
            : [];

          // Upsert new loans AND refresh stale ones (but don't overwrite chain-synced records)
          console.log(`[activeLoans] backend returned ${backendItems.length} items, landIds:`,
            backendItems.filter(i => i.landId).map(i => `${i.id.slice(0,8)}→${i.landId}`));
          for (const item of backendItems) {
            const existing = stored[item.id];
            if (!existing) {
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
        }
      } catch (_) { /* backend offline — use local data */ }

      // 3. Build arrays from IndexedDB
      const allItems = Object.values(stored);
      const activeLoans = allItems.filter(
        (l) => l.drawdownTs && l.active && !l.chainClosed
      );
      const localCount = allItems.length;
      console.log('[activeLoans] loaded:', activeLoans.length, 'active /', allItems.length, 'total');

      return {
        activeLoans,
        allItems,
        count: backendCount || localCount,
        localCount,
        synced: localCount === backendCount || backendCount === 0,
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
            // Call reverted (LoanNotExist) — delete ghost
            try { await deleteItem(id, 'ActiveLoans'); } catch (_) {}
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

          // Ghost row: no principal, no drawdown — expired voucher pre-insert
          if (principal === 0n && drawdownTs === 0n && !closed) {
            try { await deleteItem(id, 'ActiveLoans'); } catch (_) {}
            continue;
          }

          if (closed || defaulted) {
            // Flag as closed — keep for 7 days so UI can show warning, then auto-delete
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

      // Delete stale closed loans older than 7 days
      const STALE_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      for (const id of loanIds) {
        const item = stored[id];
        if (item?.chainClosed && item.closedAt && (now - item.closedAt) > STALE_MS) {
          try { await deleteItem(id, 'ActiveLoans'); } catch (_) {}
        }
      }

      // Resolve landId + farmName from chain for active loans missing them
      console.log('[chainSync] farm name resolution — _ltAddr:', _ltAddr);
      if (_ltAddr) {
        const lt = new ethers.Contract(_ltAddr, _ltAbi, provider);
        const fresh = await readAllItems('ActiveLoans') ?? {};
        const allLoans = Object.values(fresh).filter(l => !l.chainClosed);
        const needLandId = allLoans.filter(l => !l.landId && l.borrower);
        const needName = allLoans.filter(l => l.landId && !l.farmName);
        console.log(`[chainSync] ${allLoans.length} active loans, ${needLandId.length} need landId, ${needName.length} need farmName`);

        // Step 1: resolve landId from chain for loans without one
        for (const l of needLandId) {
          try {
            const bal = await lt.balanceOf(l.borrower);
            if (bal > 0n) {
              const tid = Number(await lt.tokenOfOwnerByIndex(l.borrower, 0));
              const updated = { ...l, landId: tid };
              await setDBitem(l.id, updated, 'ActiveLoans');
              fresh[l.id] = updated;
              console.log(`[chainSync] resolved landId: ${l.borrower.slice(0,8)}… → ${tid}`);
            } else {
              console.log(`[chainSync] no land title for ${l.borrower.slice(0,8)}…`);
            }
          } catch (e) {
            console.warn(`[chainSync] balanceOf failed ${l.borrower.slice(0,8)}…:`, e.message);
          }
        }

        // Step 2: resolve farmName from tokenURI for loans with landId but no farmName
        const needName2 = Object.values(fresh).filter(
          l => l.landId && !l.farmName && !l.chainClosed
        );
        console.log(`[chainSync] ${needName2.length} loans need farmName after landId resolution`);
        for (const l of needName2) {
          try {
            const uri = await lt.tokenURI(l.landId);
            const decoded = await decodeMetadataUri(uri);
            if (decoded?.farm) {
              const updated = { ...fresh[l.id] ?? l, farmName: decoded.farm };
              await setDBitem(l.id, updated, 'ActiveLoans');
              console.log(`[chainSync] ✓ ${l.id.slice(0,8)} landId=${l.landId} → "${decoded.farm}"`);
            }
          } catch (e) {
            console.warn(`[chainSync] tokenURI failed for land ${l.landId}:`, e.message);
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

  // Manual refresh: invalidate both queries — backend re-fetch + chain sync
  const refreshFromChain = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['activeLoans', unionAddress] });
    queryClient.invalidateQueries({ queryKey: ['activeLoansChainSync', unionAddress] });
  }, [queryClient, unionAddress]);

  return { ...chainSync, refreshFromChain };
}
