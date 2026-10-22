// The move M1–M4 (P3): design hooks useLegacyBalances, useMoveProgress, useMoveWallet.
// Executive decisions 16 Oct (LOAN_RULES §5 "The move"): Polygon nIN is attested on Stellar and
// burned on Polygon (oracle O10); an open Polygon loan blocks the move; no reset; custom:chain = 'stellar'.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { useMemberLoans } from '../hooks/useMemberLoans';
import { readAllItems, setDBitem } from '../utils/db';
import { updateUserChain } from '../utils/cognito_helpers';
import { useNilaSigner } from '../wallet/signer';

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

/** Last confirmed step and error, per Polygon wallet, in localStorage (survives a reload; offline). */
const keyFor = (evm) => `nila.move:${(evm || '').toLowerCase()}`;
const readProgress = (evm) => { try { return JSON.parse(localStorage.getItem(keyFor(evm))) || {}; } catch { return {}; } };
const writeProgress = (evm, p) => { try { localStorage.setItem(keyFor(evm), JSON.stringify(p)); } catch { /* private mode */ } };

export function useMoveProgress(evm) {
  const [progress, setProgress] = useState(() => readProgress(evm));
  useEffect(() => { setProgress(readProgress(evm)); }, [evm]);
  const save = useCallback((p) => { writeProgress(evm, p); setProgress(p); }, [evm]);
  return [progress, save];
}

/**
 * M1 "Move my wallet" / M4 "Try again". Each step is safe to repeat; a retry resumes at the
 * failed one. 1 her sponsored Stellar account (+ wallet pair); 2 her Polygon nIN move request
 * (the oracle burns and mints later, once her title is attested); 3 custom:chain = 'stellar'
 * in Cognito, then in IndexedDB. No reset (16 Oct): the app reloads in place.
 */
export function useMoveWallet(loans) {
  const signer = useNilaSigner();
  const qc = useQueryClient();
  const [progress, save] = useMoveProgress(signer?.evmAddress);
  const [busy, setBusy] = useState(false);
  const legacy = useLegacyBalances(signer?.evmAddress);

  const run = useCallback(async () => {
    if (busy || !signer?.evmAddress) return;
    setBusy(true);
    let step = progress.step || 0;
    try {
      if (step < 1) {
        await signer.stellarSetup.runAsync();
        step = 1; save({ step });
      }
      if (step < 2) {
        // Her loans, checked again right before anything moves (an M4 retry skips the start screen).
        if (!loans?.known || loans.open.length > 0) throw new Error('her Polygon loans are not checked, or one is open');
        // Her Polygon nIN is not moved by the app (22 Oct, LOAN_RULES "The move's nIN"): an operator pays the few
        // wallets that hold it in cash at the office, so no move request is sent.
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
  }, [busy, progress.step, signer, save, qc, loans]);

  return { run, busy, progress, legacy };
}

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
