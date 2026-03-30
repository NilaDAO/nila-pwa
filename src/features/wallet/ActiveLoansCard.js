import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';

const YEAR_SEC = 31_557_600;

const calcPendingInterest = (loan) => {
  if (!loan.drawdownTs || !loan.amount) return 0;
  const elapsed = Math.floor(Date.now() / 1000) - Number(loan.drawdownTs);
  if (elapsed <= 0) return 0;
  return (loan.amount * loan.rateBP / 10_000) * (elapsed / YEAR_SEC);
};

const formatDate = (ts) => {
  if (!ts) return '--';
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
};

/** Status icon: checkmark (verified active), warning (unverified), X (chain says closed) */
function StatusIcon({ loan }) {
  if (loan.chainClosed) {
    return <XCircleIcon className="w-4 h-4 text-red-500 dark:text-red-400" title="Closed on-chain" />;
  }
  if (loan.chainVerified) {
    return <CheckCircleIcon className="w-4 h-4 text-green-500 dark:text-green-400" title="Verified on-chain" />;
  }
  return <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 dark:text-amber-300" title="Not yet verified" />;
}

const COLUMNS = [
  { key: 'name',   label: 'Name',   align: 'left' },
  { key: 'amount', label: 'Amount', align: 'right' },
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
 *   onAddContact — (address) => void
 *   onRefresh   — () => void triggers chain sync
 *   refreshing  — boolean
 *   onDeepSync  — (lookbackBlocks) => Promise — calls POST /reset_active_loans
 */
export default function ActiveLoansCard({
  loans = [],
  fundMap = new Map(),
  fundLentMap = new Map(),
  resolveName,
  hasName,
  onAddContact,
  onRefresh,
  refreshing,
  onDeepSync,
  unionAddress,
}) {
  const [sortKey, setSortKey] = useState('amount');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedFund, setSelectedFund] = useState('all');
  const [syncStep, setSyncStep] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [gisData, setGisData] = useState({});     // { loanId: { ...summary } }
  const [gisLoading, setGisLoading] = useState({}); // { loanId: bool }

  const handleSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  // Unique fund keys from loans
  const fundKeys = useMemo(() => {
    const keys = new Set();
    for (const l of loans) {
      if (l.fund) keys.add(l.fund);
    }
    return Array.from(keys);
  }, [loans]);

  // Split into active vs flagged, filtered by selected fund
  const { active, flagged } = useMemo(() => {
    const a = [], f = [];
    for (const l of loans) {
      if (selectedFund !== 'all' && l.fund !== selectedFund) continue;
      if (l.chainClosed) { f.push(l); }
      else if (l.drawdownTs && l.active) { a.push(l); }
    }
    return { active: a, flagged: f };
  }, [loans, selectedFund]);

  const enriched = useMemo(() =>
    [...active, ...flagged].map((l) => ({
      ...l,
      displayName: resolveName(l.borrower),
      totalAmount: l.amount + calcPendingInterest(l),
    })),
    [active, flagged, resolveName]
  );

  const sorted = useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...enriched].sort((a, b) => {
      switch (sortKey) {
        case 'name':   return mul * a.displayName.localeCompare(b.displayName);
        case 'amount': return mul * (a.totalAmount - b.totalAmount);
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
      const key = l.fund || 'unknown';
      principalByFund.set(key, (principalByFund.get(key) ?? 0) + (l.principal ?? l.amount ?? 0));
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

  const API = process.env.REACT_APP_API_BASE_URL;

  const handleCheckCrop = useCallback(async (loan) => {
    if (!unionAddress || !loan.id) return;
    setGisLoading((prev) => ({ ...prev, [loan.id]: true }));
    try {
      const res = await fetch(`${API}/gis/summary?union=${unionAddress}&loan_id=${loan.id}`);
      if (res.ok) {
        const data = await res.json();
        setGisData((prev) => ({ ...prev, [loan.id]: data }));
      }
    } catch (err) {
      console.error('[GIS] check crop failed:', err);
    }
    setGisLoading((prev) => ({ ...prev, [loan.id]: false }));
  }, [unionAddress, API]);

  const hasMismatch = accounting.some((a) => !a.match);

  // Reset sync step when mismatch resolves
  useEffect(() => {
    if (!hasMismatch && syncStep > 0) setSyncStep(0);
  }, [hasMismatch, syncStep]);

  const handleDeepSync = useCallback(async () => {
    if (!onDeepSync || syncStep >= SYNC_STEPS.length) return;
    const step = SYNC_STEPS[syncStep];
    console.log('[ActiveLoans] deep sync step', syncStep, step.label, step.blocks, 'blocks');
    setSyncing(true);
    try {
      await onDeepSync(step.blocks);
      console.log('[ActiveLoans] deep sync complete, refreshing...');
      setSyncStep((s) => s + 1);
      onRefresh?.();
    } catch (err) {
      console.error('[ActiveLoans] deep sync failed:', err);
    }
    setSyncing(false);
  }, [onDeepSync, syncStep, onRefresh]);

  if (!loans.length) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {/* Header: title + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
          Active Loans
          <span className="font-normal ml-1">
            ({active.length}{flagged.length > 0 ? ` + ${flagged.length} closed` : ''})
          </span>
        </p>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-1 rounded-full active:scale-90 transition-transform"
          title="Refresh from chain"
        >
          <ArrowPathIcon className={`w-4 h-4 dark:text-slate-400 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Fund filter dropdown */}
      {fundKeys.length > 0 && (
        <select
          value={selectedFund}
          onChange={(e) => setSelectedFund(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
        >
          <option value="all">All funds</option>
          {fundKeys.map((key) => (
            <option key={key} value={key}>
              {fundMap.get(key) || key}
            </option>
          ))}
        </select>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_24px] gap-3 px-3 py-1">
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
            {/* Collapsed row */}
            <div
              onClick={() => setExpandedId(expandedId === loan.id ? null : loan.id)}
              className={`grid grid-cols-[1fr_auto_24px] gap-3 items-center px-3 py-2.5 rounded-lg cursor-pointer active:scale-[0.99] transition-transform ${
                loan.chainClosed
                  ? 'bg-red-50 dark:bg-red-900/20 opacity-60'
                  : 'bg-gray-50 dark:bg-slate-700'
              }`}
            >
              {/* Name */}
              <div className="flex items-center gap-1 min-w-0">
                <span className={`text-xs font-semibold dark:text-white truncate ${loan.chainClosed ? 'line-through' : ''}`}>
                  {loan.displayName}
                </span>
                {!hasName(loan.borrower) && !loan.chainClosed && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddContact(loan.borrower); }}
                    className="text-[10px] text-blue-500 dark:text-blue-400 whitespace-nowrap"
                  >
                    +add
                  </button>
                )}
              </div>

              {/* Amount */}
              <span className={`text-xs font-mono dark:text-white text-right whitespace-nowrap ${loan.chainClosed ? 'line-through' : ''}`}>
                ₹{loan.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>

              {/* Status icon */}
              <StatusIcon loan={loan} />
            </div>

            {/* Expanded detail */}
            {expandedId === loan.id && (
              <div className="mx-3 mt-1 mb-2 px-3 py-3 rounded-lg bg-gray-100 dark:bg-slate-600 flex flex-col gap-1.5">
                <DetailRow label="Address" value={`${loan.borrower.slice(0, 6)}...${loan.borrower.slice(-4)}`} />
                <DetailRow label="Fund" value={fundMap.get(loan.fund) || loan.fund || '--'} />
                <DetailRow label="Outstanding" value={`₹${loan.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <DetailRow label="Principal" value={`₹${(loan.principal ?? loan.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                <DetailRow label="Rate" value={`${(loan.rateBP / 100).toFixed(1)}%`} />
                <DetailRow label="EOS date" value={formatDate(loan.maturityTs)} />
                <DetailRow label="Crop health" value={loan.activity_stage ?? '--'} />
                <DetailRow label="Milestone" value={loan.milestone != null ? `#${loan.milestone}` : '--'} />
                <DetailRow
                  label="Chain status"
                  value={loan.chainClosed ? (loan.defaulted ? 'Defaulted' : 'Closed') : loan.chainVerified ? 'Verified active' : 'Pending verification'}
                />
                {loan.chainClosed && (
                  <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">
                    This loan is {loan.defaulted ? 'defaulted' : 'closed'} on-chain but still in the backend list.
                  </p>
                )}

                {/* Check crop button + GIS data */}
                {!loan.chainClosed && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-500">
                    {gisData[loan.id] ? (
                      <div className="flex flex-col gap-1">
                        {(gisData[loan.id].clusters || []).map((cl, i) => (
                          <div key={i} className="flex flex-col gap-0.5">
                            <DetailRow label={`Cluster ${cl.cluster_id}`} value={cl.crop_type || '--'} />
                            <DetailRow label="Stage" value={cl.stage || '--'} />
                            <DetailRow label="Health" value={cl.health || '--'} />
                            <DetailRow label="Yield est." value={cl.yield_estimate ? `${cl.yield_estimate} kg/ac` : '--'} />
                            <DetailRow label="SOS" value={cl.sos || '--'} />
                            <DetailRow label="EOS" value={cl.eos || '--'} />
                          </div>
                        ))}
                        {gisData[loan.id].cache_status === 'cold' && (
                          <p className="text-[10px] text-amber-500 mt-1">Cache cold — initializing in background...</p>
                        )}
                        {gisData[loan.id].farmer_score != null && (
                          <DetailRow label="Farmer score" value={gisData[loan.id].farmer_score} />
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCheckCrop(loan); }}
                        disabled={gisLoading[loan.id]}
                        className="w-full py-1.5 text-[10px] font-semibold rounded-lg bg-gray-200 dark:bg-slate-500 dark:text-white active:scale-95 disabled:opacity-40"
                      >
                        {gisLoading[loan.id] ? 'Loading...' : 'Check crop'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Accounting check footer */}
      {accounting.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 pt-2 border-t border-gray-200 dark:border-slate-600">
          {accounting.map((a) => (
            <div key={a.fundKey} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {a.match
                  ? <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />
                  : <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
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
                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-400 dark:bg-amber-500 text-black active:scale-95 disabled:opacity-40"
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
