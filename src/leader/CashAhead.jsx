// Cash ahead (25 Oct, Cash tab): the next 8 weeks of cash at the office, from the members list kept on the phone
// (no extra calls). Taken: every unused crop share in the week its window opens or its planned sowing (whichever is
// later, never before this week), at its attested cash part. Repaid: every open loan in the week of its crop's
// harvest (an overdue one this week), the cash part left. Each week: the office's cash after it, and what the LPs
// are needed for: bring the shortfall, or collect what goes above the treasury. Members may not all take up their
// shares: "Half take up" counts half of them. DESIGN GAP: no board for this card.
import { useMemo, useState } from 'react';
import { inr } from '../plan/ui';
import { C } from '../shell/tokens';
import Segmented from '../shell/Segmented';
import { useUnionMembers } from './unionMembers';

const DAY = 86400;
const WEEKS = 8;
const MAX_ESCROWS = 64;     // fx_pool MAX_OPEN_ESCROWS: cash scans the office can hold open at once
const weekStart = (t) => { const d = new Date(t * 1000); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime() / 1000; };
const ts = (iso) => (iso ? Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 1000 : 0);
const day = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The weeks: { start, taken, repaid, scans, end, bring, collect }. */
export function forecast(members, atHand, treasury, uptake = 1, now = Date.now() / 1000) {
  const w0 = weekStart(now);
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: w0 + i * 7 * DAY, taken: 0, repaid: 0, scans: 0, takers: 0 }));
  const at = (t) => Math.floor((Math.max(t, now) - w0) / (7 * DAY));
  for (const m of members || []) {
    const shares = m.shareList || [];
    for (const x of shares) {
      if (!['ready', 'early'].includes(x.state) || !(x.cash > 0)) continue;
      if (x.final && x.final < now) continue;
      const i = at(Math.max(Number(x.open || 0), ts(x.sow)));
      if (i < WEEKS) { weeks[i].taken += x.cash * uptake; weeks[i].takers += uptake; }
    }
    for (const l of m.loans || []) {
      const harvest = ts(shares.find((x) => x.token === l.token)?.harvest) || (l.due ? l.due - 21 * DAY : 0);
      const i = l.overdue ? 0 : at(harvest || now);
      if (i < WEEKS && l.left > 0) { weeks[i].repaid += l.left; weeks[i].scans += 1; }
    }
  }
  let cash = atHand;
  for (const w of weeks) {
    cash += w.repaid - w.taken;
    w.bring = cash < 0 ? -cash : 0;
    if (cash < 0) cash = 0;                    // an LP brings the shortfall
    w.collect = cash > treasury ? cash - treasury : 0;
    if (cash > treasury) cash = treasury;      // an LP takes what is above the treasury
    w.end = cash;
  }
  return weeks;
}

export default function CashAhead({ api, cash, style }) {
  const members = useUnionMembers(api);
  const [uptake, setUptake] = useState('all');
  const weeks = useMemo(() => (cash && members.data ? forecast(members.data, cash.atHand, cash.treasury, uptake === 'all' ? 1 : 0.5) : null),
    [members.data, cash, uptake]);
  if (!weeks) return null;
  const top = Math.max(1, cash.treasury, ...weeks.map((w) => Math.max(w.taken, w.repaid, w.end + w.collect)));
  const H = 120; const bw = 14; const gap = 40;
  const y = (v) => H - (v / top) * H;
  const advice = weeks.filter((w) => w.bring || w.collect || w.scans > MAX_ESCROWS);
  return (
    <section style={{ ...style, gap: 12 }} aria-label="Cash ahead">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Cash ahead · 8 weeks</h2>
        <Segmented width="hug" label="Take up" value={uptake} onChange={setUptake} options={[['all', 'All take up'], ['half', 'Half']]} />
      </div>
      <svg role="img" aria-label="Cash taken and repaid per week, and the cash at the office after it" viewBox={`0 0 ${WEEKS * gap} ${H + 18}`} style={{ width: '100%', height: 'auto' }}>
        <line x1="0" x2={WEEKS * gap} y1={y(cash.treasury)} y2={y(cash.treasury)} stroke={C.muted} strokeDasharray="4 4" strokeWidth="1" />
        {weeks.map((w, i) => {
          const x = i * gap + 4;
          return (
            <g key={w.start}>
              <rect x={x} y={y(w.repaid)} width={bw} height={H - y(w.repaid)} rx="3" fill={C.accent} />
              <rect x={x + bw + 2} y={y(w.taken)} width={bw} height={H - y(w.taken)} rx="3" fill={C.coral} opacity="0.8" />
              <text x={x + bw} y={H + 14} textAnchor="middle" fontSize="10" fill={C.muted}>{day(w.start)}</text>
            </g>
          );
        })}
        <polyline fill="none" stroke={C.text} strokeWidth="2" points={weeks.map((w, i) => `${i * gap + 4 + bw},${y(w.end)}`).join(' ')} />
      </svg>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: C.muted }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.accent, marginRight: 6 }} />Repaid (harvests)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.coral, marginRight: 6 }} />Taken (crop shares)</span>
        <span>— Cash at the office · ┄ treasury</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
        {advice.length ? advice.map((w) => (
          <div key={w.start} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: C.muted }}>Week of {day(w.start)}</span>
            <span style={{ fontWeight: 700, textAlign: 'right', color: w.bring ? C.coral : C.text }}>
              {w.bring ? `Short ${inr(w.bring)} · LPs bring back` : w.collect ? `Over the treasury ${inr(w.collect)} · an LP takes` : ''}
              {w.scans > MAX_ESCROWS ? `${w.bring || w.collect ? ' · ' : ''}${w.scans} repayments: more cash scans than the office can hold (${MAX_ESCROWS})` : ''}
            </span>
          </div>
        )) : <span style={{ color: C.muted }}>No LP needed in the next 8 weeks.</span>}
      </div>
    </section>
  );
}
