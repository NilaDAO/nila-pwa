import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataContext } from '../../utils/NavigationContext';
import { useFxPool } from '../../hooks/useWallet.ts';
import useCashSession from '../../hooks/useCashSession';
import BulkBillScanner from './BulkBillScanner';
import BillList from './BillList';

function truncate(addr) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

/**
 * Union leader confirms a filled CashOffer:
 *  count bills (LP already deposited USDT) → confirmCashOfferDelivered → USDT released to LP
 *
 * Opened from the task list with txdetails = { offerId: bigint, inrValue: bigint }
 */
export function CashOfferConfirmForm({ handleOpenForm }) {
  const { txdetails } = useDataContext();
  const { confirmCashOfferDelivered } = useFxPool();

  const offerId  = txdetails?.offerId  ?? null;
  const inrValue = txdetails?.inrValue ?? null;
  const inrTarget = Number(inrValue ?? 0n);

  const [step,  setStep]  = useState('count');
  const [error, setError] = useState(null);

  const { scannedBills, scanGroups, runningTotal, addBulkGroup, removeScanGroup, removeBill } = useCashSession();

  const handleBulkConfirmed = useCallback(({ bills, s3Key, confidence, reasoning }) => {
    addBulkGroup({ bills, s3Key, confidence, reasoning });
  }, [addBulkGroup]);

  const handleConfirm = async () => {
    if (offerId === null) return;
    setError(null);
    try {
      await confirmCashOfferDelivered(offerId);
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Confirm failed');
    }
  };

  const countComplete = runningTotal >= inrTarget && inrTarget > 0;

  return (
    <div className="flex flex-col gap-3 px-2 mb-10 w-full">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold dark:text-white">Hand Over Cash</p>
        <button onClick={() => handleOpenForm(null)} className="text-xs text-gray-400 dark:text-slate-500 active:scale-95">✕ Close</button>
      </div>

      <AnimatePresence mode="wait">

        {step === 'count' && (
          <motion.div key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400">Hand out to LP</p>
                <p className="text-lg font-bold dark:text-white">₹{inrTarget.toLocaleString('en-IN')}</p>
              </div>
            </div>
            <BulkBillScanner onBulkConfirmed={handleBulkConfirmed} />
            {scanGroups.length > 0 && (
              <BillList
                scanGroups={scanGroups}
                scannedBills={scannedBills}
                runningTotal={runningTotal}
                onRemoveGroup={removeScanGroup}
                onRemoveBill={removeBill}
              />
            )}
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              onClick={handleConfirm}
              disabled={!scannedBills.length || runningTotal < inrTarget}
              className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98] disabled:opacity-40"
            >
              {scannedBills.length
                ? countComplete
                  ? 'Confirm — release USDT'
                  : `Scan ₹${(inrTarget - runningTotal).toLocaleString('en-IN')} more`
                : 'Scan the bills first'}
            </button>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 items-center py-8">
            <p className="text-3xl">✓</p>
            <p className="text-sm font-bold dark:text-white">Complete!</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
              USDT released to LP. ₹{inrTarget.toLocaleString('en-IN')} cash handed over.
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
