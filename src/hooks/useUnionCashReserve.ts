import { useQuery } from '@tanstack/react-query';
import { useContract } from './useWallet.ts';
import { useWallet } from './useWallet.ts';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
import genericErc20Artifact from '../components/ABI/genericErc20.json';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';

const nilaFxPoolAbi = (nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact;
const genericFundCoreAbi = (genericFundCoreArtifact as any).abi ?? genericFundCoreArtifact;
const erc20Abi = (genericErc20Artifact as any).abi ?? genericErc20Artifact;
const genericFundViewerAbi = (genericFundViewerArtifact as any).abi ?? genericFundViewerArtifact;

const SCAN_DEPTH = 50n;

export interface PendingDisburse {
  escrowId: bigint;
  ninAmount: bigint;  // exact nIN in the escrow (18 dec) — use this for resolveEscrowCash
  inrValue: bigint;   // INR value at scan time (human units, e.g. 500 for ₹500)
  deadline: number;   // unix ts
}

export function useUnionCashReserve(unionAddr?: string, loanType?: string) {
  const { wallet } = useWallet();
  const fxAddress     = process.env.REACT_APP_FX_POOL_MAIN;
  const coreAddr      = process.env.REACT_APP_CORE_MAIN;
  const viewerAddress = process.env.REACT_APP_VIEWER_MAIN;

  const fxPool = useContract(fxAddress,     nilaFxPoolAbi,        wallet);
  const core   = useContract(coreAddr,      genericFundCoreAbi,   wallet);
  const viewer = useContract(viewerAddress, genericFundViewerAbi, wallet);

  return useQuery({
    queryKey: ['unionCashReserve', unionAddr, loanType],
    enabled: !!unionAddr && !!fxPool && !!core,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { ethers } = await import('ethers');
      const lt = loanType ?? ethers.ZeroHash;

      const [treasury, rainyDay, activeEscrowNin, usdtTokenAddr, usdtDec, escrowDurationRaw, juniorPendingNin, seniorPendingNin, healthRaw] = await Promise.all([
        core!.unionTreasury(unionAddr!),
        core!.unionRainyDay(unionAddr!),
        fxPool!.unionActiveEscrowNin(unionAddr!),
        fxPool!.usdt(),
        fxPool!.usdtDecimals(),
        fxPool!.escrowDuration(),
        core!.juniorPendingPrincipal(unionAddr!, lt),
        core!.seniorPendingPrincipal(unionAddr!),
        viewer!.systemHealth(fxAddress!, unionAddr!, lt).catch(() => null),
      ]);
      const escrowDuration = Number(escrowDurationRaw);

      // USDT balance held by the FxPool contract
      let usdtBalance: bigint = 0n;
      let usdtDecimals: number = Number(usdtDec);
      try {
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
          const escrow = await fxPool!.escrows(id);
          const escrowUnion   = escrow.union   ?? escrow[0];
          const escrowStatus  = Number(escrow.status  ?? escrow[6]);
          const escrowDeadline = Number(escrow.deadline ?? escrow[5]);
          const unionMatch = escrowUnion?.toLowerCase() === unionAddr!.toLowerCase();
          const isActive   = escrowStatus === 0;
          if (unionMatch && isActive) {
            if (nextDeadline === null || escrowDeadline < nextDeadline) nextDeadline = escrowDeadline;
            pendingDisburse.push({
              escrowId:  id,
              ninAmount: (escrow.ninAmount ?? escrow[2]) as bigint,
              inrValue:  (escrow.inrValue  ?? escrow[3]) as bigint,
              deadline:  escrowDeadline,
            });
          }
        } catch {}
      }
      pendingDisburse.sort((a, b) => a.deadline - b.deadline);

      const usdtDeposited: bigint = (healthRaw?.usdtDeposited ?? healthRaw?.[0] ?? 0n) as bigint;
      const usdtPromised:  bigint = (healthRaw?.usdtPromised  ?? healthRaw?.[1] ?? 0n) as bigint;
      const settlementShortfall = usdtPromised > usdtDeposited ? usdtPromised - usdtDeposited : 0n;

      // Convert USDT shortfall → INR using the implicit oracle rate embedded in
      // usdtPromised. totalPendingNin (18 dec) / usdtPromised (6 dec) = INR per USDT.
      const totalPendingNin = (juniorPendingNin as bigint) + (seniorPendingNin as bigint);
      const settlementShortfallInr = usdtPromised > 0n
        ? (settlementShortfall * totalPendingNin) / usdtPromised
        : 0n; // 18 dec (same as nIN / INR)

      return {
        treasury:         treasury         as bigint,
        rainyDay:         rainyDay         as bigint,
        activeEscrowNin:  activeEscrowNin  as bigint,
        available:        (treasury as bigint) - (activeEscrowNin as bigint),
        juniorPendingNin: juniorPendingNin as bigint,
        usdtDeposited,
        usdtPromised,
        settlementShortfall,
        settlementShortfallInr,
        nextDeadline,
        pendingDisburse,
        hasNoEscrow: pendingDisburse.length === 0,
        escrowDuration,
        usdtBalance,
        usdtDecimals,
      };
    },
  });
}
