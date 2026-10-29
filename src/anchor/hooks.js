// LP hooks (P9; design DataHooksRead.md useAnchorInfo, useSep10Token, useKyc, useQuote, useAnchorTx;
// DataHooksWrite.md useAcceptOffer). Offers and LP status are read from fx_pool; K1 and the SEP-24
// status from the anchor with her SEP-10 token (kept in memory until a minute before it expires).
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Asset, TransactionBuilder } from '@stellar/stellar-sdk';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { getAccount } from '../stellar/api';
import { readContract, sv } from '../stellar/soroban';
import { anchorInfo, sep10 } from './sep';

const API = process.env.REACT_APP_API_BASE_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const U = 10_000_000;
export const usdcOf = (units) => (Number(units) / U).toFixed(2);

export function useAnchorInfo() {
  const { data: cfg } = useStellarConfig();
  return useQuery({ queryKey: ['anchor', 'info', cfg?.anchor_url], enabled: !!cfg?.anchor_url, staleTime: 86_400_000,
    queryFn: () => anchorInfo(cfg.anchor_url) });
}

const tokens = new Map();   // account → { token, exp } (memory only: never stored)

/** Her SEP-10 token: signed once, reused until a minute before it expires. */
export function useSep10Token() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const info = useAnchorInfo();
  return useCallback(async () => {
    // SEP-10 signs with her key (G…). NOT BUILT (26 Oct): the anchor naming her smart account (SEP-45, or its own map).
    const me = s?.senderAddress || s?.stellarAddress;
    const t = tokens.get(me);
    if (t && t.exp * 1000 > Date.now() + 60_000) return t.token;
    const i = info.data || (await info.refetch()).data;
    if (!i) throw new Error('The anchor is not reachable.');
    const fresh = await sep10(i, me, s.signHash, cfg.passphrase);
    tokens.set(me, fresh);
    return fresh.token;
  }, [s, cfg, info]);
}

/** Her LP standing in the union: a title (may apply, R20), accepted by the anchor, her identity checked (K1), her USDC trustline. */
export function useLpStatus() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const me = s?.stellarAddress;
  return useQuery({
    queryKey: ['stellar', 'lp', cfg?.union, me], enabled: !!cfg?.anchor_url && !!cfg?.contracts?.fx_pool && !!me, staleTime: 30_000,
    refetchOnMount: 'always',   // Settings and A1 read it afresh (a title or the anchor's acceptance can land meanwhile)
    queryFn: async () => {
      const um = [sv.address(cfg.union), sv.address(me)];
      const [title, m, a, idc] = await Promise.all([
        readContract(cfg, 'land_title', 'holds_title', um).catch(() => false),
        readContract(cfg, 'fx_pool', 'lp_member', um).catch(() => null),
        getAccount(cfg.horizon_url, me).catch(() => null),
        // K1 (22 Oct): the anchor marked her identity checked on fx_pool (a leader's USDC, A9).
        readContract(cfg, 'fx_pool', 'id_checked', [sv.address(me)]).catch(() => false),
      ]);
      const [code, issuer] = (cfg.usdc_asset || ':').split(':');
      const line = a?.balances?.find((b) => b.asset_code === code && b.asset_issuer === issuer);
      return { member: !!title, lp: !!m?.accepted, idChecked: !!idc, trustline: !!line, usdc: line ? Number(line.balance) : 0 };
    },
  });
}

/** The union's open and accepted LP offers (fx_pool.offers_of → offer). */
export function useUnionOffers({ poll = true, on = true } = {}) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'offers', cfg?.union], enabled: on && !!cfg?.contracts?.fx_pool, refetchInterval: poll ? 20_000 : false,
    queryFn: async () => {
      const ids = (await readContract(cfg, 'fx_pool', 'offers_of', [sv.address(cfg.union)])) || [];
      const out = await Promise.all(ids.map(async (id) => ({ id: Number(id), ...(await readContract(cfg, 'fx_pool', 'offer', [sv.u64(id)])) })));
      return out.map((o) => ({ ...o, kind: Number(o.kind), state: Number(o.state), inr: Number(BigInt(o.inr) / BigInt(U)), expires: Number(o.expires) }))
        .sort((a, b) => a.expires - b.expires);
    },
  });
}

/** fx_pool.quote: what an offer pays or takes today, her 1% included (C9). */
export function useOfferQuote(kind, inr) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'quote', kind, inr], enabled: !!cfg?.contracts?.fx_pool && inr > 0, staleTime: 30_000,
    queryFn: () => readContract(cfg, 'fx_pool', 'quote', [sv.address(cfg.union), sv.u32(kind), sv.i128(BigInt(inr) * BigInt(U))]),
  });
}

/** Her USDC trustline (R11), sponsored by the node once the anchor accepted her: checked, signed, submitted. */
export function useUsdcTrustline() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const me = s.stellarAddress;
      const post = async (path, body) => {
        const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || `${path}: ${r.status}`);
        return j;
      };
      const { xdr } = await post('/stellar/usdc-trustline', { lp: me });
      const tx = TransactionBuilder.fromXDR(xdr, cfg.passphrase);
      const [code, issuer] = cfg.usdc_asset.split(':');
      const ops = tx.operations;
      const ok = ops.length === 3 && tx.source === cfg.sponsor
        && ops[0].type === 'beginSponsoringFutureReserves' && ops[0].sponsoredId === me
        && ops[1].type === 'changeTrust' && ops[1].source === me && ops[1].line instanceof Asset
        && ops[1].line.getCode() === code && ops[1].line.getIssuer() === issuer
        && ops[2].type === 'endSponsoringFutureReserves' && ops[2].source === me;
      if (!ok) throw new Error('the node sent a transaction that is not your USDC trustline');
      tx.addSignature(me, btoa(String.fromCharCode(...(await s.signHash(tx.hash())))));
      await post('/stellar/usdc-trustline/submit', { xdr: tx.toXDR() });
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const a = await getAccount(cfg.horizon_url, me).catch(() => null);
        if (a?.balances?.some((b) => b.asset_code === code && b.asset_issuer === issuer)) return true;
      }
      throw new Error('The USDC trustline is not on Stellar yet.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['stellar', 'lp'] }),
  });
}

// Her accepted swaps, kept on this phone so A7b can show her code again (the chain has the offer; the anchor
// has the SEP-24 status).
const KEY = 'nila.lp.swaps';
export const loadSwaps = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
export const saveSwap = (e) => {
  try { localStorage.setItem(KEY, JSON.stringify([...loadSwaps().filter((x) => x.offer !== e.offer), e])); } catch { /* private */ }
};

// Her LP code (A7b): the offer id, a time and her Stellar key's signature over both, so the leader's scan
// can check the code comes from the LP who accepted the offer (the offer id alone is public).
export const CODE_TTL = 600;
const enc = (t) => new TextEncoder().encode(t);
export async function codeHash(offer, ts) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc(`nila-offer-code-v1\n${offer}\n${ts}`)));
}
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export async function signedCode(offer, signHash) {
  const ts = Math.floor(Date.now() / 1000);
  return `nila:offer:${offer}:${ts}:${hex(await signHash(await codeHash(offer, ts)))}`;
}
