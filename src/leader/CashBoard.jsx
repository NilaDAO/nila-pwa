// The leader's Cash tab (P10): C1 (board LeaderCash) with the C2 reconcile chip (LeaderCashOff), the Funds card
// and its Adjust panel (C3, LeaderCashAdjust), the Lending card, and the Cash card with "Let an LP collect it" and
// the LP cards (C4, LeaderCashSettle #settle). Values: useUnionCash (contracts) and useUnionBook (the node's loan
// list + get_loan, O15). Deposit = her own nIN into the treasury (C10); withdraw = to her wallet; both sponsored.
// DESIGN GAPs: "Member contributions" and the fund total have no formula in the design (see useUnionBook); no
// waiting cash-outs list (executive decision 20 Oct: the leader scans her code when she comes); LP names are
// short addresses; "Take a tour" is not built; the cash tasks the board leaves to L1 are listed below the cards.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { getAccount } from '../stellar/api';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { useOfferQuote, useUnionOffers, usdcOf } from '../anchor/hooks';
import { usePost } from '../anchor/LeaderLp';
import { COLLECT } from '../anchor/sep';
import { C, FONT, R } from '../shell/tokens';
import { Loading } from '../register/Boot';
import { StickyTop } from '../shell/ListRow';
import RoundButton, { SettingsButton } from '../shell/RoundButton';
import { HistoryIcon } from '../shell/icons';
import { LeaderTasksButton } from '../shell/A1';
import Segmented from '../shell/Segmented';
import { SEARCH_WINDOWS, useUnionBook, useUnionCash } from './hooks';

const U = 10_000_000n;
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const card = { background: C.ink, borderRadius: R.card, padding: '18px 22px', marginBottom: 12, fontFamily: FONT, color: C.text };
const rowS = { display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' };
const pill = { height: 36, padding: '0 14px', borderRadius: R.round, background: C.raised, border: 0, color: C.text, fontWeight: 700, fontFamily: FONT };
const primary = { width: '100%', height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontFamily: FONT, marginTop: 12 };

/** The N1–N3 screens over the whole tab, not inside a card. */
const Over = ({ children }) => <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: C.ink }}>{children}</div>;

function Row({ k, v, accent, coral }) {
  return <div style={rowS}><span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, color: coral ? C.coral : accent ? C.accent : C.text }}>{v}</span></div>;
}

function Stepper({ value, set, max, step = 100, label = 'Amount in rupees' }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12px 0' }}>
      <button type="button" aria-label="Less" style={b} onClick={() => set(Math.max(0, value - step))}>−</button>
      <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => set(Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0))}
        style={{ width: 110, height: 44, textAlign: 'center', borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 18 }} />
      <button type="button" aria-label="More" style={b} onClick={() => set(Math.min(max, value + step))}>+</button>
      <button type="button" style={{ ...b, width: 'auto', padding: '0 14px', fontSize: 14 }} onClick={() => set(max)}>Max</button>
    </div>
  );
}

/** C2: one wider search per tap (24 h → week → month → 6 months) until the list and the chain agree. */
function Chip({ book, api, onFound }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState();
  const [added, setAdded] = useState(0);
  const [gapInStore, setGapInStore] = useState(false);
  // The share list is a part of C1 that loads after the screen: an inline line, never S1 inside the card (22 Oct).
  if (!book) return <p role="status" style={{ textAlign: 'center', margin: '8px 0 0', color: C.muted, fontSize: 14 }}>Checking the share list…</p>;
  if (book.gap <= 0) {
    return <p style={{ textAlign: 'center', margin: '8px 0 0' }}><b>✓ Every rupee is accounted for</b><br /><span style={{ color: C.muted, fontSize: 14 }}>{added ? `${added} share${added > 1 ? 's' : ''} added to the list` : 'Treasury and share list agree'}</span></p>;
  }
  const [win, label] = SEARCH_WINDOWS[Math.min(step, SEARCH_WINDOWS.length - 1)];
  const search = async () => {
    setBusy(true);
    try {
      const before = book.loans.length;
      const r = await api.unionSearch(win);
      if (r.store_gap) setGapInStore(true);
      const after = (await onFound()).data?.loans.length ?? before;
      const n = Math.max(0, after - before);
      setAdded((x) => x + n);
      setNote(`Searched ${label} · ${n ? `${n} share${n > 1 ? 's' : ''} added` : 'nothing new'}`);
      setStep((x) => x + 1);
    } catch (e) { setNote(e.message); }
    setBusy(false);
  };
  const done = step >= SEARCH_WINDOWS.length || gapInStore;
  if (busy) {
    return (
      <p style={{ textAlign: 'center', margin: '8px 0 0' }}><b>Searching {label}…</b><br />
        <span style={{ color: C.muted, fontSize: 14 }}>{win === '6months' ? 'This can take a few minutes. You can leave this screen.' : 'A few seconds'}</span></p>
    );
  }
  const next = SEARCH_WINDOWS[Math.min(step, SEARCH_WINDOWS.length - 1)][1];
  return (
    <button type="button" onClick={done ? undefined : search} style={{ ...pill, display: 'block', margin: '8px auto 0', height: 'auto', padding: '8px 16px', color: C.coral, textAlign: 'center' }}>
      {inr(book.gap)} not accounted for<br />
      <span style={{ color: C.muted, fontWeight: 400, fontSize: 13 }}>
        {done ? `${note ? `${note}. ` : ''}Ask Nila support.` : `${note ? `${note}. ` : ''}Tap to search ${next}.`}
      </span>
    </button>
  );
}

/** Her USDC and fx_pool's rate, for a USDC deposit into the treasury (22 Oct). */
function useUsdcIn(cfg, address) {
  return useQuery({
    queryKey: ['stellar', 'treasuryUsdcIn', address], enabled: !!cfg && !!address, staleTime: 15_000,
    queryFn: async () => {
      const a = await getAccount(cfg.horizon_url, address);
      const [code, issuer] = (cfg.usdc_asset || ':').split(':');
      const b = a?.balances?.find((x) => x.asset_code === code && x.asset_issuer === issuer);
      const r = await readContract(cfg, 'fx_pool', 'rate', []).catch(() => null);
      const fresh = r && Number(r.valid_until) * 1000 > Date.now();
      return { usdc: b ? Number(b.balance) : 0, trust: !!b, inrPerUsd: fresh ? Number(r.inr_per_usd) / 1e7 : null };
    },
  });
}

/** C3: add to the treasury with her own nIN or with USDC, or withdraw to her wallet (C10; the node sponsors all).
 *  The treasury is the mirror of cash and always USDC-backed (executive decision 22 Oct): counted cash never goes in;
 *  USDC is swapped by fx_pool at its rate (deposit_usdc_treasury) and stays there as the backing. */
function Adjust({ cash, onClose }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [dir, setDir] = useState('deposit');
  const [src, setSrc] = useState('nin');
  const [rainy, setRainy] = useState(false);
  const [amount, setAmount] = useState(0);
  const uq = useUsdcIn(cfg, s?.stellarAddress);
  const mine = Math.floor(s?.stellarAccount?.nin?.balance ?? 0);
  const fromRainy = dir === 'withdraw' && rainy;
  const viaUsdc = dir === 'deposit' && src === 'usdc';
  const rate = uq.data?.inrPerUsd;
  // In USDC: the stepper counts whole USDC; the treasury gets its rupee value at fx_pool's rate (max ₹10,000 a call).
  const max = viaUsdc ? (rate ? Math.min(Math.floor(uq.data.usdc), Math.floor(10_000 / rate)) : 0)
    : dir === 'deposit' ? mine : fromRainy ? Math.floor(cash.rainy) : Math.floor(cash.free);
  const a = Math.min(amount, max);
  const inrIn = viaUsdc ? Math.floor(a * (rate || 0)) : a;
  if (tx.status !== 'idle') return <Over><TxScreens tx={tx} onClose={() => { tx.reset(); onClose(); }} onRetry={() => tx.retry()} /></Over>;
  const go = () => tx.run(viaUsdc ? {
    label: `Add ${a} USDC`,
    rows: [['USDC', `${a} USDC`], ['Into the treasury', `~${inr(inrIn)}`], ['Union treasury after', `~${inr(cash.treasury + inrIn)}`]],
    contractName: 'fx_pool', fn: 'deposit_usdc_treasury',
    args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.i128(BigInt(a) * U)],
    invalidate: [['stellar', 'unionCash'], ['stellar', 'treasuryUsdcIn']],
  } : {
    label: dir === 'deposit' ? `Deposit ${inr(a)}` : `Withdraw ${inr(a)}`,
    rows: [['Amount', inr(a)], fromRainy ? ['Rainy day fund after', inr(cash.rainy - a)] : ['Union treasury after', inr(cash.treasury + (dir === 'deposit' ? a : -a))]],
    contractName: 'fund_core', fn: dir === 'deposit' ? 'leader_deposit_treasury' : 'withdraw_union_treasury',
    args: dir === 'deposit'
      ? [sv.address(s.stellarAddress), sv.address(cfg.union), sv.i128(BigInt(a) * U)]
      : [sv.address(s.stellarAddress), sv.address(cfg.union), sv.i128(BigInt(a) * U), sv.bool(fromRainy)],
    invalidate: [['stellar', 'unionCash'], ['stellar', 'account']],
  });
  return (
    <>
      <div style={{ margin: '12px 0' }}>
        <Segmented label="Deposit or withdraw" options={[['deposit', 'Deposit into the fund'], ['withdraw', 'Withdraw from the fund']]} value={dir} onChange={setDir} />
      </div>
      {dir === 'withdraw' && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={rainy} onChange={(e) => setRainy(e.target.checked)} aria-label="From the rainy day fund" />
          From the rainy day fund ({inr(cash.rainy)})
        </label>
      )}
      {dir === 'deposit' && (
        <div style={{ margin: '0 0 12px' }}>
          <Segmented label="Deposit from" options={[['nin', 'My nIN'], ['usdc', 'USDC']]} value={src} onChange={(v) => { setSrc(v); setAmount(0); }} />
        </div>
      )}
      {viaUsdc && !uq.data?.trust && <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>You hold no USDC.</p>}
      {viaUsdc && uq.data?.trust && !rate && <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>No current rate: try again later.</p>}
      <Stepper value={a} set={setAmount} max={max} step={viaUsdc ? 1 : 100} label={viaUsdc ? 'Amount in USDC' : 'Amount in rupees'} />
      {viaUsdc ? (
        <>
          <Row k="Into the treasury" v={`~${inr(inrIn)}${rate ? ` (₹${rate.toFixed(2)} a USDC)` : ''}`} />
          <Row k="Union treasury after" v={`~${inr(cash.treasury + inrIn)}`} />
          <Row k="Your USDC after" v={`${((uq.data?.usdc || 0) - a).toFixed(2)} USDC`} />
        </>
      ) : (
        <>
          {fromRainy ? <Row k="Rainy day fund after" v={inr(cash.rainy - a)} /> : <Row k="Union treasury after" v={inr(cash.treasury + (dir === 'deposit' ? a : -a))} />}
          <Row k="Your nIN after" v={`${(mine + (dir === 'deposit' ? -a : a)).toLocaleString('en-IN')} nIN`} />
        </>
      )}
      <button type="button" disabled={!a || !tx.ready} style={{ ...primary, opacity: !a || !tx.ready ? 0.5 : 1 }} onClick={go}>{viaUsdc ? `Add ${a} USDC` : dir === 'deposit' ? `Deposit ${inr(a)}` : `Withdraw ${inr(a)}`}</button>
    </>
  );
}

function useCountdown(ts) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(t); }, []);
  if (!ts) return null;
  const s = Math.max(0, Math.floor(ts - now));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** C4: the Cash card (time left, let an LP collect it) and the LP cards. */
function CashCard({ cash, open, setOpen, onScanLp }) {
  const s = useNilaSigner();
  const offers = useUnionOffers().data || [];
  const { tx, post } = usePost();
  const cancel = useSorobanTx();
  const [sure, setSure] = useState();   // a second tap cancels (an accepted offer is the LP's swap too)
  const promised = offers.filter((o) => o.kind === COLLECT && o.state <= 1).reduce((t, o) => t + o.inr, 0);
  const max = Math.max(0, Math.min(10000, Math.floor(cash.atHand) - promised));
  const [amount, setAmount] = useState(0);
  const a = Math.min(amount, max);
  const first = cash.escrows.find((e) => e.remaining > 0);
  const left = useCountdown(first?.expires);
  const q = useOfferQuote(COLLECT, a);
  const feeBp = q.data ? Number(q.data.fee_bp) : 100;
  const fee = Math.round((a * feeBp) / 10_000);
  const t = tx.status !== 'idle' ? tx : cancel.status !== 'idle' ? cancel : null;
  if (t) return <Over><TxScreens tx={t} onClose={() => t.reset()} onRetry={() => t.retry()} /></Over>;
  const until = (ts) => { const sec = ts - Date.now() / 1000; return sec < 86400 ? `${Math.max(1, Math.ceil(sec / 3600))} h left` : `In ${Math.ceil(sec / 86400)} d`; };
  const now = Date.now() / 1000;
  const live = offers.filter((o) => o.state <= 1 && o.expires > now);
  return (
    <>
      <section style={card} aria-label="Cash">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Cash</h2>
          {open ? <button type="button" style={pill} onClick={() => setOpen(false)}>Close</button> : null}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0' }}>{inr(cash.atHand)}</div>
        {!open && <button type="button" style={{ ...pill, marginTop: 4 }} onClick={() => setOpen(true)}>Let an LP collect it</button>}
        {open && (
          <>
            {left && <Row k="Time left" v={left} coral={first.expires - now < 86400} />}
            <Row k="After the deadline" v="Treasury covers it" />
            <h3 style={{ fontSize: 14, margin: '14px 0 0' }}>Cash for your LPs to collect</h3>
            <Stepper value={a} set={setAmount} max={max} />
            <Row k={`LP fee (${feeBp / 100}%)`} v={a ? inr(fee) : '—'} />
            <Row k="Into the union treasury" v={a ? `${inr(a - fee)}${q.data ? ` · ${usdcOf(q.data.usdc)} USDC` : ''}` : '—'} />
            {promised > 0 && <p style={{ color: C.muted, fontSize: 13 }}>{inr(promised)} is offered to LPs already.</p>}
            <button type="button" disabled={!a || !tx.ready} style={{ ...primary, opacity: !a || !tx.ready ? 0.5 : 1 }} onClick={() => post(COLLECT, a)}>Let LPs collect {inr(a)}</button>
          </>
        )}
      </section>
      {live.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', marginBottom: 12 }} aria-label="LP">
          {live.map((o) => (
            <section key={o.id} style={{ ...card, flex: '0 0 85%', scrollSnapAlign: 'center', marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{o.state === 1 ? `LP ${short(o.lp)}` : o.kind === 0 ? 'LP brings cash' : 'Give cash'}</b>
                <span style={{ color: o.state === 1 ? C.accent : C.muted, fontWeight: 700 }}>{o.state === 1 ? 'Here' : until(o.expires)}</span>
              </div>
              <Row k="Amount" v={inr(o.inr)} />
              <Row k={`Fee (${feeBp / 100}%)`} v={inr((o.inr * feeBp) / 10_000)} />
              {o.state === 1 ? <Row k="USDC" v={usdcOf(o.usdc)} /> : <Row k="Status" v="Waiting" />}
              {o.state === 1 && <button type="button" style={primary} onClick={onScanLp}>Scan code</button>}
              <button type="button" onClick={() => (sure === o.id ? cancel.run({
                label: `Cancel the offer of ${inr(o.inr)}`, rows: [['Offer', `${o.kind === 0 ? 'LP brings cash' : 'Give cash'} ${inr(o.inr)}`]],
                contractName: 'fx_pool', fn: 'cancel_offer', args: [sv.address(s.stellarAddress), sv.u64(o.id)], invalidate: [['stellar', 'offers']],
              }) : setSure(o.id))} style={{ background: 'none', border: 0, padding: 0, color: C.coral, fontWeight: 700, marginTop: 8 }}>
                {sure === o.id ? (o.state === 1 ? 'Tap again: the LP accepted it' : 'Tap again to cancel') : 'Cancel'}
              </button>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function CashBoard({ settle, onScanLp, tasks }) {
  const api = usePlanClient();
  const cashQ = useUnionCash();
  const bookQ = useUnionBook(api);
  const [adjust, setAdjust] = useState(false);
  const [open, setOpen] = useState(!!settle);
  const cash = cashQ.data;
  const book = bookQ.data;
  if (cashQ.isError) return <div style={{ ...card, margin: 16 }}>Could not read the union. Try again.</div>;
  if (!cash) return <Loading />;   // S1 while the union loads (executive decision 21 Oct: every wait is S1)
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      {/* The header as on A1L (C4 audit, 22 Oct): History, All tasks, Settings. */}
      <StickyTop>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <RoundButton label="History" onClick={() => { window.location.hash = '#/history'; }}><HistoryIcon color={C.text} /></RoundButton>
          <LeaderTasksButton onClick={() => { window.location.hash = '#/tasks'; }} />
          <SettingsButton onClick={() => { window.location.hash = '#/settings'; }} />
        </div>
      </StickyTop>
      <section style={{ ...card, textAlign: 'center' }} aria-label="Union treasury">
        <div style={{ color: C.muted }}>Union treasury</div>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{inr(cash.treasury)}</div>
        {book && book.earningsPending > 0 && <div style={{ color: C.muted }}>+ {inr(book.earningsPending)} earnings pending</div>}
        <Chip book={book} api={api} onFound={() => bookQ.refetch()} />
        {bookQ.isError && <p style={{ color: C.coral, fontSize: 13 }}>The share list could not be read: {bookQ.error.message}</p>}
      </section>
      <section style={card} aria-label="Funds">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Funds</h2>
          <button type="button" style={pill} onClick={() => setAdjust((x) => !x)}>{adjust ? 'Close' : 'Adjust'}</button>
        </div>
        <Row k="Union fund" v={book ? inr(book.fundTotal) : '…'} />
        <Row k="Rainy day fund" v={inr(cash.rainy)} />
        {adjust && <Adjust cash={cash} onClose={() => setAdjust(false)} />}
      </section>
      <section style={card} aria-label="Lending">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Lending</h2>
          <span style={{ color: cash.overdue ? C.coral : C.accent, fontWeight: 700 }}>{cash.overdue ? '● On hold' : 'Open'}</span>
        </div>
        {cash.overdue > 0 && <p style={{ color: C.coral, margin: '6px 0' }}>{cash.overdue} share{cash.overdue > 1 ? 's' : ''} overdue</p>}
        <Row k="Member contributions" v={book ? inr(book.contributions) : '…'} />
        <Row k="In circulation" v={`${inr(cash.atHand)} (${cash.treasury ? Math.round((100 * cash.atHand) / cash.treasury) : 0}%)`} />
        <Row k="Interest pending" v={book ? inr(book.interestPending) : '…'} />
        <Row k="Available to cash in" v={inr(cash.free)} accent />
        <Row k="Union USDC" v={`${(cash.usdc.lp + cash.usdc.domestic + cash.usdc.offshore).toFixed(2)} (LP ${cash.usdc.lp.toFixed(2)} · senior ${(cash.usdc.domestic + cash.usdc.offshore).toFixed(2)})`} />
      </section>
      <CashCard cash={cash} open={open} setOpen={setOpen} onScanLp={onScanLp} />
      {tasks}
    </div>
  );
}
