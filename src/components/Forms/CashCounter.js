import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import BulkBillScanner from './BulkBillScanner';
import BillList from './BillList';
import SwapButton from './SwapButton';
import QRScanner from '../UI/qrScan';
import NameGate from '../UI/NameGate';
import useCashSession from '../../hooks/useCashSession';
import useCashSwap from '../../hooks/useCashSwap';
import useTrainingData from '../../hooks/useTrainingData';
import { useMemberLoans, pickLoan } from '../../hooks/useMemberLoans';
import { useDataContext } from '../../utils/NavigationContext';
import { useContactBook } from '../../hooks/useContactBook';
import { useUnionCashReserve } from '../../hooks/useUnionCashReserve.ts';
import { DropdownButton } from '../UI/buttons';

// ── Escrow countdown ──────────────────────────────────────────────────────────
function EscrowCountdown({ totalSeconds = 3 * 24 * 3600 }) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const pct = remaining / totalSeconds;
  const ringColor = pct > 0.5 ? '#f59e0b' : pct > 0.2 ? '#f97316' : '#ef4444';

  const R = 54;
  const circumference = 2 * Math.PI * R;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-56 h-56">
        <div className="absolute inset-0 rounded-full bg-amber-50/60 dark:bg-amber-900/20" />
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeWidth="4" className="text-amber-200 dark:text-amber-900/60" />
          <circle
            cx="60" cy="60" r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {d > 0 && (
            <span className="text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-200 leading-none mb-1">{d}d</span>
          )}
          <span className="text-3xl font-bold tabular-nums text-amber-800 dark:text-amber-200 leading-none">
            {pad(h)}:{pad(m)}:{pad(s)}
          </span>
        </div>
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400">{Math.round(totalSeconds / 86400)}-day escrow window</p>
    </div>
  );
}

// ── Loan info card ────────────────────────────────────────────────────────────
function LoanCard({ loan }) {
  if (!loan) return null;
  const apr = (loan.rateBP / 100).toFixed(1);
  const isPending = loan.drawdownTs === 0n || loan.drawdownTs === BigInt(0);

  return (
    <div className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold dark:text-white">{loan.loanType || 'Loan'}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
          isPending
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
            : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
        }`}>
          {isPending ? 'Pending' : 'Active'}
        </span>
      </div>
      <div className="flex justify-between mt-1">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 dark:text-slate-400">Outstanding</span>
          <span className="text-base font-bold dark:text-white">₹{loan.outstanding.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-500 dark:text-slate-400">Rate</span>
          <span className="text-base font-bold dark:text-white">{apr}% APR</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-500 dark:text-slate-400">Principal</span>
          <span className="text-base font-bold dark:text-white">₹{loan.principal.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
}

// ── Treasury cap warning (auto-clamp) ────────────────────────────────────────
function TreasuryCapBlock({ uncounted }) {
  return (
    <div className="w-full rounded-xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3">
      <p className="text-xs font-bold text-yellow-800 dark:text-white">Treasury at cap</p>
      <p className="text-xs text-yellow-700 dark:text-white/80 mt-1">
        ₹{uncounted.toLocaleString('en-IN')} is uncounted — set aside and return to member.
        Only the remaining amount will be invested.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// phases: 'pre-scan' | 'scan-qr' | 'scan' | 'scanning-bulk' | 'review' | 'confirm'
const CashCounter = ({ handleOpenForm }) => {
  const { db, unionFunds, txdetails } = useDataContext();
  const { resolveName, hasName, addContact } = useContactBook();
  const unionAddr = db?.union?.address;

  const [selectedFund, setSelectedFund] = useState(() => unionFunds?.[0] ?? null);

  // loanType to use for contribute when there is no matched loan (investor pays into pool).
  // Derived from the selected fund dropdown; falls back to 'GENERIC' only if no funds registered.
  const contributeLoanType = (() => {
    const f = selectedFund ?? unionFunds?.[0];
    if (!f) return 'GENERIC';
    try { return ethers.decodeBytes32String(f[2]); } catch { return 'GENERIC'; }
  })();
  const { data: reserveData } = useUnionCashReserve(db?.union?.leader ? unionAddr : undefined);
  const available = reserveData?.available ?? null;

  const {
    scannedBills,
    scanGroups,
    runningTotal,
    addBulkGroup,
    removeScanGroup,
    removeBill,
    clearSession,
  } = useCashSession();
  const { executeSwap, isProcessing } = useCashSwap(clearSession, handleOpenForm);
  const { pendingCount, isUploading, uploadPending } = useTrainingData();

  const prefillAddress = txdetails?.memberAddress ?? null;
  // prefillLoan: pre-seeded from portfolio view — bypasses the getLoansByBorrower
  // chain query which can fail for transferred / re-indexed loans.
  const prefillLoan    = txdetails?.prefillLoan ?? null;
  const [memberAddress, setMemberAddress] = useState(prefillAddress);
  const [phase, setPhase] = useState(
    prefillAddress        ? 'scan'
    : scannedBills.length > 0 ? 'scanning-bulk' : 'pre-scan'
  );
  // investOverride: member has a loan but explicitly wants to invest instead
  const [investOverride, setInvestOverride] = useState(false);

  // When prefillLoan is supplied, skip the chain query entirely.
  const { loans: chainLoans, collectDeadline, escrowDuration, loading: chainLoansLoading } =
    useMemberLoans(prefillLoan ? null : memberAddress);
  const loans       = prefillLoan ? [prefillLoan] : chainLoans;
  const loansLoading = prefillLoan ? false : chainLoansLoading;

  // hasLoan: member has an active or pending loan
  const hasLoan = loans.length > 0;

  // CashCounter is CASH-IN only: member brings physical INR.
  // Default: repay if loan exists. Checkbox overrides to invest.
  // No loan → always invest.
  const isRepay = hasLoan && !investOverride;
  const purpose = isRepay ? 'repay' : 'contribute';
  const matchedLoan = pickLoan(loans, purpose, collectDeadline);

  const handleBulkConfirmed = useCallback(
    ({ items, s3Key, confidence, reasoning }) => {
      addBulkGroup({ items, s3Key, confidence, reasoning });
    },
    [addBulkGroup]
  );

  const handleStopScanning = useCallback(() => {
    setPhase(scannedBills.length > 0 ? 'scanning-bulk' : 'scan');
  }, [scannedBills.length]);

  const handleQrScanned = useCallback((address) => {
    setMemberAddress(address);
    if (!hasName(address)) {
      setPhase('name-gate');
    } else {
      setPhase('scan');
    }
  }, [hasName]);

  const loanPending = matchedLoan
    ? (matchedLoan.drawdownTs === 0n || matchedLoan.drawdownTs === BigInt(0))
    : null;

  const handleSwap = useCallback(async () => {
    const loanOutstanding = matchedLoan?.outstanding ?? 0;
    const fullRepay = isRepay && loanOutstanding > 0 && runningTotal >= Math.ceil(loanOutstanding) + 1;
    const availableINR = available !== null ? Number(available / 10n ** 18n) : Infinity;
    const effectiveAmount = isRepay && loanOutstanding > 0
      ? Math.min(runningTotal, Math.ceil(loanOutstanding) + 1)
      : purpose === 'contribute'
        ? Math.min(runningTotal, availableINR)
        : runningTotal;
    const changeBack = runningTotal - effectiveAmount;
    const uncounted = purpose === 'contribute' && runningTotal > availableINR
      ? runningTotal - availableINR : 0;

    const purposeLabel = isRepay ? 'Repay loan' : 'Invest';
    let msg = `${purposeLabel}: ₹${effectiveAmount.toLocaleString('en-IN')} for ${resolveName(memberAddress)}?`;
    if (uncounted > 0) {
      msg += `\n\n₹${uncounted.toLocaleString('en-IN')} is uncounted — set aside and return to member.`;
    }
    if (fullRepay && changeBack > 0) {
      msg += `\n\nFull repay (outstanding ₹${Math.ceil(loanOutstanding).toLocaleString('en-IN')}). Give ₹${changeBack.toLocaleString('en-IN')} change back.`;
    } else if (isRepay && loanOutstanding > 0) {
      const remaining = Math.ceil(loanOutstanding - effectiveAmount);
      msg += `\n\nPartial repay. ₹${remaining.toLocaleString('en-IN')} still outstanding.`;
    }
    if (!confirm(msg)) return;
    await executeSwap(scannedBills, effectiveAmount, {
      memberAddress,
      purpose,
      loanID: matchedLoan?.loanID,
      loanType: matchedLoan?.loanType ?? contributeLoanType,
      loanPending,
      outstanding: loanOutstanding,
    });
  }, [isRepay, runningTotal, memberAddress, scannedBills, executeSwap, purpose, matchedLoan, loanPending, contributeLoanType, available]);


  return (
    <div className="flex flex-col gap-2 px-2 mb-10 w-full">
      <AnimatePresence mode="wait">

        {/* ────────── PRE-SCAN (QR camera) ────────── */}
        {(phase === 'pre-scan' || phase === 'scan-qr') && (
          <motion.div
            key="pre-scan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 items-center"
          >
            <p className="text-xs dark:text-slate-400 text-center pt-2">Scan the member's QR code</p>
            <QRScanner sendTo={handleQrScanned} />
          </motion.div>
        )}

        {/* ────────── NAME GATE ────────── */}
        {phase === 'name-gate' && memberAddress && (
          <motion.div
            key="name-gate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            <NameGate
              address={memberAddress}
              onConfirm={(addr, name) => {
                addContact(addr, name);
                setPhase('scan');
              }}
              onSkip={() => {
                setPhase('scan');
              }}
            />
          </motion.div>
        )}

        {/* ────────── SCAN CHOICE ────────── */}
        {phase === 'scan' && (
          <motion.div
            key="scan-choice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 items-center"
          >
            {/* Member pill */}
            <div className="flex items-center gap-2 py-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-xs font-mono dark:text-slate-300">
                {resolveName(memberAddress)}
              </p>
              <button
                onClick={() => setPhase('pre-scan')}
                className="text-xs text-gray-400 dark:text-slate-500 underline active:scale-95"
              >
                rescan
              </button>
            </div>

            {/* Loan lookup + invest override checkbox */}
            {loansLoading ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Looking up loans…</p>
            ) : hasLoan ? (
              <>
                {!investOverride && <LoanCard loan={matchedLoan} />}
                <label className="flex items-center gap-2 cursor-pointer select-none w-full px-1">
                  <input
                    type="checkbox"
                    checked={investOverride}
                    onChange={(e) => setInvestOverride(e.target.checked)}
                    className="w-4 h-4 accent-black dark:accent-white"
                  />
                  <span className="text-xs dark:text-slate-300">Contribute as investor instead of repaying loan</span>
                </label>
              </>
            ) : (
              <p className="text-xs text-blue-600 dark:text-blue-400 text-center">No loan found — cash will be added to the junior pool</p>
            )}

            {/* Fund selector — shown when contributing to the junior pool */}
            {purpose === 'contribute' && unionFunds?.length > 0 && (
              <div className="w-full">
                <p className="text-xs text-gray-500 dark:text-slate-300 mb-1">Fund</p>
                <DropdownButton
                  options={unionFunds}
                  onSelect={(fund) => setSelectedFund(fund)}
                  z={20}
                  color="white"
                />
                {contributeLoanType && (
                  <p className="text-xs text-gray-400 dark:text-slate-300 mt-1">
                    Shares will be credited to <span className="font-bold">{contributeLoanType}</span>
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setPhase('scanning-bulk')}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl active:scale-[0.98] py-8 w-full border border-gray-200 dark:border-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 dark:text-slate-400 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              <p className="text-sm font-bold dark:text-white">Photo count</p>
              <p className="text-xs dark:text-slate-400 text-center px-8">Lay all bills on a table and take one photo</p>
            </button>

            <button
              disabled
              className="flex flex-col items-center justify-center gap-3 rounded-2xl py-8 w-full border border-gray-200 dark:border-slate-700 opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 dark:text-slate-400 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
              </svg>
              <p className="text-sm font-bold dark:text-white">Cash teller machine</p>
              <p className="text-xs dark:text-slate-400 text-center px-8">Coming soon</p>
            </button>
          </motion.div>
        )}

        {/* ────────── SCANNING BULK ────────── */}
        {phase === 'scanning-bulk' && (
          <motion.div
            key="scanning-bulk"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-2"
          >
            {/* List rendered ABOVE the camera so X buttons aren't overlapped by
                the <video> element's compositing layer (iOS Safari/PWA quirk:
                video can intercept touches on DOM-flow siblings beneath it).
                Also better UX — user sees counted bills without scrolling past
                60dvh of camera. */}
            {scanGroups.length > 0 && (
              <div className="relative z-10">
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
              </div>
            )}
            <BulkBillScanner
              onBulkConfirmed={handleBulkConfirmed}
              onStop={handleStopScanning}
            />
            {scannedBills.length > 0 && (
              <button
                onClick={() => setPhase('confirm')}
                className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
              >
                Continue →
              </button>
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
            {/* Heading + member address */}
            <div className="text-center pt-2">
              <p className="text-xl font-bold dark:text-white">
                {isRepay ? 'Repay Loan' : 'Invest'}
              </p>
              {memberAddress && (
                <p className="text-xs font-mono text-gray-500 dark:text-slate-400 mt-1">
                  {memberAddress.slice(0, 10)}…{memberAddress.slice(-6)}
                </p>
              )}
            </div>

            {/* Outstanding: old → new (repay only) */}
            {isRepay && matchedLoan && (
              <div className="flex flex-col items-center gap-1 py-2">
                <span className="text-2xl font-bold text-gray-400 dark:text-slate-500 line-through">
                  ₹{matchedLoan.outstanding.toLocaleString('en-IN')}
                </span>
                <span className="text-4xl font-bold dark:text-white">
                  ₹{Math.max(0, matchedLoan.outstanding - runningTotal).toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-500">outstanding after repayment</span>
              </div>
            )}

            {/* No loan warning — invest path */}
            {!isRepay && purpose === 'contribute' && (
              <p className="text-xs text-blue-600 dark:text-blue-400 text-center">
                Cash will be added to the junior pool · {contributeLoanType}
              </p>
            )}

            {/* Treasury cap block — CASH-IN INVEST only (not give/repay) */}
            {purpose === 'contribute' && available !== null && runningTotal > Number(available / 10n ** 18n) && (
              <TreasuryCapBlock uncounted={runningTotal - Number(available / 10n ** 18n)} />
            )}

            {/* Escrow countdown — both REPAY and INVEST create an escrow */}
            <EscrowCountdown totalSeconds={escrowDuration ?? 7 * 86400} />

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
              disabled={isRepay && !matchedLoan}
              onSwap={handleSwap}
              isProcessing={isProcessing}
              purposeLabel={
                isRepay
                  ? `Repay ₹${runningTotal.toLocaleString('en-IN')} nIN`
                  : purpose === 'contribute' && available !== null && runningTotal > Number(available / 10n ** 18n)
                    ? `Invest ₹${Number(available / 10n ** 18n).toLocaleString('en-IN')} nIN`
                    : 'Invest'
              }
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

export default CashCounter;
