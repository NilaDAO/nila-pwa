import { ethers } from 'ethers';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useContract } from './useWallet.ts';
import { useTx } from './useTx.ts';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';
const nilaFxPoolAbi = (nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact;

const fxPoolAddress: string = process.env.REACT_APP_FX_POOL_MAIN!;

// Mirrors ScanPurpose enum in NilaFxPool.sol
export const ScanPurpose = { INVEST: 0, REPAY: 1 } as const;
export type ScanPurposeValue = typeof ScanPurpose[keyof typeof ScanPurpose];

/**
 * Union leader: scan physical cash and route it to either
 * - INVEST: credit the junior market escrow bucket
 * - REPAY:  close an existing farmer loan
 */
export function useCashScanMint() {
  const { wallet } = useWallet();
  const runTx      = useTx();
  const qc         = useQueryClient();
  const fxPool     = useContract(fxPoolAddress, nilaFxPoolAbi, wallet);

  const cashScanMint = (
    unionAddr : string,
    loanType  : string,                          // bytes32 hex string
    inrValue  : number,                          // human INR units e.g. 84000
    scanHash  : string,                          // bytes32 hex string
    purpose   : ScanPurposeValue,
    loanId    : string = ethers.ZeroHash,        // bytes32, required for REPAY
  ) =>
    runTx(
      async () => {
        if (!fxPool || !wallet) throw new Error('FxPool or wallet not ready');
        return fxPool.cashScanMint(unionAddr, loanType, inrValue, scanHash, purpose, loanId);
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['unionGenericFunds'] });
          qc.invalidateQueries({ queryKey: ['balances'] });
        },
      }
    );

  return { cashScanMint };
}

/**
 * Union leader: farmer physically comes to collect cash.
 * FxPool has BURNER_ROLE on nIN — burns directly from farmer's balance,
 * no permit or allowance needed.
 * Union scans farmer QR, confirms amount, calls collectCash.
 */
export function useCollectCash() {
  const { wallet } = useWallet();
  const runTx      = useTx();
  const qc         = useQueryClient();
  const fxPool     = useContract(fxPoolAddress, nilaFxPoolAbi, wallet);

  const collectCash = (farmer: string, amount: bigint) =>
    runTx(
      async () => {
        if (!fxPool || !wallet) throw new Error('FxPool or wallet not ready');
        return fxPool.burnFarmerNin(farmer, amount);
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['balances'] });
          qc.invalidateQueries({ queryKey: ['unionGenericFunds'] });
        },
      }
    );

  return { collectCash };
}
