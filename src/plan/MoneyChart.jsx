// CP11 "Money left each month" (board CropPlanTerms): per month, sales stacked up in crop colours and the crop share
// taken (hatched) above zero; inputs (grey) and repayment (hatched) below zero; the money left with the crop plan as a
// white line with dots, without it as a dashed line. The info button opens the legend drawer ("What the chart shows").
//
// Every series is a direct sum of the plan's rows (no new numbers): sales = the row's value in its harvest month; crop
// share taken = its loan cash and voucher value in its sowing month; inputs = seed, cash inputs, hand or hired work and
// the part above the cap at sowing, machine work in the month it is used; repayment = its repay in its due month.
// Without the crop plan she pays the same inputs and machines herself and repays nothing.
import { useMemo, useState } from 'react';
import { C, FONT } from '../shell/tokens';

const W = 330, H = 170, X0 = 34, X1 = 324, Y0 = 8, Y1 = 152;
const BW = (X1 - X0) / 12;
const INPUTS = '#64748B';
const ym = (d) => (d ? d.slice(0, 7) : null);
const rs = (v) => `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
const sg = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${rs(v)}`;
const k = (v) => (v === 0 ? '₹0' : `${v < 0 ? '−' : ''}₹${Math.abs(v) >= 1000 ? `${Math.abs(v) / 1000}k` : Math.abs(v)}`);
const r100 = (v) => Math.round(v / 100) * 100;

function niceStep(range) {
  const raw = range / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
}

/** The chart's numbers from the plan (months from the node's cashflow, the 12 months of her plan year). */
export function series(plan) {
  const p = plan.plan;
  const months = (p.cashflow || []).map((m) => m.month);
  const at = Object.fromEntries(months.map((m, i) => [m, i]));
  const z = () => new Array(months.length).fill(0);
  const sales = months.map(() => []), take = z(), inputs = z(), repay = z();
  for (const s of p.seasons || []) {
    for (const r of s.rows) {
      const f = r.finance;
      const h = at[ym(r.harvest)], w = at[ym(r.sow)], d = at[ym(f.due)];
      if (h !== undefined && r.value > 0) sales[h].push({ name: r.name, colour: r.colour, v: r.value });
      if (w !== undefined) {
        take[w] += f.cash + (f.voucher_value || 0);
        inputs[w] += f.seed + f.cash_inputs + (f.hand_work_cash || 0);
      }
      for (const m of Object.values(f.machines || {})) {
        const u = at[ym(m.when)];
        if (u !== undefined) inputs[u] += m.value;
      }
      if (d !== undefined) repay[d] += f.repay || 0;
    }
  }
  let a = 0, b = 0;
  const withPlan = [], without = [];
  months.forEach((_, i) => {
    const sold = sales[i].reduce((t, c) => t + c.v, 0);
    a += sold + take[i] - inputs[i] - repay[i];
    b += sold - inputs[i];
    withPlan.push(a); without.push(b);
  });
  return { months, sales, take, inputs, repay, withPlan, without };
}

const monthLabel = (m, opts) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', opts);

export default function MoneyChart({ plan }) {
  const [legend, setLegend] = useState(false);
  const s = useMemo(() => series(plan), [plan]);
  const n = s.months.length;
  if (!n) return null;
  const up = s.months.map((_, i) => s.sales[i].reduce((t, c) => t + c.v, 0) + s.take[i]);
  const dn = s.months.map((_, i) => -(s.inputs[i] + s.repay[i]));
  const hi = Math.max(0, ...up, ...s.withPlan, ...s.without);
  const lo = Math.min(0, ...dn, ...s.withPlan, ...s.without);
  const step = niceStep(hi - lo || 1000);
  const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
  const cy = (v) => Y0 + ((Y1 - Y0) * (top - v)) / (top - bot);
  const cx = (i) => X0 + i * BW + BW / 2;
  const ticks = [];
  for (let v = bot; v <= top + 1e-6; v += step) ticks.push(v);

  const bars = [];
  s.months.forEach((_, i) => {
    const x = cx(i) - 8;
    const ups = [...s.sales[i].map((c) => [c.colour, c.v]), ['url(#cf-fin)', s.take[i]]].filter(([, v]) => v > 0);
    let base = 0;
    ups.forEach(([fill, v], j) => {
      const y2 = cy(base) - (j === 0 ? 1 : 2), y1 = cy(base + v);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: j === ups.length - 1 ? 3 : 0, fill, key: `u${i}${j}` });
      base += v;
    });
    base = 0;
    const dns = [[INPUTS, s.inputs[i]], ['url(#cf-fin)', s.repay[i]]].filter(([, v]) => v > 0);
    dns.forEach(([fill, v], j) => {
      const y1 = cy(base) + (j === 0 ? 1 : 2), y2 = cy(base - v);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: j === dns.length - 1 ? 3 : 0, fill, key: `d${i}${j}` });
      base -= v;
    });
  });
  const pts = (arr) => arr.map((v, i) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ');
  const minNo = Math.min(...s.without), iNo = s.without.indexOf(minNo);
  const end = s.withPlan[n - 1];
  const crops = [...new Map(s.sales.flat().map((c) => [c.name, c.colour])).entries()];
  const seasons = (plan.plan.seasons || []).length;
  const sub = `${monthLabel(s.months[0], { month: 'short', year: 'numeric' })} to ${monthLabel(s.months[n - 1], { month: 'short', year: 'numeric' })} · all ${seasons} seasons`;
  const tip = (i) => [monthLabel(s.months[i], { month: 'short', year: 'numeric' }),
    ...s.sales[i].map((c) => `${c.name} ${rs(c.v)}`),
    s.take[i] ? `finance taken ${rs(s.take[i])}` : null,
    s.inputs[i] ? `inputs −${rs(s.inputs[i])}` : null,
    s.repay[i] ? `repayment −${rs(s.repay[i])}` : null,
    `with crop share ${sg(s.withPlan[i])}`, `without ${sg(s.without[i])}`].filter(Boolean).join(' · ');

  return (
    <figure style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <figcaption style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>Money left each month</span>
          <button type="button" onClick={() => setLegend(true)} aria-label="What the chart shows" style={{ width: 44, height: 44, margin: -8, border: 0, padding: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
          </button>
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>{sub}</span>
      </figcaption>
      <svg role="img" aria-label={`Money left each month, with and without crop share. With crop share it ends at ${sg(r100(end))}.`}
        width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', fontFamily: FONT }}>
        <defs>
          <pattern id="cf-fin" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill={C.raised} /><rect width="2" height="4" fill={C.muted} />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={cy(v)} y2={cy(v)} stroke={v === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
            <text x={X0 - 6} y={cy(v)} fill={C.muted} fontSize="12" textAnchor="end" dominantBaseline="middle">{k(v)}</text>
          </g>
        ))}
        {bars.map((b) => <rect key={b.key} x={b.x.toFixed(1)} y={b.y.toFixed(1)} width="16" height={b.h.toFixed(1)} rx={b.rx} fill={b.fill} />)}
        <polyline points={pts(s.without)} fill="none" stroke="rgba(241,245,249,0.5)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />
        <polyline points={pts(s.withPlan)} fill="none" stroke={C.text} strokeWidth="2" strokeLinejoin="round" />
        {s.withPlan.map((v, i) => <circle key={i} cx={cx(i)} cy={cy(v)} r={i === n - 1 ? 4 : 2.5} fill={C.text} stroke={C.ink} strokeWidth="2" />)}
        {minNo < 0 && <text x={cx(iNo) - 4} y={cy(minNo) + 16} fill={C.muted} fontSize="12" fontWeight="700" textAnchor="end">{sg(r100(minNo))}</text>}
        <text x={cx(n - 1) + 6} y={cy(end) - 8} fill={C.text} fontSize="12" fontWeight="700" textAnchor="end">{sg(r100(end))}</text>
        {s.months.map((m, i) => (
          <text key={m} x={cx(i)} y={H - 4} fill={C.muted} fontSize="12" textAnchor="middle">{monthLabel(m, { month: 'narrow' })}</text>
        ))}
        {s.months.map((m, i) => <rect key={`h${m}`} x={cx(i) - 12} y={0} width={24} height={Y1} fill="transparent"><title>{tip(i)}</title></rect>)}
      </svg>
      {legend && <Legend crops={crops} onClose={() => setLegend(false)} />}
    </figure>
  );
}

function Legend({ crops, onClose }) {
  const row = (mark, label) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{mark}</span><span>{label}</span>
    </div>
  );
  const sq = (bg) => <span style={{ width: 12, height: 12, borderRadius: 3, background: bg }} />;
  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" aria-label="What the chart shows" style={{ position: 'fixed', left: 8, right: 8, bottom: 88, zIndex: 21, background: C.ink, borderRadius: 24,
        boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT, color: C.text }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, paddingTop: 4 }}>What the chart shows</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {row(<span style={{ width: 20, height: 0, borderTop: `2px solid ${C.text}` }} />, 'With crop plan')}
          {row(<span style={{ width: 20, height: 0, borderTop: '2px dashed rgba(241,245,249,0.5)' }} />, 'Without crop plan')}
          {crops.map(([name, colour]) => row(sq(colour), name))}
          {row(sq(`repeating-linear-gradient(45deg, ${C.muted} 0 1.5px, ${C.raised} 1.5px 3px)`), 'Crop share received ↑, repaid ↓')}
          {row(sq(INPUTS), 'Inputs')}
        </div>
        <button type="button" onClick={onClose} style={{ height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', color: C.text, background: C.raised, cursor: 'pointer' }}>Close</button>
      </div>
    </>
  );
}
