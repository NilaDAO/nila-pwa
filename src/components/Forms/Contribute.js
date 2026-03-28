import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BillScanner from './BillScanner';
import BulkBillScanner from './BulkBillScanner';
import BillList from './BillList';
import QRScanner from '../UI/qrScan';
import NameGate from '../UI/NameGate';
import SwapButton from './SwapButton';
import useCashSession from '../../hooks/useCashSession';
import useTrainingData from '../../hooks/useTrainingData';
import useCashSwap from '../../hooks/useCashSwap';
import { useDataContext } from '../../utils/NavigationContext';
import { useContactBook } from '../../hooks/useContactBook';
import { DropdownButton } from '../UI/buttons';
import { ethers } from 'ethers';

// phases: 'pre-scan' | 'scan-choice' | 'scan' | 'scan-bulk' | 'review' | 'confirm'
const Contribute = ({ handleOpenForm }) => {
  const { unionFunds } = useDataContext();
  const { resolveName, hasName, addContact } = useContactBook();
  const {
    scanGroups,
    scannedBills,
    runningTotal,
    addBill,
    addBulkGroup,
    removeScanGroup,
    removeBill,
    clearSession,
  } = useCashSession();

  const { queueCapture, pendingCount, isUploading, uploadPending } = useTrainingData();
  const { executeSwap, isProcessing } = useCashSwap(clearSession, handleOpenForm);

  const [phase, setPhase] = useState(scannedBills.length > 0 ? 'review' : 'pre-scan');
  const [memberAddress, setMemberAddress] = useState(null);
  const [selectedFund, setSelectedFund] = useState(() => unionFunds?.[0] ?? null);

  // loanType string decoded from the selected fund's bytes32
  const loanType = selectedFund
    ? (() => { try { return ethers.decodeBytes32String(selectedFund[2]); } catch { return null; } })()
    : null;

  const handleBillConfirmed = useCallback(
    (bill) => {
      addBill(bill);
      if (bill.imageDataUrl && !bill.s3Key) queueCapture(bill);
    },
    [addBill, queueCapture]
  );

  const handleBulkConfirmed = useCallback(
    ({ bills, s3Key, confidence, reasoning }) => {
      addBulkGroup({ bills, s3Key, confidence, reasoning });
      setPhase('review');
    },
    [addBulkGroup]
  );

  const handleStopScanning = useCallback(() => {
    setPhase(scannedBills.length > 0 ? 'review' : 'scan-choice');
  }, [scannedBills.length]);

  const handleQrScanned = useCallback((address) => {
    setMemberAddress(address);
    if (!hasName(address)) {
      setPhase('name-gate');
    } else {
      setPhase('scan-choice');
    }
  }, [hasName]);

  const handleConfirm = useCallback(async () => {
    const msg = `Record ₹${runningTotal.toLocaleString('en-IN')} contribution for ${resolveName(memberAddress)}?`;
    if (!confirm(msg)) return;
    await executeSwap(scannedBills, runningTotal, {
      memberAddress,
      purpose: 'contribute',
      loanType,
    });
  }, [runningTotal, memberAddress, scannedBills, executeSwap, loanType]);

  return (
    <div className="flex flex-col gap-2 px-2 mb-10 w-full">
      <AnimatePresence mode="wait">

        {/* ────────── PRE-SCAN (QR camera inline) ────────── */}
        {phase === 'pre-scan' && (
          <motion.div
            key="pre-scan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 items-center"
          >
            <p className="text-xs dark:text-slate-400 text-center px-4">
              Scan the member's QR code to attribute shares to their account
            </p>
            <QRScanner sendTo={handleQrScanned} />
          </motion.div>
        )}

        {/* ────────── NAME GATE ────────── */}
        {phase === 'name-gate' && memberAddress && (
          <motion.div key="name-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }}>
            <NameGate
              address={memberAddress}
              onConfirm={(addr, name) => {
                addContact(addr, name);
                setPhase('scan-choice');
              }}
              onCancel={() => {
                setMemberAddress(null);
                setPhase('pre-scan');
              }}
            />
          </motion.div>
        )}

        {/* ────────── SCAN CHOICE ────────── */}
        {phase === 'scan-choice' && (
          <motion.div
            key="scan-choice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 items-center"
          >
            {/* Member pill */}
            <div className="flex items-center gap-2 py-1 w-full">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-xs font-mono dark:text-slate-300 truncate flex-1">
                {resolveName(memberAddress)}
              </p>
              <button
                onClick={() => setPhase('pre-scan')}
                className="text-xs text-gray-400 dark:text-slate-500 underline active:scale-95 shrink-0"
              >
                rescan
              </button>
            </div>

            {/* Fund selector */}
            {unionFunds?.length > 0 && (
              <div className="w-full">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Fund</p>
                <DropdownButton
                  options={unionFunds}
                  onSelect={(fund) => setSelectedFund(fund)}
                  z={20}
                  color="white"
                />
                {loanType && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                    Shares will be credited to <span className="font-bold">{loanType}</span>
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setPhase('scan')}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl active:scale-[0.98] py-8 w-full border border-gray-200 dark:border-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 dark:text-slate-400 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              <p className="text-sm font-bold dark:text-white">Scan one by one</p>
              <p className="text-xs dark:text-slate-400 text-center px-8">Place each bill flat, Gandhi portrait facing up</p>
            </button>

            <button
              onClick={() => setPhase('scan-bulk')}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl active:scale-[0.98] py-8 w-full border border-gray-200 dark:border-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 dark:text-slate-400 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
              <p className="text-sm font-bold dark:text-white">Count all at once</p>
              <p className="text-xs dark:text-slate-400 text-center px-8">Lay all bills on a table and take one photo</p>
            </button>
          </motion.div>
        )}

        {/* ────────── SCAN ONE-BY-ONE ────────── */}
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

        {/* ────────── SCAN BULK ────────── */}
        {phase === 'scan-bulk' && (
          <motion.div
            key="scan-bulk"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col -mx-2 -mb-10"
            style={{ marginTop: '-2rem' }}
          >
            <BulkBillScanner
              onBulkConfirmed={handleBulkConfirmed}
              onStop={handleStopScanning}
            />
          </motion.div>
        )}

        {/* ────────── REVIEW ────────── */}
        {phase === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2"
          >
            {/* Member pill */}
            {memberAddress && (
              <div className="flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-xs font-mono dark:text-slate-300">
                    {memberAddress.slice(0, 10)}…{memberAddress.slice(-6)}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
                  Contribute
                </span>
              </div>
            )}

            <BillList
              scanGroups={scanGroups}
              scannedBills={scannedBills}
              runningTotal={runningTotal}
              mode="DEPOSIT"
              onRemoveGroup={removeScanGroup}
              onRemoveBill={removeBill}
              pendingCount={pendingCount}
              isUploading={isUploading}
              uploadPending={uploadPending}
            />

            <div className="flex justify-between items-center px-2">
              <button
                onClick={() => { if (confirm('Clear all scanned bills?')) { clearSession(); setPhase('pre-scan'); } }}
                className="text-xs text-red dark:text-red font-bold py-2 px-4 active:scale-95"
              >
                Clear all
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase('scan-bulk')}
                  className="flex items-center gap-1.5 text-xs font-bold py-2 px-3 rounded-full bg-gray-100 dark:bg-slate-800 dark:text-white active:scale-[0.98]"
                >
                  + Multiple
                </button>
                <button
                  onClick={() => setPhase('scan')}
                  className="flex items-center gap-1.5 text-xs font-bold py-2 px-3 rounded-full bg-gray-100 dark:bg-slate-800 dark:text-white active:scale-[0.98]"
                >
                  + Single
                </button>
              </div>
            </div>

            {scannedBills.length > 0 && (
              <div className="px-2 pt-2">
                <button
                  onClick={() => setPhase('confirm')}
                  className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
                >
                  Continue →
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ────────── CONFIRM ────────── */}
        {phase === 'confirm' && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            {/* Member + amount summary */}
            <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 text-center">
              <p className="text-xs dark:text-slate-400 font-mono">
                {resolveName(memberAddress)}
              </p>
              <p className="text-2xl font-bold dark:text-white mt-1">
                ₹{runningTotal.toLocaleString('en-IN')}
              </p>
              <p className="text-xs dark:text-slate-400 mt-0.5">
                {scannedBills.length} bill(s) · Contribute{loanType ? ` · ${loanType}` : ''}
              </p>
            </div>

            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3">
              <p className="text-xs font-bold text-green-800 dark:text-green-300">Junior shares attributed</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                After minting, physically deposit this cash or convert to USDT within the escrow window.
              </p>
            </div>

            <button
              onClick={() => setPhase('review')}
              className="text-xs text-gray-400 dark:text-slate-500 text-center py-1 active:scale-95"
            >
              ← Back
            </button>

            <SwapButton
              mode="DEPOSIT"
              runningTotal={runningTotal}
              scannedBills={scannedBills}
              onSwap={handleConfirm}
              isProcessing={isProcessing}
              purposeLabel="Record contribution"
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

export default Contribute;
