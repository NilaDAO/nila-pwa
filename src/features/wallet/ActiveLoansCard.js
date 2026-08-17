import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';
import { ClaimButton } from '../../components/UI/buttons';
import { useWallet, useContract } from '../../hooks/useWallet.ts';
import { runTx } from '../../utils/runTx.ts';
import { setDBitem } from '../../utils/db.js';
import { ethers } from 'ethers';
import landTitleArtifact from '../../components/ABI/NilaLandTitleWithName.json';
import foodTokenArtifact from '../../components/ABI/FoodTokens.json';
import { CROP_CODE_NAMES } from '../../hooks/useFoodTokenBatches.ts';

const _ltAbi = (landTitleArtifact).abi ?? landTitleArtifact;
const _ftAbi = (foodTokenArtifact).abi ?? foodTokenArtifact;
const _ltAddr = process.env.REACT_APP_LAND_TITLE_MAIN;
const _ftAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;
const _ninAddr = process.env.REACT_APP_NIN_MAIN;
const _erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const DAY_MS = 86_400_000;
const SWIPE_REVEAL  = 60;
const SWIPE_TRIGGER = 80;
const SWIPE_MAX     = 160;

const formatDate = (ts) => {
  if (!ts) return '--';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
};

/** Days from now to an ISO date string (positive = future, negative = past) */
const daysToDate = (isoDate) => {
  if (!isoDate) return null;
  const target = new Date(isoDate + 'T00:00:00Z').getTime();
  return Math.round((target - Date.now()) / DAY_MS);
};

/**
 * Format an ISO date as "mid Jan '26", "early Mar", "late Nov '25".
 * Omits year if it matches the current year.
 */
const formatEosDate = (isoDate) => {
  if (!isoDate) return '--';
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late';
  const yearStr = year !== new Date().getFullYear() ? ` '${String(year).slice(2)}` : '';
  return `${part} ${month}${yearStr}`;
};

/** Format a predicted harvest range as "Jun-Aug" or "Jun-Aug '26". */
const formatPredictedRange = (earliest, latest) => {
  if (!earliest) return '--';
  const fmt = (iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  };
  const yearStr = (() => {
    const y = new Date(latest + 'T00:00:00Z').getUTCFullYear();
    return y !== new Date().getFullYear() ? ` '${String(y).slice(2)}` : '';
  })();
  return latest ? `${fmt(earliest)}-${fmt(latest)}${yearStr}` : `${fmt(earliest)}${yearStr}`;
};

/** Row background: orange when past maturity (grace period), red when default deadline <1 week away (maturityTs + 21 days). */
const eosRowBg = (daysToMaturity, chainClosed) => {
  if (chainClosed) return 'bg-red-50 dark:bg-red-900/20 opacity-60';
  if (daysToMaturity == null) return 'bg-gray-50 dark:bg-slate-700';
  if (daysToMaturity < -14) return 'bg-red-50 dark:bg-red-900/20';
  if (daysToMaturity < 0)   return 'bg-orange-50 dark:bg-orange-900/20';
  return 'bg-gray-50 dark:bg-slate-700';
};

/** Status icon: maturity overdue > chain verification status */
function StatusIcon({ loan }) {
  if (loan.chainClosed) {
    return <XCircleIcon className="w-4 h-4 text-black dark:text-white" title="Closed on-chain" />;
  }
  if (loan.daysToMaturity != null && loan.daysToMaturity < -14) {
    return <ExclamationTriangleIcon className="w-4 h-4 text-red" title="Default deadline within 1 week" />;
  }
  if (loan.daysToMaturity != null && loan.daysToMaturity < 0) {
    return <ExclamationTriangleIcon className="w-4 h-4 text-orange dark:text-orange-400" title="Past maturity" />;
  }
  if (loan.chainVerified) {
    return <CheckCircleIcon className="w-4 h-4 text-green dark:text-green_dark" title="Verified on-chain" />;
  }
  return <ExclamationTriangleIcon className="w-4 h-4 text-amber dark:text-amber-300" title="Not yet verified" />;
}

const COLUMNS = [
  { key: 'name',   label: 'Name',   align: 'left' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'eos',    label: 'Harvest', align: 'right' },
  { key: 'status', label: '',       align: 'right' },
];

const SYNC_STEPS = [
  { blocks: 43_200,     label: '24h' },
  { blocks: 1_296_000,  label: '1 month' },
  { blocks: 3_888_000,  label: '3 months' },
  { blocks: 7_776_000,  label: '6 months' },
  { blocks: 15_552_000, label: '12 months' },
];

function SortIcon({ active, dir }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ChevronUpIcon className="w-3 h-3 inline ml-0.5" />
    : <ChevronDownIcon className="w-3 h-3 inline ml-0.5" />;
}

/**
 * Sortable active loans list for union leaders.
 *
 * Simplified: Name | Amount | Status icon
 * Click row to expand: rate, EOS date, crop health, milestone, chain verification
 * Reload button triggers manual Multicall3 chain sync.
 */
/**
 * Sortable active loans list for union leaders, grouped by fund type.
 *
 * Simplified: Name | Amount | Status icon
 * Click row to expand: rate, EOS date, crop health, milestone, chain verification
 * Fund dropdown filters by fund type. Reload button triggers manual chain sync.
 *
 * Props:
 *   loans       — allItems from useActiveLoans (includes chainClosed)
 *   fundMap     — Map<bytes32, name> built from unionFunds
 *   fundLentMap — Map<bytes32, totalLent> from getFundTotalsByTranche (chain)
 *   resolveName — from useContactBook
 *   hasName     — from useContactBook
 *   onAddContact — (address, suggestedName?) => void
 *   onRefresh   — () => void triggers chain sync
 *   refreshing  — boolean
 *   onDeepSync  — (lookbackBlocks) => Promise — calls POST /reset_active_loans
 */
export default function ActiveLoansCard({
  loans = [],
  fundMap = new Map(),
  fundLentMap = new Map(),
  eosMap = new Map(),
  resolveName,
  hasName,
  onAddContact,
  onRefresh,
  refreshing,
  onDeepSync,
  onCashIn,
  onCashOut,
  onAcceptPending,
  onDenyPending,
  onViewMap,
  collectDeadline,
  unionAddress,
  cashOutDisabled = false,
}) {
  const [sortKey, setSortKey] = useState('eos');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedFund, setSelectedFund] = useState('all');
  const [fundOpen, setFundOpen] = useState(false);
  const fundRef = useRef(null);
  const [syncStep, setSyncStep] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [keyMode, setKeyMode] = useState(null);   // null | 'confirm'
  const [keysPurchased, setKeysPurchased] = useState(false);
  const [quotedFee, setQuotedFee] = useState(null); // per-token fee in wei, null = not yet quoted
  const { wallet } = useWallet();
  const landTitle = useContract(_ltAddr, _ltAbi, wallet);
  const foodToken = useContract(_ftAddr, _ftAbi, wallet);
  const nin = useContract(_ninAddr, _erc20Abi, wallet);
  const [ftData, setFtData] = useState({}); // { loanId: { cropName, kg, sosTs, harvestTs } }
  const [copiedId, setCopiedId] = useState(null);

  // Per-loan collect-deadline window check.
  // Within window (drawdownTs + collectDeadline > now): swipe right → cash-out (DISBURSE more).
  // Outside window: swipe left → repay.
  const isInCollectWindow = useCallback((loan) => {
    if (!collectDeadline || !loan?.drawdownTs) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec - Number(loan.drawdownTs) < Number(collectDeadline);
  }, [collectDeadline]);

  // Pending = slow-draw loan claimed on-chain but not yet approved by the union
  // (drawdownTs is null/0). Swipe right → accept, swipe left → deny.
  const isPending = useCallback((loan) => (
    loan?.active && !loan?.chainClosed && !loan?.drawdownTs && !loan?.fastDraw
  ), []);

  // Swipe: left = repay (only outside window), right = cash-out (only inside window)
  const [swipe, setSwipe] = useState({ id: null, dx: 0 });
  const swipeRef  = useRef({ startX: null, id: null, dragging: false, allowLeft: false, allowRight: false });
  const swipeDxRef = useRef(0);
  const wasSwipingRef = useRef(false);

  // A loan is "fully cashed out" when CashOutForm has observed the borrower's
  // wallet at zero nIN and persisted that into IDB. Once flagged, swipe-right
  // (cash-out) is disabled — there's nothing left to disburse — and swipe-left
  // (repay) becomes the only meaningful action even inside the collect window.
  const isFullyCashedOut = useCallback((loan) => (
    loan?.borrowerNinBal === 0 && Boolean(loan?.borrowerNinBalCheckedAt)
  ), []);

  const onSwipeTouchStart = useCallback((e, loan) => {
    const pending = isPending(loan);
    const inWindow      = isInCollectWindow(loan);
    const fullyCashedOut = isFullyCashedOut(loan);
    swipeRef.current = {
      startX: e.touches[0].clientX,
      id: loan.id,
      dragging: false,
      // Pending row: right = accept, left = deny — both always allowed.
      // Drawn row: same as before (repay outside window, cash-out inside).
      allowLeft:  pending ? Boolean(onDenyPending)   : (!inWindow || fullyCashedOut),
      allowRight: pending ? Boolean(onAcceptPending) : (inWindow && !fullyCashedOut && !cashOutDisabled),
    };
  }, [isPending, isInCollectWindow, isFullyCashedOut, onDenyPending, onAcceptPending, cashOutDisabled]);

  const onSwipeTouchMove = useCallback((e) => {
    const { startX, id } = swipeRef.current;
    if (startX === null) return;
    const delta = e.touches[0].clientX - startX;
    if (!swipeRef.current.dragging && Math.abs(delta) < 8) return;
    swipeRef.current.dragging = true;
    wasSwipingRef.current = true;
    // Always allow visual swipe in both directions — disabled side reveals an "unavailable" message.
    const dx = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, delta * 0.8));
    swipeDxRef.current = dx;
    setSwipe({ id, dx });
  }, []);

  const onSwipeTouchEnd = useCallback((loan) => {
    const dx = swipeDxRef.current;
    const { allowLeft, allowRight } = swipeRef.current;
    const pending = isPending(loan);
    swipeRef.current = { startX: null, id: null, dragging: false, allowLeft: false, allowRight: false };
    swipeDxRef.current = 0;
    setSwipe({ id: null, dx: 0 });
    if (dx < -SWIPE_TRIGGER && allowLeft) {
      if (pending) onDenyPending?.(loan); else onCashIn?.(loan);
    } else if (dx > SWIPE_TRIGGER && allowRight) {
      if (pending) onAcceptPending?.(loan); else onCashOut?.(loan);
    }
  }, [isPending, onCashIn, onCashOut, onAcceptPending, onDenyPending]);

  // Close fund dropdown on outside click
  useEffect(() => {
    if (!fundOpen) return;
    const handler = (e) => {
      if (fundRef.current && !fundRef.current.contains(e.target)) setFundOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [fundOpen]);

  const handleSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  // Normalize fund to always have 0x prefix
  const normFund = (f) => (!f ? '' : f.startsWith('0x') ? f : `0x${f}`);

  // Unique fund keys from loans
  const fundKeys = useMemo(() => {
    const keys = new Set();
    for (const l of loans) {
      if (l.fund) keys.add(normFund(l.fund));
    }
    return Array.from(keys);
  }, [loans]);

  // Split into pending (claimed, awaiting leader approval), active (drawn), flagged (closed).
  const { pending, active, flagged } = useMemo(() => {
    const p = [], a = [], f = [];
    for (const l of loans) {
      if (selectedFund !== 'all' && normFund(l.fund) !== selectedFund) continue;
      if (l.chainClosed) { f.push(l); }
      else if (l.active && !l.drawdownTs && !l.fastDraw) { p.push(l); }
      else if (l.drawdownTs && l.active) { a.push(l); }
    }
    return { pending: p, active: a, flagged: f };
  }, [loans, selectedFund]);

  const enriched = useMemo(() =>
    [...pending, ...active, ...flagged].map((l) => {
      const _isPending = isPending(l);
      const eos = eosMap.get(l.id);
      // Primary: maturityTs from chain. Fallback: EOS from satellite API.
      const maturityDate = l.maturityTs
        ? new Date(Number(l.maturityTs) * 1000).toISOString().slice(0, 10)
        : null;
      const satelliteEos = eos?.eos_date ?? null;
      const predictedEarliest = eos?.predicted_eos_earliest ?? null;
      const predictedLatest = eos?.predicted_eos_latest ?? null;
      // Harvest column: satellite EOS is the actual harvest date, maturityTs is the loan deadline
      const eosDate = satelliteEos || maturityDate;
      const daysEos = daysToDate(eosDate) ?? daysToDate(predictedEarliest);
      const daysToMaturity = daysToDate(maturityDate); // null if no contract deadline
      // Display priority: contact name → on-chain farm name (tokenURI, cached in IDB) → 0xABCD…
      const hasContact = hasName(l.borrower);
      const contactName = resolveName(l.borrower); // already returns truncated addr if no contact
      const landId = l.landId ?? eos?.land_id ?? null;
      const farmName = l.farmName || eos?.farm_name || null;
      const displayName = hasContact ? contactName : (farmName || contactName);
      return {
        ...l,
        farmName,
        landId,
        hasContact,
        displayName,
        isPending: _isPending,
        // l.amount already equals chain `outstanding` (principal + accrued interest)
        // from useActiveLoans chain sync — don't add interest on top.
        totalAmount: l.amount,
        eosDate,
        maturityDate,
        satelliteEos,
        predictedEarliest,
        predictedLatest,
        daysToEos: daysEos,
        daysToMaturity,
        eosStage: eos?.stage ?? l.activity_stage,
        isOpen: eos?.is_open ?? true,
        eosSource: satelliteEos ? 'satellite' : maturityDate ? 'contract' : predictedEarliest ? 'predicted' : null,
      };
    }),
    [pending, active, flagged, resolveName, eosMap, isPending]
  );

  // Check IndexedDB on mount — if viewing keys cached, show "View on map"
  useEffect(() => {
    import('../../utils/db').then(({ readItem }) => {
      readItem('viewingKeys', 'FarmData').then(cached => {
        const hashes = cached?.value?.hashes || cached?.hashes;
        if (hashes && Object.keys(hashes).length > 0) setKeysPurchased(true);
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  // When a row is expanded and it carries a foodTokenId, fetch on-chain crop / kg / SOS / harvest.
  useEffect(() => {
    if (!expandedId || !foodToken) return;
    const loan = (loans || []).find((l) => l.id === expandedId);
    const tokenId = loan?.foodTokenId;
    if (!tokenId || ftData[expandedId]) return;
    (async () => {
      try {
        const [unpacked, bal, harvestTs] = await Promise.all([
          foodToken.unpackTokenId(tokenId),
          foodToken.balanceOf(loan.borrower, tokenId),
          foodToken.tokenHarvestTs(tokenId),
        ]);
        // SOS is now packed in the tokenId itself; cropCode is the 6-digit codex (family*1000 + variety)
        const combined   = Number(unpacked?.cropCode ?? unpacked?.[1] ?? 0);
        const cropFamily = Math.floor(combined / 1000);
        const variety    = combined % 1000;
        const sosTs      = Number(unpacked?.sosTs ?? unpacked?.[2] ?? 0);
        setFtData((prev) => ({
          ...prev,
          [expandedId]: {
            cropName: CROP_CODE_NAMES[cropFamily] ?? `Crop ${cropFamily}`,
            variety,
            kg: Number(bal),
            sosTs,
            harvestTs: Number(harvestTs),
          },
        }));
      } catch (e) {
        console.warn('[foodToken] read failed:', e.message);
      }
    })();
  }, [expandedId, foodToken, loans, ftData]);

  // Read view fee from contract when user opens the confirm panel
  useEffect(() => {
    if (keyMode !== 'confirm' || !landTitle) return;
    landTitle.viewFeeNin().then(fee => {
      setQuotedFee(fee);
      console.log(`[viewingKeys] fee: ${ethers.formatEther(fee)} nIN/property`);
    }).catch(e => console.warn('[viewingKeys] fee read failed:', e.message));
  }, [keyMode, landTitle]);

  const sorted = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...enriched].sort((a, b) => {
      switch (sortKey) {
        case 'name':   return mul * a.displayName.localeCompare(b.displayName);
        case 'amount': return mul * (a.totalAmount - b.totalAmount);
        case 'eos': {
          // null EOS sorts last; otherwise sort by days-to-EOS (ascending = soonest first)
          const da = a.daysToEos ?? 9999;
          const db = b.daysToEos ?? 9999;
          return mul * (da - db);
        }
        case 'status': {
          const rank = (l) => l.chainClosed ? 2 : l.chainVerified ? 0 : 1;
          return mul * (rank(a) - rank(b));
        }
        default: return 0;
      }
    });
  }, [enriched, sortKey, sortDir]);

  // Accounting check: sum of principals by fund vs chain's total lent
  const accounting = useMemo(() => {
    // group principal sum by fund for active (non-closed) loans in current filter
    const principalByFund = new Map();
    for (const l of active) {
      const key = normFund(l.fund) || 'unknown';
      const outstanding = (l.principal != null && l.principalRepaid != null)
        ? l.principal - l.principalRepaid
        : l.amount ?? 0;
      principalByFund.set(key, (principalByFund.get(key) ?? 0) + outstanding);
    }

    const results = [];
    for (const [fundKey, sumPrincipal] of principalByFund) {
      const chainLent = fundLentMap.get(fundKey);
      if (chainLent == null) continue; // no chain data yet
      const diff = Math.abs(chainLent - sumPrincipal);
      const match = diff < 1; // within ₹1 tolerance (rounding)
      results.push({
        fundKey,
        fundName: fundMap.get(fundKey) || fundKey,
        sumPrincipal,
        chainLent,
        diff,
        match,
      });
    }
    return results;
  }, [active, fundLentMap, fundMap]);

  const hasMismatch = accounting.some((a) => !a.match);

  // Debug: log the accounting breakdown so mismatches can be diagnosed from
  // the console without another backend round-trip — which loans and which
  // fund are actually driving the "off" figure.
  useEffect(() => {
    if (!accounting.length) return;
    for (const a of accounting) {
      console.log(
        `[accounting] fund=${a.fundName} (${a.fundKey}) chainLent=${a.chainLent} ` +
        `sumPrincipal=${a.sumPrincipal} diff=${a.diff} match=${a.match}`
      );
    }
    if (hasMismatch) {
      const byFund = new Map();
      for (const l of active) {
        const key = normFund(l.fund) || 'unknown';
        if (!byFund.has(key)) byFund.set(key, []);
        const outstanding = (l.principal != null && l.principalRepaid != null)
          ? l.principal - l.principalRepaid
          : l.amount ?? 0;
        byFund.get(key).push({ id: l.id, borrower: l.borrower, outstanding });
      }
      for (const [fundKey, rows] of byFund) {
        console.log(`[accounting] loans in fund=${fundKey}:`, rows);
      }
      // Pending (claimed on-chain, not yet drawdownTs-approved) loans are excluded
      // from `active` and therefore from sumPrincipal above — if the chain's
      // fund total already counts a claimed-but-undrawn loan, that's exactly
      // where a persistent gap would come from.
      if (pending.length) {
        console.log(
          '[accounting] pending (excluded from sumPrincipal):',
          pending.map((l) => ({ id: l.id, borrower: l.borrower, fund: normFund(l.fund), amount: l.amount }))
        );
      }
    }
  }, [accounting, hasMismatch, active, pending]);

  // Reset sync step when mismatch resolves
  useEffect(() => {
    if (!hasMismatch && syncStep > 0) setSyncStep(0);
  }, [hasMismatch, syncStep]);

  const handleDeepSync = useCallback(async () => {
    if (!onDeepSync || syncStep >= SYNC_STEPS.length) return;
    const step = SYNC_STEPS[syncStep];

    setSyncing(true);
    try {
      await onDeepSync(step.blocks);

      setSyncStep((s) => s + 1);
      onRefresh?.();
    } catch (err) {
      console.error('[ActiveLoans] deep sync failed:', err);
    }
    setSyncing(false);
  }, [onDeepSync, syncStep, onRefresh]);

  // Empty state: no loans synced yet — show sync bar so leader can scan events
  if (!loans.length) {
    return (
      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            Active Loans <span className="font-normal">(0)</span>
          </p>
          <button
            onClick={onRefresh}
            disabled={refreshing || syncing}
            className="p-1 rounded-full active:scale-90 transition-transform"
            title="Refresh from chain"
          >
            <ArrowPathIcon className={`w-4 h-4 dark:text-slate-400 text-gray-500 ${(refreshing || syncing) ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-3">
          No loans synced yet.
        </p>
        <div data-tour="loan-sync" className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-slate-600">
          <span className="text-[10px] text-gray-500 dark:text-slate-400">Scan chain events</span>
          <button
            onClick={handleDeepSync}
            disabled={syncing || syncStep >= SYNC_STEPS.length}
            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-black dark:bg-white text-white dark:text-gray-800 active:scale-95 disabled:opacity-40"
          >
            {syncing
              ? 'Scanning…'
              : syncStep >= SYNC_STEPS.length
                ? 'No loans found'
                : `Scan ${SYNC_STEPS[syncStep].label}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {/* Header: title + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
          Active Loans
          <span className="font-normal ml-1">
            ({active.length}
            {pending.length > 0 ? ` + ${pending.length} awaiting` : ''}
            {flagged.length > 0 ? ` + ${flagged.length} closed` : ''})
          </span>
        </p>
        <button
          onClick={onRefresh}
          disabled={refreshing || syncing}
          className="p-1 rounded-full active:scale-90 transition-transform"
          title="Refresh from chain"
        >
          <ArrowPathIcon className={`w-4 h-4 dark:text-slate-400 text-gray-500 ${(refreshing || syncing) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Fund filter dropdown + viewing keys */}
      {fundKeys.length > 0 && !keyMode && (
        <div className="flex gap-2">
        <div ref={fundRef} className="relative flex-1">
          <button
            onClick={() => setFundOpen((o) => !o)}
            className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white text-left flex items-center justify-between"
          >
            <span>{selectedFund === 'all' ? 'All funds' : (fundMap.get(selectedFund) || selectedFund)}</span>
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${fundOpen ? 'rotate-180' : ''}`} />
          </button>
          {fundOpen && (
            <div className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg overflow-hidden">
              {[{ key: 'all', label: 'All funds' }, ...fundKeys.map((k) => ({ key: k, label: fundMap.get(k) || k }))].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setSelectedFund(opt.key); setFundOpen(false); }}
                  className={`w-full text-left text-xs px-3 py-1.5 ${
                    selectedFund === opt.key
                      ? 'bg-gray-100 dark:bg-slate-600 font-semibold'
                      : 'active:bg-gray-50 dark:active:bg-slate-600'
                  } dark:text-white`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {keysPurchased ? (
          <button
            onClick={() => onViewMap?.(enriched)}
            className="text-xs px-3 py-1.5 rounded-lg border border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-bold active:scale-95 whitespace-nowrap"
          >View on map</button>
        ) : (
          <>
          <button
            onClick={() => onViewMap?.(enriched, { outlinesOnly: true })}
            disabled={!active.length}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white font-bold active:scale-95 disabled:opacity-30 whitespace-nowrap"
            title="See property outlines only — free, no records"
          >Outlines</button>
          <button
            onClick={() => setKeyMode('confirm')}
            disabled={!active.length}
            className="text-xs px-3 py-1.5 rounded-lg border border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-bold active:scale-95 disabled:opacity-30 whitespace-nowrap"
          >Buy keys</button>
          </>
        )}
        </div>
      )}

      {/* Buy viewing keys — inline confirm */}
      {keyMode === 'confirm' && (
        <div data-tour="viewing-keys" className="flex flex-col gap-2 py-2">
          <div className="flex justify-end">
            <button
              onClick={() => setKeyMode(null)}
              className="text-gray-400 dark:text-slate-400 text-sm px-1 active:scale-95"
            >✕</button>
          </div>
          <p className="text-[10px] dark:text-slate-300">
            A viewing key unlocks each member's <span className="font-bold dark:text-white">real-life farm record</span> — harvest timing, yield and crop health, verified from the field and satellite imagery. Property outlines are always free to view (see below).
          </p>
          <p className="text-[10px] dark:text-slate-300">
            Pay up to <span className="font-bold dark:text-white">{quotedFee != null ? `${ethers.formatEther(quotedFee * BigInt(active.length))} nIN` : '...'}</span> for {active.length} members ({quotedFee != null ? `${ethers.formatEther(quotedFee)}/property` : 'quoting...'}). Properties without farm data on-chain are skipped automatically. 80% of the revenue goes directly to the farmer.
          </p>
          <button
            onClick={() => { setKeyMode(null); onViewMap?.(enriched, { outlinesOnly: true }); }}
            className="self-start text-[11px] text-gray-500 dark:text-slate-400 underline active:scale-95"
          >See property outlines only (free)</button>
          <ClaimButton
            title={quotedFee != null ? `Pay up to ${ethers.formatEther(quotedFee * BigInt(active.length))} nIN` : 'Quoting...'}
            pendingTitle="Signing..."
            successTitle="Keys acquired"
            handleClick={async () => {
              if (!landTitle || !wallet || !nin) throw new Error('Wallet not ready');

              // 1. Resolve land_ids from loan data (backend /loans/sync)
              //    Chain fallback for loans without land_id
              const landIds = [];
              const seen = new Set();
              for (const l of active) {
                if (l.landId && !seen.has(l.landId)) {
                  seen.add(l.landId);
                  landIds.push(l.landId);
                } else if (!l.landId && l.borrower && !seen.has(l.borrower)) {
                  seen.add(l.borrower);
                  try {
                    const bal = await landTitle.balanceOf(l.borrower);
                    if (bal > 0n) {
                      const tid = Number(await landTitle.tokenOfOwnerByIndex(l.borrower, 0));
                      if (!seen.has(tid)) { seen.add(tid); landIds.push(tid); }
                      console.log(`[viewingKeys] chain: ${l.borrower.slice(0,8)}... → ${tid}`);
                    }
                  } catch (e) {
                    console.warn(`[viewingKeys] resolve failed ${l.borrower.slice(0,8)}...`);
                  }
                }
              }

              // 2. Use quoted fee (already fetched on panel open)
              const fee = quotedFee ?? await landTitle.quoteViewFee(landIds[0], wallet.address);
              const maxWei = fee * BigInt(landIds.length);
              console.log('[viewingKeys] landIds:', landIds, 'fee:', fee.toString(), 'max:', maxWei.toString());

              // 3. Approve max — needed for staticCall simulation
              if (maxWei > 0n) {
                const allowance = await nin.allowance(wallet.address, _ltAddr);
                if (allowance < maxWei) {
                  await runTx(() => nin.approve(_ltAddr, maxWei));
                }
              }

              // 4. Free staticCall to discover which IDs have hashes
              const hashes = await landTitle.getRecordHashBatch.staticCall(landIds);
              const validIds = [];
              const hashMap = {};
              for (let i = 0; i < landIds.length; i++) {
                const hash = hashes[i];
                if (hash && hash !== ethers.ZeroHash) {
                  validIds.push(landIds[i]);
                  hashMap[landIds[i]] = hash;
                }
              }

              // 5. Only pay for properties that actually have data
              if (validIds.length > 0) {
                const paidWei = fee * BigInt(validIds.length);
                console.log(`[viewingKeys] paying for ${validIds.length}/${landIds.length} (${ethers.formatEther(paidWei)} nIN, skipped ${landIds.length - validIds.length} empty)`);
                await runTx(() => landTitle.getRecordHashBatch(validIds));
              } else {
                console.warn('[viewingKeys] no properties have hashes — nothing to pay for');
              }

              await setDBitem('viewingKeys', { hashes: hashMap, ts: Date.now() }, 'FarmData');

              // Log for visual verification
              console.log('[viewingKeys] ── Hashes ──');
              console.table(hashMap);
              console.log(`[viewingKeys] ${validIds.length}/${landIds.length} stored`);

              setKeysPurchased(true);
              setKeyMode(null);
            }}
          />
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_6rem_5.5rem_1rem] gap-3 px-3 py-1">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => col.key && handleSort(col.key)}
            className={`text-[10px] font-semibold uppercase tracking-wide dark:text-slate-400 text-gray-500 ${
              col.align === 'right' ? 'text-right' : 'text-left'
            }`}
          >
            {col.label}
            <SortIcon active={sortKey === col.key} dir={sortDir} />
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
        {sorted.map((loan) => (
          <div key={loan.id}>
            {/* Collapsed row — swipeable */}
            {(() => {
              const isTarget = swipe.id === loan.id;
              const dx = isTarget ? swipe.dx : 0;
              const leftPct  = Math.min(1, Math.max(0, -dx / SWIPE_REVEAL));
              const rightPct = Math.min(1, Math.max(0,  dx / SWIPE_REVEAL));
              const pendingRow     = loan.isPending;
              const inWindow       = isInCollectWindow(loan);
              const fullyCashedOut = isFullyCashedOut(loan);
              // Pending: right=accept (green), left=deny (red). Both always enabled.
              // Drawn: right=cash-out (blue) when in window, left=repay (green) outside window.
              const leftAllowed  = pendingRow ? Boolean(onDenyPending)   : (!inWindow || fullyCashedOut);
              const rightAllowed = pendingRow ? Boolean(onAcceptPending) : (inWindow && !fullyCashedOut && !cashOutDisabled);
              const leftBg = pendingRow
                ? `rgba(239,68,68,${leftPct * 0.9})`      // red — deny
                : (leftAllowed
                    ? `rgba(34,197,94,${leftPct * 0.9})`     // green — repay
                    : `rgba(107,114,128,${leftPct * 0.9})`); // gray
              const rightBg = pendingRow
                ? `rgba(34,197,94,${rightPct * 0.9})`     // green — accept
                : (rightAllowed
                    ? `rgba(59,130,246,${rightPct * 0.9})`   // blue — cash out
                    : `rgba(107,114,128,${rightPct * 0.9})`); // gray
              const leftLabel  = pendingRow
                ? 'Deny'
                : (leftAllowed ? 'Repay' : 'Repay later');
              const rightLabel = pendingRow
                ? 'Accept'
                : (rightAllowed
                    ? 'Cash out'
                    : cashOutDisabled ? 'Settling'
                    : (fullyCashedOut ? 'Cashed out' : 'Cash-out closed'));
              return (
              <div className={`relative overflow-hidden rounded-lg ${loan.maturityTs && !loan.chainClosed && !pendingRow ? 'bg-red/25' : ''}`}>
                {/* Left reveal — repay (drawn) / deny (pending) */}
                {leftPct > 0 && (
                  <div
                    className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-3 rounded-lg"
                    style={{ width: 100, backgroundColor: leftBg }}
                  >
                    <span className="text-white text-[10px] font-bold text-right leading-tight" style={{ opacity: leftPct }}>
                      {leftLabel}
                    </span>
                  </div>
                )}
                {/* Right reveal — cash-out (drawn) / accept (pending) */}
                {rightPct > 0 && (
                  <div
                    className="absolute left-0 top-0 bottom-0 flex items-center justify-start pl-3 rounded-lg"
                    style={{ width: 110, backgroundColor: rightBg }}
                  >
                    <span className="text-white text-[10px] font-bold leading-tight" style={{ opacity: rightPct }}>
                      {rightLabel}
                    </span>
                  </div>
                )}
                <div
                  onTouchStart={(e) => onSwipeTouchStart(e, loan)}
                  onTouchMove={onSwipeTouchMove}
                  onTouchEnd={() => onSwipeTouchEnd(loan)}
                  onClick={() => {
                    if (wasSwipingRef.current) { wasSwipingRef.current = false; return; }
                    setExpandedId(expandedId === loan.id ? null : loan.id);
                  }}
                  style={{
                    transform: `translateX(${dx}px)`,
                    transition: swipeRef.current.dragging ? 'none' : 'transform 0.2s ease',
                  }}
                  className={`grid grid-cols-[1fr_6rem_5.5rem_1rem] gap-3 items-center px-3 py-2.5 rounded-lg cursor-pointer touch-pan-y ${eosRowBg(loan.daysToMaturity, loan.chainClosed)}`}
                >
              {/* Name */}
              <div className="flex items-center gap-1 min-w-0">
                <span className={`text-xs font-semibold dark:text-white truncate ${loan.chainClosed ? 'line-through' : ''}`}>
                  {loan.displayName}
                </span>
                {!loan.hasContact && !loan.chainClosed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddContact(loan.borrower, loan.farmName || null);
                    }}
                    className="text-[10px] text-blue-500 dark:text-blue-400 whitespace-nowrap"
                  >
                    {loan.farmName ? 'edit' : '+add'}
                  </button>
                )}
              </div>

              {/* Amount */}
              <span className={`text-xs font-mono dark:text-white text-right whitespace-nowrap ${loan.chainClosed ? 'line-through' : ''}`}>
                ₹{loan.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>

              {/* EOS date — or "pending" label for unapproved slow-draw loans */}
              {loan.isPending ? (
                <span className="text-[10px] font-bold uppercase tracking-wide text-right text-amber-600 dark:text-amber-300">
                  awaiting
                </span>
              ) : (
                <span className={`text-[10px] font-mono text-right whitespace-nowrap ${
                  loan.daysToMaturity != null && loan.daysToMaturity < -14
                    ? 'text-red dark:text-red font-bold'
                    : loan.daysToMaturity != null && loan.daysToMaturity < 0
                      ? 'text-orange-600 dark:text-orange-400 font-bold'
                      : loan.satelliteEos
                        ? 'text-black dark:text-white'
                        : (loan.eosSource === 'predicted' || loan.daysToEos != null && loan.daysToEos < 0)
                          ? 'text-blue-400 dark:text-blue-300'
                          : 'text-gray-500 dark:text-slate-300'
                }`}>
                  {loan.eosDate
                    ? formatEosDate(loan.eosDate)
                    : formatPredictedRange(loan.predictedEarliest, loan.predictedLatest)}
                </span>
              )}

              {/* Status icon — suppressed for pending rows so column stays clean */}
              {loan.isPending ? <span /> : <StatusIcon loan={loan} />}
                </div>
              </div>
              );
            })()}

            {/* Expanded detail */}
            {expandedId === loan.id && (
              <div className="mx-3 mt-1 mb-2 px-3 py-3 rounded-lg bg-gray-100 dark:bg-slate-600 flex flex-col gap-1.5">
                {!loan.chainClosed && loan.daysToMaturity != null && loan.daysToMaturity < 0 && (
                  <p className={`text-[10px] font-semibold ${loan.daysToMaturity < -14 ? 'text-red dark:text-red' : 'text-orange-600 dark:text-orange-400'}`}>
                    ⚠ Close this loan before it defaults
                    {loan.daysToMaturity < -14
                      ? ` — default deadline passed ${Math.abs(loan.daysToMaturity + 21)} days ago.`
                      : ` — ${21 + loan.daysToMaturity} days left before default.`}
                  </p>
                )}
                {loan.chainClosed && (
                  <p className="text-[10px] text-red dark:text-red">
                    This loan is {loan.defaulted ? 'defaulted' : 'closed'} on-chain but still in the backend list.
                  </p>
                )}

                {/* Header: farm name (#landId) + copy address */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold dark:text-white">
                    {loan.farmName || loan.displayName}
                    {loan.landId != null && (
                      <span className="ml-1 text-gray-500 dark:text-slate-400 font-normal">(#{loan.landId})</span>
                    )}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard?.writeText(loan.borrower);
                      setCopiedId(loan.id);
                      setTimeout(() => setCopiedId((id) => (id === loan.id ? null : id)), 1500);
                    }}
                    className={`flex items-center gap-1 text-[10px] active:scale-90 ${
                      copiedId === loan.id ? 'text-green dark:text-green_dark' : 'text-gray-500 dark:text-slate-300'
                    }`}
                    title="Copy wallet address"
                  >
                    {copiedId === loan.id ? (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        <span className="font-semibold">Copied</span>
                      </>
                    ) : (
                      <ClipboardIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <DetailRow label="Farm score" value={loan.farmerScore ?? '--'} />

                <Divider />
                <DetailRow label="Fund" value={fundMap.get(loan.fund) || loan.fund || '--'} />
                <DetailRow label="Principal" value={`₹${(loan.principal ?? loan.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <DetailRow label="Rate" value={`${(loan.rateBP / 100).toFixed(1)}%`} />

                {loan.foodTokenId && (
                  <>
                    <Divider />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                      Food token #{String(loan.foodTokenId).slice(0, 6)}…{String(loan.foodTokenId).slice(-4)}
                    </span>
                    <DetailRow label="Crop" value={ftData[loan.id]?.cropName ?? '…'} />
                    <DetailRow label="Committed" value={ftData[loan.id]?.kg != null ? `${ftData[loan.id].kg.toLocaleString('en-IN')} kg` : '…'} />
                    <DetailRow label="SOS" value={ftData[loan.id]?.sosTs ? formatDate(ftData[loan.id].sosTs) : '…'} />
                    <DetailRow label="Harvest" value={ftData[loan.id]?.harvestTs ? formatDate(ftData[loan.id].harvestTs) : '…'} />
                  </>
                )}

                <Divider />
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Record</span>
                <span className="text-[10px] text-gray-400 dark:text-slate-400 italic">No record data yet.</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Accounting check footer */}
      {accounting.length > 0 && (
        <div data-tour="loan-sync" className="flex flex-col gap-1.5 px-3 pt-2 border-t border-gray-200 dark:border-slate-600">
          {accounting.map((a) => (
            <div key={a.fundKey} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {a.match
                  ? (
                      <span className="relative inline-flex w-5 h-5">
                        <span className="absolute inset-0 rounded-full bg-green dark:bg-green_dark opacity-60 animate-ping" />
                        <CheckCircleIcon className="relative w-5 h-5 text-green dark:text-green_dark" />
                      </span>
                    )
                  : <ExclamationTriangleIcon className="w-7 h-7 text-red dark:text-amber-400 animate-icon-pulse" />
                }
                <span className="text-[10px] text-gray-500 dark:text-slate-400">{a.fundName}</span>
              </div>
              {a.match ? (
                <span className="text-[10px] font-mono dark:text-slate-400 text-gray-500">
                  ₹{a.chainLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })} lent
                </span>
              ) : (
                <button
                  onClick={handleDeepSync}
                  disabled={syncing || syncStep >= SYNC_STEPS.length}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red dark:bg-amber-400 text-white dark:text-black active:scale-95 disabled:opacity-40"
                >
                  {syncing
                    ? 'Syncing…'
                    : syncStep >= SYNC_STEPS.length
                      ? `₹${a.diff.toLocaleString('en-IN', { maximumFractionDigits: 0 })} off`
                      : `₹${a.diff.toLocaleString('en-IN', { maximumFractionDigits: 0 })} off · sync ${SYNC_STEPS[syncStep].label}`
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[10px] text-gray-500 dark:text-slate-400">{label}</span>
      <span className="text-[10px] font-mono dark:text-white">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-gray-200 dark:border-slate-500" />;
}
