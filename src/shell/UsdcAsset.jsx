// A9 (board MemberAssetUsdc #leader, #send, #swap): the leader's USDC, opened from A1L's USDC row once her identity is
// checked. Top card: the USDC logo, her balance and its rupee value. Below: Send | Swap (executive decision 22 Oct).
//  - Send: to any Stellar address she scans or pastes; a plain USDC transfer from her wallet (the node pays the fee
//    once her identity is checked). DESIGN GAP: the board's contact list (union, providers) has no source yet.
//  - Swap: USDC → nIN in her wallet at fx_pool's rate (fx_pool.swap_usdc_to_nin); no fee. The way back is on A7.
// No Receive button (22 Oct).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MapCard from './MapCard';
import Segmented from './Segmented';
import { useLpStatus, useUsdcTrustline } from '../anchor/hooks';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Camera } from '../loan/LoanScreens';
import { KV, Stepper } from '../loan/AssetParts';
import { Notice, Primary } from '../plan/ui';
import { UsdcTile } from './icons';
import { C, FONT, R, SHADOW, TAB_BAR_HEIGHT } from './tokens';

const UNIT = 10_000_000n;   // USDC and nIN, 7 decimals
const card = { background: C.ink, borderRadius: 24, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box' };
const isG = (a) => /^G[A-Z2-7]{55}$/.test(a);

/** fx_pool's rupees per USDC, or null when it is stale (a swap is then refused by the contract too). */
export function useFxRate() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'fxRate'], enabled: !!cfg?.contracts?.fx_pool, staleTime: 60_000,
    queryFn: async () => {
      const r = await readContract(cfg, 'fx_pool', 'rate', []);
      if (!r || Number(r.valid_until) * 1000 < Date.now()) return null;
      return Number(BigInt(r.inr_per_usd)) / Number(UNIT);
    },
  });
}

const money = (n, d = 2) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Swap nIN → USDC for a leader (A7), paid back from the union's leader-swap USDC (fx_pool.swap_nin_to_usdc). */
/** bare: only the form, for a card that already has its own title / switch (A7, 22 Oct). */
export function SwapToUsdc({ nin, tx, bare }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const lp = useLpStatus().data;
  const rate = useFxRate().data;
  const [amount, setAmount] = useState(0);
  if (!lp?.idChecked || !lp?.trustline) return null;
  const a = Math.max(0, Math.min(amount, Math.floor(nin)));
  const get = rate ? a / rate : 0;
  const swap = () => tx.run({
    label: `Swap ${a} nIN to USDC`, rows: [['You give', `${a} nIN`], ['You get about', `${money(get)} USDC`]],
    contractName: 'fx_pool', fn: 'swap_nin_to_usdc',
    args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.i128(BigInt(a) * UNIT)],
    invalidate: [['stellar', 'account'], ['stellar', 'lp']],
  });
  const form = (
    <>
      <Stepper value={a} set={setAmount} step={100} min={0} max={Math.floor(nin)} unit="nIN" label="nIN to swap" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <KV k="You get about" v={rate ? `${money(get)} USDC` : '—'} />
        <KV k="Rate" v={rate ? `1 USDC = ${money(rate)} nIN` : 'Not available now'} />
      </div>
      <Primary disabled={!tx.ready || !rate || a < 1} onClick={swap}>{a < 1 ? 'Enter an amount' : 'Swap to USDC'}</Primary>
    </>
  );
  if (bare) return form;
  return (
    <section aria-label="Swap to USDC" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Swap to USDC</h2>
      {form}
    </section>
  );
}

export default function UsdcAsset({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const lp = useLpStatus().data;
  const trust = useUsdcTrustline();
  const rate = useFxRate().data;
  const tx = useSorobanTx();
  const [tab, setTab] = useState('swap');
  const [amount, setAmount] = useState(0);
  const [to, setTo] = useState('');
  const [scan, setScan] = useState(false);
  const usdc = lp ? lp.usdc || 0 : 0;
  // Her identity is checked (K1), so the node sponsors her USDC trustline; until it exists she holds no USDC.
  const noLine = lp && lp.idChecked && !lp.trustline;
  const a = Math.max(0, Math.min(amount, Math.floor(usdc)));
  const left = usdc - a;
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); setAmount(0); }} onRetry={() => tx.retry()} />;
  const swap = () => tx.run({
    label: `Swap ${a} USDC to nIN`, rows: [['You give', `${a} USDC`], ['You get about', `${money(a * rate, 0)} nIN`]],
    contractName: 'fx_pool', fn: 'swap_usdc_to_nin',
    args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.i128(BigInt(a) * UNIT)],
    invalidate: [['stellar', 'account'], ['stellar', 'lp']],
  });
  const send = () => tx.run({
    label: `Send ${a} USDC`, rows: [['To', `${to.slice(0, 4)}…${to.slice(-4)}`], ['Amount', `${a} USDC`]],
    contractName: 'usdc', fn: 'transfer',
    args: [sv.address(s.stellarAddress), sv.address(to), sv.i128(BigInt(a) * UNIT)],
    invalidate: [['stellar', 'lp']],
  });
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, minHeight: `calc(100dvh - ${TAB_BAR_HEIGHT + 16}px)`, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: '', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}>
      <section aria-label="USDC" style={card}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 24px' }}><UsdcTile size={72} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>USDC</span>
            <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>Digital US dollar{rate ? ` · ₹${money(rate)}` : ''}</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{lp ? money(usdc) : '…'}</span>
            {rate && <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>₹{money(usdc * rate, 0)}</span>}
          </span>
        </div>
        {noLine && (
          <>
            <Primary disabled={trust.isPending} onClick={() => trust.mutate()}>{trust.isPending ? 'Opening your USDC account…' : 'Open your USDC account'}</Primary>
            {trust.isError && <p style={{ color: C.coral, fontSize: 14 }}>{trust.error.message}</p>}
          </>
        )}
      </section>
      {lp?.trustline && (
        <section aria-label="Send or swap" style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Segmented label="Send or swap" options={[['send', 'Send'], ['swap', 'Swap']]} value={tab} onChange={setTab} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>To</span>
          {tab === 'swap' ? (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderRadius: R.button, background: C.raised }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Nila swap · your nIN</span>
              <span style={{ fontSize: 14, color: C.muted }}>{rate ? `1 USDC = ${money(rate)} nIN` : 'Rate not available now'}</span>
            </div>
          ) : scan ? (
            <Camera onText={(t) => { const g = t.replace(/^.*?(G[A-Z2-7]{55}).*$/s, '$1'); setTo(g); setScan(false); }} />
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="Stellar address" placeholder="G… address" value={to} onChange={(e) => setTo(e.target.value.trim().toUpperCase())}
                style={{ flex: 1, minWidth: 0, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, padding: '0 14px',
                  fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setScan(true)} style={{ height: 44, padding: '0 14px', border: 0, borderRadius: R.button, background: C.raised,
                color: C.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Scan QR</button>
            </div>
          )}
          <span style={{ fontSize: 14, fontWeight: 700 }}>Amount</span>
          <Stepper value={a} set={setAmount} step={1} min={0} max={Math.floor(usdc)} unit="USDC" label="USDC amount" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tab === 'swap' && <KV k="You get about" v={rate && a ? `${money(a * rate, 0)} nIN` : '—'} />}
            <KV k="Fee" v="None" />
            <KV k="Left after" v={`${money(left)} USDC`} />
          </div>
          {tab === 'swap'
            ? <Primary disabled={!tx.ready || !rate || a < 1} onClick={swap}>{a < 1 ? 'Enter an amount' : 'Swap to nIN'}</Primary>
            : <Primary disabled={!tx.ready || a < 1 || !isG(to) || to === s?.stellarAddress} onClick={send}>
              {!isG(to) ? 'Enter an address' : a < 1 ? 'Enter an amount' : `Send ${a} USDC`}</Primary>}
        </section>
      )}
      <section style={{ ...card, paddingTop: 10, paddingBottom: 10 }}>
        <Notice kind="info">Worth US dollars, so its rupee value moves with the exchange rate. Swapping to nIN is free.</Notice>
      </section>
    </MapCard>
  );
}
