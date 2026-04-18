import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useDataContext, useNavContext } from '../../utils/NavigationContext';
import { useUnionCashReserve } from '../../hooks/useUnionCashReserve.ts';
import { usePendingCashDeliveries, useUnionOpenCashOffersList, useUnionOpenRedeemOrdersList } from '../../hooks/useCashOffer.ts';
import { useUnionTreasury, useLoadFundsData } from '../../hooks/useLoadFunds.ts';
import { useFxPool, useProvider } from '../../hooks/useWallet.ts';
import { ethers } from 'ethers';
import genericFundViewerArtifact from '../../components/ABI/genericFundViewer.json';
import { useErc20Balances } from '../../hooks/useLoadETH.ts';
import { IndividualExchangeButton, ClaimButton } from '../../components/UI/buttons.js';
import { useActiveLoans, useActiveLoansChainSync } from '../../hooks/useActiveLoans';
import { useContactBook } from '../../hooks/useContactBook';
import ActiveLoansCard from './ActiveLoansCard';
import { useLPCashOnHand } from '../../hooks/useLPCashOnHand';

function inrDisplay(nin) {
  return `₹${Number(nin / 10n ** 18n).toLocaleString('en-IN')}`;
}

// escrow.inrValue is stored as a plain integer (e.g. 500 = ₹500), not wei
function inrValueDisplay(raw) {
  return `₹${Number(raw).toLocaleString('en-IN')}`;
}

function tsLabel(ts) {
  if (!ts) return '—';
  const remaining = ts - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'Ready now';
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function Countdown({ deadline, escrowDuration, amount, count, onSettleRequest, onSettleCancel, onSettleConfirm, confirmingSettle, settling }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, deadline - now);
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const timeStr = d > 0
    ? `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const isUrgent = remaining < 14400;
  const isWarning = remaining < 86400; // < 1 day
  const total = escrowDuration || 7 * 86400;
  const progress = Math.max(0, Math.min(1, 1 - remaining / total));
  const barColor = progress > 0.85
    ? 'bg-red'
    : progress > 0.5
      ? 'bg-amber-400'
      : 'bg-green';
  const dotColor = progress > 0.85
    ? 'text-red'
    : progress > 0.5
      ? 'text-amber-500'
      : 'text-green';

  return (
    <div className="flex items-stretch gap-2">
      <div data-tour="pending-draws" className={`flex-1 rounded-lg border bg-white dark:bg-slate-700 px-3 py-2 flex flex-col gap-1.5 ${
        isWarning
          ? 'border-red animate-border-flash'
          : 'border-gray-200 dark:border-slate-600'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isWarning ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${dotColor}`}>
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
            ) : (
              <span className={`text-xs ${dotColor}`}>●</span>
            )}
            <span className="text-xs font-semibold dark:text-white">{inrDisplay(amount)}</span>
            {count > 1 && (
              <span className="text-[10px] text-gray-400 dark:text-slate-400">· {count} settlements</span>
            )}
          </div>
          <span className={`text-[10px] font-mono ${
            isUrgent ? 'text-red font-semibold' : 'text-gray-400 dark:text-slate-400'
          }`}>
            {remaining <= 0 ? '⚠ Expired' : timeStr}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-600 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>
        {isWarning && !confirmingSettle && (
          <p className="text-[10px] text-red leading-snug">
            Under 24h left. Cash-out to a new borrower or settle through a LP — otherwise the union treasury absorbs this amount.
          </p>
        )}
        {confirmingSettle && (
          <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-gray-200 dark:border-slate-600">
            <p className="text-xs text-gray-700 dark:text-slate-300 text-center">
              Post offer to settle <span className="font-bold">{inrDisplay(amount)}</span> with 1% LP fee
            </p>
            <div className="flex gap-2">
              <button
                onClick={onSettleCancel}
                disabled={settling}
                className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-slate-600 text-xs font-bold text-gray-600 dark:text-slate-300 active:scale-95 disabled:opacity-50"
              >
                Keep cash
              </button>
              <button
                onClick={onSettleConfirm}
                disabled={settling}
                className="flex-1 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-gray-800 text-xs font-bold active:scale-95 disabled:opacity-50"
              >
                {settling ? 'Posting…' : 'Settle'}
              </button>
            </div>
          </div>
        )}
      </div>
      {!confirmingSettle && (
        <button
          data-tour="settle"
          onClick={onSettleRequest}
          disabled={settling}
          className={`px-4 rounded-lg text-xs font-bold active:scale-95 border disabled:opacity-50 ${
            isWarning
              ? 'bg-red text-white border-red'
              : 'bg-white dark:bg-slate-700 text-black dark:text-white border-gray-200 dark:border-slate-600'
          }`}
        >
          Settle
        </button>
      )}
    </div>
  );
}

// ₹100 step for treasury adjustments
const STEP = 100n * 10n ** 18n;

const UnionReserve = ({ handleOpenForm }) => {
  const { db, unionFunds, setFieldActivity } = useDataContext();
  const { setIx } = useNavContext();
  const unionAddr = db?.union?.address;
  const chain = process.env.REACT_APP_CHAIN_ID || '137';

  const { data, isLoading } = useUnionCashReserve(unionAddr);
  const { data: tokenData = [] } = useErc20Balances(chain, db?.address, { enabled: !!db?.address });
  const ninInitialBalance = Number(tokenData.find(t => t.sym === 'nIN')?.bal ?? 0);
  const { data: pendingDeliveries = [] } = usePendingCashDeliveries(unionAddr);
  const { data: openCashOffersList = [] } = useUnionOpenCashOffersList(unionAddr);
  const { data: openRedeemOrdersList = [] } = useUnionOpenRedeemOrdersList(unionAddr);
  const { cancelRedeemOrder, cancelCashOffer, confirmCashDelivery, postCashOffer } = useFxPool();
  const { total: lpCashOnHand, addCash: addLPCash, consumeCash: consumeLPCash } = useLPCashOnHand(unionAddr);
  const { deposit, withdraw } = useUnionTreasury();
  const { data: loansData } = useActiveLoans(unionAddr, !!db?.union?.leader);
  const { refreshFromChain, isFetching: chainSyncing } = useActiveLoansChainSync(unionAddr, !!db?.union?.leader);
  const { provider } = useProvider();

  // Fetch the union's collectDeadline once — used by ActiveLoansCard to gate
  // swipe-right (cash-out, only while window open) vs swipe-left (repay, only after).
  const [collectDeadline, setCollectDeadline] = useState(null);
  useEffect(() => {
    if (!unionAddr || !provider || !db?.union?.leader) return;
    let cancelled = false;
    const viewer = new ethers.Contract(
      process.env.REACT_APP_VIEWER_MAIN,
      genericFundViewerArtifact.abi,
      provider,
    );
    viewer.getUnionCollectDeadline(unionAddr)
      .then((d) => { if (!cancelled) setCollectDeadline(Number(d)); })
      .catch((err) => console.warn('[UnionReserve] getUnionCollectDeadline failed:', err));
    return () => { cancelled = true; };
  }, [unionAddr, provider, db?.union?.leader]);
  const { resolveName, hasName, addContact } = useContactBook();
  const { data: fundsData = [] } = useLoadFundsData(unionAddr, unionFunds ?? [], db?.address);
  const qc = useQueryClient();

  // ── EOS / harvest cache helpers (4-hour localStorage TTL) ──
  const EOS_CACHE_KEY = `eos_cache_${unionAddr}`;
  const EOS_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

  const readEosCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(EOS_CACHE_KEY);
      if (!raw) return null;
      const { ts, entries } = JSON.parse(raw);
      if (Date.now() - ts > EOS_TTL_MS) { localStorage.removeItem(EOS_CACHE_KEY); return null; }
      return new Map(entries);
    } catch { return null; }
  }, [EOS_CACHE_KEY]);

  const writeEosCache = useCallback((map) => {
    try {
      localStorage.setItem(EOS_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        entries: [...map],
      }));
    } catch { /* quota */ }
  }, [EOS_CACHE_KEY]);

  // Batch EOS data for all active loans — serves from 4h cache when fresh
  const { data: eosMap = new Map() } = useQuery({
    queryKey: ['batchEos', unionAddr],
    queryFn: async () => {
      // Return cached data if still within TTL
      const cached = readEosCache();
      if (cached) { console.log('[batchEos] serving from 4h cache'); return cached; }

      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL}/gis/batch-eos?union=${unionAddr}`);
      if (!res.ok) return new Map();
      const json = await res.json();
      const m = new Map();

      if (json.results) {
        const loans = qc.getQueryData(['activeLoans', unionAddr]);
        const borrowerToLoanIds = new Map();
        for (const l of (loans?.activeLoans ?? [])) {
          const key = l.borrower?.toLowerCase();
          if (!borrowerToLoanIds.has(key)) borrowerToLoanIds.set(key, []);
          borrowerToLoanIds.get(key).push(l.id);
        }
        for (const [borrower, data] of Object.entries(json.results)) {
          for (const loanId of (borrowerToLoanIds.get(borrower?.toLowerCase()) ?? [])) {
            m.set(loanId, data);
          }
        }
      } else {
        for (const l of (json.loans ?? [])) {
          m.set(l.loan_id, l);
        }
      }

      const existing = qc.getQueryData(['batchEos', unionAddr]);
      if (existing instanceof Map) {
        for (const [key, val] of existing) {
          const hasData = val?.eos_date || val?.predicted_eos_earliest || val?.predicted_eos_latest;
          const serverHasData = m.get(key)?.eos_date || m.get(key)?.predicted_eos_earliest;
          if (hasData && !serverHasData) m.set(key, val);
        }
      }

      writeEosCache(m);
      return m;
    },
    enabled: !!unionAddr && !!db?.union?.leader,
    staleTime: EOS_TTL_MS,
    gcTime: EOS_TTL_MS,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Auto-fetch EOS for active loans missing satellite data (respects 4h cache)
  const fetchedEosRef = useRef(new Set());
  useEffect(() => {
    const loans = loansData?.activeLoans;
    if (!loans?.length || !eosMap) return;
    const API = process.env.REACT_APP_API_BASE_URL;

    const missing = loans.filter((l) => {
      if (!l.borrower || fetchedEosRef.current.has(l.borrower)) return false;
      const eos = eosMap.get(l.id);
      return !eos?.eos_date && !eos?.predicted_eos_earliest && !eos?.predicted_eos_latest;
    });
    if (!missing.length) return;

    // If cache is still fresh, don't hit the API for missing entries either
    const cached = readEosCache();
    if (cached) return;

    missing.forEach((l) => fetchedEosRef.current.add(l.borrower));
    const borrowers = [...new Set(missing.map((l) => l.borrower))];
    const borrowerToLoanIds = new Map();
    for (const l of missing) {
      const key = l.borrower?.toLowerCase();
      if (!borrowerToLoanIds.has(key)) borrowerToLoanIds.set(key, []);
      borrowerToLoanIds.get(key).push(l.id);
    }
    fetch(`${API}/gis/eos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ borrowers }),
    })
      .then((res) => res.json())
      .then((json) => {
        console.log('[gis/eos] result:', json);
        qc.setQueryData(['batchEos', unionAddr], (prev = new Map()) => {
          const updated = new Map(prev);
          for (const [borrower, data] of Object.entries(json.results ?? {})) {
            for (const loanId of (borrowerToLoanIds.get(borrower?.toLowerCase()) ?? [])) {
              updated.set(loanId, data);
            }
          }
          writeEosCache(updated);
          return updated;
        });
      })
      .catch(console.error);
  }, [loansData?.activeLoans, eosMap, unionAddr, qc, readEosCache, writeEosCache]);

  // Map fund bytes32 loanType → human name from unionFunds context
  const fundMap = useMemo(() => {
    const m = new Map();
    if (Array.isArray(unionFunds)) {
      for (const f of unionFunds) m.set(f[2], f[1]); // f[2]=loanType, f[1]=name
    }
    return m;
  }, [unionFunds]);

  // Map fund loanType → total lent (from chain via getFundTotalsByTranche)
  const fundLentMap = useMemo(() => {
    const m = new Map();
    for (const fd of fundsData) {
      for (const t of (fd.tokens ?? [])) {
        if (t.loanType) m.set(t.loanType, t.totals?.lent ?? 0);
      }
    }
    return m;
  }, [fundsData]);

  // Deep sync: call sensingNode to re-scan on-chain events, returns diff
  const handleDeepSync = useCallback(async (lookbackBlocks) => {
    const url = `${process.env.REACT_APP_API_BASE_URL}/loans/scan`;
    console.log(`[DeepSync] POST /loans/scan  union=${unionAddr}  lookback=${lookbackBlocks} blocks`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ union: unionAddr, lookback_blocks: lookbackBlocks }),
    });
    const data = await res.json();

    console.log(
      `[DeepSync] result: found=${data.found?.length ?? 0} closed=${data.closed?.length ?? 0} ` +
      `total_active=${data.total_active} scanned=${data.scanned_blocks} blocks`
    );
    if (data.found?.length) {
      for (const l of data.found) {
        console.log(`  [DeepSync] NEW loan ${l.loan_id?.slice(0,10)}… amount=${l.amount} borrower=${l.borrower}`);
      }
    }
    if (data.closed?.length) {
      for (const id of data.closed) {
        console.log(`  [DeepSync] CLOSED loan ${id?.slice(0,10)}…`);
      }
    }
    if (!data.found?.length && !data.closed?.length) {
      console.warn('[DeepSync] no changes found — gap is outside the lookback window or not event-based');
    }

    return data;
  }, [unionAddr]);

  // LP request card state
  const [confirmCancelId, setConfirmCancelId] = useState(null); // orderId awaiting cancel confirm
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmCancelOfferId, setConfirmCancelOfferId] = useState(null); // CashOffer id awaiting cancel confirm
  const [cancellingOfferId, setCancellingOfferId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null); // orderId awaiting accept confirm
  const [acceptingId,  setAcceptingId]  = useState(null); // orderId tx in flight
  const [settling, setSettling] = useState(false);        // postCashOffer tx in flight
  const [confirmingSettle, setConfirmingSettle] = useState(false); // inline confirm row visible

  // ── Tour: walks the leader through every part of the Cash & Liquidity card.
  // Conditional steps (pending draws, LP requests, scheduled exits) are filtered
  // out at click time if their target isn't currently in the DOM.
  // First run shows a centered pill; after completion shrinks to a "?" on the right.
  const TOUR_SEEN_KEY = 'unionReserve_tourSeen';
  const [tourSeen, setTourSeen] = useState(() => {
    try { return localStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
  });

  const startTour = useCallback(() => {
    const allSteps = [
      {
        element: '[data-tour="card"]',
        popover: {
          title: 'Cash & Liquidity',
          description: 'This card is the union cash control panel. Cash always has to be balanced with digital nIN — you can <i>never</i> have more cash at hand than available in the treasury.',
        },
      },
      {
        element: '[data-tour="reserve-summary"]',
        popover: {
          title: 'Your reserve at a glance',
          description: 'On each repaid loan, a part of the interest earned goes to the treasury. Here you can adjust the treasury and monitor the balance of cash. Take profits if you have surplus funds, deposit more if you feel the balancing isn\'t going efficiently enough.',
        },
        onHighlightStarted: () => {
          // flushSync forces React to commit the state update synchronously
          // so driver.js measures the expanded panel's bounding box, not the collapsed one.
          flushSync(() => setTreasuryExpanded(true));
        },
        onDeselected: () => {
          setTreasuryExpanded(false);
        },
      },
      {
        element: '[data-tour="cash-in"]',
        popover: {
          title: 'Cash In',
          description: 'Use cash-in to bring physical cash into the union. Scan a member QR to invest for a member, or to repay for a borrower.',
        },
      },
      {
        element: '[data-tour="cash-out"]',
        popover: {
          title: 'Cash Out',
          description: 'Use cash-out to give cash to members — when they want to withdraw investments or receive a loan in cash.',
        },
      },
      {
        element: '[data-tour="pending-draws"]',
        popover: {
          title: 'Settlements — cash at hand',
          description: 'Here you can see the total cash your union holds, and until when you have to settle it or lend it out again. Make sure you do it in time — expired cash will be taken from the treasury. This doesn\'t mean you lost it, it just means you need to settle it again.',
        },
      },
      {
        element: '[data-tour="settle"]',
        popover: {
          title: 'Settle',
          description: 'Cannot borrow from a fund or cannot find a borrower in time? Click Settle to post an offer to settle cash with an LP. The escrow is cleared and the treasury is replenished.',
        },
      },
      {
        element: '[data-tour="lp-cash"]',
        popover: {
          title: 'LP cash on hand',
          description: 'Physical cash an LP has delivered for an open RedeemOrder, but which has not yet been paid out to the requesting member. Acts as a buffer.',
        },
      },
      {
        element: '[data-tour="scheduled-exits"]',
        popover: {
          title: 'Scheduled cash outs',
          description: 'Members who have requested to unbond their position. The window is when they become eligible to receive cash. If liquidity is short before the window opens, post a RedeemOrder to bring in LP cash.',
        },
      },
      {
        element: '[data-tour="lp-requests"]',
        popover: {
          title: 'Active LP requests',
          description: 'Settlements with an LP can be found here. When an LP brought you the cash, accept it here. When an LP took your cash, check here if it has been accepted.',
        },
      },
      {
        element: '[data-tour="active-loans"]',
        popover: {
          title: 'Active loans',
          description: 'All funded loans for this union. Sortable by amount and harvest date. Click an item to dig in, or swipe left to cash-in quickly.',
        },
      },
      {
        element: '[data-tour="viewing-keys"]',
        popover: {
          title: 'Viewing keys',
          description: 'Buy viewing keys to see harvest timing, yield, crop health and tailored advice for each member. Each key costs 1 nIN — 80% goes directly to the farmer. Once purchased, tap Skip to load cached data. Update when new data is available.',
        },
      },
      {
        element: '[data-tour="loan-sync"]',
        popover: {
          title: 'Fund balance check',
          description: 'Accountancy is about balancing the books. See in one glance if your work matches the on-chain reality. A green check means everything is correct. A red warning means you are out of sync — some loans may be missing or already closed. Click the amount-off button to resync, and don\'t cash-in or settle anything until you see green.',
        },
      },
    ];
    const steps = allSteps.filter(s => document.querySelector(s.element));
    if (steps.length === 0) return;
    driver({
      showProgress: true,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      steps,
      onDestroyed: () => {
        try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch {}
        setTourSeen(true);
      },
    }).drive();
  }, []);

  // Settle = post a CashOffer (1% LP fee) against the earliest-expiring escrow.
  // Two-step: click Settle → confirm row appears → click Confirm → tx fires.
  // Each settled escrow handles ONE escrow; leader clicks again for the next.
  const handleSettle = async () => {
    const earliest = (data?.pendingDisburse ?? [])[0]; // already sorted by deadline asc
    if (!earliest || !unionAddr) return;
    setSettling(true);
    try {
      await postCashOffer(unionAddr, earliest.escrowId, 100); // 100 BP = 1%
      qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
      qc.invalidateQueries({ queryKey: ['unionOpenCashOffersList'] });
      setConfirmingSettle(false);
    } catch (err) {
      console.error('Settle (postCashOffer) failed:', err);
    } finally {
      setSettling(false);
    }
  };

  const handleCancelRedeem = async (orderId) => {
    setCancellingId(orderId);
    try {
      await cancelRedeemOrder(orderId);
      setConfirmCancelId(null);
      qc.invalidateQueries({ queryKey: ['unionOpenRedeemOrdersList'] });
      qc.invalidateQueries({ queryKey: ['pendingCashDeliveries'] });
    } catch (err) {
      console.error('Cancel failed:', err);
    } finally {
      setCancellingId(null);
    }
  };

  // Cancels an open CashOffer (status=0). No tokens move on chain — the
  // underlying CashEscrow stays alive and can be re-offered or expire.
  // Wired against cancelCashOffer; contract function lands with plan 019.
  const handleCancelCashOffer = async (offerId) => {
    setCancellingOfferId(offerId);
    try {
      await cancelCashOffer(offerId);
      setConfirmCancelOfferId(null);
      qc.invalidateQueries({ queryKey: ['unionOpenCashOffersList'] });
      qc.invalidateQueries({ queryKey: ['globalOpenRedeemOrders'] });
    } catch (err) {
      console.error('Cancel CashOffer failed:', err);
    } finally {
      setCancellingOfferId(null);
    }
  };

  const handleAcceptDelivery = async (order) => {
    setAcceptingId(order.id);
    try {
      await confirmCashDelivery(order.id);
      const inr = Number(order.inrValue);
      addLPCash(order.id, inr);
      qc.invalidateQueries({ queryKey: ['pendingCashDeliveries'] });
      qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (err) {
      console.error('Accept delivery failed:', err);
    } finally {
      setAcceptingId(null);
      setConfirmingId(null);
    }
  };

  // treasury panel state
  const [treasuryExpanded, setTreasuryExpanded] = useState(false);
  const [treasuryDir,    setTreasuryDir]    = useState('deposit'); // 'deposit' | 'withdraw'
  const [treasuryAmount, setTreasuryAmount] = useState(0n);
  const [treasuryStep,   setTreasuryStep]   = useState('input');   // 'input' | 'confirm'

  const handleTreasuryInput = (e) => {
    const cap = withdrawCap;
    if      (e === 'add')    setTreasuryAmount(a => { const n = a + STEP * 10n; return cap != null && n > cap ? cap : n; });
    else if (e === 'remove') setTreasuryAmount(a => a >= STEP * 10n ? a - STEP * 10n : 0n);
    else if (e === 0)        setTreasuryAmount(a => { const n = a + STEP; return cap != null && n > cap ? cap : n; });
    else                     setTreasuryAmount(a => a >= STEP ? a - STEP : 0n);
  };

  const handleTreasuryMax = () => {
    if (treasuryDir === 'deposit') {
      setTreasuryAmount(BigInt(Math.round(ninInitialBalance * 1e18)));
    } else {
      setTreasuryAmount(available);
    }
  };

  const handleTreasuryConfirm = () => {
    const action = treasuryDir === 'deposit'
      ? deposit(unionAddr, treasuryAmount)
      : withdraw(unionAddr, treasuryAmount);
    action.then(() => {
      setTreasuryAmount(0n);
      setTreasuryStep('input');
      qc.invalidateQueries({ queryKey: ['balances', chain, db?.address] });
    });
  };

  const treasury        = data?.treasury        ?? 0n;
  const rainyDay        = data?.rainyDay         ?? 0n;
  const activeEscrow    = data?.activeEscrowNin  ?? 0n;
  const available       = data?.available        ?? 0n;
  const pendingDisburse = data?.pendingDisburse  ?? [];
  const scheduledExits  = data?.scheduledExits   ?? [];
  const hasNoEscrow     = data?.hasNoEscrow      ?? true;
  const escrowDuration  = data?.escrowDuration   ?? 0;
  const pct             = treasury > 0n ? Number(available) / Number(treasury) : 1;
  const withdrawCap     = treasuryDir === 'withdraw' ? available : null;

  const cumulativeInterest = useMemo(() => {
    const loans = loansData?.activeLoans;
    if (!loans?.length) return 0;
    return loans.reduce((sum, l) => {
      const outstanding = l.amount ?? 0;
      const principal   = l.principal ?? outstanding;
      return sum + Math.max(0, outstanding - principal);
    }, 0);
  }, [loansData?.activeLoans]);

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="flex flex-col w-full mb-[220px] gap-4">

      {/* ── Tour trigger: pill on first run, "?" on the right after completion ── */}
      <div className={`flex ${tourSeen ? 'justify-end pr-2' : 'justify-center'}`}>
        {tourSeen ? (
          <button
            onClick={startTour}
            aria-label="Take the tour"
            className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-white active:scale-95"
          >
            ?
          </button>
        ) : (
          <button
            onClick={startTour}
            className="text-xs px-4 py-1.5 rounded-full font-semibold bg-white dark:bg-slate-700 text-gray-700 dark:text-white border border-gray-200 dark:border-slate-600 shadow-bottom-light active:scale-95"
          >
            ✨ Take a tour
          </button>
        )}
      </div>

      {/* ── Union Cash Reserve ── */}
      <div data-tour="card" className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 gap-6 shadow-bottom">
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Union Cash Reserve</p>
          <button
            onClick={() => { setTreasuryExpanded(e => !e); setTreasuryStep('input'); setTreasuryAmount(0n); }}
            className={`active:scale-95 ${treasuryExpanded ? 'text-gray-400 dark:text-slate-400 text-sm px-1' : 'text-xs px-3 py-1.5 rounded-full font-semibold bg-gray-100 dark:bg-slate-600 dark:text-white text-gray-700'}`}
          >{treasuryExpanded ? '✕' : 'Adjust'}</button>
        </div>

        {isLoading ? (
          <p className="text-xs text-gray-400 dark:text-slate-500">Loading…</p>
        ) : (
          <>
            <div data-tour="reserve-summary" className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-slate-400">Treasury</span>
                <div className="flex items-center gap-1.5">
                  {treasuryExpanded && treasuryAmount > 0n && (
                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 line-through">{inrDisplay(treasury)}</span>
                  )}
                  <span className="text-xs font-bold dark:text-white">
                    {treasuryExpanded && treasuryAmount > 0n
                      ? inrDisplay(treasuryDir === 'deposit' ? treasury + treasuryAmount : treasury - treasuryAmount)
                      : inrDisplay(treasury)}
                  </span>
                </div>
              </div>
              {treasuryExpanded && (
                <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-gray-100 dark:border-slate-600">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTreasuryDir('deposit'); setTreasuryStep('input'); setTreasuryAmount(0n); }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 ${treasuryDir === 'deposit' ? 'bg-black text-white dark:bg-white dark:text-gray-800' : 'bg-gray-100 dark:bg-slate-600 dark:text-white'}`}
                    >Deposit</button>
                    <button
                      onClick={() => { setTreasuryDir('withdraw'); setTreasuryStep('input'); setTreasuryAmount(0n); }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 ${treasuryDir === 'withdraw' ? 'bg-black text-white dark:bg-white dark:text-gray-800' : 'bg-gray-100 dark:bg-slate-600 dark:text-white'}`}
                    >Withdraw</button>
                  </div>
                  {treasuryStep === 'input' && (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl font-bold dark:text-white">{inrDisplay(treasuryAmount)}</p>
                        <div className="flex items-end gap-1">
                          <IndividualExchangeButton
                            disabled_add={withdrawCap != null && treasuryAmount >= withdrawCap}
                            disabled_remove={treasuryAmount === 0n}
                            handleTx={handleTreasuryInput}
                            title=""
                            texts={{ plus: 'add', minus: 'remove' }}
                          />
                          <p
                            className={`flex text-sm items-end px-1 dark:text-white ${treasuryAmount === (treasuryDir === 'deposit' ? BigInt(Math.round(ninInitialBalance * 1e18)) : available) && 'opacity-40'}`}
                            onClick={handleTreasuryMax}
                          >max</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Balance: {(treasuryDir === 'deposit'
                          ? ninInitialBalance - Number(treasuryAmount) / 1e18
                          : ninInitialBalance + Number(treasuryAmount) / 1e18
                        ).toLocaleString('en-IN', { maximumFractionDigits: 2 })} nIN
                      </p>
                      <ClaimButton disabled={treasuryAmount === 0n} handleClick={() => setTreasuryStep('confirm')} title="Set" />
                    </>
                  )}
                  {treasuryStep === 'confirm' && (
                    <div className="flex flex-col gap-2 items-center py-4">
                      <p className="text-sm dark:text-white mb-2">
                        {treasuryDir === 'deposit' ? 'Add' : 'Withdraw'} <span className="font-bold">{inrDisplay(treasuryAmount)}</span> {treasuryDir === 'deposit' ? 'to' : 'from'} treasury
                      </p>
                      <ClaimButton disabled={false} handleClick={handleTreasuryConfirm} title={treasuryDir === 'deposit' ? 'Deposit' : 'Withdraw'} />
                      <button onClick={() => setTreasuryStep('input')} className="text-xs text-gray-400 dark:text-slate-400">change amount</button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Rainy day fund</span>
                <span className="text-xs font-bold text-black dark:text-white">{inrDisplay(rainyDay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">In circulation</span>
                <span className="text-xs font-bold dark:text-white">
                  {inrDisplay(activeEscrow)}
                  {treasury > 0n && (
                    <span className="ml-1 text-gray-400 dark:text-slate-500">
                      ({Math.round((Number(activeEscrow) / Number(treasury)) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Interest pending</span>
                <span className="text-xs font-bold dark:text-white">
                  ₹{cumulativeInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-slate-400">Available to cash-in</span>
                  <div className="h-1.5 w-16 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-green ${pct < 0.2 ? 'dark:bg-red-500' : pct < 0.5 ? 'dark:bg-amber-400' : 'dark:bg-green-500'}`}
                      style={{ width: `${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%` }}
                    />
                  </div>
                </div>
                <span className={`text-xs font-bold text-green ${pct < 0.2 ? 'dark:text-red-400' : pct < 0.5 ? 'dark:text-amber-400' : 'dark:text-green-400'}`}>
                  {inrDisplay(available)}
                </span>
              </div>
            </div>

            {/* ── Primary actions ── */}
            <div className="flex gap-2 mt-1">
              <button
                data-tour="cash-in"
                onClick={() => handleOpenForm('cashIn')}
                className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-gray-800 text-sm font-bold active:scale-95"
              >
                Cash In
              </button>
              <button
                data-tour="cash-out"
                onClick={() => handleOpenForm('cashOut')}
                className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-600 dark:text-white text-sm font-bold active:scale-95"
              >
                Cash Out
              </button>
            </div>

            {/* ── Settle countdown ── */}
            {pendingDisburse.length > 0 && (() => {
              // Only the earliest-deadline bucket drives the bar. Anchor on the
              // first escrow (pendingDisburse is sorted asc by deadline in
              // useUnionCashReserve) and include any escrow whose deadline
              // falls within 4h of that anchor. Escrows days away stay silent
              // until they become the new anchor. Countdown flashes red at <1d
              // via its own isWarning (remaining < 86400).
              const BUCKET_WINDOW = 4 * 3600;
              const anchor = pendingDisburse[0].deadline;
              const bucket = pendingDisburse.filter(e => e.deadline - anchor < BUCKET_WINDOW);
              const amount = bucket.reduce((s, e) => s + e.ninAmount, 0n);
              return (
                <Countdown
                  deadline={anchor}
                  escrowDuration={escrowDuration}
                  amount={amount}
                  count={bucket.length}
                  onSettleRequest={() => setConfirmingSettle(true)}
                  onSettleCancel={() => setConfirmingSettle(false)}
                  onSettleConfirm={handleSettle}
                  confirmingSettle={confirmingSettle}
                  settling={settling}
                />
              );
            })()}

            {/* ── LP cash on hand ── */}
            {lpCashOnHand > 0 && (
              <div data-tour="lp-cash" className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-500 dark:text-green-400">●</span>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-slate-400 font-semibold">LP cash on hand</span>
                    <p className="text-sm font-bold dark:text-white">₹{lpCashOnHand.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-slate-500">not yet disbursed</span>
              </div>
            )}

            {/* ── Scheduled member exits ── */}
            {scheduledExits.length > 0 && (
              <div data-tour="scheduled-exits" className="flex flex-col gap-1.5 mt-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Scheduled cash outs</p>
                {scheduledExits.map(e => {
                  const addrShort = `${e.investor.slice(0, 6)}…${e.investor.slice(-4)}`;
                  const actionForm = e.tranche === 'senior' ? 'cashOut' : 'redeem';
                  const canFund = available >= e.inrValue;
                  const shortfall = canFund ? 0n : e.inrValue - available;
                  return (
                    <div key={`${e.investor}-${e.tranche}`} className="flex flex-col gap-1 rounded-xl bg-gray-50 dark:bg-slate-600 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-mono text-gray-500 dark:text-slate-400">{addrShort}</span>
                          <span className="ml-2 text-sm font-bold dark:text-white">{inrDisplay(e.inrValue)}</span>
                          <span className={`ml-2 text-xs ${e.pastMin ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400 dark:text-slate-400'}`}>
                            {e.pastMin ? 'Ready now' : tsLabel(e.minWindowTs)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleOpenForm(actionForm, { investor: e.investor, loanType: e.loanType })}
                          className="text-xs font-bold text-black dark:text-white border border-gray-300 dark:border-slate-500 rounded-lg px-3 py-1 active:scale-95"
                        >
                          {e.tranche === 'senior' ? 'Cash Offer' : 'Redeem'}
                        </button>
                      </div>
                      {!canFund && !e.pastMin && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ₹{Number(shortfall / 10n ** 18n).toLocaleString('en-IN')} short — window may open before liquidity arrives
                        </p>
                      )}
                      {!canFund && e.pastMin && (
                        <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                          ⚠ Window open but blocked — {inrDisplay(shortfall)} short; needs loan repayments or new deposits
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── No-escrow hint: shown when no pending draws + scheduled exits exist ── */}
            {hasNoEscrow && scheduledExits.length > 0 && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-1">No pending loan draws</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
                  To pay out members, post a Redeem Order — an LP will convert their nIN to USDT.
                </p>
                <button
                  onClick={() => handleOpenForm('redeem')}
                  className="text-xs font-bold text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600 rounded-lg px-3 py-1 active:scale-95"
                >
                  Post Redeem Order
                </button>
              </div>
            )}


          </>
        )}
      </section>
      </div>

      {/* ── Active LP Requests ── */}
      {(openCashOffersList.length > 0 || openRedeemOrdersList.length > 0 || pendingDeliveries.length > 0) && (
        <div data-tour="lp-requests" className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 gap-3 shadow-bottom">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Active LP Requests</p>

          {/* Open CashOffers — union offered escrow INR for USDT (cancel only flips status; no tokens move) */}
          {openCashOffersList.map(o => {
            const isCancellingOffer    = cancellingOfferId    !== null && cancellingOfferId    === o.id;
            const isConfirmCancelOffer = confirmCancelOfferId !== null && confirmCancelOfferId === o.id;
            return (
              <div key={`co-${String(o.id)}`} className="relative rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2">
                {!isConfirmCancelOffer && (
                  <button
                    disabled={isCancellingOffer}
                    onClick={() => setConfirmCancelOfferId(o.id)}
                    className="absolute top-2 right-2 text-gray-400 dark:text-slate-500 active:scale-90"
                    aria-label="Cancel cash offer"
                  >
                    {isCancellingOffer ? (
                      <span className="text-[10px]">…</span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    )}
                  </button>
                )}
                <div className="flex flex-col gap-0.5 pr-6">
                  <span className="text-xs font-semibold dark:text-white">
                    {inrValueDisplay(o.inrValue)} cash offer
                  </span>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400">Awaiting LP</span>
                  <span className={`text-[10px] ${o.deadline - now < 3600 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-400'}`}>
                    expires {tsLabel(o.deadline)}
                  </span>
                </div>

                {isConfirmCancelOffer && (
                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-slate-600">
                    <p className="text-xs text-gray-700 dark:text-slate-300 text-center">
                      Cancel this cash offer? The underlying escrow stays active — no tokens move.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmCancelOfferId(null)}
                        className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-slate-600 text-sm font-bold text-gray-600 dark:text-slate-300 active:scale-95"
                      >
                        Keep
                      </button>
                      <button
                        disabled={isCancellingOffer}
                        onClick={() => handleCancelCashOffer(o.id)}
                        className="flex-1 py-2 rounded-xl bg-red-600 dark:bg-red-500 text-white text-sm font-bold active:scale-95 disabled:opacity-50"
                      >
                        {isCancellingOffer ? 'Cancelling…' : 'Cancel offer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Open RedeemOrders (status=0) — no LP found yet */}
          {openRedeemOrdersList.map(o => {
            const farmerShort = resolveName(o.farmer);
            const isCancelling    = cancellingId    !== null && cancellingId    === o.id;
            const isConfirmCancel = confirmCancelId !== null && confirmCancelId === o.id;
            const inr  = Number(o.inrValue);
            const feeInr = Math.round(inr * o.feeBP / 10000);
            return (
              <div key={`ro-${String(o.id)}`} className="relative rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2">
                {!isConfirmCancel && (
                  <button
                    disabled={isCancelling}
                    onClick={() => setConfirmCancelId(o.id)}
                    className="absolute top-2 right-2 text-gray-400 dark:text-slate-500 active:scale-90"
                    aria-label="Cancel order"
                  >
                    {isCancelling ? (
                      <span className="text-[10px]">…</span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    )}
                  </button>
                )}
                <div className="flex flex-col gap-0.5 pr-6">
                  <span className="text-xs font-semibold dark:text-white">
                    Order to bring {inrValueDisplay(o.inrValue)} in cash
                  </span>
                  <span className="text-[10px] font-mono text-gray-400 dark:text-slate-400">{farmerShort}</span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400">
                    ₹{feeInr.toLocaleString('en-IN')} LP fee ({o.feeBP / 100}%)
                  </span>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400">No LP found yet</span>
                  <span className={`text-[10px] ${o.deadline - now < 3600 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-400'}`}>
                    expires {tsLabel(o.deadline)}
                  </span>
                </div>

                {isConfirmCancel && (
                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-slate-600">
                    <p className="text-xs text-gray-700 dark:text-slate-300 text-center">
                      Cancel this order? The nIN will be sent back to {farmerShort}.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmCancelId(null)}
                        className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-slate-600 text-sm font-bold text-gray-600 dark:text-slate-300 active:scale-95"
                      >
                        Keep
                      </button>
                      <button
                        disabled={isCancelling}
                        onClick={() => handleCancelRedeem(o.id)}
                        className="flex-1 py-2 rounded-xl bg-red-600 dark:bg-red-500 text-white text-sm font-bold active:scale-95 disabled:opacity-50"
                      >
                        {isCancelling ? 'Cancelling…' : 'Cancel order'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Committed RedeemOrders (status=1) — LP arrived with cash */}
          {pendingDeliveries.map(o => {
            const lpName = resolveName(o.lp);
            const inr = Number(o.inrValue);
            const feeBP = o.feeBP ?? 100;
            const feeInr = Math.round(inr * feeBP / 10000);
            const isConfirming = confirmingId !== null && confirmingId === o.id;
            const isAccepting  = acceptingId  !== null && acceptingId  === o.id;
            return (
              <div key={`rd-${String(o.id)}`} className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-500 dark:text-green-400">●</span>
                    <span className="text-xs font-semibold dark:text-white">
                      {inrValueDisplay(o.inrValue)} — LP arrived
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 dark:text-slate-400">{lpName}</span>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-slate-400 ml-4">
                  ₹{feeInr.toLocaleString('en-IN')} LP fee ({feeBP / 100}%)
                </div>

                {isConfirming ? (
                  <div className="flex flex-col gap-2 mt-1">
                    <p className="text-xs text-gray-700 dark:text-slate-300 text-center">
                      Is this really <span className="font-bold">₹{inr.toLocaleString('en-IN')}</span> INR?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-600 text-sm font-bold text-gray-600 dark:text-slate-300 active:scale-95"
                      >
                        No
                      </button>
                      <button
                        disabled={isAccepting}
                        onClick={() => handleAcceptDelivery(o)}
                        className="flex-1 py-2.5 rounded-xl bg-gray-700 dark:bg-slate-200 text-white dark:text-gray-800 text-sm font-bold active:scale-95 disabled:opacity-50"
                      >
                        {isAccepting ? 'Releasing…' : 'Yes, confirm'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(o.id)}
                    className="w-full py-2.5 rounded-xl bg-gray-700 dark:bg-slate-200 text-white dark:text-gray-800 text-sm font-bold active:scale-95"
                  >
                    Accept cash
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active Loans Portfolio ── */}
      <div data-tour="active-loans" className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 gap-3 shadow-bottom">
        <ActiveLoansCard
          loans={loansData?.allItems ?? []}
          fundMap={fundMap}
          fundLentMap={fundLentMap}
          eosMap={eosMap}
          resolveName={resolveName}
          hasName={hasName}
          onAddContact={(addr, suggestedName) => {
            const name = prompt(
              `Name for ${addr.slice(0, 6)}…${addr.slice(-4)}:`,
              suggestedName || '',
            );
            if (name) addContact(addr, name);
          }}
          onRefresh={refreshFromChain}
          refreshing={chainSyncing}
          onDeepSync={handleDeepSync}
          onCashIn={(loan) => handleOpenForm('cashIn', { memberAddress: loan.borrower })}
          onCashOut={(loan) => handleOpenForm('cashOut', { memberAddress: loan.borrower })}
          onViewMap={(loansWithLand) => {
            setFieldActivity({
              portfolioMode: true,
              portfolioLoans: loansWithLand,
              features: [],
              geojson: { type: 'FeatureCollection', features: [] },
            });
            setIx(2);
          }}
          collectDeadline={collectDeadline}
          unionAddress={unionAddr}
        />
      </div>

    </div>
  );
};

export default UnionReserve;
