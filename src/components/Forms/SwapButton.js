import { ClaimButton } from '../UI/buttons';

const SwapButton = ({ mode, runningTotal, scannedBills, disabled, onSwap, isProcessing }) => {
  if (!scannedBills.length) return null;

  const label = mode === 'DEPOSIT'
    ? `Mint ${runningTotal.toLocaleString('en-IN')} nIN`
    : `Burn ${runningTotal.toLocaleString('en-IN')} nIN`;

  return (
    <div className="flex flex-col items-center gap-3 py-4 px-4">
      <div className="rounded-xl bg-gray-100 dark:bg-slate-800 p-4 w-full text-center">
        <p className="text-xs dark:text-slate-400 mb-1">
          {mode === 'DEPOSIT' ? 'Deposit' : 'Payout'}: {scannedBills.length} bill(s)
        </p>
        <p className="text-lg font-bold dark:text-white">
          {runningTotal.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
        </p>
      </div>
      <ClaimButton
        disabled={disabled || isProcessing}
        handleClick={onSwap}
        title={label}
        pendingTitle="Processing..."
      />
    </div>
  );
};

export default SwapButton;
