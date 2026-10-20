// A1L (board MemberAssetsLeader = A1 with leader on): the cash slides above the Assets card and the "Union"
// rows. Values from the contracts (useUnionCash, useUnionOffers). P10a.
// DESIGN GAPs: LP names (the node has none) are short wallet addresses; the member slides (repay, invest,
// withdrawal) and the Tasks badge come with their own steps.
import { useEffect, useState } from 'react';
import { useUnionOffers, usdcOf } from '../anchor/hooks';
import { C, FONT, R } from '../shell/tokens';
import { useUnionCash } from './hooks';

const inr = (n) => `₹${Math.floor(n).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const WEEK = 7 * 86400;
const leftText = (ts, now) => {
  const s = ts - now;
  if (s <= 0) return 'covered by the treasury';
  return s < 86400 ? `${Math.ceil(s / 3600)} h left` : `${Math.ceil(s / 86400)} days left`;
};
const expiresIn = (ts, now) => { const s = ts - now; return s < 86400 ? `${Math.max(1, Math.ceil(s / 3600))} h` : `${Math.ceil(s / 86400)} d`; };

function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 60_000); return () => clearInterval(t); }, []);
  return now;
}

const card = { flex: '0 0 calc(100% - 16px)', scrollSnapAlign: 'center', background: C.ink, borderRadius: 24, padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 };
const btn = { height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontFamily: FONT, fontSize: 14 };

/** The cash and LP slides; nothing when there is no cash at hand and no LP offer. */
export function LeaderSlides({ onSettle, onScanLp }) {
  const cash = useUnionCash().data;
  const offers = useUnionOffers().data || [];
  const now = useNow();
  const [at, setAt] = useState(0);
  const slides = [];
  if (cash && cash.atHand > 0) {
    const first = cash.escrows.find((e) => e.remaining > 0);
    const left = first ? first.expires - now : 0;
    slides.push(
      <section key="cash" aria-label="Lend out or settle your cash" style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lend out or settle your cash</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{inr(cash.atHand)}</span>
          {first && <span style={{ color: left < 86400 ? C.coral : C.muted, fontWeight: 700 }}>{leftText(first.expires, now)}</span>}
        </div>
        {first && <div style={{ height: 8, background: C.raised, borderRadius: R.round }}><div style={{ width: `${Math.max(0, Math.min(100, (100 * left) / WEEK))}%`, height: 8, background: left < 86400 ? C.coral : C.accent, borderRadius: R.round }} /></div>}
        <span style={{ color: C.muted, fontSize: 14 }}>After 7 days the treasury covers it.</span>
        <button type="button" style={btn} onClick={onSettle}>Lend out or settle</button>
      </section>,
    );
  }
  const live = offers.filter((o) => o.state <= 1 && o.expires > now);
  if (live.length) {
    const here = live.find((o) => o.state === 1);
    slides.push(
      <section key="lp" aria-label="LP requests" style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>LP requests · {live.length}</h2>
        {live.slice(0, 3).map((o) => {
          const bring = o.kind === 0;
          const title = o.state === 1 ? 'LP arrived' : bring ? 'LP brings cash' : 'Give cash';
          const sub = o.state === 1 ? `${short(o.lp)} · ${usdcOf(o.usdc)} USDC` : `${bring ? 'Tops up the cash' : 'The LP deposits USDC'} · expires in ${expiresIn(o.expires, now)}`;
          return (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}><b>{title} · {inr(o.inr)}</b><span style={{ color: C.muted }}>{sub}</span></span>
              <span style={{ color: o.state === 1 ? C.accent : C.muted, fontWeight: 700 }}>{o.state === 1 ? 'Here' : 'Waiting'}</span>
            </div>
          );
        })}
        {here && <button type="button" style={btn} onClick={onScanLp}>Accept {inr(here.inr)} from {short(here.lp)}</button>}
      </section>,
    );
  }
  if (!slides.length) return null;
  return (
    <div style={{ margin: '0 0 16px' }}>
      <div onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '0 8px' }}>{slides}</div>
      {slides.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }} aria-hidden="true">
          {slides.map((sl, i) => <span key={sl.key} style={{ width: 8, height: 8, borderRadius: R.round, background: i === at ? C.text : C.muted }} />)}
        </div>
      )}
    </div>
  );
}

/** The "Union" rows of the Assets card. */
export function UnionRows({ Row, Icon, onTreasury, onSettle }) {
  const cash = useUnionCash().data;
  const now = useNow();
  if (!cash) return null;
  const first = cash.escrows.find((e) => e.remaining > 0);
  return (
    <>
      <span style={{ fontWeight: 700, color: C.muted }}>Union</span>
      <Row label="Open union treasury" icon={<Icon />} title="Union treasury" sub={`${inr(cash.free)} free to cash in`}
        value={inr(cash.treasury)} valueSub={cash.overdue > 0 ? 'On hold' : 'Lending open'} onClick={onTreasury} />
      <Row label="Open cash" icon={<Icon />} title="Cash" sub="Lend out or settle" value={inr(cash.atHand)}
        valueSub={first ? leftText(first.expires, now) : '—'} onClick={onSettle} />
    </>
  );
}
