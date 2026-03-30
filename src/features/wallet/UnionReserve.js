import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDataContext } from '../../utils/NavigationContext';
import { useUnionCashReserve } from '../../hooks/useUnionCashReserve.ts';
import { usePendingCashDeliveries } from '../../hooks/useCashOffer.ts';
import { useFxPool } from '../../hooks/useWallet.ts';
import { useUnionTreasury, useLoadFundsData } from '../../hooks/useLoadFunds.ts';
import { useErc20Balances } from '../../hooks/useLoadETH.ts';
import { IndividualExchangeButton, ClaimButton } from '../../components/UI/buttons.js';
import { useActiveLoans, useActiveLoansChainSync } from '../../hooks/useActiveLoans';
import { useContactBook } from '../../hooks/useContactBook';
import ActiveLoansCard from './ActiveLoansCard';

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

function pctBar(pct) {
  const color = pct < 0.2 ? 'bg-red-500' : pct < 0.5 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%` }}
      />
    </div>
  );
}

// ₹100 step for treasury adjustments
const STEP = 100n * 10n ** 18n;

const UnionReserve = ({ handleOpenForm }) => {
  const { db, unionFunds } = useDataContext();
  const unionAddr = db?.union?.address;
  const chain = process.env.REACT_APP_CHAIN_ID || '137';

  const { data, isLoading } = useUnionCashReserve(unionAddr);
  const { data: tokenData = [] } = useErc20Balances(chain, db?.address, { enabled: !!db?.address });
  const ninInitialBalance = Number(tokenData.find(t => t.sym === 'nIN')?.bal ?? 0);
  const { data: pendingDeliveries = [] } = usePendingCashDeliveries(unionAddr);
  const { postCashOffer } = useFxPool();
  const { deposit, withdraw } = useUnionTreasury();
  const { data: loansData } = useActiveLoans(unionAddr, !!db?.union?.leader);
  const { refreshFromChain, isFetching: chainSyncing } = useActiveLoansChainSync(unionAddr, !!db?.union?.leader);
  const { resolveName, hasName, addContact } = useContactBook();
  const { data: fundsData = [] } = useLoadFundsData(unionAddr, unionFunds ?? [], db?.address);
  const qc = useQueryClient();

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
    console.log('[DeepSync] calling', url, { union: unionAddr, lookback_blocks: lookbackBlocks });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ union: unionAddr, lookback_blocks: lookbackBlocks }),
    });
    const data = await res.json();
    console.log('[DeepSync] result:', data);
    return data;
  }, [unionAddr]);

  // treasury panel state
  const [treasuryDir,    setTreasuryDir]    = useState('deposit'); // 'deposit' | 'withdraw'
  const [treasuryAmount, setTreasuryAmount] = useState(0n);
  const [treasuryStep,   setTreasuryStep]   = useState('input');   // 'input' | 'confirm'

  const handleTreasuryInput = (e) => {
    if      (e === 'add')    setTreasuryAmount(a => a + STEP * 10n);
    else if (e === 'remove') setTreasuryAmount(a => a >= STEP * 10n ? a - STEP * 10n : 0n);
    else if (e === 0)        setTreasuryAmount(a => a + STEP);
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
  const pct             = treasury > 0n ? Number(available) / Number(treasury) : 1;

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="flex flex-col w-full mb-[220px] gap-4">

      {/* ── Union Cash Reserve ── */}
      <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 gap-6 shadow-bottom">
      <section className="flex flex-col gap-3">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Union Cash Reserve</p>

        {isLoading ? (
          <p className="text-xs text-gray-400 dark:text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Treasury</span>
                <span className="text-xs font-bold dark:text-white">{inrDisplay(treasury)}</span>
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
                <span className="text-xs text-gray-500 dark:text-slate-400">Available to scan</span>
                <span className={`text-xs font-bold ${pct < 0.2 ? 'text-red-600 dark:text-red-400' : pct < 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                  {inrDisplay(available)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Rainy day fund</span>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{inrDisplay(rainyDay)}</span>
              </div>
            </div>

            {pctBar(pct)}

            {/* ── Primary actions ── */}
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => handleOpenForm('cashIn')}
                className="flex-1 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-bold active:scale-95"
              >
                Cash In
              </button>
              <button
                onClick={() => handleOpenForm('cashOut')}
                className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-600 dark:text-white text-sm font-bold active:scale-95"
              >
                Cash Out
              </button>
            </div>

            {/* ── Pending loan draws ── */}
            {pendingDisburse.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Pending loan draws</p>
                {pendingDisburse.map(e => {
                  const urgent = e.deadline - now < 86400;
                  return (
                    <div key={String(e.escrowId)} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-slate-600 px-3 py-2">
                      <div>
                        <span className="text-sm font-bold dark:text-white">{inrValueDisplay(e.inrValue)}</span>
                        <span className={`ml-2 text-xs ${urgent ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-400'}`}>
                          {tsLabel(e.deadline)}{urgent ? ' ⚠' : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => postCashOffer(unionAddr, e.escrowId, 100)}
                        className="text-xs font-bold text-black dark:text-white border border-gray-300 dark:border-slate-500 rounded-lg px-3 py-1 active:scale-95"
                      >
                        Want USDT
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Scheduled member exits ── */}
            {scheduledExits.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
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

      {/* ── Adjust Treasury ── */}
      <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 gap-3 shadow-bottom">
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Adjust Treasury</p>
          <div className="flex gap-1">
            <button
              onClick={() => { setTreasuryDir('deposit'); setTreasuryStep('input'); setTreasuryAmount(0n); }}
              className={`text-xs px-3 py-1 rounded-full font-semibold ${treasuryDir === 'deposit' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-slate-600 dark:text-white'}`}
            >Deposit</button>
            <button
              onClick={() => { setTreasuryDir('withdraw'); setTreasuryStep('input'); setTreasuryAmount(0n); }}
              className={`text-xs px-3 py-1 rounded-full font-semibold ${treasuryDir === 'withdraw' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-slate-600 dark:text-white'}`}
            >Withdraw</button>
          </div>
        </div>
        {treasuryStep === 'input' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold dark:text-white">{inrDisplay(treasuryAmount)}</p>
              <div className="flex items-end gap-1">
                <IndividualExchangeButton
                  disabled_add={false}
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
          <div className="flex flex-col gap-2 items-center m-10">
            <p className="text-sm dark:text-white mb-10">
              {treasuryDir === 'deposit' ? 'Add' : 'Withdraw'} <span className="font-bold">{inrDisplay(treasuryAmount)}</span> {treasuryDir === 'deposit' ? 'to' : 'from'} treasury
            </p>
            <ClaimButton disabled={false} handleClick={handleTreasuryConfirm} title={treasuryDir === 'deposit' ? 'Deposit' : 'Withdraw'} />
            <button onClick={() => setTreasuryStep('input')} className="text-xs text-gray-400 dark:text-slate-400">change amount</button>
          </div>
        )}
      </section>
      </div>

      {/* ── Pending LP Deliveries ── */}
      {pendingDeliveries.length > 0 && (
        <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 gap-3 shadow-bottom">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Pending LP Deliveries</p>
          {pendingDeliveries.map(o => {
            const lpShort = resolveName(o.lp);
            const usdtDisplay = (Number(o.usdtLocked) / 1e6).toLocaleString('en-IN', { maximumFractionDigits: 2 });
            return (
              <div key={String(o.id)} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-slate-600 px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold dark:text-white">{inrValueDisplay(o.inrValue)}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-400">${usdtDisplay} USDT</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400 dark:text-slate-400">{lpShort}</span>
                    <span className={`text-xs ${o.deadline - now < 3600 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-400'}`}>
                      {tsLabel(o.deadline)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenForm('redeem', { orderId: o.id })}
                  className="text-xs font-bold text-black dark:text-white border border-gray-300 dark:border-slate-500 rounded-lg px-3 py-1 active:scale-95"
                >
                  Count Bills
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active Loans Portfolio ── */}
      <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl w-full py-6 gap-3 shadow-bottom">
        <ActiveLoansCard
          loans={loansData?.allItems ?? []}
          fundMap={fundMap}
          fundLentMap={fundLentMap}
          resolveName={resolveName}
          hasName={hasName}
          onAddContact={(addr) => {
            const name = prompt(`Name for ${addr.slice(0, 6)}…${addr.slice(-4)}:`);
            if (name) addContact(addr, name);
          }}
          onRefresh={refreshFromChain}
          refreshing={chainSyncing}
          onDeepSync={handleDeepSync}
          unionAddress={unionAddr}
        />
      </div>

    </div>
  );
};

export default UnionReserve;
