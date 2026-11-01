// A member's Polygon side, read at start: titles and nIN (useLegacyBalances) and open Polygon loans. The self-move
// (M1–M4) is gone (executive decision 1 Nov, as 24 Oct): the operator prepares the account and sets custom:chain.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { useMemberLoans } from '../hooks/useMemberLoans';

const ERC20 = ['function balanceOf(address) view returns (uint256)'];

/** Polygon: title count, nIN (wei), USDT; read on open (design qk.polygon.legacy). */
export function useLegacyBalances(address) {
  const { provider } = useProvider();
  return useQuery({
    queryKey: ['polygon', 'legacy', address],
    enabled: !!provider && !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const c = (a) => new ethers.Contract(a, ERC20, provider);
      const [titles, nin, usdt] = await Promise.all([
        c(process.env.REACT_APP_LAND_TITLE_MAIN).balanceOf(address),
        c(process.env.REACT_APP_NIN_MAIN).balanceOf(address),
        c(process.env.REACT_APP_USDT_MAIN).balanceOf(address),
      ]);
      return { titles: Number(titles), ninWei: nin, nin: Number(ethers.formatUnits(nin, 18)),
        usdt: Number(ethers.formatUnits(usdt, 6)) };
    },
  });
}

/** Last confirmed step and error, per Polygon wallet, in localStorage (survives a reload; offline). */
/**
 * An open Polygon loan blocks the move until it is repaid in the old app (16 Oct): ₹10 or more
 * outstanding (smaller remainders do not block). `known` is true only after a read for this wallet
 * and union finished without error: until then the move stays closed (never assume "none").
 */
export const LOAN_DUST = 10;

export function useOpenPolygonLoans(address, unionAddress) {
  const { loans, loading, error } = useMemberLoans(address);
  const started = useRef(false);
  const [known, setKnown] = useState(false);
  useEffect(() => { started.current = false; setKnown(false); }, [address, unionAddress]);
  useEffect(() => {
    if (loading) { started.current = true; setKnown(false); }
    else if (started.current) setKnown(!error);
  }, [loading, error]);
  return { open: (loans || []).filter((l) => Number(l.outstanding) >= LOAN_DUST), known, error };
}
