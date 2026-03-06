import { useState, useCallback } from 'react';
import axios from 'axios';
import { useDataContext } from '../utils/NavigationContext';
import { useFxPool } from './useWallet.ts';

const API = process.env.REACT_APP_API_BASE_URL;

const buildMerkleTree = async (serials) => {
  const { MerkleTree } = await import(
    /* webpackChunkName: "merkle" */ 'merkletreejs'
  );
  const keccak256 = (
    await import(/* webpackChunkName: "merkle" */ 'keccak256')
  ).default;

  const leaves = serials.map((s) => keccak256(s));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return tree.getHexRoot();
};

const useCashSwap = (clearSession, handleOpenForm) => {
  const { db } = useDataContext();
  const { mintNin, redeemNin } = useFxPool();
  const [isProcessing, setIsProcessing] = useState(false);

  const executeSwap = useCallback(
    async (mode, scannedBills, runningTotal) => {
      if (isProcessing || !scannedBills.length) return;
      setIsProcessing(true);

      try {
        const serialNumbers = scannedBills.map((b) => b.serialNumber);
        const merkleRoot = await buildMerkleTree(serialNumbers);
        const address = db?.address;
        const unionId = db?.union?.address;

        if (mode === 'DEPOSIT') {
          await axios.post(`${API}/swap/mint`, {
            unionId,
            recipientAddress: address,
            amount: runningTotal,
            serialNumbers,
            merkleRoot,
          });
          await mintNin(runningTotal);
        } else {
          const unknownSerials = scannedBills
            .filter((b) => b.inventoryStatus !== 'known')
            .map((b) => b.serialNumber);

          await axios.post(`${API}/swap/burn`, {
            unionId,
            farmerAddress: address,
            amount: runningTotal,
            serialNumbers,
            merkleRoot,
            unknownSerials,
          });
          await redeemNin(runningTotal);
        }

        clearSession();
        handleOpenForm('receipts');
      } catch (err) {
        console.error('Cash swap failed:', err);
        alert(
          err?.response?.data?.message ||
            err?.message ||
            'Swap failed. Please try again.'
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, db, mintNin, redeemNin, clearSession, handleOpenForm]
  );

  return { executeSwap, isProcessing };
};

export default useCashSwap;
