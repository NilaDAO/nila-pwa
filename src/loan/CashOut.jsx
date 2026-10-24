// A7 nIN (board MemberAssetNin; a leader, and a member who holds nIN: a machine owner's income) → Collect (executive
// decision 24 Oct, LOAN_RULES "Two withdrawals"): her phone shows a QR with her signed authorization to burn X nIN
// (fx_pool.cash_out_signed, deskCode.js); at the union office the leader hands over the cash, scans it (Tasks → Pay
// out cash) and submits; her nIN is burned and the rupees leave cash at hand. Nothing moves until the leader scans;
// an unused QR simply expires (~48 h). No Send, no escrow, no code.
// Codes from before 24 Oct (fx_pool.request_cash_out, a one-time code kept on her phone) stay listed until paid or,
// after expiry, taken back with reclaim_cash_out, so no nIN is stuck.
// DESIGN GAPs: "Union office · <leader>" and "Paid by" without a name (no leader name on Stellar); no board for "Get
// your nIN back" or for the list of her open codes (shown on A7 under the cash-out card); #paid's time is when her
// app saw it paid, not the pay_out ledger time.
import DeskCard from '../shell/DeskCard';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, server, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, inr, muted } from '../plan/ui';
import { C } from '../shell/tokens';
import { Loading } from '../register/Boot';
import CameraView from '../shell/CameraView';
import { useFxRate } from '../shell/UsdcAsset';
import AssetSwapLayout, { AssetForm, SwapTarget, money } from '../shell/AssetSwapLayout';
import { useLpStatus } from '../anchor/hooks';
import { AssetScreen, Card, CardTitle, KV, MarkCircle, QrCircle, Secondary, Stepper, useOnline, when } from './AssetParts';
import { readDeskCode, signDeskCode } from './deskCode';
import { deskClaim } from './desk';

const NIN = 10_000_000n;
const SETTLE_S = 600;                // a code never seen on chain after 10 min was never sent
const KEY = 'nila.cashouts';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private */ } };
const patch = (hash, f) => store(load().map((e) => (e.hash === hash ? { ...e, ...f } : e)));
const day = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmt = (n) => Math.floor(n).toLocaleString('en-IN');

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

/** Her signed QR for the leader (both withdrawals, 24 Oct). */
export function DeskQr({ title, rows, qr, until, onBack }) {
  const [img, setImg] = useState();
  useEffect(() => { if (qr) QRCode.toDataURL(qr, { width: 400, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [qr]);
  return (
    <AssetScreen title={title} onBack={onBack} note="Go to the union office and ask for the cash.">
      <Card label="Your cash QR">
        <QrCircle img={img} alt="Your cash QR" />
        <p style={{ ...muted, textAlign: 'center', color: C.gold, margin: 0 }}>Let your leader scan this only after you have received the cash.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}
          <KV k="Valid until" v={when(until)} />
        </div>
        <Secondary onClick={onBack}>Done</Secondary>
      </Card>
    </AssetScreen>
  );
}

const SWITCH = [['cash', 'Cash out'], ['swap', 'Swap']];

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
  const lp = useLpStatus().data;
  const canSwap = !!lp?.idChecked && !!lp?.trustline;
  const [mode, setPick] = useState('cash');
  const [swapAmt, setSwapAmt] = useState(0);
  const rate = useFxRate().data;
  const pick = canSwap ? mode : 'cash';
  const [show, setShow] = useState();      // hash of the code on screen
  const [desk, setDesk] = useState();      // her signed QR on screen: { qr, until, amount }
  const [error, setError] = useState();
  const [img, setImg] = useState();
  const [closed, setClosed] = useState([]);   // paid codes she tapped Done on (before the list is read again)
  const list = (mine.data || []).filter((e) => !closed.includes(e.hash));
  // A code just paid opens on its own (A7b #paid); else the one she picked or just sent.
  const shown = list.find((e) => e.hash === show) || list.find((e) => e.state === 'paid');
  useEffect(() => { if (shown?.code) QRCode.toDataURL(`nila:cash:${shown.code}`, { width: 400, margin: 0 }).then(setImg); }, [shown?.code]);

  const collect = async (amt) => {
    setError(undefined);
    try { setDesk({ ...(await signDeskCode({ cfg, signer: me, signHash: s.signHash, kind: 'N', amount: BigInt(amt) * NIN })), amount: amt }); } catch (e) { setError(e.message); }
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
  if (desk) return <DeskQr title={`${inr(desk.amount)} in cash`} rows={[['You get', `₹${fmt(desk.amount)} in cash`], ['nIN', `${fmt(desk.amount)} burned when paid`]]} qr={desk.qr} until={desk.until} onBack={() => setDesk(undefined)} />;
  if (shown) return <Code e={shown} img={img} ready={tx.ready} reclaim={reclaim} onDone={() => done(shown)} onBack={() => done(shown)} />;

  const a = max < 1 ? 0 : Math.max(1, Math.min(amount, max));   // nothing to cash out: 0, and the button is off
  const open = list.filter((e) => e.state !== 'paid');
  const sa = Math.max(0, Math.min(swapAmt, nin));
  const swap = () => tx.run({
    label: `Swap ${sa} nIN to USDC`, rows: [['You give', `${sa} nIN`], ['You get about', `${money(rate ? sa / rate : 0)} USDC`]],
    contractName: 'fx_pool', fn: 'swap_nin_to_usdc',
    args: [sv.address(me), sv.address(cfg.union), sv.i128(BigInt(sa) * NIN)],
    invalidate: [['stellar', 'account'], ['stellar', 'lp']],
  });
  // The same layout as A9 (22 Oct): asset card, then one card with Cash out | Swap (the swap only for a leader whose
  // identity is checked and who has a USDC account), then her open codes and the note.
  const form = pick === 'swap' ? (
    <AssetForm to={<SwapTarget title="Nila swap · your USDC" rate={rate ? `1 USDC = ${money(rate)} nIN` : 'Rate not available now'} />}
      amount={<Stepper value={sa} set={setSwapAmt} step={100} min={0} max={nin} unit="nIN" label="nIN to swap" />}
      rows={[['You get about', rate && sa ? `${money(sa / rate)} USDC` : '—'], ['Fee', 'None'], ['Left after', `${fmt(nin - sa)} nIN`]]}
      button={<Primary disabled={!tx.ready || !rate || sa < 1} onClick={swap}>{sa < 1 ? 'Enter an amount' : 'Swap to USDC'}</Primary>} />
  ) : (
    <AssetForm
      amount={<Stepper value={a} set={setAmount} min={max < 1 ? 0 : 1} max={max} unit="nIN" label="nIN to cash out" />}
      rows={[['You get', `₹${fmt(a)} in cash`, C.accent], ['Where', 'Union office']]}
      button={online
        ? <Primary disabled={!s?.ready || maxScan.data == null || max < 1} onClick={() => collect(a)}>Collect</Primary>
        : <Secondary disabled>Collecting needs a connection</Secondary>} />
  );
  return (
    <AssetSwapLayout onBack={onBack} icon={<MarkCircle />} name="nIN" sub="Worth ₹1 each" amount={`${fmt(nin)} nIN`} value={`₹${fmt(nin)}`}
      switchLabel="Cash out or swap" options={canSwap ? SWITCH : null} tab={pick} onTab={setPick}
      after={open.length > 0 && (
        <Card label="Your cash-outs" style={{ gap: 8 }}>
          <CardTitle>Your cash-outs</CardTitle>
          {open.map((e) => (
            <Choice key={e.hash} sub={e.state === 'expired' ? 'Not collected · get it back' : e.state === 'waiting' ? 'Waiting for the network' : `Valid until ${day(e.expires)}`}
              onClick={() => setShow(e.hash)}>{inr(e.amount)} in cash</Choice>
          ))}
        </Card>
      )}
      note={online ? (error || 'Collect it in cash at the union office. Your leader scans your QR, and the same nIN is burned.')
        : `You are offline. Balance from today, ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`}>
      {!canSwap && <CardTitle>Cash out</CardTitle>}
      {form}
    </AssetSwapLayout>
  );
}

/** Leader: Tasks → Pay out cash (24 Oct, one task for both withdrawals): scan her signed QR after handing over the
 *  cash. NILA:W (her investment): the app checks the 14 days have passed and submits fund_core.claim_junior_cash;
 *  NILA:N (her nIN): fx_pool.cash_out_signed. A leader's code from before 24 Oct still pays with fx_pool.pay_out.
 *  The leader submits; the node sponsors the fee. */
export function PayOut({ onBack, initial, onInvest }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [got, setGot] = useState();        // { kind, member, inr, entry } | { old: code }
  const [error, setError] = useState();
  // From the one scan (24 Oct): the QR is read already; check it here as if scanned on this screen.
  useEffect(() => { if (initial && cfg) read(initial); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = async (text) => {
    setError(undefined);
    try {
      const t = (text || '').trim();
      if (/^nila:cash:/i.test(t)) { setGot({ old: cleanCode(t) }); return; }
      const c = readDeskCode(cfg, t);
      if ((await server(cfg).getLatestLedger()).sequence >= c.exp) throw new Error('This QR has expired. The member makes a new one.');
      if (c.kind === 'W') {
        const claim = await deskClaim(cfg, c.member);
        if (claim.shares <= 0n) {
          throw new Error(claim.pendingFrom ? `The withdrawal is ready from about ${day(claim.pendingFrom)}. Do not pay it yet.`
            : 'No withdrawal to collect. The member asks for one on their phone (Union investment → Withdraw).');
        }
        setGot({ ...c, inr: Math.floor(claim.inr) });
      } else setGot({ ...c, inr: Number(c.amount / NIN) });
    } catch (e) { setError(e.message); }
  };
  const pay = () => {
    const me = s.stellarAddress;
    if (got.old) {
      return tx.run({ label: 'Pay out a cash-out', rows: [['Code', `${got.old.slice(0, 4)}…${got.old.slice(-4)}`]], contractName: 'fx_pool', fn: 'pay_out',
        args: [sv.address(me), sv.bytes(new TextEncoder().encode(got.old))], invalidate: [['stellar', 'account']] });
    }
    const rows = [['Hand over', `${inr(got.inr)} in cash`], ['To', `${got.member.slice(0, 4)}…${got.member.slice(-4)}`]];
    return got.kind === 'W'
      ? tx.run({ label: `Pay out ${inr(got.inr)}`, rows, contractName: 'fund_core', fn: 'claim_junior_cash',
        args: [sv.address(cfg.union), sv.address(got.member), sv.address(me), sv.i128(0n)], auth: [got.entry],
        invalidate: [['stellar', 'investment'], ['stellar', 'fund']] })
      : tx.run({ label: `Pay out ${inr(got.inr)}`, rows, contractName: 'fx_pool', fn: 'cash_out_signed',
        args: [sv.address(me), sv.address(cfg.union), sv.address(got.member), sv.i128(got.amount)], auth: [got.entry],
        invalidate: [['stellar', 'account']] });
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  if (!cfg) return <Loading />;
  if (got) {
    return (
      <DeskCard title="Pay out cash" onBack={() => setGot(undefined)}>
        <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>{got.old ? 'A cash-out code' : `${inr(got.inr)} in cash`}</p>
        {!got.old && <p style={{ ...muted, textAlign: 'center' }}>{got.kind === 'W' ? 'Their union investment' : 'Their nIN, burned when you record it'}</p>}
        <p style={{ color: C.gold, textAlign: 'center' }}>Record it only once you have handed over the cash.</p>
        <Primary disabled={!tx.ready} onClick={pay}>Cash handed over</Primary>
        {got.kind === 'W' && onInvest && <Secondary onClick={() => onInvest(got.member)}>Invest instead</Secondary>}
      </DeskCard>
    );
  }
  return (
    <DeskCard title="Pay out cash" onBack={onBack}>
      <CameraView mode="qr" onText={read} />
      <p style={muted}>Hand over the cash, then scan the QR on her phone.</p>
      {error && <p style={{ color: C.coral }}>{error}</p>}
    </DeskCard>
  );
}
