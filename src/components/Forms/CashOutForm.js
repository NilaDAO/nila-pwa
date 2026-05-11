import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataContext, useNavContext, useViewModeContext } from '../../utils/NavigationContext';
import { readItem, setDBitem } from '../../utils/db';
import { useContactBook } from '../../hooks/useContactBook';
import { useFxPool } from '../../hooks/useWallet.ts';
import { useCashOffer, useUnionOpenCashOffersList, useUnionOpenRedeemOrdersList } from '../../hooks/useCashOffer.ts';
import { useRedeemOrder } from '../../hooks/useRedeemOrder.ts';
import { useMemberLoans } from '../../hooks/useMemberLoans';
import { useUnionCashReserve } from '../../hooks/useUnionCashReserve.ts';
import useCashSession from '../../hooks/useCashSession';
import { useLPCashOnHand } from '../../hooks/useLPCashOnHand';
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
  const { db, txdetails } = useDataContext();
  const { setIx, prevIx } = useNavContext();
  const { setTokenview, setCardView } = useViewModeContext();
  // Mirror DragSheet.close() — navigates back to wherever the form was opened from.
  const closeSheet = () => {
    console.log('[CashOut] closeSheet → prevIx=', prevIx.current);
    setIx(prevIx.current ?? null);
    setTokenview(false);
    setCardView('default');
  };
  const { resolveName, hasName, addContact } = useContactBook();
  const unionAddr = db?.union?.address;

  const qc = useQueryClient();
  const { postCashOffer, confirmCashOfferDelivered, burnFarmerNin, burnAndDrainEscrows, redeemFarmerNin, postRedeemOrder, confirmCashDelivery, cashScanMint, acceptLoan, getNinBalance, getNinAllowance, systemHealth, fillCashOfferWithNin } = useFxPool();
  const isJuniorCashOut = txdetails?.juniorCashOut === true;
  const { scanGroups, scannedBills, runningTotal, addBulkGroup, clearSession } = useCashSession();
  const { addCash: addLPCash, consumeCash: consumeLPCash } = useLPCashOnHand(unionAddr);
  const { data: openCashOffersList = [] } = useUnionOpenCashOffersList(unionAddr);
  const { data: openRedeemOrdersList = [] } = useUnionOpenRedeemOrdersList(unionAddr);

  const prefillAddress = txdetails?.memberAddress ?? null;
  const [step,           setStep]          = useState(
    prefillAddress
      ? (hasName(prefillAddress) ? 'review-loan' : 'name-gate')
      : 'scan-qr'
  );
  const [memberAddress,  setMemberAddress] = useState(prefillAddress);
  const [feeBP,          setFeeBP]         = useState(100); // 1% default
  const [offerId,        setOfferId]       = useState(null);
  const [redeemOrderId,  setRedeemOrderId] = useState(null);
  const [stagedUsdtOut,  setStagedUsdtOut] = useState(null); // set after redeemFarmerNin mines — prevents re-burn on retry
  const [error,          setError]         = useState(null);

  const { loans, loading: loansLoading } = useMemberLoans(memberAddress);
  const activeLoan     = loans.find((l) => l.drawdownTs !== 0n && l.drawdownTs !== BigInt(0) && !l.defaulted) ?? null;
  const pendingLoan    = !activeLoan ? loans.find((l) => l.drawdownTs === 0n || l.drawdownTs === BigInt(0)) ?? null : null;
  const currentLoan    = activeLoan ?? pendingLoan ?? null;
  const principalRaw   = currentLoan?.principalRaw ?? 0n;                 // original loan bigint

  // Fetch the member's actual nIN wallet balance — this is one input to the
  // payout cap. The other is the loan principal: see maxPayoutRaw below for why
  // we cap at min(balance, principal) instead of just balance.
  const [ninBalanceRaw, setNinBalanceRaw]         = useState(0n);
  const [ninAllowanceRaw, setNinAllowanceRaw]     = useState(0n);
  const [ninBalanceFetched, setNinBalanceFetched] = useState(false);
  const [cashOutInput, setCashOutInput]           = useState('');       // leader-entered amount (string for input)
  const fxAddress = process.env.REACT_APP_FX_POOL_MAIN;
  // Reset the input only when the scanned member changes — not on every balance refresh.
  useEffect(() => { setCashOutInput(''); }, [memberAddress]);
  useEffect(() => {
    if (!memberAddress || !getNinBalance || !getNinAllowance || !fxAddress) {
      setNinBalanceRaw(0n); setNinAllowanceRaw(0n); setNinBalanceFetched(false); return;
    }
    let stale = false;
    setNinBalanceFetched(false);
    Promise.all([
      getNinBalance(memberAddress),
      getNinAllowance(memberAddress, fxAddress),
    ]).then(([bal, allowance]) => {
      console.log('[CashOut] nIN balance for', memberAddress, '=', bal.toString(), 'allowance =', allowance.toString());
      if (!stale) { setNinBalanceRaw(bal); setNinAllowanceRaw(allowance); setNinBalanceFetched(true); }
    }).catch((err) => { console.error('[CashOut] getNinBalance/Allowance failed:', err); });
    return () => { stale = true; };
  }, [memberAddress, getNinBalance, getNinAllowance, fxAddress]);

  // For pending loans, payout = full principal (acceptLoan mints nIN first).
  // For active loans, cap = min(wallet nIN, permit allowance, loan principal).
  //   - The allowance is set by the EIP-2612 permit signed at drawLoanWithVoucher
  //     time and decreases with each burn. burnFarmerNin / redeemFarmerNin now
  //     call transferFrom before burning, so they will revert if the amount
  //     exceeds the allowance — the cap here matches what the contract enforces.
  //   - Wallet nIN may include residue from other loans; using allowance (not
  //     raw balance) prevents burning tokens the borrower never authorised for
  //     this disbursement.
  //   - principalRaw cap: the farmer can never cash out more than their loan
  //     amount regardless of wallet balance or allowance (e.g. MaxUint256 in
  //     local test seeds).
  const activeCapRaw   = activeLoan
    ? (ninBalanceRaw < ninAllowanceRaw ? ninBalanceRaw : ninAllowanceRaw)
    : 0n;
  const maxPayoutRaw   = activeLoan
    ? (activeCapRaw < principalRaw ? activeCapRaw : principalRaw)
    : principalRaw;

  // Existing open RedeemOrders for this specific farmer.
  // Used to (a) show pending orders in the UI and (b) enforce a defensive cap so that
  // if ninBalanceRaw is stale (e.g. MaxUint256 test allowance means transferFrom doesn't
  // decrement it), we still can't offer more than principal − already-ordered.
  const existingFarmerOrders = memberAddress
    ? openRedeemOrdersList.filter(o => o.farmer?.toLowerCase() === memberAddress.toLowerCase())
    : [];
  const existingOrderedRaw = existingFarmerOrders.reduce(
    (acc, o) => acc + BigInt(o.inrValue) * 10n ** 18n, 0n
  );
  // orderedCapRaw = what's still available to order (principal minus already-pending)
  const orderedCapRaw  = principalRaw > existingOrderedRaw ? principalRaw - existingOrderedRaw : 0n;
  const effectiveMaxRaw = orderedCapRaw < maxPayoutRaw ? orderedCapRaw : maxPayoutRaw;

  const maxPayout      = Number(effectiveMaxRaw / 10n ** 18n);
  const inputRaw       = cashOutInput ? ethers.parseUnits(cashOutInput, 18) : effectiveMaxRaw;
  const payoutRaw      = inputRaw > effectiveMaxRaw ? effectiveMaxRaw : inputRaw;
  const principal      = Number(payoutRaw / 10n ** 18n);                  // for display

  // Persist the freshly-read nIN balance into the ActiveLoans IDB record so
  // ActiveLoansCard can gate its swipe-right (cash-out) action without making
  // a dedicated chain call. Reuses the getNinBalance call we already do above.
  useEffect(() => {
    if (!ninBalanceFetched) return;
    if (!currentLoan?.loanID) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await readItem(currentLoan.loanID, 'ActiveLoans');
        if (!existing || cancelled) return;
        const balNum = Number(ethers.formatUnits(ninBalanceRaw, 18));
        if (existing.borrowerNinBal === balNum) return;
        await setDBitem(currentLoan.loanID, {
          ...existing,
          borrowerNinBal: balNum,
          borrowerNinBalCheckedAt: Date.now(),
        }, 'ActiveLoans');
        if (!cancelled && unionAddr) {
          qc.invalidateQueries({ queryKey: ['activeLoans', unionAddr] });
        }
      } catch (_) { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, [ninBalanceFetched, ninBalanceRaw, currentLoan?.loanID, unionAddr, qc]);

  // Auto-bail: active loan + empty wallet = nothing left to cash out.
  // Show a terminal "fully cashed out" screen instead of rendering a ₹0 form.
  useEffect(() => {
    if (!ninBalanceFetched) return;
    if (step !== 'review-loan') return;
    if (!activeLoan || pendingLoan) return;
    if (ninBalanceRaw !== 0n) return;
    setStep('fully-cashed-out');
  }, [ninBalanceFetched, ninBalanceRaw, activeLoan, pendingLoan, step]);

  // --- LP withdrawal gate: check if USDT is short for pending LP withdrawals ---
  const [settlementNeeded, setSettlementNeeded] = useState(null); // null=loading, 0=healthy, >0=shortfall USDT
  useEffect(() => {
    if (!unionAddr || !systemHealth) { setSettlementNeeded(null); return; }
    let stale = false;
    const loanType = currentLoan?.loanType || ethers.encodeBytes32String('GENERIC');
    systemHealth(unionAddr, loanType).then((h) => {
      if (!stale) setSettlementNeeded(h.usdtPromised > h.usdtDeposited ? h.usdtPromised - h.usdtDeposited : 0n);
    }).catch(() => { if (!stale) setSettlementNeeded(0n); }); // on error, don't block
    return () => { stale = true; };
  }, [unionAddr, systemHealth, currentLoan?.loanType]);
  const acceptGated = settlementNeeded != null && settlementNeeded > 0n;

  const { data: reserveData } = useUnionCashReserve(unionAddr);
  // Accumulate active escrows (sorted by deadline asc) until they cover the principal.
  // Contract resolves each escrow fully — no partial escrow support on-chain.
  const allEscrows     = reserveData?.pendingDisburse ?? [];
  const escrowsToUse   = [];
  let   escrowAccumRaw = 0n;
  for (const e of allEscrows) {
    if (escrowAccumRaw >= payoutRaw) break;
    escrowsToUse.push(e);
    escrowAccumRaw += e.ninAmount;  // exact nIN from contract
  }
  const cashInHandRaw  = escrowAccumRaw;
  // Cap fromEscrow at payout; LP covers any shortfall
  const fromEscrowRaw  = cashInHandRaw < payoutRaw ? cashInHandRaw : payoutRaw;
  const fromLPRaw      = payoutRaw - fromEscrowRaw;
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
      qc.invalidateQueries({ queryKey: ['activeLoans'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
      // Effective payout = min(bills scanned, loan principal).
      // Bills < principal → partial: farmer keeps remaining nIN in wallet.
      // Bills >= principal → full: surplus bills are physical change, not tracked on-chain.
      const principalINR = Number(pendingLoan.principalRaw / 10n ** 18n);
      const effectiveAmount = Math.min(runningTotal, principalINR);
      const effectiveRaw = BigInt(effectiveAmount) * 10n ** 18n;
      await cashScanMint(
        unionAddr,
        pendingLoan.loanType || 'GENERIC',
        effectiveAmount,
        scanHash,
        0, // INVEST — records physical INR held by union
        ethers.ZeroHash,
        ethers.ZeroAddress,
        0n,
      );
      await burnFarmerNin(memberAddress, effectiveRaw);
      consumeLPCash(effectiveAmount);
      clearSession();
      qc.invalidateQueries({ queryKey: ['activeLoans'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
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
      // CS016: build escrow arrays for atomic burn+drain
      const buildEscrowArrays = (totalRaw) => {
        const ids = [];
        const amts = [];
        let remaining = totalRaw;
        for (const e of escrowsToUse) {
          if (remaining === 0n) break;
          const consume = remaining < e.ninAmount ? remaining : e.ninAmount;
          ids.push(e.escrowId);
          amts.push(consume);
          remaining -= consume;
        }
        return { ids, amts };
      };

      if (fromLP > 0) {
        // Mixed: escrow(s) cover part, LP covers the rest.
        // 1. Atomic: burn escrow portion + drain escrows in one tx (CS016 fix).
        if (fromEscrowRaw > 0n) {
          const { ids, amts } = buildEscrowArrays(fromEscrowRaw);
          await burnAndDrainEscrows(memberAddress, fromEscrowRaw, ids, amts);
        }
        // 2. Burn LP portion from farmer's wallet → receive USDT equivalent.
        const usdtOut = await redeemFarmerNin(memberAddress, fromLPRaw);
        // 3. Post RedeemOrder: lock the USDT we received + store ninAmount for deferred burn (CS027).
        const id = await postRedeemOrder(unionAddr, memberAddress, BigInt(Math.round(fromLP)), usdtOut, fromLPRaw, feeBP);
        qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
        qc.invalidateQueries({ queryKey: ['activeLoans'] });
        qc.invalidateQueries({ queryKey: ['tasks'] });
        setRedeemOrderId(id);
        setStep('redeem-waiting');
      } else {
        // Escrow(s) cover everything — atomic burn + drain in one tx (CS016 fix).
        const { ids, amts } = buildEscrowArrays(payoutRaw);
        await burnAndDrainEscrows(memberAddress, payoutRaw, ids, amts);
        consumeLPCash(principal);
        qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
        qc.invalidateQueries({ queryKey: ['activeLoans'] });
        qc.invalidateQueries({ queryKey: ['tasks'] });
        setStep('done');
      }
    } catch (err) {
      setError(err?.reason || err?.message || 'Failed');
      setStep('review-loan');
    }
  };

  // Junior cash-out: investor surrenders nIN → burn against auto-posted CashOffer → union hands cash.
  const handleJuniorCashOut = async () => {
    if (!unionAddr || !memberAddress) return;
    setError(null);
    setStep('posting');
    try {
      // Find earliest open CashOffer for this union (auto-posted by cashScanMint)
      const openOffers = openCashOffersList.filter(o => o.status === 0 && o.lp === ethers.ZeroAddress);
      if (!openOffers.length) throw new Error('No open cash offers — union needs to scan cash first');
      const offer = openOffers[0]; // FIFO: oldest first
      await fillCashOfferWithNin(offer.offerId, payoutRaw);
      await confirmCashOfferDelivered(offer.offerId);
      qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
      qc.invalidateQueries({ queryKey: ['unionOpenCashOffersList'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
      setStep('done');
    } catch (err) {
      setError(err?.reason || err?.message || 'Junior cash-out failed');
      setStep('review-loan');
    }
  };

  // No-escrow path: swap farmer's nIN for USDT (using existing allowance), then post RedeemOrder.
  // Always navigates back to the CL card (closeSheet in finally) so the user lands on
  // UnionReserve after the TxProgress dismisses — for both success and failure.
  const handlePostRedeemRequest = async () => {
    if (!unionAddr || !memberAddress || !activeLoan) return;
    setError(null);
    setStep('redeem-posting');
    let localUsdtOut = stagedUsdtOut;
    try {
      if (localUsdtOut === null) {
        localUsdtOut = await redeemFarmerNin(memberAddress, payoutRaw);
        setStagedUsdtOut(localUsdtOut);
      }
      const id = await postRedeemOrder(unionAddr, memberAddress, BigInt(Math.round(fromLP)), localUsdtOut, payoutRaw, feeBP);
      setStagedUsdtOut(null);
      setRedeemOrderId(id);
      qc.invalidateQueries({ queryKey: ['unionOpenRedeemOrdersList'] });
      qc.invalidateQueries({ queryKey: ['pendingCashDeliveries'] });
    } catch (err) {
      setError(err?.reason || err?.message || 'Failed');
    } finally {
      closeSheet();
    }
  };

  const handleConfirmRedeemDelivery = async () => {
    if (redeemOrderId === null) return;
    setError(null);
    try {
      await confirmCashDelivery(redeemOrderId);
      addLPCash(redeemOrderId, Math.round(fromLP));
      qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
      qc.invalidateQueries({ queryKey: ['unionCashReserve', unionAddr] });
      qc.invalidateQueries({ queryKey: ['activeLoans'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
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
              onSkip={() => {
                setStep('review-loan');
              }}
            />
          </motion.div>
        )}

        {/* ── Step 1b: Scan bills ── */}
        {step === 'scan-bills' && (pendingLoan || activeLoan) && (() => {
          const scanTarget  = activeLoan ? fromEscrow : (pendingLoan?.principal ?? 0);
          const onConfirm   = isJuniorCashOut ? handleJuniorCashOut : (activeLoan ? handlePostOffer : handleDisburse);
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
                disabled={step !== 'scan-bills' || !scannedBills.length || runningTotal < scanTarget}
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
                  {acceptGated && (
                    <div className="rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                      <p className="text-xs font-bold text-red-700 dark:text-red-300">LP withdrawal pending</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">Settle ₹{Number(settlementNeeded / 10n ** 12n).toLocaleString('en-IN')} in cash offers before accepting new loans.</p>
                    </div>
                  )}
                  <button
                    onClick={handleAcceptLoan}
                    disabled={escrowLoading || acceptGated}
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
                {/* Existing open RedeemOrders for this farmer */}
                {existingFarmerOrders.length > 0 && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 flex flex-col gap-1">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {existingFarmerOrders.length} open LP request{existingFarmerOrders.length > 1 ? 's' : ''}
                    </p>
                    {existingFarmerOrders.map(o => (
                      <p key={String(o.id)} className="text-xs text-amber-600 dark:text-amber-400">
                        ₹{Number(o.inrValue).toLocaleString('en-IN')} · {Number(o.inrValue).toLocaleString('en-IN')} nIN · Awaiting LP
                      </p>
                    ))}
                    <p className="text-xs text-amber-500 dark:text-amber-500">
                      Remaining available: ₹{maxPayout.toLocaleString('en-IN')}
                    </p>
                  </div>
                )}

                {/* Amount input — leader can choose partial payout */}
                <div className="rounded-xl bg-gray-100 dark:bg-slate-800 px-4 py-3 flex flex-col gap-1">
                  <label className="text-xs text-gray-500 dark:text-slate-400">Cash out amount</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold dark:text-white">₹</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={maxPayout.toString()}
                      value={cashOutInput}
                      onChange={(e) => setCashOutInput(e.target.value)}
                      className="flex-1 bg-transparent text-lg font-bold dark:text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {cashOutInput && (
                      <button onClick={() => setCashOutInput('')} className="text-xs text-gray-400 dark:text-slate-500 underline">max</button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    Permitted: ₹{maxPayout.toLocaleString('en-IN')} nIN
                  </p>
                </div>

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
                            <span className="text-xs text-gray-400 dark:text-slate-500">{fromLP.toLocaleString('en-IN')} nIN</span>
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
                        <span className="text-xs text-gray-400 dark:text-slate-500">{principal.toLocaleString('en-IN')} nIN</span>
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

        {/* ── Fully cashed out: active loan with empty wallet ── */}
        {step === 'fully-cashed-out' && activeLoan && (
          <motion.div key="fully-cashed-out" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <p className="text-xs font-mono dark:text-slate-300">{resolveName(memberAddress)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold dark:text-white">{activeLoan.loanType || 'Loan'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300">Cashed out</span>
              </div>
              <p className="text-base font-bold dark:text-white">₹{Number(activeLoan.principalRaw / 10n ** 18n).toLocaleString('en-IN')} fully disbursed</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                This loan has no remaining nIN to cash out. The borrower can repay once their collect window closes.
              </p>
            </div>
            <button
              onClick={() => handleOpenForm(null)}
              className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-slate-800 dark:text-white font-bold text-sm active:scale-[0.98]"
            >
              Close
            </button>
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
            {error ? (
              <>
                <p className="text-sm font-bold text-red-600 dark:text-red-400 text-center">Order posting failed</p>
                <p className="text-xs text-red-500 dark:text-red-400 text-center">{error}</p>
                {stagedUsdtOut !== null && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 text-center">
                    nIN was already swapped. Retry will post the order without burning again.
                  </p>
                )}
                <button
                  onClick={handlePostRedeemRequest}
                  className="mt-2 w-full py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm active:scale-[0.98]"
                >
                  {stagedUsdtOut !== null ? 'Retry — post order only' : 'Retry'}
                </button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 border-2 border-gray-300 border-t-black dark:border-t-white rounded-full animate-spin" />
                <p className="text-sm dark:text-white">Swapping nIN → USDT &amp; posting request…</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center">Using member's existing allowance — no extra signature needed.</p>
              </>
            )}
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
