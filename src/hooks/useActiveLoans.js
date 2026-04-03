import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { setDBitem, readAllItems } from '../utils/db';
import { useProvider } from './useWallet.ts';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
import MulticallAbi from '../components/ABI/MultiCall3.json';

const genericFundViewerAbi = genericFundViewerArtifact.abi;
const genericFundViewerAddress = process.env.REACT_APP_VIEWER_MAIN;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
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
  fund: i.fund,
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

          // Upsert ONLY new loans (don't overwrite chain-synced records)
          for (const item of backendItems) {
            if (!stored[item.id]) {
              try { await setDBitem(item.id, item, 'ActiveLoans'); } catch (_) {}
              stored[item.id] = item;
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

        const [, ret] = await mc.aggregate.staticCall(calls);

        for (let j = 0; j < batch.length; j++) {
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
          } = viewerIface.decodeFunctionResult('getBorrowerInfo', ret[j]);

          const id = batch[j];
          const existing = stored[id] ?? {};

          if (closed || defaulted) {
            // Flag as closed — don't delete, so UI can show warning
            const flagged = {
              ...existing,
              chainVerified: true,
              chainClosed: true,
              active: false,
              defaulted: Boolean(defaulted),
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
