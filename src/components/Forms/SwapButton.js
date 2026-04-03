import { ClaimButton } from '../UI/buttons';

const SwapButton = ({ mode, runningTotal, scannedBills, disabled, onSwap, isProcessing, purposeLabel }) => {
  if (!scannedBills.length) return null;

  const action = purposeLabel || (mode === 'DEPOSIT' ? 'Mint' : 'Burn');
  // If purposeLabel already contains the full label (e.g. "Repay ₹1,000 nIN"), use it directly
  const label = purposeLabel?.includes('nIN') ? purposeLabel : `${action} ₹${runningTotal.toLocaleString('en-IN')} nIN`;

  return (
    <div className="flex flex-col items-center gap-3 py-4 px-4">
      <ClaimButton
        disabled={disabled || isProcessing}
        handleClick={onSwap}
        title={isProcessing ? 'Processing...' : label}
        pendingTitle="Processing..."
      />
    </div>
  );
};

export default SwapButton;
