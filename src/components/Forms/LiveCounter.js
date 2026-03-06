import { motion, AnimatePresence } from 'framer-motion';
import { truncateSerial, groupByDenomination } from '../../utils/cashCounterHelpers';

const LiveCounter = ({ scannedBills, runningTotal, mode, pendingCount, isUploading, uploadPending }) => {
  const groups = groupByDenomination(scannedBills);
  const lastBill = scannedBills[scannedBills.length - 1];
  const frontCount = scannedBills.filter(b => b.side === 'front').length;
  const backCount = scannedBills.filter(b => b.side === 'back').length;

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* Header stats */}
      <div className="flex flex-row justify-between items-baseline">
        <div>
          <p className="text-xs dark:text-slate-400">Bills</p>
          <p className="text-2xl font-bold dark:text-white">{scannedBills.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs dark:text-slate-400">Total</p>
          <p className="text-2xl font-bold dark:text-white">
            {runningTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Last scanned */}
      {lastBill && (
        <motion.div
          key={lastBill.serialNumber}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs dark:text-slate-400"
        >
          Last: ₹{lastBill.denomination.toLocaleString('en-IN')}{' '}
          <span className="font-mono">({truncateSerial(lastBill.serialNumber)})</span>
        </motion.div>
      )}

      {/* Denomination breakdown */}
      {Object.keys(groups).length > 0 && (
        <div className="rounded-xl bg-gray-100 dark:bg-slate-800 p-3">
          <AnimatePresence>
            {Object.entries(groups)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([denom, count]) => (
                <motion.div
                  key={denom}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-between text-sm py-1 dark:text-white"
                >
                  <span>₹{Number(denom).toLocaleString('en-IN')} x {count}</span>
                  <span className="font-bold">
                    = ₹{(Number(denom) * count).toLocaleString('en-IN')}
                  </span>
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
      )}

      {/* Side breakdown + training data */}
      {(frontCount > 0 || backCount > 0) && (
        <div className="flex justify-between items-center text-xs dark:text-slate-400">
          <span>{frontCount} front + {backCount} back</span>
          {pendingCount > 0 && (
            <button
              onClick={uploadPending}
              disabled={isUploading}
              className="text-xs font-bold active:scale-95 text-blue-500 dark:text-blue-400"
            >
              {isUploading ? 'Uploading...' : `Upload ${pendingCount} photo${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* Inventory warnings (PAYOUT only) */}
      {mode === 'PAYOUT' && scannedBills.some((b) => b.inventoryStatus === 'unknown') && (
        <div className="rounded-xl bg-yellow-100 dark:bg-yellow-900/30 p-3 text-xs">
          <p className="font-bold text-yellow-800 dark:text-yellow-300">
            {scannedBills.filter((b) => b.inventoryStatus === 'unknown').length} bill(s) not in recorded inventory
          </p>
          <p className="text-yellow-700 dark:text-yellow-400 mt-1">
            May be bank-cycled replacements. Count continues.
          </p>
        </div>
      )}

      {mode === 'PAYOUT' && scannedBills.some((b) => b.inventoryStatus === 'pending') && (
        <div className="rounded-xl bg-gray-200 dark:bg-slate-700 p-3 text-xs dark:text-slate-400">
          Inventory check pending — will verify on sync.
        </div>
      )}
    </div>
  );
};

export default LiveCounter;
