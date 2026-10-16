// The move M1–M4 (P3): design hooks useLegacyBalances, useMoveProgress, useMoveWallet.
// Executive decisions 16 Oct (LOAN_RULES §5 "The move"): Polygon nIN is attested on Stellar and
// burned on Polygon (oracle O10); an open Polygon loan blocks the move; no reset; custom:chain = 'stellar'.
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { useMemberLoans } from '../hooks/useMemberLoans';
import { readAllItems, setDBitem } from '../utils/db';
import { updateUserChain } from '../utils/cognito_helpers';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { requestMoveNin } from './api';

export const STELLAR_CHAIN = 'stellar';
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

/** Last confirmed step and error, in localStorage (survives a reload; works offline). */
const KEY = 'nila.move';
const readProgress = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const writeProgress = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } };

export function useMoveProgress() {
  const [progress, setProgress] = useState(readProgress);
  const save = useCallback((p) => { writeProgress(p); setProgress(p); }, []);
  return [progress, save];
}

/**
 * M1 "Move my wallet" / M4 "Try again". Each step is safe to repeat; a retry resumes at the
 * failed one. 1 her sponsored Stellar account (+ wallet pair); 2 her Polygon nIN move request
 * (the oracle burns and mints later, once her title is attested); 3 custom:chain = 'stellar'
 * in Cognito, then in IndexedDB. No reset (16 Oct): the app reloads in place.
 */
export function useMoveWallet() {
  const signer = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const qc = useQueryClient();
  const [progress, save] = useMoveProgress();
  const [busy, setBusy] = useState(false);
  const legacy = useLegacyBalances(signer?.evmAddress);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    let step = progress.step || 0;
    try {
      if (step < 1) {
        await signer.stellarSetup.runAsync();
        step = 1; save({ step });
      }
      if (step < 2) {
        const wei = (await legacy.refetch()).data?.ninWei ?? 0n;
        if (wei > 0n) {
          await requestMoveNin({ network: cfg.network, stellar: signer.stellarAddress,
            evmAddress: signer.evmAddress, amountWei: wei, signEvmMessage: signer.signEvmMessage });
        }
        step = 2; save({ step });
      }
      if (step < 3) {
        // Her Cognito tokens, as the login stored them (no admin fallback: no phone passed).
        const init = await readAllItems('Init');
        if (!init.jwt_token && !init.refresh_token) throw new Error('not logged in with Cognito');
        await updateUserChain({ accessToken: init.jwt_token, refreshToken: init.refresh_token, chainId: STELLAR_CHAIN });
        await setDBitem('chain', STELLAR_CHAIN, 'Init');
        step = 3; save({ step, done: true });
      }
      qc.invalidateQueries();
    } catch (e) {
      console.error('[move] step', step + 1, 'failed', e);
      save({ step, error: e.message || String(e) });
    } finally {
      setBusy(false);
    }
  }, [busy, progress.step, signer, cfg, legacy, save, qc]);

  return { run, busy, progress, legacy };
}

/** An open Polygon loan blocks the move until it is repaid in the old app (16 Oct). */
export function useOpenPolygonLoans(address) {
  const { loans, loading } = useMemberLoans(address);
  return { open: (loans || []).filter((l) => Number(l.outstanding) > 0), loading };
}
