import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataContext } from '../../utils/NavigationContext';
import { useFxPool } from '../../hooks/useWallet.ts';
import { useRedeemOrder } from '../../hooks/useRedeemOrder.ts';
import useCashSession from '../../hooks/useCashSession';
import BulkBillScanner from './BulkBillScanner';
import BillList from './BillList';
import QRScanner from '../UI/qrScan';

function truncate(addr) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function deadlineSecs(dl) {
  const rem = dl - Math.floor(Date.now() / 1000);
  if (rem <= 0) return 'Expired';
  const d = Math.floor(rem / 86400);
  const h = Math.floor((rem % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

/**
 * Flow:
 *  scan-qr   → union scans farmer's QR (contains permit sig)
 *  review    → show amounts + USDT quote
 *  redeeming → tx1: redeemFarmerNin (burn nIN, USDT to union wallet)
 *  posting   → tx2: postRedeemOrder (lock USDT in pool, post cash request)
 *  waiting   → open order, LP has not yet committed
 *  committed → LP committed, union counts bills then confirms delivery
 *  done
 *
 * QR payload (JSON): { farmer, ninAmount, inrValue, feeBP, permitDeadline, v, r, s }
 */
export function RedeemForm({ handleOpenForm }) {
  const { db, txdetails } = useDataContext();
  const unionAddr = db?.union?.address;

  const { redeemFarmerNin, postRedeemOrder, confirmCashDelivery, quoteRedeem } = useFxPool();

  // When opened from the pending-deliveries list, txdetails.orderId is pre-set
  const presetOrderId = txdetails?.orderId ?? null;

  const [step,      setStep]      = useState(presetOrderId !== null ? 'committed' : 'scan-qr');
  const [permit,    setPermit]    = useState(null);
  const [usdtQuote, setUsdtQuote] = useState(null);
  const [usdtOut,   setUsdtOut]   = useState(null);
  const [orderId,   setOrderId]   = useState(presetOrderId);
  const [error,     setError]     = useState(null);

  const { data: order } = useRedeemOrder(orderId ?? undefined);

  const { scannedBills, scanGroups, runningTotal, addBulkGroup, removeScanGroup, removeBill } = useCashSession();

  // Auto-advance: open → committed
  if (step === 'waiting' && order?.status === 1) setStep('committed');

  useEffect(() => {
    if (!permit) return;
    quoteRedeem(permit.ninAmount).then(([base]) => {
      const withFee = base + (base * BigInt(permit.feeBP)) / 10_000n;
      setUsdtQuote(withFee);
    }).catch(() => setUsdtQuote(null));
  }, [permit]);

  const handleQrScanned = (raw) => {
    try {
      const data = JSON.parse(raw);
      setPermit({
        farmer:         data.farmer ?? data.member,
        ninAmount:      BigInt(data.ninAmount),
        inrValue:       BigInt(data.inrValue),
        feeBP:          Number(data.feeBP),
        permitDeadline: BigInt(data.permitDeadline),
        v:              Number(data.v),
        r:              data.r,
        s:              data.s,
      });
      setStep('review');
    } catch {
      setError('Invalid QR code. Expected JSON permit data.');
    }
  };

  const handleRedeem = async () => {
    if (!unionAddr || !permit) return;
    setError(null);
    setStep('redeeming');
    try {
      const usdt = await redeemFarmerNin(
        permit.farmer, permit.ninAmount,
        permit.permitDeadline, permit.v, permit.r, permit.s,
      );
      setUsdtOut(usdt);
      setStep('posting');
      const usdtWithBonus = usdt + (usdt * BigInt(permit.feeBP)) / 10_000n;
      const id = await postRedeemOrder(unionAddr, permit.farmer, permit.inrValue, usdtWithBonus, permit.feeBP);
      setOrderId(id);
      setStep('waiting');
    } catch (err) {
      setError(err?.reason || err?.message || 'Transaction failed');
      setStep('review');
    }
  };

  const handleConfirm = async () => {
    if (orderId === null) return;
    setError(null);
    try {
      await confirmCashDelivery(orderId);
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Confirm failed');
    }
  };

  const handleBulkConfirmed = useCallback(({ bills, s3Key, confidence, reasoning }) => {
    addBulkGroup({ bills, s3Key, confidence, reasoning });
  }, [addBulkGroup]);

  const inrTarget = Number(permit?.inrValue ?? order?.inrValue ?? 0n);
  const usdtFmt = (val) => val != null ? `$${(Number(val) / 1e6).toFixed(2)}` : '…';

  return (
    <div className="flex flex-col gap-3 px-2 mb-10 w-full">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold dark:text-white">Redeem — Give Cash</p>
        <button onClick={() => handleOpenForm(null)} className="text-xs text-gray-400 dark:text-slate-500 active:scale-95">✕ Close</button>
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Scan farmer QR ── */}
        {step === 'scan-qr' && (
          <motion.div key="scan-qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
            <p className="text-xs dark:text-slate-400">Scan the farmer's redeem QR (their pre-signed permit).</p>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <QRScanner sendTo={handleQrScanned} />
          </motion.div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 'review' && permit && (
          <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Farmer</span>
                <span className="text-xs font-mono dark:text-white">{truncate(permit.farmer)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Cash to give farmer</span>
                <span className="text-xs font-bold dark:text-white">₹{Number(permit.inrValue).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">nIN to burn</span>
                <span className="text-xs font-bold dark:text-white">{Number(permit.ninAmount / 10n ** 18n).toLocaleString('en-IN')} nIN</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">LP fee bonus</span>
                <span className="text-xs dark:text-white">{(permit.feeBP / 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">USDT to offer LP</span>
                <span className="text-xs font-bold dark:text-white">{usdtFmt(usdtQuote)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-500 dark:text-slate-400">Permit expires</span>
                <span className="text-xs dark:text-white">{deadlineSecs(Number(permit.permitDeadline))}</span>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              onClick={handleRedeem}
              className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
            >
              Burn nIN + Post Cash Request
            </button>
            <button onClick={() => setStep('scan-qr')} className="text-xs text-gray-400 dark:text-slate-500 text-center py-1 active:scale-95">← Rescan</button>
          </motion.div>
        )}

        {/* ── Step 3a: Burning nIN ── */}
        {step === 'redeeming' && (
          <motion.div key="redeeming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
            <p className="text-sm dark:text-white">Burning farmer nIN…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">Step 1 of 2 — redeeming nIN for USDT</p>
          </motion.div>
        )}

        {/* ── Step 3b: Posting order ── */}
        {step === 'posting' && (
          <motion.div key="posting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
            <p className="text-sm dark:text-white">Posting cash request…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">Step 2 of 2 — locking {usdtFmt(usdtOut)} USDT for LP</p>
          </motion.div>
        )}

        {/* ── Step 4: Waiting for LP ── */}
        {step === 'waiting' && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 items-center py-4">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm font-bold dark:text-white">Waiting for LP…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
              An LP will bring ₹{Number(permit?.inrValue ?? 0n).toLocaleString('en-IN')} cash and earn {usdtFmt(usdtOut)} USDT.
            </p>
            {order?.deadline && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Order expires in {deadlineSecs(order.deadline)}</p>
            )}
            {orderId !== null && (
              <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">Order #{orderId.toString()}</p>
            )}
          </motion.div>
        )}

        {/* ── Step 5: LP committed — count bills ── */}
        {step === 'committed' && order && (
          <motion.div key="committed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Hand out</p>
                <p className="text-lg font-bold dark:text-white">₹{inrTarget.toLocaleString('en-IN')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-slate-400">LP</p>
                <p className="text-xs font-mono dark:text-white">{order.lp ? truncate(order.lp) : '…'}</p>
              </div>
            </div>
            <BulkBillScanner onBulkConfirmed={handleBulkConfirmed} />
            {scanGroups.length > 0 && (
              <BillList scanGroups={scanGroups} scannedBills={scannedBills} runningTotal={runningTotal} onRemoveGroup={removeScanGroup} onRemoveBill={removeBill} />
            )}
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              onClick={handleConfirm}
              disabled={!scannedBills.length || runningTotal < inrTarget}
              className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98] disabled:opacity-40"
            >
              {scannedBills.length
                ? runningTotal >= inrTarget
                  ? `Confirm — release ${usdtFmt(order.usdtLocked)}`
                  : `Scan ₹${(inrTarget - runningTotal).toLocaleString('en-IN')} more`
                : 'Scan the bills first'}
            </button>
          </motion.div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 items-center py-8">
            <p className="text-3xl">✓</p>
            <p className="text-sm font-bold dark:text-white">Complete!</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
              USDT released to LP. ₹{inrTarget.toLocaleString('en-IN')} cash delivered.
            </p>
            <button
              onClick={() => handleOpenForm(null)}
              className="mt-4 px-6 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 dark:text-white text-xs font-bold active:scale-95"
            >
              Close
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
