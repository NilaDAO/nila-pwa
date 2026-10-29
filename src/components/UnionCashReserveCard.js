import { useDataContext } from '../utils/NavigationContext';
import { useUnionCashReserve } from '../hooks/useUnionCashReserve.ts';

/** Format a bigint nIN value (18 dec) as an integer ₹ string with locale commas. */
function inrDisplay(nin) {
  return `₹${Number(nin / 10n ** 18n).toLocaleString('en-IN')}`;
}

function urgencyClass(pct) {
  if (pct < 0.2) return 'text-red-600 dark:text-red-400';
  if (pct < 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-700 dark:text-green-400';
}

function deadlineLabel(nextDeadline) {
  if (nextDeadline === null) return '—';
  const remaining = nextDeadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'Expired';
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

export function UnionCashReserveCard({ handleOpenForm }) {
  const { db } = useDataContext();
  const unionAddr = db?.union?.address;

  const { data, isLoading } = useUnionCashReserve(unionAddr);

  const treasury     = data?.treasury       ?? 0n;
  const activeEscrow = data?.activeEscrowNin ?? 0n;
  const available    = data?.available       ?? 0n;
  const nextDeadline = data?.nextDeadline    ?? null;
  const pct          = treasury > 0n ? Number(available) / Number(treasury) : 1;
  const deadlineUrgent = nextDeadline !== null && nextDeadline - Math.floor(Date.now() / 1000) < 86400;

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 flex flex-col gap-3">
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
              <span className="text-xs text-gray-500 dark:text-slate-400">Available</span>
              <span className={`text-xs font-bold ${urgencyClass(pct)}`}>{inrDisplay(available)}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct < 0.2 ? 'bg-red-500' : pct < 0.5 ? 'bg-amber-400' : 'bg-green-500'}`}
              style={{ width: `${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%` }}
            />
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500 dark:text-slate-400">Next expiry</span>
            <span className={`text-xs font-bold ${deadlineUrgent ? 'text-red-600 dark:text-red-400' : 'dark:text-white'}`}>
              {deadlineLabel(nextDeadline)}{deadlineUrgent ? ' ⚠' : ''}
            </span>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleOpenForm('cashOut')}
              className="flex-1 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-bold active:scale-95"
            >
              Cash Out
            </button>
            <button
              onClick={() => handleOpenForm('redeem')}
              className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 dark:text-white text-xs font-bold active:scale-95"
            >
              Redeem
            </button>
          </div>
        </>
      )}
    </div>
  );
}
