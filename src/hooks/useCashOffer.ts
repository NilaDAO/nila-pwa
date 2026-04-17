import { useQuery } from '@tanstack/react-query';
import { useContract, useWallet } from './useWallet.ts';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';

const nilaFxPoolAbi = (nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact;

export function useCashOffer(offerId?: bigint) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['cashOffer', offerId?.toString()],
    enabled: offerId !== undefined && !!fxPool,
    refetchInterval: 5_000,
    queryFn: async () => {
      const offer = await fxPool!.cashOffers(offerId!);
      return {
        union:     offer.union     as string,
        escrowId:  offer.escrowId  as bigint,
        ninAmount: offer.ninAmount as bigint,
        inrValue:  offer.inrValue  as bigint,
        feeBP:     Number(offer.feeBP),
        lp:        offer.lp        as string,
        deadline:  Number(offer.deadline),
        status:    Number(offer.status),  // 0=Open, 1=Filled, 2=Confirmed, 3=Reclaimed
      };
    },
  });
}

/** Count open CashOffers (status=0, not yet filled) for a union, scanning the last `depth` offers. */
export function useOpenCashOffers(unionAddr?: string, depth = 50) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['openCashOffers', unionAddr],
    enabled: !!unionAddr && !!fxPool,
    refetchInterval: 15_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextCashOfferId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const now = Math.floor(Date.now() / 1000);
      let count = 0;
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const offer = await fxPool!.cashOffers(id);
          if (
            offer.union?.toLowerCase() === unionAddr!.toLowerCase() &&
            Number(offer.status) === 0 &&
            Number(offer.deadline) > now
          ) count++;
        } catch {}
      }
      return count;
    },
  });
}

/**
 * List all open CashOffers (status=0, not expired) globally.
 * LP perspective: "RedeemOrder" — LP deposits USDT, picks up INR cash from union.
 * Contract side: CashOffer struct / nextCashOfferId / fillCashOffer().
 */
export function useGlobalOpenRedeemOrders(depth = 100) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['globalOpenRedeemOrders'],
    enabled: !!fxPool,
    refetchInterval: 30_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextCashOfferId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const now = Math.floor(Date.now() / 1000);
      const open: {
        id: bigint; union: string; escrowId: bigint;
        ninAmount: bigint; inrValue: bigint; feeBP: number; deadline: number;
        usdtAmount: bigint;
      }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const o = await fxPool!.cashOffers(id);
          if (Number(o.status) === 0 && Number(o.deadline) > now) {
            let usdtAmount = 0n;
            try {
              const escrow = await fxPool!.getEscrow(o.escrowId as bigint);
              const mintRate = escrow.mintRate as bigint;
              if (mintRate > 0n) {
                usdtAmount = ((o.ninAmount as bigint) * 10n ** 8n) / mintRate / 10n ** 12n;
              }
            } catch {}
            open.push({
              id,
              union:      o.union     as string,
              escrowId:   o.escrowId  as bigint,
              ninAmount:  o.ninAmount as bigint,
              inrValue:   o.inrValue  as bigint,
              feeBP:      Number(o.feeBP),
              deadline:   Number(o.deadline),
              usdtAmount,
            });
          }
        } catch {}
      }
      return open;
    },
  });
}

/**
 * List all open RedeemOrders (status=0, not expired) globally.
 * LP perspective: "CashOffer" — LP deposits USDT + brings INR cash, gets USDT + fee back.
 * Contract side: RedeemOrder struct / nextRedeemOrderId / fillRedeemOrder().
 */
export function useGlobalOpenCashOffers(depth = 100) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['globalOpenCashOffers'],
    enabled: !!fxPool,
    refetchInterval: 30_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextRedeemOrderId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const now = Math.floor(Date.now() / 1000);
      const open: {
        id: bigint; union: string; farmer: string;
        inrValue: bigint; feeBP: number; deadline: number;
        usdtAmount: bigint;
      }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const o = await fxPool!.redeemOrders(id);
          if (Number(o.status) === 0 && Number(o.deadline) > now) {
            open.push({
              id,
              union:      o.union      as string,
              farmer:     o.farmer     as string,
              inrValue:   o.inrValue   as bigint,
              feeBP:      Number(o.feeBP),
              deadline:   Number(o.deadline),
              usdtAmount: o.usdtLocked as bigint,
            });
          }
        } catch {}
      }
      return open;
    },
  });
}

/** Union leader: list RedeemOrders where LP has committed (status=1) — waiting for confirmation. */
export function usePendingCashDeliveries(unionAddr?: string, depth = 50) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['pendingCashDeliveries', unionAddr],
    enabled: !!unionAddr && !!fxPool,
    refetchInterval: 15_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextRedeemOrderId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const pending: { id: bigint; inrValue: bigint; usdtLocked: bigint; feeBP: number; lp: string; deadline: number }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const o = await fxPool!.redeemOrders(id);
          if (
            (o.union as string).toLowerCase() === unionAddr!.toLowerCase() &&
            Number(o.status) === 1  // LP committed
          ) {
            pending.push({
              id,
              inrValue:   o.inrValue   as bigint,
              usdtLocked: o.usdtLocked as bigint,
              feeBP:      Number(o.feeBP),
              lp:         o.lp         as string,
              deadline:   Number(o.deadline),
            });
          }
        } catch {}
      }
      return pending;
    },
  });
}

/** Union leader: list CashOffers where LP has filled (status=1) — union needs to count bills and confirm. */
export function usePendingFilledCashOffers(unionAddr?: string, depth = 50) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['pendingFilledCashOffers', unionAddr],
    enabled: !!unionAddr && !!fxPool,
    refetchInterval: 15_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextCashOfferId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const pending: { id: bigint; escrowId: bigint; inrValue: bigint; lp: string; feeBP: number }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const o = await fxPool!.cashOffers(id);
          if (
            (o.union as string).toLowerCase() === unionAddr!.toLowerCase() &&
            Number(o.status) === 1  // LP filled
          ) {
            pending.push({
              id,
              escrowId: o.escrowId as bigint,
              inrValue: o.inrValue as bigint,
              lp:       o.lp       as string,
              feeBP:    Number(o.feeBP),
            });
          }
        } catch {}
      }
      return pending;
    },
  });
}

/** Union leader: list open CashOffers (status=0, not expired) posted by this union — full details for the LP requests card. */
export function useUnionOpenCashOffersList(unionAddr?: string, depth = 50) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['unionOpenCashOffersList', unionAddr],
    enabled: !!unionAddr && !!fxPool,
    refetchInterval: 15_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextCashOfferId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const now = Math.floor(Date.now() / 1000);
      const open: { id: bigint; escrowId: bigint; inrValue: bigint; feeBP: number; deadline: number }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const o = await fxPool!.cashOffers(id);
          if (
            (o.union as string).toLowerCase() === unionAddr!.toLowerCase() &&
            Number(o.status) === 0 &&
            Number(o.deadline) > now
          ) {
            open.push({
              id,
              escrowId: o.escrowId as bigint,
              inrValue: o.inrValue as bigint,
              feeBP:    Number(o.feeBP),
              deadline: Number(o.deadline),
            });
          }
        } catch {}
      }
      return open;
    },
  });
}

/** Union leader: list open RedeemOrders (status=0, not expired) posted by this union — full details for the LP requests card. */
export function useUnionOpenRedeemOrdersList(unionAddr?: string, depth = 50) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['unionOpenRedeemOrdersList', unionAddr],
    enabled: !!unionAddr && !!fxPool,
    refetchInterval: 15_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextRedeemOrderId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const now = Math.floor(Date.now() / 1000);
      const open: { id: bigint; farmer: string; inrValue: bigint; usdtLocked: bigint; feeBP: number; deadline: number }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const o = await fxPool!.redeemOrders(id);
          if (
            (o.union as string).toLowerCase() === unionAddr!.toLowerCase() &&
            Number(o.status) === 0 &&
            Number(o.deadline) > now
          ) {
            open.push({
              id,
              farmer:     o.farmer     as string,
              inrValue:   o.inrValue   as bigint,
              usdtLocked: o.usdtLocked as bigint,
              feeBP:      Number(o.feeBP),
              deadline:   Number(o.deadline),
            });
          }
        } catch {}
      }
      return open;
    },
  });
}

/** List active escrows for a union (status=0), scanning the last `depth` escrows. */
export function useUnionActiveEscrows(unionAddr?: string, loanType?: string, depth = 50) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['unionActiveEscrows', unionAddr, loanType],
    enabled: !!unionAddr && !!fxPool,
    refetchInterval: 15_000,
    queryFn: async () => {
      const nextId: bigint = await fxPool!.nextEscrowId();
      const start = nextId > BigInt(depth) ? nextId - BigInt(depth) : 0n;
      const active: { id: bigint; ninAmount: bigint; inrValue: bigint; deadline: number }[] = [];
      for (let id = nextId - 1n; id >= start; id--) {
        try {
          const escrow = await fxPool!.getEscrow(id);
          if (
            escrow.union?.toLowerCase() === unionAddr!.toLowerCase() &&
            Number(escrow.status) === 0
          ) {
            active.push({
              id,
              ninAmount: escrow.ninAmount as bigint,
              inrValue:  escrow.inrValue  as bigint,
              deadline:  Number(escrow.deadline),
            });
          }
        } catch {}
      }
      return active;
    },
  });
}
