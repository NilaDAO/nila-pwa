import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useContract, useProvider } from './useWallet.ts';
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

export function useUnionCashReserve(unionAddr?: string) {
  // Read-only provider, not the decrypted signer — every call this hook
  // makes is a view call. useWallet()'s wallet/provider both sit behind
  // useDecryptKey (private-key decrypt, ~1s), which was blocking this card's
  // first fetch for no reason; useProvider() only needs the RPC URL env var
  // and is ready immediately (same one useActiveLoansChainSync already uses).
  const { provider } = useProvider();
  const fxAddress     = process.env.REACT_APP_FX_POOL_MAIN;
  const coreAddr      = process.env.REACT_APP_CORE_MAIN;
  const viewerAddress = process.env.REACT_APP_VIEWER_MAIN;

  const fxPool = useContract(fxAddress,     nilaFxPoolAbi,        provider);
  const core   = useContract(coreAddr,      genericFundCoreAbi,   provider);
  const viewer = useContract(viewerAddress, genericFundViewerAbi, provider);

  const enabled = !!unionAddr && !!fxPool && !!core && !!viewer;

  // Trace readiness timeline — should now be near-instant since nothing
  // here depends on wallet decryption anymore.
  const mountedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    console.log(
      `[unionCashReserve] readiness @ +${Date.now() - mountedAtRef.current}ms`,
      { unionAddr, hasProvider: !!provider, hasFxPool: !!fxPool, hasCore: !!core, hasViewer: !!viewer, enabled }
    );
  }, [unionAddr, provider, fxPool, core, viewer, enabled]);

  return useQuery({
    queryKey: ['unionCashReserve', unionAddr],
    enabled,
    // These figures only change as a result of on-chain actions taken through
    // this app (cash-in/out, repay, treasury deposit/withdraw, settle, accept
    // delivery, ...) — every one of those already calls
    // qc.invalidateQueries(['unionCashReserve', ...]) on success. So this
    // query only needs to fetch once and then wait to be invalidated, not
    // poll or refetch on every mount/focus.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      console.log(`[unionCashReserve] queryFn FIRED union=${unionAddr} at ${new Date().toISOString()}`);
      console.trace('[unionCashReserve] fired from');
      const { ethers } = await import('ethers');

      // Resolve the union's primary loan type ourselves rather than trusting
      // callers to pass it — they didn't consistently: previously 5 of this
      // hook's 6 call sites omitted it, silently defaulting to ZeroHash and
      // querying juniorPendingPrincipal/systemHealth for the wrong fund. That
      // also fragmented the query cache (one entry per distinct loanType
      // argument), causing this whole expensive fetch to run twice on load.
      const rawUnion = await viewer!.getUnion(unionAddr!).catch(() => null);
      const lt = (rawUnion?.[1]?.[0] as string | undefined) ?? ethers.ZeroHash;

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
        const usdtToken = new ethers.Contract(usdtTokenAddr as string, erc20Abi, provider!);
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
