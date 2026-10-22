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
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { useOfferQuote, useUnionOffers, usdcOf } from '../anchor/hooks';
import { usePost } from '../anchor/LeaderLp';
import { COLLECT } from '../anchor/sep';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import { SkeletonRows } from '../shell/Skeleton';
import { StickyTop } from '../shell/ListRow';
import RoundButton, { SettingsButton } from '../shell/RoundButton';
import { HistoryIcon } from '../shell/icons';
import { LeaderTasksButton } from '../shell/A1';
import Segmented from '../shell/Segmented';
import { useUnionInfo } from '../shell/SettingsParts';
import { SEARCH_WINDOWS, useUnionBook, useUnionCash } from './hooks';

const U = 10_000_000n;
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
// The board's spacing (LeaderCash, LeaderCashAdjust): cards 24 radius with the card shadow, 22 padding, 16 between their
// blocks; rows 14/1.5 in groups 8 apart; 24 between cards.
const card = { background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  gap: 16, fontFamily: FONT, color: C.text, fontSize: 14, lineHeight: 1.5 };
const rowS = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5 };
const rows = { display: 'flex', flexDirection: 'column', gap: 8 };
const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
const title = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, margin: 0 };
const pill = { flexShrink: 0, height: 36, padding: '0 14px', borderRadius: R.button, background: C.raised, border: 0, color: C.text, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' };
const primary = { width: '100%', height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' };
const divider = { height: 1, background: C.raised };

/** The N1–N3 screens over the whole tab, not inside a card. */
const Over = ({ children }) => <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: C.ink }}>{children}</div>;

function Row({ k, v, accent, coral }) {
  return <div style={rowS}><span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, textAlign: 'right', color: coral ? C.coral : accent ? C.accent : C.text }}>{v}</span></div>;
}

function Stepper({ value, set, max, step = 100, label = 'Amount in rupees', unit = '₹' }) {
  const b = { width: 44, height: 44, flexShrink: 0, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontFamily: FONT, fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" aria-label="Less" style={b} onClick={() => set(Math.max(0, value - step))}>−</button>
      <label style={{ flex: 1, minWidth: 0, height: 44, borderRadius: R.button, background: C.raised, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', boxSizing: 'border-box' }}>
        <input aria-label={label} inputMode="numeric" value={value.toLocaleString('en-IN')} onChange={(e) => set(Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0))}
          style={{ flex: 1, minWidth: 0, width: '100%', border: 0, background: 'transparent', color: C.text, fontFamily: FONT, fontSize: 16, fontWeight: 700, padding: 0, outline: 'none' }} />
        <span style={{ fontSize: 14, color: C.muted }}>{unit}</span>
      </label>
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

/** C3: Deposit her own nIN into the treasury or Withdraw to her wallet (C10; the node sponsors both). nIN only
 *  (executive decision 22 Oct): a leader with USDC swaps it to nIN on A9 first; counted cash never goes in. */
const arrow = (d) => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

function Adjust({ cash, dir, onClose }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [rainy, setRainy] = useState(false);
  const [amount, setAmount] = useState(0);
  const mine = Math.floor(s?.stellarAccount?.nin?.balance ?? 0);
  const fromRainy = dir === 'withdraw' && rainy;
  const max = dir === 'deposit' ? mine : fromRainy ? Math.floor(cash.rainy) : Math.floor(cash.free);
  const a = Math.min(amount, max);
  if (tx.status !== 'idle') return <Over><TxScreens tx={tx} onClose={() => { tx.reset(); onClose(); }} onRetry={() => tx.retry()} /></Over>;
  const go = () => tx.run({
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
      <div style={divider} />
      <span style={{ color: C.muted }}>{dir === 'deposit' ? 'Deposit into the fund' : 'Withdraw from the fund'}</span>
      {dir === 'withdraw' && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" checked={rainy} onChange={(e) => setRainy(e.target.checked)} aria-label="From the rainy day fund" />
          From the rainy day fund ({inr(cash.rainy)})
        </label>
      )}
      <Stepper value={a} set={setAmount} max={max} />
      <div style={rows}>
        {fromRainy ? <Row k="Rainy day fund after" v={inr(cash.rainy - a)} /> : <Row k="Union treasury after" v={inr(cash.treasury + (dir === 'deposit' ? a : -a))} />}
        <Row k="Your nIN after" v={`${(mine + (dir === 'deposit' ? -a : a)).toLocaleString('en-IN')} nIN`} />
      </div>
      <button type="button" disabled={!a || !tx.ready} style={{ ...primary, opacity: !a || !tx.ready ? 0.5 : 1 }} onClick={go}>{dir === 'deposit' ? `Deposit ${inr(a)}` : `Withdraw ${inr(a)}`}</button>
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
function CashCard({ cash, onScanLp }) {
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
      {/* C4 (22 Oct): the amount beside the title; the details and the primary action only while there is cash at hand. */}
      <section style={card} aria-label="Cash">
        <div style={head}>
          <h2 style={title}>Cash</h2>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{inr(cash.atHand)}</span>
        </div>
        {cash.atHand > 0 && (
          <>
            <div style={rows}>
              {left && <Row k="Time left" v={left} coral={first.expires - now < 86400} />}
              <Row k="After the deadline" v="Treasury covers it" />
            </div>
            <span style={{ fontWeight: 700 }}>Cash for your LPs to collect</span>
            <Stepper value={a} set={setAmount} max={max} />
            <div style={rows}>
              <Row k={`LP fee (${feeBp / 100}%)`} v={a ? inr(fee) : '—'} />
              <Row k="Into the union treasury" v={a ? `${inr(a - fee)}${q.data ? ` · ${usdcOf(q.data.usdc)} USDC` : ''}` : '—'} />
            </div>
            {promised > 0 && <span style={{ color: C.muted }}>{inr(promised)} is offered to LPs already.</span>}
            <button type="button" disabled={!a || !tx.ready} style={{ ...primary, opacity: !a || !tx.ready ? 0.5 : 1 }} onClick={() => post(COLLECT, a)}>Let an LP collect {inr(a)}</button>
          </>
        )}
      </section>
      {live.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory' }} aria-label="LP">
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
  const [adjust, setAdjust] = useState(null);   // null (closed), 'deposit' or 'withdraw'
  const cash = cashQ.data;
  const book = bookQ.data;
  const union = useUnionInfo();
  const titles = useQuery({ queryKey: ['stellar', 'unionTitles'], enabled: !!api, staleTime: 5 * 60_000,
    queryFn: () => api.unionTitles().then((r) => r.titles || []) });
  if (cashQ.isError) return <div style={{ ...card, margin: 16 }}>Could not read the union. Try again.</div>;
  // The header as on A1L (22 Oct): History, All tasks, Settings.
  const top = (
    <StickyTop>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton label="History" onClick={() => { window.location.hash = '#/history'; }}><HistoryIcon color={C.text} /></RoundButton>
        <LeaderTasksButton onClick={() => { window.location.hash = '#/tasks'; }} />
        <SettingsButton onClick={() => { window.location.hash = '#/settings'; }} />
      </div>
    </StickyTop>
  );
  // No S1 inside the app (22 Oct): the header at once and grey rows until the union is read.
  if (!cash) return <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>{top}<section style={card}><SkeletonRows rows={4} /></section></div>;
  const dot = (on) => <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.round, background: on ? C.coral : C.accent, display: 'inline-block', marginRight: 8 }} />;
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      {top}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section style={{ ...card, padding: '18px 22px', gap: 4, alignItems: 'center', textAlign: 'center' }} aria-label="Union treasury">
          <div style={{ color: C.muted }}>Union treasury</div>
          <div style={{ fontSize: 32, lineHeight: 1.2, fontWeight: 700 }}>{inr(cash.treasury)}</div>
          {book && book.earningsPending > 0 && <div style={{ color: C.muted }}>+ {inr(book.earningsPending)} earnings pending</div>}
          <Chip book={book} api={api} onFound={() => bookQ.refetch()} />
          {bookQ.isError && <p style={{ color: C.coral, fontSize: 13, margin: 0 }}>The share list could not be read: {bookQ.error.message}</p>}
        </section>
        <section style={card} aria-label="Funds">
          {/* C3 (22 Oct): the ↓ deposit / ↑ withdraw pair is the card's control; none selected = closed, tapping the selected
              one again closes it, and it closes after the transaction. */}
          <div style={head}>
            <h2 style={title}>Funds</h2>
            <Segmented icon width="hug" label="Deposit or withdraw" value={adjust} onChange={(v) => setAdjust((x) => (x === v ? null : v))}
              options={[['deposit', arrow('M12 5v14M19 12l-7 7-7-7'), 'Deposit'], ['withdraw', arrow('M12 19V5M5 12l7-7 7 7'), 'Withdraw']]} />
          </div>
          {/* The union's fund by its name (as Settings' union card); its members, cash working and vouchers from the union
              sync lists: titles (members) and the active-loan list (cash out on loans, voucher hours). */}
          <div style={rows}>
            <Row k={union.name || 'Union fund'} v={book ? `Total deposited ${inr(book.fundTotal)}` : '…'} />
            <Row k="Members" v={titles.data ? titles.data.length : '—'} />
            <Row k="Cash working (on loans)" v={book ? inr(book.loans.reduce((t, l) => t + l.outstanding, 0)) : '…'} />
            <Row k="Vouchers" v={book ? `${book.loans.reduce((t, l) => t + (l.hours || 0), 0)} machine hours` : '…'} />
            <Row k="Rainy day fund" v={inr(cash.rainy)} />
          </div>
          {adjust && <Adjust key={adjust} cash={cash} dir={adjust} onClose={() => setAdjust(null)} />}
        </section>
        <section style={card} aria-label="Lending">
          <div style={head}>
            <h2 style={title}>Lending</h2>
            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center' }}>{dot(cash.overdue > 0)}{cash.overdue ? 'On hold' : 'Open'}</span>
          </div>
          <div style={rows}>
            {cash.overdue > 0 && (
              <a href="#/tasks" style={{ ...rowS, color: C.text, textDecoration: 'none', minHeight: 44, margin: '-10px 0' }}>
                <span style={{ color: C.coral }}>{cash.overdue} share{cash.overdue > 1 ? 's' : ''} overdue</span>
                <span style={{ fontWeight: 700 }}>In Tasks ›</span>
              </a>
            )}
            <Row k="Member contributions" v={book ? inr(book.contributions) : '…'} />
            <Row k="In circulation" v={`${inr(cash.atHand)} (${cash.treasury ? Math.round((100 * cash.atHand) / cash.treasury) : 0}%)`} />
            <Row k="Interest pending" v={book ? inr(book.interestPending) : '…'} />
            <Row k="Available to cash in" v={inr(cash.free)} accent />
          </div>
        </section>
        <CashCard cash={cash} onScanLp={onScanLp} />
        {tasks}
      </div>
    </div>
  );
}
