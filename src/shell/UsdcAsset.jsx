// A9 (board MemberAssetUsdc #leader, #send, #swap): the leader's USDC, opened from A1L's USDC row once her identity is
// checked. Top card: the USDC logo, her balance and its rupee value. Below: Send | Swap (executive decision 22 Oct).
//  - Send: to any Stellar address she scans or pastes; a plain USDC transfer from her wallet (the node pays the fee
//    once her identity is checked). DESIGN GAP: the board's contact list (union, providers) has no source yet.
//  - Swap: USDC → nIN in her wallet at fx_pool's rate (fx_pool.swap_usdc_to_nin); no fee. The way back is on A7.
// No Receive button (22 Oct). Layout shared with A7 (AssetSwapLayout).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AssetSwapLayout, { AssetForm, SwapTarget, money } from './AssetSwapLayout';
import { useLpStatus, useUsdcTrustline } from '../anchor/hooks';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import CameraView from './CameraView';
import { Stepper } from '../loan/AssetParts';
import { Primary } from '../plan/ui';
import { ScanIcon, UsdcTile } from './icons';
import { C, R } from './tokens';

const UNIT = 10_000_000n;   // USDC and nIN, 7 decimals
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
  const form = (
    <AssetForm
      to={tab === 'swap' ? <SwapTarget title="Nila swap · your nIN" rate={rate ? `1 USDC = ${money(rate)} nIN` : 'Rate not available now'} />
        : scan ? <CameraView mode="qr" onText={(t) => { const g = t.replace(/^.*?(G[A-Z2-7]{55}).*$/s, '$1'); setTo(g); setScan(false); }} />
          : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="Stellar address" placeholder="G… address" value={to} onChange={(e) => setTo(e.target.value.trim().toUpperCase())}
                style={{ flex: 1, minWidth: 0, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, padding: '0 14px',
                  fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' }} />
              <button type="button" aria-label="Scan QR" onClick={() => setScan(true)} style={{ width: 44, height: 44, flexShrink: 0, border: 0, borderRadius: R.button,
                background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ScanIcon color={C.text} /></button>
            </div>
          )}
      amount={<Stepper value={a} set={setAmount} step={1} min={0} max={Math.floor(usdc)} unit="USDC" label="USDC amount" />}
      rows={[tab === 'swap' && ['You get about', rate && a ? `${money(a * rate, 0)} nIN` : '—'], ['Fee', 'None'], ['Left after', `${money(left)} USDC`]]}
      button={tab === 'swap'
        ? <Primary disabled={!tx.ready || !rate || a < 1} onClick={swap}>{a < 1 ? 'Enter an amount' : 'Swap to nIN'}</Primary>
        : <Primary disabled={!tx.ready || a < 1 || !isG(to) || to === s?.stellarAddress} onClick={send}>
          {!isG(to) ? 'Enter an address' : a < 1 ? 'Enter an amount' : `Send ${a} USDC`}</Primary>} />
  );
  return (
    <AssetSwapLayout onBack={onBack} icon={<UsdcTile size={72} />} name="USDC" sub={`Digital US dollar${rate ? ` · ₹${money(rate)}` : ''}`}
      amount={lp ? money(usdc) : '…'} value={rate ? `₹${money(usdc * rate, 0)}` : null}
      head={noLine && (
        <>
          <Primary disabled={trust.isPending} onClick={() => trust.mutate()}>{trust.isPending ? 'Opening your USDC account…' : 'Open your USDC account'}</Primary>
          {trust.isError && <p style={{ color: C.coral, fontSize: 14 }}>{trust.error.message}</p>}
        </>
      )}
      switchLabel="Send or swap" options={[['send', 'Send'], ['swap', 'Swap']]} tab={tab} onTab={setTab}
      note="Worth US dollars, so its rupee value moves with the exchange rate. Swapping to nIN is free.">
      {lp?.trustline ? form : null}
    </AssetSwapLayout>
  );
}
