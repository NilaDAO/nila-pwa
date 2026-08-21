import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useWallet, useContract } from '../../hooks/useWallet.ts';
import foodTokenArtifact from '../../components/ABI/FoodTokens.json';
import { CROP_CODE_NAMES, CROP_CODE_COLOR_KEY } from '../../hooks/useFoodTokenBatches.ts';
import { dismissLoanLocally } from '../../hooks/useActiveLoans.js';
import { cropColor, cropIconUrl } from '../../utils/cropColors';
import { HEALTH_COLOR, HEALTH_LABEL } from '../../utils/loanIssues.js';

const _ftAbi = (foodTokenArtifact).abi ?? foodTokenArtifact;
const _ftAddr = process.env.REACT_APP_FOODTOKEN_ADDRESS;

const DAY_MS = 86_400_000;
const SWIPE_REVEAL  = 60;
const SWIPE_TRIGGER = 80;
const SWIPE_MAX     = 160;

// Extended wording for the expanded row's loan-stage badge only — the
// filter-bar pills stay short (loan.loanStage's own value) since they need
// to fit compactly; this is purely a display-text lookup, not a second
// source of truth (loan.loanStage itself is still the enum-ish short form).
const LOAN_STAGE_LONG_LABEL = {
  Operating: 'Operating Credit line',
  Cultivation: 'Cultivation loan',
  'Pre-harvest': 'Pre-harvest finance',
};

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

// Amber warning window before the payback date — 3 weeks, same grace
// period already baked into eosDate itself (satEOS+3wk / drawdown+3mo+3wk).
// "date minus 3 weeks": amber starts 21 days out, red once daysEos goes
// negative (payback date itself has passed) — no separate escalation
// tier past that, unlike the old -14-day red/orange split this replaces.
const PAYBACK_WARNING_DAYS = 21;

/**
 * Row background: amber inside the 3-week payback warning window, red once
 * the payback date has passed. Fires only when there's a real eosDate —
 * confirmed on-chain maturityTs, or the satellite/minimum-floor payback
 * date — never a fabricated guess (the frontend's flat per-crop cycle-days
 * fallback was removed 2026-08-20). A loan with neither shows as a plain
 * gray row, not a guessed overdue flag.
 */
const eosRowBg = (daysEos, chainClosed) => {
  if (chainClosed) return 'bg-red-50 dark:bg-red-900/20 opacity-60';
  if (daysEos == null) return 'bg-gray-50 dark:bg-slate-700';
  if (daysEos < 0) return 'bg-red-50 dark:bg-red-900/20';
  // Reuses the orange-50/orange-900 pair the old pre-deadline tier already
  // proved out in both themes here — amber-50/amber-900 (tried first) read
  // as plain yellow in light mode and nearly invisible against
  // dark:bg-slate-700 in dark mode.
  if (daysEos <= PAYBACK_WARNING_DAYS) return 'bg-amber-500/50 dark:bg-amber-500/30';
  return 'bg-gray-50 dark:bg-slate-700';
};

/** Status icon: payback-date proximity (amber within 3wk, red once passed) > chain verification status */
function StatusIcon({ loan }) {
  if (loan.chainClosed) {
    return <XCircleIcon className="w-4 h-4 text-black dark:text-white" title="Closed on-chain" />;
  }
  if (loan.daysToEos != null && loan.daysToEos < 0) {
    return <ExclamationTriangleIcon className="w-4 h-4 text-red" title={
      loan.eosSource === 'contract' ? 'Default deadline within 1 week'
        : loan.eosSource === 'minimum' ? 'Minimum repayment period deadline passed'
        : 'Satellite-projected payback deadline passed'
    } />;
  }
  if (loan.daysToEos != null && loan.daysToEos <= PAYBACK_WARNING_DAYS) {
    return <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 dark:text-amber-300" title={
      loan.eosSource === 'contract' ? 'Maturity within 3 weeks'
        : loan.eosSource === 'minimum' ? 'Minimum repayment period ends within 3 weeks'
        : 'Satellite-projected payback date within 3 weeks'
    } />;
  }
  if (loan.chainVerified) {
    return <CheckCircleIcon className="w-4 h-4 text-green dark:text-green_dark" title="Verified on-chain" />;
  }
  return <ExclamationTriangleIcon className="w-4 h-4 text-amber dark:text-amber-300" title="Not yet verified" />;
}

/**
 * Masked crop-family glyph, tinted by cropColor. Renders nothing without a
 * cropColorKey. `dim` fades it (and drops the ring below) to signal a
 * satellite guess rather than a food-token-backed (on-chain-attested) crop —
 * opacity alone was too subtle to read at a glance, so a food-token-backed
 * crop also gets a solid ring around it.
 */
function CropIcon({ cropColorKey, className, dim }) {
  const icon = cropColorKey ? cropIconUrl(cropColorKey) : null;
  if (!icon) return null;
  const hasToken = !dim;
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        boxSizing: 'border-box',
        borderRadius: hasToken ? '9999px' : undefined,
        border: hasToken ? `1.5px solid ${cropColor(cropColorKey)}` : undefined,
        padding: hasToken ? 1.5 : undefined,
      }}
    >
      <span
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          background: cropColor(cropColorKey),
          opacity: dim ? 0.4 : 1,
          WebkitMaskImage: `url(${icon})`,
          maskImage: `url(${icon})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    </span>
  );
}

const COLUMNS = [
  { key: 'name',   label: 'Name',   align: 'left' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'eos',    label: 'Payback', align: 'right' },
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
  // Loan-stage filter (Operating/Cultivation/Pre-harvest) — same
  // tap-to-exclude pattern as staticCards.js's crop filter bar, just keyed
  // by loanStage instead of cropFamily and scoped locally to this list (no
  // shared fieldActivity state to sync with the map here).
  const [stageFilterExcluded, setStageFilterExcluded] = useState(() => new Set());
  const toggleStageFilter = useCallback((key) => {
    setStageFilterExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [syncStep, setSyncStep] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const { wallet } = useWallet();
  const queryClient = useQueryClient();
  const foodToken = useContract(_ftAddr, _ftAbi, wallet);
  const [ftData, setFtData] = useState({}); // { loanId: { cropFamily, cropName, kg, sosTs, harvestTs } }
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
      // Harvest column priority: 1) maturityTs — on-chain, only ever set once
      // manually verified (reportMaturity is currently email-gated, see
      // beats/chain_writer.py) — a real confirmed date, never second-guessed
      // by anything below. 2) otherwise, the LATER of the satellite record's
      // own projection.projected_eos_date (a model projection from the
      // cycle's actual observed NDVI/weather trajectory, computed
      // server-side by NilaSensingAgent — see resolveCropFromRecords in
      // useActiveLoans.js) and a minimum-repayment floor (drawdownTs + 3
      // months + 3 weeks). 2026-08-21: the frontend used to also guess
      // drawdown + a flat per-crop cycle-days table as a full REPLACEMENT
      // estimate, but that diverged from the satellite's own projection by
      // 100-450+ days across this union's loans — removed for that reason
      // (see the 2026-08-20 harvest-column analysis). This floor is
      // different in kind: it never overrides a satellite estimate that's
      // already later, it only guards against a satellite estimate landing
      // implausibly early (before any real minimum repayment period could
      // have elapsed) — so it can't reproduce that divergence, it can only
      // push the shown date later, never earlier, than what satellite says.
      const maturityDate = l.maturityTs
        ? new Date(Number(l.maturityTs) * 1000).toISOString().slice(0, 10)
        : null;
      const satProjectedDate = l.satProjectedEos || null;
      // Payback date, not the bare harvest date — 3 weeks after the
      // satellite's projected harvest, so the loan isn't flagged overdue
      // the instant the crop is ready, before there's been any real chance
      // to sell it and repay. Same grace-period convention as minRepayDate
      // below and the on-chain 'contract' path's 21-day post-maturity
      // grace window. Kept separate from satProjectedDate itself, which
      // stays the raw harvest date for the "Projected harvest" detail row.
      const satPaybackDate = satProjectedDate
        ? (() => {
            const d = new Date(satProjectedDate + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + 21);
            return d.toISOString().slice(0, 10);
          })()
        : null;
      const minRepayDate = l.drawdownTs
        ? (() => {
            const d = new Date(Number(l.drawdownTs) * 1000);
            d.setUTCMonth(d.getUTCMonth() + 3);
            d.setUTCDate(d.getUTCDate() + 21);
            return d.toISOString().slice(0, 10);
          })()
        : null;
      let eosDate = maturityDate;
      let eosSource = maturityDate ? 'contract' : null;
      if (!eosDate) {
        if (minRepayDate && (!satPaybackDate || minRepayDate > satPaybackDate)) {
          eosDate = minRepayDate;
          eosSource = 'minimum';
        } else if (satPaybackDate) {
          eosDate = satPaybackDate;
          eosSource = 'satellite';
        }
      }
      const daysEos = daysToDate(eosDate);
      // Season-start counterpart to eosDate, for the portfolio Gantt (see
      // staticCards.js's PortfolioCards). Simplified 2026-08-21: the food
      // token's own sosTs turned out to often be a system-suggested default
      // the farmer/leader just accepted rather than a verified date (see the
      // land-52 investigation — its sosTs landed 8 days from a stale/unrelated
      // satellite zone, not the zone this loan actually financed) — dropped
      // from consideration entirely. Used to also reject the satellite-matched
      // cycle's own satSos when it was more than 20 days from drawdownTs,
      // falling back to drawdownTs itself on the theory that a big gap meant
      // the match was wrong. Removed 2026-08-21 (land-33 investigation): the
      // cycle match itself is already the real safeguard (closest sos among
      // THIS land's own open cycles beats every other candidate, picked
      // upstream in useActiveLoans.js's resolveCropFromRecords) — an absolute
      // day-count on top of that can't distinguish "wrong cycle" from "right
      // cycle, unusually-timed drawdown" (e.g. a post-harvest loan, drawn
      // long after the season's real SOS). Rejecting satSos there paired a
      // fallback SOS with the (still unconditionally trusted, see eosDate
      // above) satellite EOS from the very cycle just rejected, showing an
      // impossible cycle length. 2026-08-21: dropped the drawdownDate
      // fallback entirely too — showing an unconfirmed drawdown-as-SOS guess
      // is worse than showing nothing, now that satSos is trusted whenever
      // present. sos is null (DetailRow below hides, Gantt bar in
      // staticCards.js skips its marker) when no cycle matched at all —
      // dropped the separate sosSource field once it became just a boolean
      // restating that (every non-null sos is now satellite-sourced).
      const sosDate = l.satSos ? new Date(l.satSos).toISOString().slice(0, 10) : null;
      // Where in the crop's season this loan's drawdown fell — the display
      // string itself, no separate label-lookup table (a post-harvest draw,
      // like land 33's 92-day-after-SOS loan that motivated this — see the
      // 2026-08-21 SOS/EOS mismatch investigation). Season split into equal
      // thirds by elapsed *fraction*, not a fixed day count: season length
      // ranges from ~85d (horse gram) to 365+d (sugarcane) across this
      // portfolio, so a flat day window isn't comparable across crops the
      // way a fraction is. Clamped at both ends — a drawdown before sos or
      // after eos still lands in the nearest bucket rather than falling out
      // of range. Uses the RAW season end (maturityDate/satProjectedDate),
      // NOT eosDate — eosDate can now be the payback-adjusted date (satEOS
      // +3wk, or the drawdown+3mo+3wk floor, added 2026-08-21), and feeding
      // that back into a fraction of (drawdown − sos) made the season length
      // partly a function of drawdown itself, silently reclassifying loans
      // like land 33's from Pre-harvest to Cultivation with no real change
      // in when the loan was drawn — this is a "where in the real crop
      // season" question, unrelated to the payback/overdue-tracking concern.
      const seasonEosDate = maturityDate || satProjectedDate;
      let loanStage = null;
      if (sosDate && seasonEosDate && l.drawdownTs) {
        const sosMs = new Date(sosDate + 'T00:00:00Z').getTime();
        const eosMs = new Date(seasonEosDate + 'T00:00:00Z').getTime();
        const seasonMs = eosMs - sosMs;
        if (seasonMs > 0) {
          const frac = (Number(l.drawdownTs) * 1000 - sosMs) / seasonMs;
          loanStage = frac < 1 / 3 ? 'Operating' : frac < 2 / 3 ? 'Cultivation' : 'Pre-harvest';
        }
      }
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
        satProjectedDate,
        loanStage,
        daysToEos: daysEos,
        eosSource,
        sos: sosDate,
      };
    }),
    [pending, active, flagged, resolveName, eosMap, isPending, ftData]
  );

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
            cropFamily,
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

  // Distinct loan stages actually present, in season order (not
  // alphabetical) — only render filter chips for stages that exist,
  // mirroring presentCropKeys in staticCards.js.
  const presentStages = useMemo(() => {
    const s = new Set();
    for (const l of enriched) if (l.loanStage) s.add(l.loanStage);
    return ['Operating', 'Cultivation', 'Pre-harvest'].filter((k) => s.has(k));
  }, [enriched]);
  // A loan with no loanStage yet (no matched satellite cycle) stays visible
  // regardless of filter state — same "unclassified is never hidden" rule
  // as cropVisible in staticCards.js.
  const stageVisible = useCallback(
    (loan) => !loan.loanStage || !stageFilterExcluded.has(loan.loanStage),
    [stageFilterExcluded]
  );
  const visible = useMemo(() => sorted.filter(stageVisible), [sorted, stageVisible]);

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

      {/* Fund filter dropdown + Analyse (was separate free "Outlines" /
          paid "Buy keys" buttons — viewing keys are redundant now that
          recordHash comes for free from the backend's /loans/sync, so the
          whole pay-to-unlock flow was removed; Analyse always opens the map
          in outlines mode). Loan-stage filter moved below the list. */}
      <div className="flex items-center gap-2">
        {fundKeys.length > 0 && (
          <div ref={fundRef} className="relative flex-1 min-w-0">
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
        )}
        <button
          onClick={() => onViewMap?.(enriched, { outlinesOnly: true })}
          disabled={!active.length}
          className="flex-shrink-0 ml-auto text-xs px-3 py-1.5 rounded-lg border border-black dark:border-white bg-black dark:bg-white text-white dark:text-gray-800 font-bold active:scale-95 disabled:opacity-30 whitespace-nowrap"
        >Harvest Calendar</button>
      </div>

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
        {visible.map((loan) => (
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
              const cropColorKey = loan.cropFamily != null ? CROP_CODE_COLOR_KEY[loan.cropFamily] : null;
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
                  className={`grid grid-cols-[1fr_6rem_5.5rem_1rem] gap-3 items-center px-3 py-2.5 rounded-lg cursor-pointer touch-pan-y ${eosRowBg(loan.daysToEos, loan.chainClosed)}`}
                >
              {/* Name */}
              <div className="flex items-center gap-1 min-w-0">
                <CropIcon cropColorKey={cropColorKey} dim={!loan.foodTokenId} className="w-3.5 h-3.5 flex-shrink-0" />
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
                  loan.daysToEos != null && loan.daysToEos < -14
                    ? 'text-red dark:text-red font-bold'
                    : loan.daysToEos != null && loan.daysToEos < 0
                      ? 'text-orange-600 dark:text-orange-400 font-bold'
                      : loan.eosSource
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-slate-300'
                }`} title={
                  loan.eosSource === 'satellite'
                    ? 'Satellite-projected payback date — 3 weeks after the model-estimated harvest, not yet confirmed on-chain'
                    : loan.eosSource === 'minimum'
                      ? 'Minimum repayment floor — 3 months + 3 weeks after drawdown, later than the satellite estimate (or no satellite estimate available)'
                      : undefined
                }>
                  {loan.eosDate ? formatEosDate(loan.eosDate) : '--'}
                </span>
              )}

              {/* Status icon — pending rows get a manual-dismiss X instead, for
                  the case where the loan is already gone on-chain but stuck
                  locally (chain-sync/backend cleanup lags a few minutes). */}
              {loan.isPending ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissLoanLocally(unionAddress, loan.id, queryClient);
                  }}
                  className="justify-self-end text-gray-400 dark:text-slate-400 active:scale-90"
                  title="Remove — already closed on-chain"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              ) : <StatusIcon loan={loan} />}
                </div>
              </div>
              );
            })()}

            {/* Expanded detail */}
            {expandedId === loan.id && (() => {
              const cropFamily = loan.cropFamily ?? ftData[loan.id]?.cropFamily ?? null;
              const cropColorKey = cropFamily != null ? CROP_CODE_COLOR_KEY[cropFamily] : null;
              return (
              <div className="mt-1 mb-2 px-3 py-3 rounded-lg bg-gray-100 dark:bg-slate-600 flex flex-col gap-1.5">
                {!loan.chainClosed && loan.daysToEos != null && loan.daysToEos < 0 && (
                  <p className="text-[10px] font-semibold text-red dark:text-red">
                    ⚠ This loan is due, please contact the borrower.
                  </p>
                )}
                {!loan.chainClosed && loan.daysToEos != null && loan.daysToEos >= 0 && loan.daysToEos <= PAYBACK_WARNING_DAYS && (
                  <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-300">
                    ⚠ This loan has to be paid back within {loan.daysToEos} day{loan.daysToEos === 1 ? '' : 's'}.
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Pass the FULL list, not just [loan] — portfolioLoans
                    // used to be restricted to this one loan for the
                    // "focused" view, which meant pressing the X/back button
                    // (which clears selection but never restored the loan
                    // list) left the Harvest Calendar card showing only this
                    // one property forever. focusLandId drives the initial
                    // single-property zoom/auto-expand instead — a transient
                    // selection, not a restriction on the underlying data.
                    onViewMap?.(enriched, {
                      outlinesOnly: true,
                      focusLandId: loan.landId,
                      // Overdue loans have already passed harvest as of
                      // "now" — the Gantt's current month shows nothing for
                      // them, so open one month back where the bar is
                      // actually visible.
                      focusMonthOffset: loan.daysToEos != null && loan.daysToEos < 0 ? -1 : 0,
                    });
                  }}
                  className="self-start text-[10px] font-semibold text-blue-500 dark:text-blue-400 active:scale-95"
                >View property outline</button>
                <DetailRow label="Farm score" value={loan.farmerScore ?? '--'} />
                {loan.loanStage && (
                  <span
                    className="self-start text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white bg-gray-800"
                    title="Where in the crop's season this loan's drawdown fell, relative to SOS/EOS"
                  >
                    {LOAN_STAGE_LONG_LABEL[loan.loanStage] ?? loan.loanStage}
                  </span>
                )}

                <Divider />
                <DetailRow label="Fund" value={fundMap.get(loan.fund) || loan.fund || '--'} />
                <DetailRow label="Principal" value={`₹${(loan.principal ?? loan.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <DetailRow label="Rate" value={`${(loan.rateBP / 100).toFixed(1)}%`} />
                {loan.sos && (
                  <DetailRow
                    label="SOS"
                    value={
                      <span
                        className="text-blue-600 dark:text-blue-400 font-semibold"
                        title="Satellite-verified — matched cycle closest to this loan's drawdown among the property's own open cycles"
                      >
                        {formatEosDate(loan.sos)}
                      </span>
                    }
                  />
                )}
                {loan.recordHash && (
                  <DetailRow
                    label="Record"
                    value={
                      <a
                        href={`${window.location.origin}/record/${loan.recordHash}`}
                        target="_blank"
                        rel="noreferrer"
                        title={loan.recordHash}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-500 dark:text-blue-400 underline"
                      >
                        {loan.recordHash.slice(0, 8)}…{loan.recordHash.slice(-6)}
                      </a>
                    }
                  />
                )}

                {loan.foodTokenId && (
                  <>
                    <Divider />
                    <div className="flex items-center gap-1.5">
                      <CropIcon cropColorKey={cropColorKey} dim={false} className="w-4 h-4 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        Food token #{String(loan.foodTokenId).slice(0, 6)}…{String(loan.foodTokenId).slice(-4)}
                      </span>
                    </div>
                    <DetailRow label="Crop" value={ftData[loan.id]?.cropName ?? '…'} />
                    <DetailRow label="Committed" value={ftData[loan.id]?.kg != null ? `${ftData[loan.id].kg.toLocaleString('en-IN')} kg` : '…'} />
                    <DetailRow label="Harvest" value={ftData[loan.id]?.harvestTs ? formatDate(ftData[loan.id].harvestTs) : '…'} />
                  </>
                )}

                {!loan.foodTokenId && (loan.cropSource === 'satellite' || loan.satProjectedDate) && (
                  <>
                    <Divider />
                    <div className="flex items-center gap-1.5">
                      <CropIcon cropColorKey={cropColorKey} dim className="w-4 h-4 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        Satellite-detected crop
                      </span>
                    </div>
                    {loan.cropSource === 'satellite' && (
                      <>
                        <DetailRow label="Crop" value={CROP_CODE_NAMES[loan.cropFamily] ?? '--'} />
                        <DetailRow label="Confidence" value={loan.cropConfidence != null ? `${Math.round(loan.cropConfidence * 100)}%` : '--'} />
                      </>
                    )}
                    {loan.satProjectedDate && (
                      <DetailRow label="Projected harvest" value={formatEosDate(loan.satProjectedDate)} />
                    )}
                  </>
                )}

                {loan.health && (
                  <>
                    <Divider />
                    <div className="flex items-center justify-between" title={loan.healthDescription || undefined}>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Crop health</span>
                      <span className={`text-[10px] font-semibold ${HEALTH_COLOR[loan.health] ?? 'text-gray-500 dark:text-slate-300'}`}>
                        {loan.healthSummary || HEALTH_LABEL[loan.health] || loan.health}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex flex-col mt-3">
                {loan.chainClosed && (
                  <p className="text-[10px] text-red dark:text-red">
                    This loan is {loan.defaulted ? 'defaulted' : 'closed'} on-chain but still in the backend list.
                  </p>
                )}
                </div>

              </div>
              );
            })()}
          </div>
        ))}
      </div>

      {/* Loan-stage filter — moved below the list (was grouped with Harvest
          Calendar above it). Same tap-to-exclude pill pattern as
          staticCards.js's crop filter bar, keyed by loanStage instead of
          crop. Only stages actually present in the list render a chip. */}
      {presentStages.length > 0 && (
        <div className="flex items-center gap-2 px-1 overflow-x-auto">
          {presentStages.map((key) => {
            const off = stageFilterExcluded.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleStageFilter(key)}
                title={key}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-bold tracking-wide active:scale-95 transition-colors ${
                  off
                    ? 'bg-transparent text-gray-400 dark:text-slate-500 border border-gray-300 dark:border-slate-600'
                    : 'bg-gray-800 text-white'
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      )}

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
