import { useState }               from "react";
import { useTx }                  from "../hooks/useTx.ts";
import { useWallet, useContract } from "../hooks/useWallet.ts";
import { useQueryClient }         from "@tanstack/react-query";
import genericFundViewerArtifact   from '../components/ABI/genericFundViewer.json';
const genericFundViewerAbi = genericFundViewerArtifact.abi;
import nilaUnionAbi               from '../components/ABI/NilaUnion.json';
import { ethers, ContractTransactionResponse, ContractTransactionReceipt } from "ethers";
import { FundSpecific }                from "./useLoadFunds.ts";
const genericFundViewerAddress: string = process.env.REACT_APP_VIEWER_MAIN!;

interface Rewards {
  ids: number[];          // demand IDs
  from_addrs: string[];   // farmer addrs matched index-wise
}

export function usePreviewUnbond(unionAddr: string) {
  const runTx        = useTx();
  const { provider } = useWallet();
  const viewer       = useContract(genericFundViewerAddress, genericFundViewerAbi, provider)
  const qc           = useQueryClient();
  const DECIMALS     = 18;

  /** preview unbonding time and withdrawal period (if no pending) */
  const preview = async (loanType: string, s: FundSpecific, userAddr: string, seniority: number) => {
    if (!viewer || !provider) return;

    if (seniority === 1) {
      // Senior: previewUnbondSenior(unionAddr, investor)
      const fetchedAtWall = Math.floor(Date.now() / 1000);
      const [p, block] = await Promise.all([
        viewer.previewUnbondSenior(unionAddr, userAddr),
        provider.getBlock('latest'),
      ]);
      return {
        requestTs: p.requestTs,
        minWindowTs: p.minWindowTs,
        chainNowSec: block?.timestamp ?? fetchedAtWall,
        fetchedAtWall,
        pending: s.senior,
        pendingPrincipalSnap: p.requestTs > 0n ? Number(ethers.formatUnits(p.pendingPrincipalSnap, DECIMALS)) : 0,
        pastMin: p.pastMin,
        coveredByBucket: p.coveredByBucket,
        eligibleNow: p.eligibleNow,
      };
    }

    const fetchedAtWall = Math.floor(Date.now() / 1000);
    const [p, block] = await Promise.all([
      viewer.previewUnbondJunior(unionAddr, loanType, userAddr),
      provider.getBlock('latest'),
    ]);

    // p.requestTs === 0 means no unbond has been started yet
    const snap = p.pendingPrincipalSnap as bigint;

    const out = {
      requestTs: snap !== 0n ? p.requestTs : 0n,
      minWindowTs: p.minWindowTs,
      chainNowSec: block?.timestamp ?? fetchedAtWall,
      fetchedAtWall,
      pending: Number(ethers.formatUnits(p.pendingShares, DECIMALS)),
      pendingPrincipalSnap: Number(ethers.formatUnits(snap, DECIMALS)),
      pastMin: p.pastMin,
      coveredByBucket: p.coveredByBucket,
      eligibleNow: p.eligibleNow,
    };
    return out
    };

    return { preview } as const;
}

export function useClaimInterest(unionAddr: string) {
  const runTx      = useTx();
  const { wallet } = useWallet();
  const union      = useContract(unionAddr, nilaUnionAbi, wallet);
  const qc         = useQueryClient();
  const walletaddr = wallet?.address;

  const claimInterest = async (rewards: Rewards) =>
    runTx(
      async (): Promise<ContractTransactionResponse> => {
        // rebuild this to only collect rewards from input fund
        
        console.log('rewardds', rewards)
        if (!union || !wallet) throw new Error("Wallet unavailable");
        if (!rewards?.ids?.length) throw new Error("No rewards");

        console.log('rewardds', rewards)
        // Build deferred calls
        const execs = rewards.ids.map((id, i) => () =>
          union.claimInterest.staticCall(id, rewards.from_addrs[i])
        );

        const receipts: ContractTransactionReceipt[] = [];
        let lastTx: ContractTransactionResponse | undefined;

        // send sequentially, wait each, but return the LAST tx response
        for (const exec of execs) {
          const tx = await exec();        // ContractTransactionResponse
          lastTx = tx;
          const rc = await tx.wait();     // ContractTransactionReceipt | null
          if (rc) receipts.push(rc);
        }

        // lastTx is defined because ids.length > 0
        return lastTx!;
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["balances", walletaddr] });
        },
      }
    );

  return { claimInterest };
}
