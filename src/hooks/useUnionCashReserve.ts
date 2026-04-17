import { useQuery } from '@tanstack/react-query';
import { useContract } from './useWallet.ts';
import { useWallet } from './useWallet.ts';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
import genericErc20Artifact from '../components/ABI/genericErc20.json';

const nilaFxPoolAbi = (nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact;
const genericFundCoreAbi = (genericFundCoreArtifact as any).abi ?? genericFundCoreArtifact;
const genericFundViewerAbi = (genericFundViewerArtifact as any).abi ?? genericFundViewerArtifact;
const erc20Abi = (genericErc20Artifact as any).abi ?? genericErc20Artifact;

const SCAN_DEPTH = 50n;

export interface PendingDisburse {
  escrowId: bigint;
  ninAmount: bigint;  // exact nIN in the escrow (18 dec) — use this for resolveEscrowCash
  inrValue: bigint;   // INR value at scan time (human units, e.g. 500 for ₹500)
  deadline: number;   // unix ts
}

export interface ScheduledExit {
  investor: string;
  inrValue: bigint;   // wei (pendingPrincipalSnap, 18 dec)
  minWindowTs: number;
  pastMin: boolean;
  tranche: 'junior' | 'senior';
  loanType?: string;  // hex bytes32, junior only
}

export function useUnionCashReserve(unionAddr?: string) {
  const { wallet } = useWallet();
  const fxAddress    = process.env.REACT_APP_FX_POOL_MAIN;
  const coreAddr     = process.env.REACT_APP_CORE_MAIN;
  const viewerAddr   = process.env.REACT_APP_VIEWER_MAIN;

  const fxPool = useContract(fxAddress,  nilaFxPoolAbi,         wallet);
  const core   = useContract(coreAddr,   genericFundCoreAbi,    wallet);
  const viewer = useContract(viewerAddr, genericFundViewerAbi,  wallet);

  return useQuery({
    queryKey: ['unionCashReserve', unionAddr],
    enabled: !!unionAddr && !!fxPool && !!core,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [treasury, rainyDay, activeEscrowNin, usdtTokenAddr, usdtDec, escrowDurationRaw] = await Promise.all([
        core!.unionTreasury(unionAddr!),
        core!.unionRainyDay(unionAddr!),
        fxPool!.unionActiveEscrowNin(unionAddr!),
        fxPool!.usdt(),
        fxPool!.usdtDecimals(),
        fxPool!.escrowDuration(),
      ]);
      const escrowDuration = Number(escrowDurationRaw);

      // USDT balance held by the FxPool contract
      let usdtBalance: bigint = 0n;
      let usdtDecimals: number = Number(usdtDec);
      try {
        const { ethers } = await import('ethers');
        const usdtToken = new ethers.Contract(usdtTokenAddr as string, erc20Abi, wallet!);
        usdtBalance = await usdtToken.balanceOf(fxAddress!) as bigint;
      } catch {}

      // Scan recent escrows — build pending disburse list + next deadline
      const pendingDisburse: PendingDisburse[] = [];
      let nextDeadline: number | null = null;
      const nextId: bigint = await fxPool!.nextEscrowId();
      const start = nextId > SCAN_DEPTH ? nextId - SCAN_DEPTH : 0n;
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const escrow = await fxPool!.getEscrow(id);
          const escrowUnion = escrow.union ?? escrow[0];   // handle tuple ABI fallback
          const escrowStatus = Number(escrow.status ?? escrow[6]);
          const escrowDeadline = Number(escrow.deadline ?? escrow[5]);
          const unionMatch = escrowUnion?.toLowerCase() === unionAddr!.toLowerCase();
          const isActive  = escrowStatus === 0;
          if (unionMatch && isActive) {
            const dl = escrowDeadline;
            if (nextDeadline === null || dl < nextDeadline) nextDeadline = dl;
            pendingDisburse.push({
              escrowId:  id,
              ninAmount: (escrow.ninAmount ?? escrow[2]) as bigint,
              inrValue:  (escrow.inrValue  ?? escrow[3]) as bigint,
              deadline:  dl,
            });
          }
        } catch {}
      }
      pendingDisburse.sort((a, b) => a.deadline - b.deadline);

      // Scan pending unbond requests for this union's members (junior only for now).
      // We read UnbondRequested events emitted by GenericFundCore to find investor addresses,
      // then call previewUnbondJunior / previewUnbondSenior to get timing data.
      const scheduledExits: ScheduledExit[] = [];
      if (viewer) {
        try {
          const filter = core!.filters.UnbondRequested(null, null, unionAddr!);
          const events = await core!.queryFilter(filter, -10000);
          // deduplicate by investor+tranche+loanType
          const seen = new Set<string>();
          for (const ev of events) {
            const { investor, tranche, loanType } = (ev as any).args;
            const key = `${investor}-${tranche}-${loanType}`;
            if (seen.has(key)) continue;
            seen.add(key);
            try {
              if (Number(tranche) === 0) {
                // Junior
                const p = await (viewer as any).previewUnbondJunior(unionAddr!, loanType, investor);
                if (Number(p.requestTs) === 0) continue; // no active unbond
                scheduledExits.push({
                  investor,
                  inrValue: p.pendingPrincipalSnap as bigint,
                  minWindowTs: Number(p.minWindowTs),
                  pastMin: Boolean(p.pastMin),
                  tranche: 'junior',
                  loanType,
                });
              } else {
                // Senior
                const p = await (viewer as any).previewUnbondSenior(unionAddr!, investor);
                if (Number(p.requestTs) === 0) continue;
                scheduledExits.push({
                  investor,
                  inrValue: p.pendingPrincipalSnap as bigint,
                  minWindowTs: Number(p.minWindowTs),
                  pastMin: Boolean(p.pastMin),
                  tranche: 'senior',
                });
              }
            } catch {}
          }
          scheduledExits.sort((a, b) => a.minWindowTs - b.minWindowTs);
        } catch {}
      }

      return {
        treasury: treasury as bigint,
        rainyDay: rainyDay as bigint,
        activeEscrowNin: activeEscrowNin as bigint,
        available: (treasury as bigint) - (activeEscrowNin as bigint),
        nextDeadline,
        pendingDisburse,
        scheduledExits,
        hasNoEscrow: pendingDisburse.length === 0,
        escrowDuration,
        usdtBalance,
        usdtDecimals,
      };
    },
  });
}
