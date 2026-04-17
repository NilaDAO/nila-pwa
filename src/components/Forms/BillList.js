import { motion, AnimatePresence } from 'framer-motion';

/**
 * BillList — shows one row per scan session (bulk or individual scan run).
 * Each group is removable. Summary footer shows total bill count + total value.
 */
const BillList = ({
  scanGroups,
  scannedBills,
  runningTotal,
  mode,
  onRemoveGroup,
  onRemoveBill,
  pendingCount,
  isUploading,
  uploadPending,
}) => {
  const frontCount = scannedBills.filter(b => b.side === 'front').length;
  const backCount  = scannedBills.filter(b => b.side === 'back').length;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">

      {/* Per-group rows */}
      <AnimatePresence initial={false}>
        {scanGroups.map((group) => (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-between rounded-xl bg-gray-100 dark:bg-slate-800 px-3 py-2.5"
          >
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              {/* Denomination breakdown for this group */}
              <p className="text-sm font-semibold dark:text-white truncate">
                {group.label}
              </p>
              <p className="text-xs dark:text-slate-400">
                ₹{group.total.toLocaleString('en-IN')}
                {group.confidence != null && (
                  <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                    {Math.round(group.confidence * 100)}% conf
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => onRemoveGroup(group.id)}
              className="ml-3 p-1.5 rounded-full text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 active:scale-90 shrink-0"
              aria-label="Remove scan"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {scanGroups.length === 0 && (
        <p className="text-sm dark:text-slate-400 text-center py-4">No cash scanned yet</p>
      )}

      {/* Summary footer */}
      {scannedBills.length > 0 && (
        <div className="flex justify-between items-baseline pt-2 border-t border-gray-200 dark:border-slate-700 mt-1">
          <div>
            <p className="text-xs dark:text-slate-400">
              {scannedBills.length} item{scannedBills.length !== 1 ? 's' : ''}
              {(frontCount > 0 || backCount > 0) && (
                <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                  ({frontCount}f + {backCount}b)
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold dark:text-white">
              ₹{runningTotal.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}

      {/* Training data upload */}
      {pendingCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={uploadPending}
            disabled={isUploading}
            className="text-xs font-bold active:scale-95 text-blue-500 dark:text-blue-400"
          >
            {isUploading ? 'Uploading...' : `Upload ${pendingCount} photo${pendingCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Inventory warnings (PAYOUT only) */}
      {mode === 'PAYOUT' && scannedBills.some(b => b.inventoryStatus === 'unknown') && (
        <div className="rounded-xl bg-yellow-100 dark:bg-yellow-900/30 p-3 text-xs">
          <p className="font-bold text-yellow-800 dark:text-yellow-300">
            {scannedBills.filter(b => b.inventoryStatus === 'unknown').length} bill(s) not in recorded inventory
          </p>
          <p className="text-yellow-700 dark:text-yellow-400 mt-1">
            May be bank-cycled replacements. Count continues.
          </p>
        </div>
      )}
      {mode === 'PAYOUT' && scannedBills.some(b => b.inventoryStatus === 'pending') && (
        <div className="rounded-xl bg-gray-200 dark:bg-slate-700 p-3 text-xs dark:text-slate-400">
          Inventory check pending — will verify on sync.
        </div>
      )}
    </div>
  );
};

export default BillList;
