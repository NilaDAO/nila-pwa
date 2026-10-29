// Leader side of the LP offers (P9): C4 "Let an LP collect it" (board LeaderCashSettle #settle) posts a
// Collect; L11 #short posts a Bring for the gap (PostBring); A1b #leader scans an LP's code and confirms
// (fx_pool.confirm: Bring pays her the USDC, Collect takes it). The node sponsors post_offer, confirm and
// cancel_offer for a leader of the union (O14). Offers run 48 h (≤ 7 days in fx_pool).
// On a Bring the leader counts the LP's rupees with the C6 photo count (P10) before confirming.
// DESIGN GAP: LP names ("LP Suresh K.") are shown as short wallet addresses. Her code is signed by her Stellar
// key (offer id + time, 10 min): the scan checks it is the LP who accepted (the offer id alone is public).
import DeskCard from '../shell/DeskCard';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import CameraView from '../shell/CameraView';
import { Secondary } from '../loan/AssetParts';
import PhotoCount from '../loan/PhotoCount';
import { Choice, Primary, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { Keypair } from '@stellar/stellar-sdk';
import { CODE_TTL, U, codeHash, useOfferQuote, useUnionOffers, usdcOf } from './hooks';
import { BRING, COLLECT } from './sep';

export const OFFER_TTL = 48 * 3600;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const left = (ts) => { const s = ts - Date.now() / 1000; return s <= 0 ? 'expired' : s < 86400 ? `${Math.ceil(s / 3600)} h left` : `In ${Math.round(s / 86400)} d`; };
const STATE = ['Waiting', 'Accepted', 'Done', 'Cancelled', 'Expired'];

export function usePost() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const post = (kind, amount) => tx.run({
    label: kind === BRING ? `Ask LPs to bring ${inr(amount)}` : `Let LPs collect ${inr(amount)}`,
    rows: [['Amount', inr(amount)], ['Open for', '48 hours']],
    contractName: 'fx_pool', fn: 'post_offer',
    args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.u32(kind), sv.i128(BigInt(amount) * BigInt(U)),
      sv.u64(Math.floor(Date.now() / 1000) + OFFER_TTL)],
    invalidate: [['stellar', 'offers']],
  });
  return { tx, post };
}

function OfferList({ onCancel }) {
  const offers = useUnionOffers();
  const [sure, setSure] = useState();   // a second tap cancels (an accepted offer is her swap too)
  if (!offers.data?.length) return null;
  return (
    <>
      <h2 style={{ fontSize: 14, marginTop: 16 }}>LP offers</h2>
      {offers.data.map((o) => (
        <div key={o.id} style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>{o.kind === BRING ? 'LP brings cash' : 'LP collects cash'} · {inr(o.inr)}</span><span>{left(o.expires)}</span>
          </div>
          <div style={{ color: C.muted }}>{STATE[o.state]}{o.lp ? ` · LP ${short(o.lp)}` : ''}{o.state === 1 ? ` · ${usdcOf(o.usdc)} USDC` : ''}</div>
          <button type="button" onClick={() => (sure === o.id ? onCancel(o) : setSure(o.id))} style={{ background: 'none', border: 0, padding: 0, color: C.coral, fontWeight: 700, marginTop: 4 }}>
            {sure === o.id ? (o.state === 1 ? 'Tap again: the LP accepted it' : 'Tap again to cancel') : 'Cancel'}
          </button>
        </div>
      ))}
    </>
  );
}

/** C4: spare cash at the office for the union's LPs to collect (Collect offer). */
export function LetCollect({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const { tx, post } = usePost();
  const cancel = useSorobanTx();
  const hand = useQuery({ queryKey: ['stellar', 'cashAtHand', cfg?.union], enabled: !!cfg,
    queryFn: () => readContract(cfg, 'fx_pool', 'cash_at_hand', [sv.address(cfg.union)]) });
  // Max: cash at hand less what open Collect offers already promise to LPs.
  const offers = useUnionOffers();
  const promised = (offers.data || []).filter((o) => o.kind === COLLECT && o.state <= 1).reduce((t, o) => t + o.inr, 0);
  const max = hand.data != null ? Math.max(0, Math.min(10000, Math.floor(Number(BigInt(hand.data) / BigInt(U))) - promised)) : 0;
  const [amount, setAmount] = useState(0);
  const a = Math.min(amount, max);
  const q = useOfferQuote(COLLECT, a);
  const fee = q.data ? Math.round((a * q.data.fee_bp) / 10_000) : null;
  const t = tx.status !== 'idle' ? tx : cancel.status !== 'idle' ? cancel : null;
  if (t) return <TxScreens tx={t} onClose={() => t.reset()} onRetry={() => t.retry()} />;
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <DeskCard title="Cash for your LPs to collect" onBack={onBack}>
      <p style={{ ...muted, textAlign: 'center' }}>Cash at the office: {hand.data != null ? inr(Number(BigInt(hand.data) / BigInt(U))) : '…'}{promised ? ` · ${inr(promised)} offered already` : ''}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12px 0' }}>
        <button type="button" aria-label="Less" style={b} onClick={() => setAmount(Math.max(0, a - 100))}>−</button>
        <span style={{ minWidth: 90, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{inr(a)}</span>
        <button type="button" aria-label="More" style={b} onClick={() => setAmount(Math.min(max, a + 100))}>+</button>
        <button type="button" style={{ ...b, width: 'auto', padding: '0 14px', fontSize: 14 }} onClick={() => setAmount(max)}>Max</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '4px 0' }}>
        <span style={{ color: C.muted }}>LP fee ({q.data ? q.data.fee_bp / 100 : 1}%)</span><span style={{ fontWeight: 700 }}>{fee != null && a ? inr(fee) : '—'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '4px 0' }}>
        <span style={{ color: C.muted }}>Into the union treasury</span><span style={{ fontWeight: 700 }}>{q.data && a ? `${inr(a - fee)} · ${usdcOf(q.data.usdc)} USDC` : '—'}</span>
      </div>
      <Primary disabled={!a || !tx.ready} onClick={() => post(COLLECT, a)}>Let LPs collect {inr(a)}</Primary>
      <OfferList onCancel={(o) => cancel.run({
        label: `Cancel the offer of ${inr(o.inr)}`, rows: [['Offer', `${o.kind === BRING ? 'Bring' : 'Collect'} ${inr(o.inr)}`]],
        contractName: 'fx_pool', fn: 'cancel_offer', args: [sv.address(s.stellarAddress), sv.u64(o.id)], invalidate: [['stellar', 'offers']],
      })} />
    </DeskCard>
  );
}

/** A1b #leader for an LP code: scan, check the offer, confirm the cash. */
export function ScanLp({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [id, setId] = useState();
  const [bad, setBad] = useState();
  const o = useQuery({ queryKey: ['stellar', 'offer', id], enabled: !!cfg && id != null,
    queryFn: () => readContract(cfg, 'fx_pool', 'offer', [sv.u64(id)]) });
  const [proof, setProof] = useState();   // { ts, sig } from her code
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState(null);   // rupees counted on C6 for a Bring
  const kind = Number(o.data?.kind);
  const inrAmt = o.data ? Number(BigInt(o.data.inr) / BigInt(U)) : 0;
  // The code is hers: signed by the LP who accepted this offer, less than 10 minutes ago.
  const mine = useQuery({ queryKey: ['anchor', 'codeCheck', id, proof?.ts, o.data?.lp], enabled: !!proof && !!o.data?.lp,
    queryFn: async () => {
      if (Math.abs(Date.now() / 1000 - proof.ts) > CODE_TTL) return false;
      try { return Keypair.fromPublicKey(o.data.lp).verify(Buffer.from(await codeHash(id, proof.ts)), Buffer.from(proof.sig, 'hex')); } catch { return false; }
    } });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  const read = (t) => {
    const m = /^nila:offer:(\d+):(\d+):([0-9a-f]{128})$/.exec(t.trim());
    if (!m) { setBad('This is not an LP code.'); return; }
    setBad(undefined); setId(Number(m[1])); setProof({ ts: Number(m[2]), sig: m[3] });
  };
  const again = () => { setId(undefined); setProof(undefined); setBad(undefined); setTyped(''); setCounted(null); };
  if (counting) {
    return <PhotoCount name="LP brings cash" target={inrAmt} verb="Counted" onBack={() => setCounting(false)}
      onDone={({ total }) => { setCounted(total); setCounting(false); }} />;
  }
  const live = o.data && Number(o.data.expires) > Date.now() / 1000;
  const ok = o.data && Number(o.data.state) === 1 && o.data.union === cfg.union && live && mine.data === true;
  const why = !o.data ? '' : !live ? 'expired' : ['not accepted by an LP yet', '', 'done already', 'cancelled', 'expired'][Number(o.data.state)] || 'not open';
  return (
    <DeskCard title="Scan an LP code" onBack={onBack}>
      {id == null && !typing && <CameraView mode="qr" onText={read} />}
      {id == null && typing && (
        <>
          <textarea aria-label="The LP code" value={typed} onChange={(e) => setTyped(e.target.value)} rows={4}
            style={{ width: '100%', borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: 12, boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13 }} />
          <Primary disabled={!typed.trim()} onClick={() => read(typed)}>Check the code</Primary>
        </>
      )}
      {/* A secondary button (25 Oct). The typed code is the LP's full code (about 160 characters, 10 minutes valid). */}
      {id == null && <Secondary onClick={() => setTyping((t) => !t)}>{typing ? 'Use the camera' : 'Type the code instead'}</Secondary>}
      {bad && <p style={{ color: C.coral }}>{bad}</p>}
      {id != null && o.isLoading && <p style={muted}>…</p>}
      {o.data === null && <p style={{ color: C.coral }}>No such offer.</p>}
      {o.data && Number(o.data.state) !== 1 && <p style={{ color: C.coral }}>This offer is {why}.</p>}
      {o.data && Number(o.data.state) === 1 && !live && <p style={{ color: C.coral }}>This offer has expired.</p>}
      {o.data && Number(o.data.state) === 1 && live && mine.data === false && <p style={{ color: C.coral }}>This code is not from the LP who accepted the offer, or it is older than 10 minutes. Ask the LP to open their code again.</p>}
      {id != null && !ok && <Secondary onClick={again}>Scan again</Secondary>}
      {ok && (
        <>
          <Choice sub={`LP ${short(o.data.lp)} · ${usdcOf(o.data.usdc)} USDC`}>{kind === BRING ? `The LP brings ${inr(inrAmt)}` : `The LP collects ${inr(inrAmt)}`}</Choice>
          <p style={muted}>{kind === BRING ? 'Count the cash the LP hands over. Confirming pays the LP the USDC from the union.'
            : 'Hand over the cash. Confirming takes the LP\'s USDC into the union.'}</p>
          {kind === BRING && counted == null && <Primary disabled={!tx.ready} onClick={() => setCounting(true)}>Count the cash</Primary>}
          {kind === BRING && counted != null && counted < inrAmt && <p style={{ color: C.coral }}>Counted {inr(counted)} of {inr(inrAmt)}: count again before you confirm.</p>}
          {(kind !== BRING || (counted != null && counted >= inrAmt)) && <Primary disabled={!tx.ready} onClick={() => tx.run({
            label: kind === BRING ? `Got ${inr(inrAmt)} from the LP` : `Gave ${inr(inrAmt)} to the LP`,
            rows: [['LP', short(o.data.lp)], ['USDC', usdcOf(o.data.usdc)]],
            contractName: 'fx_pool', fn: 'confirm', args: [sv.address(s.stellarAddress), sv.u64(id)], invalidate: [['stellar', 'offers'], ['stellar', 'cashAtHand']],
          })}>{kind === BRING ? `I got ${inr(inrAmt)}` : `I gave ${inr(inrAmt)}`}</Primary>}
          {kind === BRING && counted != null && counted < inrAmt && <button type="button" onClick={() => setCounting(true)} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>Count again</button>}
        </>
      )}
    </DeskCard>
  );
}
