// A7 nIN (board MemberAssetNin; member and leader alike, the leader with her tab bar) → A7b her code (board
// MemberAssetTractorScrolled-h3n0, default and #paid): fx_pool.request_cash_out escrows her nIN under the hash of a
// one-time code (7 days); she shows the code as QR (and as text, the typed fallback); the leader's pay_out
// (Cash → Pay out a cash-out) hands over the rupees and burns it; after expiry she takes it back with reclaim_cash_out.
// The code is 128 random bits (the hash is public in CashOutRequested, so a short code could be found by
// trying). It is saved on her phone BEFORE the call is sent and kept per code until the chain shows it
// paid or taken back: a timeout, a second cash-out or "Done" never loses it. A code seen open on chain that is gone
// later, and that she did not take back, was paid: A7b #paid shows it until she taps Done.
// DESIGN GAPs: "Union office · <leader>" and "Paid by" without a name (no leader name on Stellar); no board for "Get
// your nIN back" or for the list of her open codes (shown on A7 under the cash-out card); #paid's time is when her
// app saw it paid, not the pay_out ledger time.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C } from '../shell/tokens';
import { Loading } from '../register/Boot';
import { Camera } from './LoanScreens';
import { AssetScreen, Card, CardTitle, KV, MarkCircle, QrCircle, Secondary, Stepper, useOnline, when } from './AssetParts';

const NIN = 10_000_000n;
const TERM_S = 7 * 86400 - 3600;     // fx_pool allows 7 days; an hour less for a phone clock that runs ahead
const SETTLE_S = 600;                // a code never seen on chain after 10 min was never sent
const KEY = 'nila.cashouts';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private */ } };
const patch = (hash, f) => store(load().map((e) => (e.hash === hash ? { ...e, ...f } : e)));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const day = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmt = (n) => Math.floor(n).toLocaleString('en-IN');

/** 16 random bytes as 26 base32 letters (RFC 4648, no padding). Also the A8a voucher code (P6). */
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0; let v = 0; let out = '';
  for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += B32[(v << (5 - bits)) & 31];
  return out;
}
export const cleanCode = (t) => t.replace(/^nila:cash:/i, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
export const grouped = (c) => c.replace(/(.{4})(?=.)/g, '$1 ');

/** Her saved codes with their state on chain: open | expired | waiting (sent, not seen yet) | paid (until Done). */
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
        if (co) {
          const seen = { ...e, seen: true };
          keep.push(seen); out.push({ ...seen, expires: Number(co.expires), state: now >= Number(co.expires) ? 'expired' : 'open' });
          continue;
        }
        if (e.seen && !e.reclaimed && !e.done) { const paid = { ...e, paidAt: e.paidAt || Math.floor(now) }; keep.push(paid); out.push({ ...paid, state: 'paid' }); continue; }
        if (!e.seen && now - e.created < SETTLE_S) { keep.push(e); out.push({ ...e, state: 'waiting' }); }
      }
      store(keep);
      return out.sort((a, b) => b.created - a.created);
    },
  });
}

function Code({ e, img, onDone, onBack, reclaim, ready }) {
  if (e.state === 'paid') {
    return (
      <AssetScreen title="Cash out · paid" onBack={onBack} note="This code is closed.">
        <Card label="Cash out paid" style={{ gap: 8 }}>
          <KV k="Paid out" v={`${inr(e.amount)} in cash`} />
          <KV k="When" v={when(e.paidAt)} />
          <KV k="nIN" v="burned by the union" />
          <div style={{ marginTop: 8 }}><Secondary onClick={onDone}>Done</Secondary></div>
        </Card>
      </AssetScreen>
    );
  }
  if (e.state === 'expired') {
    return (
      <AssetScreen title={`${inr(e.amount)} in cash`} onBack={onBack} note={`This cash-out was not collected before ${day(e.expires)}.`}>
        <Card label="Cash out not collected" style={{ gap: 8 }}>
          <KV k="Where" v="Union office" />
          <KV k="Sent" v={when(e.created)} />
          <div style={{ marginTop: -8 }}><Primary disabled={!ready} onClick={() => reclaim(e)}>Get your nIN back</Primary></div>
        </Card>
      </AssetScreen>
    );
  }
  return (
    <AssetScreen title={`${inr(e.amount)} in cash`} onBack={onBack} note={e.state === 'waiting' ? 'Waiting for the network…' : "Go to the union's office and ask for cash"}>
      <Card label="Your cash-out code">
        <QrCircle img={img} alt="Your cash-out code" />
        <p style={{ ...muted, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 1, margin: 0 }}>{grouped(e.code)}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KV k="Where" v="Union office" />
          <KV k="Sent" v={when(e.created)} />
        </div>
        <Secondary onClick={onDone}>Done</Secondary>
      </Card>
    </AssetScreen>
  );
}

export default function CashOut({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const online = useOnline();
  const me = s?.stellarAddress;
  const mine = useMyCashOuts(cfg, me);
  const maxScan = useQuery({ queryKey: ['stellar', 'maxScan'], enabled: !!cfg,
    queryFn: () => readContract(cfg, 'fx_pool', 'max_scan', []) });
  const nin = Math.floor(s?.stellarAccount?.nin?.balance ?? 0);
  const max = maxScan.data != null ? Math.min(nin, Number(BigInt(maxScan.data) / NIN)) : 0;
  const [amount, setAmount] = useState(1000);
  const [show, setShow] = useState();      // hash of the code on screen
  const [img, setImg] = useState();
  const [closed, setClosed] = useState([]);   // paid codes she tapped Done on (before the list is read again)
  const list = (mine.data || []).filter((e) => !closed.includes(e.hash));
  // A code just paid opens on its own (A7b #paid); else the one she picked or just sent.
  const shown = list.find((e) => e.hash === show) || list.find((e) => e.state === 'paid');
  useEffect(() => { if (shown?.code) QRCode.toDataURL(`nila:cash:${shown.code}`, { width: 400, margin: 0 }).then(setImg); }, [shown?.code]);

  const send = async (amt) => {
    const code = newCode();
    const e = { code, hash: hex(await sha(code)), amount: amt, expires: Math.floor(Date.now() / 1000) + TERM_S, created: Math.floor(Date.now() / 1000), member: me };
    store([...load(), e]);                 // saved first: a timeout after it landed never loses the code
    setShow(e.hash);
    await tx.run({
      label: `Cash out ${inr(amt)}`, rows: [['Amount', `${amt} nIN`], ['Where', 'Union office']],
      contractName: 'fx_pool', fn: 'request_cash_out',
      args: [sv.address(me), sv.address(cfg.union), sv.i128(BigInt(amt) * NIN), sv.bytes32(e.hash), sv.u64(e.expires)],
      invalidate: [['stellar', 'account'], ['stellar', 'cashouts']],
    });
  };
  const reclaim = (e) => {
    patch(e.hash, { reclaimed: true });    // taken back, not paid: never shown as #paid once it is gone
    return tx.run({
      label: `Get your ${e.amount} nIN back`, rows: [['Amount', `${e.amount} nIN`]],
      contractName: 'fx_pool', fn: 'reclaim_cash_out', args: [sv.bytes32(e.hash)],
      invalidate: [['stellar', 'account'], ['stellar', 'cashouts']],
    });
  };
  const done = (e) => { if (e.state === 'paid') { patch(e.hash, { done: true }); setClosed((c) => [...c, e.hash]); } setShow(undefined); };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  if (!s?.stellarAccount || !cfg || mine.isLoading) return <Loading />;
  if (shown) return <Code e={shown} img={img} ready={tx.ready} reclaim={reclaim} onDone={() => done(shown)} onBack={() => done(shown)} />;

  const a = max < 1 ? 0 : Math.max(1, Math.min(amount, max));   // nothing to cash out: 0, and the button is off
  const open = list.filter((e) => e.state !== 'paid');
  return (
    <AssetScreen onBack={onBack} note={online ? 'You send the nIN to the union now. Your leader pays you the same in cash at the office.'
      : `You are offline. Balance from today, ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`}>
      <Card label="nIN" style={{ alignItems: 'center', textAlign: 'center', padding: '18px 22px' }}>
        <MarkCircle />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>{fmt(nin)} nIN</span>
          <span style={{ color: C.muted }}>Worth ₹1 each</span>
        </div>
      </Card>
      <Card label="Cash out">
        <CardTitle>Cash out</CardTitle>
        <Stepper value={a} set={setAmount} min={max < 1 ? 0 : 1} max={max} unit="nIN" label="nIN to cash out" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KV k="You get" v={`₹${fmt(a)} in cash`} color={C.accent} />
          <KV k="Where" v="Union office" />
        </div>
        {online
          ? <div style={{ marginTop: -16 }}><Primary disabled={!tx.ready || maxScan.data == null || max < 1} onClick={() => send(a)}>Send and collect</Primary></div>
          : <Secondary disabled>Sending needs a connection</Secondary>}
      </Card>
      {open.length > 0 && (
        <Card label="Your cash-outs" style={{ gap: 8 }}>
          <CardTitle>Your cash-outs</CardTitle>
          {open.map((e) => (
            <Choice key={e.hash} sub={e.state === 'expired' ? 'Not collected · get it back' : e.state === 'waiting' ? 'Waiting for the network' : `Valid until ${day(e.expires)}`}
              onClick={() => setShow(e.hash)}>{inr(e.amount)} in cash</Choice>
          ))}
        </Card>
      )}
    </AssetScreen>
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
