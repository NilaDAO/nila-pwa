// A7 cash out → A7b her code (boards MemberAssetNin, MemberAssetTractorScrolled-h3n0 #sent/#paid):
// fx_pool.request_cash_out escrows her nIN under the hash of a one-time code (7 days); she shows the
// code as QR (and as text, the typed fallback); the leader's pay_out (Cash → Pay out a cash-out) hands
// over the rupees and burns it; after expiry she takes it back with reclaim_cash_out.
// The code is 128 random bits (the hash is public in CashOutRequested, so a short code could be found by
// trying). It is saved on her phone BEFORE the call is sent and kept per code until the chain shows it
// paid or taken back: a timeout, a second cash-out or "Done" never loses it.
// DESIGN GAPs: "Where: Union office · <leader>" without a name; no board for "Get your nIN back".
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { Camera } from './LoanScreens';

const NIN = 10_000_000n;
const TERM_S = 7 * 86400 - 3600;     // fx_pool allows 7 days; an hour less for a phone clock that runs ahead
const SETTLE_S = 600;                // a code not on chain after 10 min was paid, taken back or never sent
const KEY = 'nila.cashouts';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private */ } };
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const day = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** 16 random bytes as 26 base32 letters (RFC 4648, no padding). */
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0; let v = 0; let out = '';
  for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += B32[(v << (5 - bits)) & 31];
  return out;
}
export const cleanCode = (t) => t.replace(/^nila:cash:/i, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
const grouped = (c) => c.replace(/(.{4})(?=.)/g, '$1 ');

/** Her saved codes with their state on chain: open | expired | waiting (sent, not seen yet). */
function useMyCashOuts(cfg, me) {
  return useQuery({
    queryKey: ['stellar', 'cashouts', me], enabled: !!cfg && !!me, refetchInterval: 30_000,
    queryFn: async () => {
      const now = Date.now() / 1000;
      const keep = [];
      const out = [];
      for (const e of load()) {
        if (e.member && e.member !== me) { keep.push(e); continue; }
        const co = await readContract(cfg, 'fx_pool', 'cash_out', [sv.bytes32(e.hash)]).catch(() => undefined);
        if (co === undefined) { keep.push(e); out.push({ ...e, state: 'waiting' }); continue; }   // RPC down: keep
        if (co) { keep.push(e); out.push({ ...e, expires: Number(co.expires), state: now >= Number(co.expires) ? 'expired' : 'open' }); continue; }
        if (now - e.created < SETTLE_S) { keep.push(e); out.push({ ...e, state: 'waiting' }); }
      }
      store(keep);
      return out.sort((a, b) => b.created - a.created);
    },
  });
}

export default function CashOut({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const me = s?.stellarAddress;
  const mine = useMyCashOuts(cfg, me);
  const maxScan = useQuery({ queryKey: ['stellar', 'maxScan'], enabled: !!cfg,
    queryFn: () => readContract(cfg, 'fx_pool', 'max_scan', []) });
  const nin = Math.floor(s?.stellarAccount?.nin?.balance ?? 0);
  const max = maxScan.data != null ? Math.min(nin, Number(BigInt(maxScan.data) / NIN)) : 0;
  const [amount, setAmount] = useState(50);
  const [show, setShow] = useState();      // hash of the code on screen
  const [making, setMaking] = useState(false);
  const [img, setImg] = useState();
  const list = mine.data || [];
  const shown = list.find((e) => e.hash === show) || (!making && list[0]);
  useEffect(() => { if (shown?.code) QRCode.toDataURL(`nila:cash:${shown.code}`, { width: 260, margin: 1 }).then(setImg); }, [shown?.code]);

  const send = async (amt) => {
    const code = newCode();
    const e = { code, hash: hex(await sha(code)), amount: amt, expires: Math.floor(Date.now() / 1000) + TERM_S, created: Math.floor(Date.now() / 1000), member: me };
    store([...load(), e]);                 // saved first: a timeout after it landed never loses the code
    setShow(e.hash); setMaking(false);
    await tx.run({
      label: `Cash out ${inr(amt)}`, rows: [['Amount', `${amt} nIN`], ['Where', 'Union office']],
      contractName: 'fx_pool', fn: 'request_cash_out',
      args: [sv.address(me), sv.address(cfg.union), sv.i128(BigInt(amt) * NIN), sv.bytes32(e.hash), sv.u64(e.expires)],
      invalidate: [['stellar', 'account'], ['stellar', 'cashouts']],
    });
  };
  const reclaim = (e) => tx.run({
    label: `Get your ${e.amount} nIN back`, rows: [['Amount', `${e.amount} nIN`]],
    contractName: 'fx_pool', fn: 'reclaim_cash_out', args: [sv.bytes32(e.hash)],
    invalidate: [['stellar', 'account'], ['stellar', 'cashouts']],
  });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;

  if (shown && !making) {
    return (
      <Sheet landName="Nila" title={`${inr(shown.amount)} in cash`} onBack={onBack}>
        {shown.state === 'expired' ? (
          <>
            <p style={muted}>This cash-out was not collected before {day(shown.expires)}. Your nIN goes back to your wallet.</p>
            <Primary disabled={!tx.ready} onClick={() => reclaim(shown)}>Get your nIN back</Primary>
          </>
        ) : (
          <>
            {img && <img src={img} alt="Your cash-out code" style={{ display: 'block', margin: '0 auto', width: 260, height: 260, background: '#fff', borderRadius: 12 }} />}
            <p style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 1, fontSize: 15, fontFamily: 'monospace' }}>{grouped(shown.code)}</p>
            {shown.state === 'waiting' && <p style={muted}>Waiting for the network…</p>}
            <p style={muted}>Where: Union office · valid until {day(shown.expires)}</p>
            <p style={muted}>Go to the union's office and ask for cash. Show this to your leader.</p>
          </>
        )}
        {list.length > 1 && list.filter((e) => e.hash !== shown.hash).map((e) => (
          <Choice key={e.hash} sub={e.state === 'expired' ? 'Not collected · get it back' : `Valid until ${day(e.expires)}`} onClick={() => setShow(e.hash)}>{inr(e.amount)} in cash</Choice>
        ))}
        <Primary onClick={onBack}>Done</Primary>
        <button type="button" onClick={() => setMaking(true)} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%', marginTop: 8 }}>Another cash out</button>
      </Sheet>
    );
  }
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  const a = Math.min(amount, max);
  return (
    <Sheet landName="Nila" title="Cash out" onBack={list.length ? () => setMaking(false) : onBack}>
      <p style={{ ...muted, textAlign: 'center' }}>nIN · Nila digital rupee · worth ₹1 each · you have {nin}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12px 0' }}>
        <button type="button" aria-label="Less" style={b} onClick={() => setAmount(Math.max(1, a - 100))}>−</button>
        <span style={{ minWidth: 90, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{a} nIN</span>
        <button type="button" aria-label="More" style={b} onClick={() => setAmount(Math.min(max, a + 100))}>+</button>
        <button type="button" style={{ ...b, width: 'auto', padding: '0 14px', fontSize: 14 }} onClick={() => setAmount(max)}>Max</button>
      </div>
      <p style={{ ...muted, textAlign: 'center' }}>You get {inr(a)} in cash · Where: Union office</p>
      <Primary disabled={!tx.ready || maxScan.data == null || a < 1} onClick={() => { setAmount(a); send(a); }}>Cash out</Primary>
    </Sheet>
  );
}

/** Leader: Cash → Pay out a cash-out (scan her code, or type it) → fx_pool.pay_out (sponsored, O12). */
export function PayOut({ onBack }) {
  const s = useNilaSigner();
  const tx = useSorobanTx();
  const [code, setCode] = useState('');
  const [typing, setTyping] = useState(false);
  const clean = cleanCode(code);
  const pay = () => tx.run({ label: 'Pay out a cash-out', rows: [['Code', `${clean.slice(0, 4)}…${clean.slice(-4)}`]], contractName: 'fx_pool', fn: 'pay_out',
    args: [sv.address(s.stellarAddress), sv.bytes(new TextEncoder().encode(clean))], invalidate: [['stellar', 'account']] });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  return (
    <Sheet landName="Cash" title="Pay out a cash-out" onBack={onBack}>
      {!typing && clean.length !== 26 && <Camera onText={(t) => setCode(t)} />}
      {(typing || clean.length === 26) && (
        <input aria-label="Her code" autoCapitalize="characters" value={typing ? code : grouped(clean)} onChange={(e) => setCode(e.target.value)}
          style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box', fontSize: 15, fontFamily: 'monospace' }} />
      )}
      <p style={muted}>Scan the code on her phone, then hand over the cash.</p>
      <Primary disabled={clean.length !== 26 || !tx.ready} onClick={pay}>Pay out</Primary>
      <button type="button" onClick={() => setTyping((t) => !t)} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>{typing ? 'Use the camera' : 'Type the code instead'}</button>
    </Sheet>
  );
}
