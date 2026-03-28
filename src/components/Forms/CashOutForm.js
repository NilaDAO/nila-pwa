import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataContext } from '../../utils/NavigationContext';
import { useContactBook } from '../../hooks/useContactBook';
import { useFxPool } from '../../hooks/useWallet.ts';
import { useCashOffer } from '../../hooks/useCashOffer.ts';
import { useRedeemOrder } from '../../hooks/useRedeemOrder.ts';
import { useMemberLoans } from '../../hooks/useMemberLoans';
import { useUnionCashReserve } from '../../hooks/useUnionCashReserve.ts';
import useCashSession from '../../hooks/useCashSession';
import BulkBillScanner from './BulkBillScanner';
import BillList from './BillList';
import QRScanner from '../UI/qrScan';
import NameGate from '../UI/NameGate';

const buildScanHash = async (serialNumbers) => {
  if (!serialNumbers.length) return ethers.ZeroHash;
  const { MerkleTree } = await import(/* webpackChunkName: "merkle" */ 'merkletreejs');
  const hashFn = (data) => ethers.getBytes(ethers.keccak256(data));
  const leaves = serialNumbers.map((s) => hashFn(ethers.toUtf8Bytes(s)));
  const tree = new MerkleTree(leaves, hashFn, { sortPairs: true });
  return tree.getHexRoot();
};

function deadlineSecs(dl) {
  const rem = dl - Math.floor(Date.now() / 1000);
  if (rem <= 0) return 'Expired';
  const d = Math.floor(rem / 86400);
  const h = Math.floor((rem % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

// steps: scan-qr | review-loan | set-fee | posting | waiting | filled | confirm | done
export function CashOutForm({ handleOpenForm }) {
  const { db } = useDataContext();
  const { resolveName, hasName, addContact } = useContactBook();
  const unionAddr = db?.union?.address;

  const qc = useQueryClient();
  const { postCashOffer, confirmCashOfferDelivered, burnFarmerNin, redeemFarmerNin, postRedeemOrder, confirmCashDelivery, cashScanMint, resolveEscrowCash, acceptLoan } = useFxPool();
  const { scanGroups, scannedBills, runningTotal, addBulkGroup, clearSession } = useCashSession();

  const [step,           setStep]          = useState('scan-qr');
  const [memberAddress,  setMemberAddress] = useState(null);
  const [feeBP,          setFeeBP]         = useState(100); // 1% default
  const [offerId,        setOfferId]       = useState(null);
  const [redeemOrderId,  setRedeemOrderId] = useState(null);
  const [error,          setError]         = useState(null);

  const { loans, loading: loansLoading } = useMemberLoans(memberAddress);
  const activeLoan     = loans.find((l) => l.drawdownTs !== 0n && l.drawdownTs !== BigInt(0) && !l.defaulted) ?? null;
  const pendingLoan    = !activeLoan ? loans.find((l) => l.drawdownTs === 0n || l.drawdownTs === BigInt(0)) ?? null : null;
  const currentLoan    = activeLoan ?? pendingLoan ?? null;
  const principal      = currentLoan?.principal ?? 0;                     // Number, for display only
  const principalRaw   = currentLoan?.principalRaw ?? 0n;                 // exact bigint for on-chain calls

  const { data: reserveData } = useUnionCashReserve(unionAddr);
  // Accumulate active escrows (sorted by deadline asc) until they cover the principal.
  // Contract resolves each escrow fully — no partial escrow support on-chain.
  const allEscrows     = reserveData?.pendingDisburse ?? [];
  const escrowsToUse   = [];
  let   escrowAccumRaw = 0n;
  for (const e of allEscrows) {
    if (escrowAccumRaw >= principalRaw) break;
    escrowsToUse.push(e);
    escrowAccumRaw += e.ninAmount;  // exact nIN from contract
  }
  const cashInHandRaw  = escrowAccumRaw;
  // Cap fromEscrow at principal; LP covers any shortfall
  const fromEscrowRaw  = cashInHandRaw < principalRaw ? cashInHandRaw : principalRaw;
  const fromLPRaw      = principalRaw - fromEscrowRaw;
  const fromEscrow     = Number(fromEscrowRaw / 10n ** 18n);              // for display
  const fromLP         = Number(fromLPRaw / 10n ** 18n);                  // for display

  // Poll CashOffer status (LP deposits USDT path)
  const { data: offer } = useCashOffer(offerId ?? undefined);
  if (step === 'waiting' && offer?.status === 1) setStep('filled');

  // Poll RedeemOrder status (LP brings cash path)
  const { data: redeemOrder } = useRedeemOrder(redeemOrderId ?? undefined);
  if (step === 'redeem-waiting' && redeemOrder?.status === 1) setStep('redeem-committed');

  const handleQrScanned = (address) => {
    setMemberAddress(address);
    if (!hasName(address)) {
      setStep('name-gate');
    } else {
      setStep('review-loan');
    }
  };

  // escrowId = first (earliest) escrow; used for existence checks only
  const escrowId      = escrowsToUse[0]?.escrowId ?? null;
  const escrowLoading = !reserveData;

  // ── Pending loan: acceptLoan — uses existing escrow if one is ready ──
  const handleAcceptLoan = async () => {
    if (!unionAddr || !pendingLoan) return;
    setError(null);
    setStep('posting');
    try {
      await acceptLoan(unionAddr, pendingLoan.loanID, escrowId ?? 0n);
      // nIN now in member wallet — proceed to count bills
      setStep('scan-bills');
    } catch (err) {
      setError(err?.reason || err?.message || 'Accept loan failed');
      setStep('review-loan');
    }
  };

  // After bills counted: cashScanMint (treasury reserve record) + burnFarmerNin
  const handleDisburse = async () => {
    if (!unionAddr || !memberAddress || !pendingLoan || !scannedBills.length) return;
    setError(null);
    setStep('posting');
    try {
      const serialNumbers = scannedBills.map((b) => b.serialNumber).filter(Boolean);
      const scanHash = await buildScanHash(serialNumbers);
      await cashScanMint(
        unionAddr,
        pendingLoan.loanType || 'GENERIC',
        runningTotal,
        scanHash,
        0, // INVEST — records physical INR held by union
        ethers.ZeroHash,
        ethers.ZeroAddress,
        0n,
      );
      await burnFarmerNin(memberAddress, pendingLoan.principalRaw);
      clearSession();
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Failed');
      setStep('scan-bills');
    }
  };

  const handlePostOffer = async () => {
    if (!unionAddr || !memberAddress) return;
    setError(null);
    setStep('posting');
    try {
      // Drain escrows with partial support — last escrow may be partially consumed.
      const drainEscrows = async (totalRaw) => {
        let remaining = totalRaw;
        for (const e of escrowsToUse) {
          if (remaining === 0n) break;
          const consume = remaining < e.ninAmount ? remaining : e.ninAmount;
          await resolveEscrowCash(e.escrowId, consume);
          remaining -= consume;
        }
      };

      if (fromLP > 0) {
        // Mixed: escrow(s) cover part, LP covers the rest.
        // 1. Burn escrow portion from farmer — union hands that cash now.
        if (fromEscrowRaw > 0n) {
          await burnFarmerNin(memberAddress, fromEscrowRaw);
        }
        // 2. Resolve each used escrow.
        await drainEscrows(fromEscrowRaw);
        // 3. Burn LP portion from farmer's wallet → receive USDT equivalent.
        const usdtOut = await redeemFarmerNin(memberAddress, fromLPRaw);
        // 4. Post RedeemOrder: lock the USDT we received (no extra bonus — union has exactly usdtOut).
        const id = await postRedeemOrder(unionAddr, memberAddress, BigInt(Math.round(fromLP)), usdtOut, feeBP);
        qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
        setRedeemOrderId(id);
        setStep('redeem-waiting');
      } else {
        // Escrow(s) cover everything — burn full principal then drain escrows.
        await burnFarmerNin(memberAddress, principalRaw);
        await drainEscrows(principalRaw);
        qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
        setStep('done');
      }
    } catch (err) {
      setError(err?.reason || err?.message || 'Failed');
      setStep('review-loan');
    }
  };

  // No-escrow path: swap farmer's nIN for USDT (using existing allowance), then post RedeemOrder.
  const handlePostRedeemRequest = async () => {
    if (!unionAddr || !memberAddress || !activeLoan) return;
    setError(null);
    setStep('redeem-posting');
    try {
      const usdtOut = await redeemFarmerNin(memberAddress, principalRaw);
      const id = await postRedeemOrder(unionAddr, memberAddress, BigInt(Math.round(fromLP)), usdtOut, feeBP);
      setRedeemOrderId(id);
      setStep('redeem-waiting');
    } catch (err) {
      setError(err?.reason || err?.message || 'Failed');
      setStep('review-loan');
    }
  };

  const handleConfirmRedeemDelivery = async () => {
    if (redeemOrderId === null) return;
    setError(null);
    try {
      await confirmCashDelivery(redeemOrderId);
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Confirm failed');
    }
  };

  const handleConfirm = async () => {
    if (offerId === null || !memberAddress) return;
    setError(null);
    try {
      // Burn remaining LP portion from borrower wallet — leader hands ₹fromLP now
      if (fromLPRaw > 0n) {
        await burnFarmerNin(memberAddress, fromLPRaw);
      }
      await confirmCashOfferDelivered(offerId);
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Failed to confirm delivery');
    }
  };

  return (
    <div className="flex flex-col gap-3 px-2 mb-10 w-full">
      <AnimatePresence mode="wait">
        {/* ── Step 1: Scan member QR ── */}
        {step === 'scan-qr' && (
          <motion.div key="scan-qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 items-center">
            <p className="text-xs dark:text-slate-400 text-center pt-2">Scan the member's QR code</p>
            <QRScanner sendTo={handleQrScanned} />
          </motion.div>
        )}

        {/* ── Name gate ── */}
        {step === 'name-gate' && memberAddress && (
          <motion.div key="name-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <NameGate
              address={memberAddress}
              onConfirm={(addr, name) => {
                addContact(addr, name);
                setStep('review-loan');
              }}
              onCancel={() => {
                setMemberAddress(null);
                setStep('scan-qr');
              }}
            />
          </motion.div>
        )}

        {/* ── Step 1b: Scan bills ── */}
        {step === 'scan-bills' && (pendingLoan || activeLoan) && (() => {
          const scanTarget  = activeLoan ? fromEscrow : (pendingLoan?.principal ?? 0);
          const onConfirm   = activeLoan ? handlePostOffer : handleDisburse;
          const loanLabel    = activeLoan ? activeLoan.loanType : pendingLoan?.loanType;
          const statusLabel  = activeLoan ? 'Active' : 'Pending';
          const statusColor  = activeLoan
            ? 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
            : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
          return (
            <motion.div key="scan-bills" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <p className="text-xs font-mono dark:text-slate-300">{resolveName(memberAddress)}</p>
                <button onClick={() => setStep('review-loan')} className="text-xs text-gray-400 dark:text-slate-500 underline active:scale-95">back</button>
              </div>
              <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Hand out</p>
                  <p className="text-lg font-bold dark:text-white">₹{scanTarget.toLocaleString('en-IN')} {loanLabel}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${statusColor}`}>{statusLabel}</span>
              </div>
              <BulkBillScanner onBulkConfirmed={addBulkGroup} />
              {scanGroups.length > 0 && (
                <BillList scanGroups={scanGroups} scannedBills={scannedBills} runningTotal={runningTotal} />
              )}
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={onConfirm}
                disabled={!scannedBills.length || runningTotal < scanTarget}
                className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98] disabled:opacity-40"
              >
                {scannedBills.length
                  ? runningTotal >= scanTarget
                    ? `Confirm — hand out ₹${scanTarget.toLocaleString('en-IN')}`
                    : `Scan ₹${(scanTarget - runningTotal).toLocaleString('en-IN')} more`
                  : 'Scan the bills first'}
              </button>
            </motion.div>
          );
        })()}

        {/* ── Step 2: Review loan + cash plan ── */}
        {step === 'review-loan' && (
          <motion.div key="review-loan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-xs font-mono dark:text-slate-300">{resolveName(memberAddress)}</p>
              <button onClick={() => setStep('scan-qr')} className="text-xs text-gray-400 dark:text-slate-500 underline active:scale-95">rescan</button>
            </div>

            {loansLoading ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Looking up loans…</p>
            ) : !activeLoan ? (
              pendingLoan ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold dark:text-white">{pendingLoan.loanType || 'Loan'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Pending</span>
                    </div>
                    <span className="text-base font-bold dark:text-white">₹{pendingLoan.principal.toLocaleString('en-IN')}</span>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Scan the bills to accept this loan and hand out cash.</p>
                  </div>
                  {escrowLoading ? (
                    <p className="text-xs text-gray-400 dark:text-slate-500">Checking escrow…</p>
                  ) : escrowId != null ? (
                    <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center">
                      <div>
                        <p className="text-xs dark:text-slate-400">Cash in hand (escrow)</p>
                        <p className="text-xl font-bold dark:text-white">₹{fromEscrow.toLocaleString('en-IN')}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Ready</span>
                    </div>
                  ) : null}
                  <button
                    onClick={handleAcceptLoan}
                    disabled={escrowLoading}
                    className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98] disabled:opacity-40"
                  >
                    Accept loan{escrowId != null ? ` + hand out ₹${fromEscrow.toLocaleString('en-IN')}` : ''}
                  </button>
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">No active loan found</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">This member has no outstanding loan to draw cash against.</p>
                </div>
              )
            ) : (
              <>
                {/* Cash breakdown card */}
                {escrowLoading ? (
                  <p className="text-xs text-gray-400 dark:text-slate-500">Checking escrow…</p>
                ) : escrowId != null ? (() => {
                  const escrowDeadline = reserveData?.pendingDisburse?.[0]?.deadline ?? null;
                  const escrowDue = escrowDeadline ? deadlineSecs(escrowDeadline) : null;
                  const fullyFromEscrow = fromLP === 0;
                  return (
                    <div className="rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden">
                      {/* Header row: total + meta */}
                      <div className="flex items-center justify-between px-4 pt-3 pb-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">₹{principal.toLocaleString('en-IN')}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500 text-right">
                          {activeLoan.loanType || 'Loan'} · {(activeLoan.rateBP / 100).toFixed(1)}%
                        </span>
                      </div>
                      {/* Divider */}
                      <div className="mx-4 border-t border-gray-200 dark:border-slate-700" />
                      {/* Row: escrow */}
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 dark:text-slate-400">You give now</span>
                          <span className="text-xl font-bold text-gray-900 dark:text-white">₹{fromEscrow.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                            {escrowsToUse.length > 1 ? `${escrowsToUse.length} escrows ready` : 'Escrow ready'}
                          </span>
                          {escrowDue && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">due {escrowDue}</span>
                          )}
                        </div>
                      </div>
                      {/* Row: LP (only when needed) */}
                      {!fullyFromEscrow && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-slate-700">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-500 dark:text-slate-400">LP brings soon</span>
                            <span className="text-xl font-bold text-red dark:text-red_dark">₹{fromLP.toLocaleString('en-IN')}</span>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-200 dark:bg-slate-700 text-red dark:text-red_dark">LP</span>
                        </div>
                      )}
                      {/* Divider + zero row */}
                      <div className="mx-4 border-t border-gray-200 dark:border-slate-700" />
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-500 dark:text-slate-400">Remaining</span>
                        <span className="text-sm font-bold text-gray-400 dark:text-slate-500">₹0 — fully covered</span>
                      </div>
                    </div>
                  );
                })() : (
                  // No escrow — LP covers full principal via RedeemOrder
                  <div className="rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">₹{principal.toLocaleString('en-IN')}</span>
                      <span className="text-xs text-gray-400 dark:text-slate-500 text-right">
                        {activeLoan.loanType || 'Loan'} · {(activeLoan.rateBP / 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mx-4 border-t border-gray-200 dark:border-slate-700" />
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-slate-400">LP brings</span>
                        <span className="text-xl font-bold text-red dark:text-red_dark">₹{principal.toLocaleString('en-IN')}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-200 dark:bg-slate-700 text-red dark:text-red_dark">LP</span>
                    </div>
                    <div className="mx-4 border-t border-gray-200 dark:border-slate-700" />
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-gray-500 dark:text-slate-400">You give now</span>
                      <span className="text-sm font-bold text-gray-400 dark:text-slate-500">₹0</span>
                    </div>
                    <div className="mx-4 border-t border-gray-200 dark:border-slate-700" />
                    <div className="px-4 py-2.5">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Ask the member to open their app and show their <span className="font-bold text-gray-700 dark:text-slate-200">Redeem QR</span>. You'll scan it on the next screen.</p>
                    </div>
                  </div>
                )}

                {/* LP fee slider — when LP portion > 0 (with or without existing escrow) */}
                {!escrowLoading && fromLP > 0 && (
                  <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs dark:text-slate-300">LP fee bonus</span>
                      <span className="text-xs font-bold dark:text-white">{(feeBP / 100).toFixed(2)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={500} step={10} value={feeBP}
                      onChange={(e) => setFeeBP(Number(e.target.value))}
                      className="w-full accent-black dark:accent-white"
                    />
                    <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
                      LP receives {fromLP.toLocaleString('en-IN')} nIN
                      {feeBP > 0 && ` + ${Math.round(fromLP * feeBP / 10000)} bonus`}
                    </p>
                  </div>
                )}

                {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

                {!escrowLoading && (escrowId != null ? (
                  <button
                    onClick={() => setStep('scan-bills')}
                    className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
                  >
                    Count bills →
                  </button>
                ) : (
                  <button
                    onClick={handlePostRedeemRequest}
                    className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
                  >
                    Request LP cash → ₹{principal.toLocaleString('en-IN')}
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}

        {/* ── Step 4: Posting ── */}
        {step === 'posting' && (
          <motion.div key="posting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
            <p className="text-sm dark:text-white">Posting offer on-chain…</p>
          </motion.div>
        )}

        {/* ── Step 5: Waiting for LP ── */}
        {step === 'waiting' && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 items-center py-4">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm font-bold dark:text-white">
              {fromEscrow > 0
                ? `₹${fromEscrow.toLocaleString('en-IN')} handed out — waiting for LP…`
                : 'Waiting for LP…'}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">An LP will bring ₹{fromLP.toLocaleString('en-IN')} cash. The borrower needs to return to collect it.</p>
            {offer?.deadline && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Offer expires in {deadlineSecs(offer.deadline)}</p>
            )}
            {offerId !== null && (
              <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">Offer #{offerId.toString()}</p>
            )}
          </motion.div>
        )}

        {/* ── Step 6: LP filled ── */}
        {step === 'filled' && offer && (
          <motion.div key="filled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="rounded-xl border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20 px-4 py-3">
              <p className="text-sm font-bold text-green-700 dark:text-green-300">LP has delivered ₹{fromLP.toLocaleString('en-IN')}!</p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Hand ₹{fromLP.toLocaleString('en-IN')} to the borrower, then confirm below.
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">LP address:</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-mono dark:text-white">{resolveName(offer.lp)}</span>
                <button onClick={() => navigator.clipboard?.writeText(offer.lp)} className="text-xs text-blue-500 active:scale-95">Copy</button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              onClick={() => setStep('confirm')}
              className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
            >
              Done — Cash Handed Over
            </button>
          </motion.div>
        )}

        {/* ── Step 7: Confirm on-chain ── */}
        {step === 'confirm' && (
          <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <p className="text-xs dark:text-slate-400 text-center">Confirm delivery on-chain to release USDT to the LP.</p>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              onClick={handleConfirm}
              className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
            >
              Confirm Delivery
            </button>
          </motion.div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 items-center py-8">
            <p className="text-3xl">✓</p>
            <p className="text-sm font-bold dark:text-white">Cash Out complete!</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">USDT has been released to the LP.</p>
            <button
              onClick={() => handleOpenForm(null)}
              className="mt-4 px-6 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 dark:text-white text-xs font-bold active:scale-95"
            >
              Close
            </button>
          </motion.div>
        )}

        {/* ── RedeemOrder: swapping nIN for USDT ── */}
        {step === 'redeem-posting' && (
          <motion.div key="redeem-posting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
            <p className="text-sm dark:text-white">Swapping nIN → USDT &amp; posting request…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">Using member's existing allowance — no extra signature needed.</p>
          </motion.div>
        )}

        {/* ── RedeemOrder: waiting for LP to commit ── */}
        {step === 'redeem-waiting' && (
          <motion.div key="redeem-waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4 items-center py-4">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm font-bold dark:text-white">Waiting for LP…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
              LP will bring ₹{fromLP.toLocaleString('en-IN')} cash and earn USDT.
            </p>
            {redeemOrder?.deadline && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Order expires in {deadlineSecs(redeemOrder.deadline)}</p>
            )}
          </motion.div>
        )}

        {/* ── RedeemOrder: LP committed, count bills ── */}
        {step === 'redeem-committed' && redeemOrder && (
          <motion.div key="redeem-committed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">LP is on their way</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {redeemOrder.lp ? resolveName(redeemOrder.lp) : '…'} committed to bring ₹{fromLP.toLocaleString('en-IN')} cash.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Count the bills, then confirm.</p>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              onClick={handleConfirmRedeemDelivery}
              className="w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
            >
              Cash Counted — Confirm Delivery
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
