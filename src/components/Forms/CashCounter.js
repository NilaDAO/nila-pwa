import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlideToggle, ClaimButton } from '../UI/buttons';
import BillScanner from './BillScanner';
import LiveCounter from './LiveCounter';
import SwapButton from './SwapButton';
import useCashSession from '../../hooks/useCashSession';
import useInventoryCheck from '../../hooks/useInventoryCheck';
import useCashSwap from '../../hooks/useCashSwap';
import useTrainingData from '../../hooks/useTrainingData';

// 3 phases: 'pre-scan' | 'scan' | 'post-scan'
const CashCounter = ({ handleOpenForm }) => {
  const {
    mode,
    setMode,
    scannedBills,
    runningTotal,
    addBill,
    updateBillStatus,
    clearSession,
  } = useCashSession();

  const { checkSerial } = useInventoryCheck(updateBillStatus);
  const { executeSwap, isProcessing } = useCashSwap(clearSession, handleOpenForm);
  const { queueCapture, pendingCount, isUploading, uploadPending } = useTrainingData();
  const [phase, setPhase] = useState(scannedBills.length > 0 ? 'post-scan' : 'pre-scan');

  const isDeposit = mode === 'DEPOSIT';

  const handleToggleMode = () => {
    setMode(isDeposit ? 'PAYOUT' : 'DEPOSIT');
  };

  const handleBillConfirmed = useCallback(
    (bill) => {
      addBill(bill);
      if (bill.imageDataUrl && !bill.s3Key) queueCapture(bill);
      if (mode === 'PAYOUT' && bill.side === 'front') checkSerial(bill.serialNumber);
    },
    [addBill, queueCapture, mode, checkSerial]
  );

  // transition: stop scanning → review (or pre-scan if no bills)
  const handleStopScanning = useCallback(() => {
    setPhase(scannedBills.length > 0 ? 'post-scan' : 'pre-scan');
  }, [scannedBills.length]);

  // transition: start scanning
  const handleStartScanning = useCallback(() => {
    setPhase('scan');
  }, []);

  const handleSwap = useCallback(async () => {
    const msg = `${isDeposit ? 'Mint' : 'Burn'} ${runningTotal.toLocaleString('en-IN')} nIN from ${scannedBills.length} bills?`;
    if (!confirm(msg)) return;
    await executeSwap(mode, scannedBills, runningTotal);
  }, [isDeposit, mode, scannedBills, runningTotal, executeSwap]);

  return (
    <div className="flex flex-col gap-2 px-2 mb-10 w-full">
      <AnimatePresence mode="wait">
        {/* ────────── PRE-SCAN ────────── */}
        {phase === 'pre-scan' && (
          <motion.div
            key="pre-scan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 items-center"
          >
            {/* Mode toggle */}
            <div className="flex justify-center w-full">
              <SlideToggle
                isOn={isDeposit}
                handleToggle={handleToggleMode}
                onTitle="Deposit"
                offTitle="Payout"
              />
            </div>

            <p className="text-xs dark:text-slate-400 text-center px-4">
              {isDeposit
                ? 'Take cash of a member'
                : 'Give cash to a member'}
            </p>

            {/* Tap to scan */}
            <button
              onClick={handleStartScanning}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl active:scale-[0.98] py-12 w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 dark:text-slate-400 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              <p className="text-sm font-bold dark:text-white">Tap to scan bills</p>
              <p className="text-xs dark:text-slate-400 text-center px-8">
                Place bill on a flat surface, Gandhi portrait facing up
              </p>
            </button>
          </motion.div>
        )}

        {/* ────────── SCAN ────────── */}
        {phase === 'scan' && (
          <motion.div
            key="scan"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col -mx-2 -mb-10"
            style={{ marginTop: '-2rem' }}
          >
            <BillScanner
              onBillConfirmed={handleBillConfirmed}
              billCount={scannedBills.length}
              runningTotal={runningTotal}
              onStop={handleStopScanning}
            />
          </motion.div>
        )}

        {/* ────────── POST-SCAN ────────── */}
        {phase === 'post-scan' && (
          <motion.div
            key="post-scan"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2"
          >
            <>
              <LiveCounter
                  scannedBills={scannedBills}
                  runningTotal={runningTotal}
                  mode={mode}
                  pendingCount={pendingCount}
                  isUploading={isUploading}
                  uploadPending={uploadPending}
                />

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => { if (confirm('Clear all scanned bills?')) { clearSession(); setPhase('pre-scan'); } }}
                    className="text-xs text-red dark:text-red font-bold py-2 px-4 active:scale-95"
                  >
                    Clear all
                  </button>
                </div>

                {/* Add more cash */}
                <div className="flex justify-center">
                  <button
                    onClick={handleStartScanning}
                    className="flex items-center gap-2 text-sm font-bold py-2.5 px-5 rounded-full bg-gray-100 dark:bg-slate-800 active:scale-[0.98]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                    </svg>
                    <span className="dark:text-white">Add more cash</span>
                  </button>
                </div>

                {/* Swap action */}
                <SwapButton
                  mode={mode}
                  runningTotal={runningTotal}
                  scannedBills={scannedBills}
                  disabled={false}
                  onSwap={handleSwap}
                  isProcessing={isProcessing}
                />
            </>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CashCounter;
