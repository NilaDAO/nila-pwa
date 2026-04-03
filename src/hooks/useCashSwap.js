import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useDataContext } from '../utils/NavigationContext';
import { useFxPool } from './useWallet.ts';

const buildMerkleRoot = async (serials) => {
  const { MerkleTree } = await import(
    /* webpackChunkName: "merkle" */ 'merkletreejs'
  );
  const hashFn = (data) => {
    const hex = ethers.keccak256(data);
    return ethers.getBytes(hex);
  };
  const leaves = serials.map((s) => hashFn(ethers.toUtf8Bytes(s)));
  const tree = new MerkleTree(leaves, hashFn, { sortPairs: true });
  return tree.getHexRoot();
};

// ScanPurpose enum on-chain: 0 = INVEST, 1 = REPAY, 2 = DISBURSE
const SCAN_PURPOSE = { contribute: 0, repay: 1 };

const useCashSwap = (clearSession, handleOpenForm) => {
  const { db } = useDataContext();
  const { cashScanMint, acceptLoan, burnFarmerNin } = useFxPool();
  const [isProcessing, setIsProcessing] = useState(false);

  const executeSwap = useCallback(
    async (scannedBills, runningTotal, {
      memberAddress,
      purpose,
      loanID,
      loanType,
      loanPending, // true = drawdownTs===0 (pending loan, no nIN yet), false = already drawn (nIN in wallet)
    } = {}) => {
      if (isProcessing || !scannedBills.length) return;
      setIsProcessing(true);

      try {
        const unionAddr = db?.union?.address;
        if (!unionAddr) throw new Error('No union address found');

        const serialNumbers = scannedBills.map((b) => b.serialNumber).filter(Boolean);
        const scanHash = serialNumbers.length > 0
          ? await buildMerkleRoot(serialNumbers)
          : ethers.ZeroHash;

        const resolvedLoanType = loanType || 'GENERIC';
        const loanIdBytes = loanID ?? ethers.ZeroHash;
        const ninAmount = BigInt(runningTotal) * 10n ** 18n;

        if (purpose === 'give') {
          // CASH-OUT: member wants physical INR, surrenders nIN from their wallet.
          if (!memberAddress) throw new Error('Member address required for cash-out');
          if (loanPending && loanIdBytes !== ethers.ZeroHash) {
            // Pending loan (drawdownTs===0): no nIN in wallet yet.
            // acceptLoan mints nIN to member, then burnFarmerNin removes it — leader hands cash.
            const escrowId = await cashScanMint(
              unionAddr,
              resolvedLoanType,
              runningTotal,
              scanHash,
              SCAN_PURPOSE.contribute, // INVEST — creates escrow to back the loan
              ethers.ZeroHash,
              ethers.ZeroAddress,
              0,
            );
            await acceptLoan(unionAddr, loanIdBytes, escrowId);
          }
          // nIN is now in member's wallet (either already was, or just minted via acceptLoan above).
          // Leader burns it: member surrenders nIN, leader hands physical INR.
          await burnFarmerNin(memberAddress, ninAmount);

        } else if (purpose === 'contribute' && loanPending && loanIdBytes !== ethers.ZeroHash) {
          // CASH-IN: member brings INR + has a pending loan.
          // Create INVEST escrow then immediately accept the loan against it.
          const escrowId = await cashScanMint(
            unionAddr,
            resolvedLoanType,
            runningTotal,
            scanHash,
            SCAN_PURPOSE.contribute, // 0 = INVEST
            ethers.ZeroHash,
            memberAddress ?? ethers.ZeroAddress,
            0,
          );
          await acceptLoan(unionAddr, loanIdBytes, escrowId);

        } else {
          // CASH-IN: REPAY (member brings INR to close loan) or plain INVEST (no loan).
          await cashScanMint(
            unionAddr,
            resolvedLoanType,
            runningTotal,
            scanHash,
            SCAN_PURPOSE[purpose] ?? SCAN_PURPOSE.repay,
            loanIdBytes,
            memberAddress ?? ethers.ZeroAddress,
            0,
          );
        }

        clearSession();
        handleOpenForm('receipts');
      } catch (err) {
        console.error('Cash swap failed:', err);
        alert(err?.reason || err?.message || 'Swap failed. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, db, cashScanMint, acceptLoan, burnFarmerNin, clearSession, handleOpenForm]
  );

  return { executeSwap, isProcessing };
};

export default useCashSwap;
