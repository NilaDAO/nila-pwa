import { useState, useEffect } from 'react';
import { useGlobalOpenRedeemOrders, useGlobalOpenCashOffers, useCashOffer } from '../../hooks/useCashOffer.ts';
import { useRedeemOrder } from '../../hooks/useRedeemOrder.ts';
import { useFxPool, useContract, useProvider } from '../../hooks/useWallet.ts';
import nilaFxPoolArtifact from '../../components/ABI/NilaFxPool.json';

const fxPoolAbi = nilaFxPoolArtifact.abi ?? nilaFxPoolArtifact;

function truncate(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function deadlineLabel(sec) {
  const rem = sec - Math.floor(Date.now() / 1000);
  if (rem <= 0) return 'Expired';
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
      <span className={`text-xs dark:text-white ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

// ── Get Cash fill sheet ──────────────────────────────────────────────────────
// LP fills a contract CashOffer: deposits USDT, walks to union, picks up INR cash.
function GetCashFillSheet({ offer, onClose }) {
  const { lpFillRedeemOrder, lpReclaimRedeemOrder } = useFxPool();
  const { data: live } = useCashOffer(offer?.id);

  const [step, setStep]         = useState('review');
  const [error, setError]       = useState(null);
  const [usdtEst, setUsdtEst]   = useState(null);

  const { provider } = useProvider();
  const fxAddress    = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool       = useContract(fxAddress, fxPoolAbi, provider);

  // Compute exact USDT from escrow locked rate
  useEffect(() => {
    if (!fxPool || !offer) return;
    (async () => {
      try {
        const escrow = await fxPool.getEscrow(offer.escrowId);
        // usdtAmount = ninAmount * 1e8 / mintRate / 1e12  (oracleDecimals=8, usdtDecimals=6)
        const usdt6 = (escrow.ninAmount * 10n ** 8n) / escrow.mintRate / 10n ** 12n;
        setUsdtEst(Number(usdt6) / 1e6);
      } catch {}
    })();
  }, [fxPool, offer]);

  // Auto-advance when union confirms delivery
  useEffect(() => {
    if (step === 'pending' && live?.status === 2) setStep('done');
  }, [live?.status, step]);

  const expired = step === 'pending' && live?.deadline && Math.floor(Date.now() / 1000) > live.deadline;

  const handleFill = async () => {
    setError(null);
    setStep('filling');
    try {
      await lpFillRedeemOrder(offer.id);
      setStep('pending');
    } catch (err) {
      setError(err?.reason || err?.message || 'Transaction failed');
      setStep('review');
    }
  };

  const handleReclaim = async () => {
    setError(null);
    try {
      await lpReclaimRedeemOrder(offer.id);
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Reclaim failed');
    }
  };

  return (
    <div className="flex flex-col gap-4 px-2 pb-8">
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-bold dark:text-white">Get Cash — Deposit USDT</p>
        <button onClick={onClose} className="text-xs text-gray-400 dark:text-slate-500 active:scale-95">✕ Back</button>
      </div>

      {step === 'review' && (
        <>
          <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex flex-col gap-2">
            <Row label="Union"        value={truncate(offer.union)} />
            <Row label="You collect"  value={`₹${Number(offer.inrValue).toLocaleString('en-IN')}`} bold />
            <Row label="You deposit"  value={usdtEst != null ? `$${usdtEst.toFixed(2)} USDT` : '…'} bold />
            <Row label="Cash bonus"   value={`${(offer.feeBP / 100).toFixed(2)}%`} />
            <Row label="Expires"      value={deadlineLabel(offer.deadline)} />
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Deposit USDT on-chain now, then walk to the union and collect
            ₹{Number(offer.inrValue).toLocaleString('en-IN')} cash (+ {(offer.feeBP / 100).toFixed(2)}% bonus).
            Union confirms on-chain once cash is handed over.
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            onClick={handleFill}
            className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
          >
            Approve USDT & Fill
          </button>
        </>
      )}

      {step === 'filling' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
          <p className="text-sm dark:text-white">Approving and filling…</p>
        </div>
      )}

      {step === 'pending' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">Walk to the union</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Collect ₹{Number(offer.inrValue).toLocaleString('en-IN')} cash from {truncate(offer.union)}.
              Union will mark complete on-chain once cash is handed over.
            </p>
          </div>
          {expired && (
            <>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={handleReclaim}
                className="w-full py-3 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
              >
                Reclaim USDT
              </button>
            </>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-3xl">✓</p>
          <p className="text-sm font-bold dark:text-white">
            {live?.status === 2 ? 'Cash collected!' : 'USDT reclaimed.'}
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 dark:text-white text-xs font-bold active:scale-95"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

// ── Give Cash fill sheet ─────────────────────────────────────────────────────
// LP fills a contract RedeemOrder: deposits USDT + brings INR cash, gets USDT + fee returned.
function GiveCashFillSheet({ offer, onClose }) {
  const { lpFillCashOffer } = useFxPool();
  const { data: live } = useRedeemOrder(offer?.id);

  const [step, setStep]       = useState('review');
  const [error, setError]     = useState(null);
  const [usdtEst, setUsdtEst] = useState(null);

  const { provider } = useProvider();
  const fxAddress    = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool       = useContract(fxAddress, fxPoolAbi, provider);

  // Quote USDT using current oracle rate + feeBP
  useEffect(() => {
    if (!fxPool || !offer) return;
    (async () => {
      try {
        const usdtBase = await fxPool.quoteRedeem(offer.ninAmount);
        const fee      = (usdtBase * BigInt(offer.feeBP)) / 10_000n;
        setUsdtEst(Number(usdtBase + fee) / 1e6);
      } catch {}
    })();
  }, [fxPool, offer]);

  // Auto-advance when union confirms USDT delivered to LP
  useEffect(() => {
    if (step === 'pending' && live?.status === 2) setStep('done');
  }, [live?.status, step]);

  const handleFill = async () => {
    setError(null);
    setStep('filling');
    try {
      await lpFillCashOffer(offer.id);
      setStep('pending');
    } catch (err) {
      setError(err?.reason || err?.message || 'Transaction failed');
      setStep('review');
    }
  };

  return (
    <div className="flex flex-col gap-4 px-2 pb-8">
      <div className="flex justify-between items-center mb-1">
        <p className="text-sm font-bold dark:text-white">Give Cash — Earn USDT</p>
        <button onClick={onClose} className="text-xs text-gray-400 dark:text-slate-500 active:scale-95">✕ Back</button>
      </div>

      {step === 'review' && (
        <>
          <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex flex-col gap-2">
            <Row label="Union"          value={truncate(offer.union)} />
            <Row label="Cash to bring"  value={`₹${Number(offer.inrValue).toLocaleString('en-IN')}`} bold />
            <Row label="USDT to deposit" value={usdtEst != null ? `$${usdtEst.toFixed(2)} USDT` : '…'} bold />
            <Row label="Fee (USDT)"     value={`${(offer.feeBP / 100).toFixed(2)}%`} />
            <Row label="Expires"        value={deadlineLabel(offer.deadline)} />
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Deposit USDT on-chain, then bring ₹{Number(offer.inrValue).toLocaleString('en-IN')} cash to the union.
            After the union confirms receipt, your USDT + {(offer.feeBP / 100).toFixed(2)}% fee is released to your wallet.
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            onClick={handleFill}
            className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
          >
            Approve USDT & Fill
          </button>
        </>
      )}

      {step === 'filling' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
          <p className="text-sm dark:text-white">Approving and filling…</p>
        </div>
      )}

      {step === 'pending' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Bring cash to the union</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Deliver ₹{Number(offer.inrValue).toLocaleString('en-IN')} cash to {truncate(offer.union)}.
            Union will confirm on-chain; your USDT + fee will be released automatically.
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-3xl">✓</p>
          <p className="text-sm font-bold dark:text-white">USDT released!</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
            Union confirmed. USDT + fee sent to your wallet.
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 dark:text-white text-xs font-bold active:scale-95"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

// ── Offer card ───────────────────────────────────────────────────────────────
function OfferCard({ union, inrValue, feeBP, deadline, onFill }) {
  return (
    <div className="flex flex-row items-center justify-between bg-gray-100 dark:bg-slate-800 rounded-2xl px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-bold dark:text-white">₹{Number(inrValue).toLocaleString('en-IN')}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400">{truncate(union)}</p>
        <p className="text-xs text-gray-400 dark:text-slate-500">{(feeBP / 100).toFixed(2)}% fee · {deadlineLabel(deadline)}</p>
      </div>
      <button
        onClick={onFill}
        className="px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-bold active:scale-95"
      >
        Fill
      </button>
    </div>
  );
}

// ── Main OfferList ───────────────────────────────────────────────────────────
export function OfferList({ handleOpenForm }) {
  const [tab,     setTab]     = useState('get');   // 'get' | 'give'
  const [filling, setFilling] = useState(null);    // { tab, offer }

  // "Get Cash": LP picks up INR cash (contract CashOffer → fillCashOffer)
  const { data: getOffers  = [], isLoading: loadingGet  } = useGlobalOpenRedeemOrders();
  // "Give Cash": LP brings INR cash (contract RedeemOrder → fillRedeemOrder)
  const { data: giveOffers = [], isLoading: loadingGive } = useGlobalOpenCashOffers();

  if (filling) {
    return filling.tab === 'get'
      ? <GetCashFillSheet offer={filling.offer} onClose={() => setFilling(null)} />
      : <GiveCashFillSheet offer={filling.offer} onClose={() => setFilling(null)} />;
  }

  const loading = tab === 'get' ? loadingGet : loadingGive;
  const offers  = tab === 'get' ? getOffers  : giveOffers;

  return (
    <div className="flex flex-col gap-4 px-2 pb-10 w-full">

      {/* Tab bar */}
      <div className="flex rounded-2xl bg-gray-100 dark:bg-slate-800 p-1 gap-1">
        {[
          { key: 'get',  label: 'Get Cash' },
          { key: 'give', label: 'Give Cash' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
              tab === key
                ? 'bg-white dark:bg-slate-600 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 dark:text-slate-400 px-1">
        {tab === 'get'
          ? 'Deposit USDT on-chain, walk to the union, collect INR cash.'
          : 'Deposit USDT on-chain, bring INR cash to the union, earn USDT + fee.'}
      </p>

      {/* Offer list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2">
          <p className="text-sm dark:text-slate-400">No open offers</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
            Check back later or enable notifications to be alerted.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {offers.map((o) => (
            <OfferCard
              key={o.id.toString()}
              union={o.union}
              inrValue={o.inrValue}
              feeBP={o.feeBP}
              deadline={o.deadline}
              onFill={() => setFilling({ tab, offer: o })}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => handleOpenForm(null)}
        className="text-xs text-gray-400 dark:text-slate-500 text-center py-2 active:scale-95"
      >
        ← Back
      </button>
    </div>
  );
}

export default OfferList;
