// CP11, the accept screen's chart (12 Nov, rethought with Carst): one chart for the whole plan year. Seasons as shaded
// bands with their names; up at sowing the crop share received (hatched yellow); at harvest the sale in the crop's
// colour, the part repaid from it hatched over its top; inputs (grey) below zero; the money left as one white line.
// No "without the plan" line (12 Nov: dropped, too busy).
//
// Every series is a direct sum of the plan's rows (no new numbers): sales = the row's value in its harvest month (and
// the crop in the field now, plan.standing_sales, at its end of season); crop share = its cash and voucher value in its
// sowing month; inputs = seed, cash inputs and hand or hired work at sowing, machine work in the month it is used;
// repayment = its repay in its harvest month (she repays from that sale; the due date is 21 days after).
import { useMemo } from 'react';
import { C, FONT } from '../shell/tokens';

const W = 330, H = 196, X0 = 34, X1 = 324, Y0 = 26, Y1 = 176;
const BW = (X1 - X0) / 12;
const INPUTS = '#64748B';
const SPAN = { S1: 5, S2: 3, S3: 3 };   // months in the season
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

/** All the plan's rows that carry a crop share: the seasons' rows and the green manures. */
const financedRows = (p) => [...(p.seasons || []).flatMap((s) => s.rows), ...(p.soil_cover || []).filter((c) => c.finance)];

/** What she repays in all, and when (the headline). */
export function repayment(plan) {
  const rows = financedRows(plan.plan).filter((r) => r.finance?.repay);
  const dues = [...new Set(rows.map((r) => ym(r.finance.due)).filter(Boolean))].sort();
  return { total: rows.reduce((a, r) => a + r.finance.repay, 0), parts: dues.length, first: dues[0], last: dues[dues.length - 1] };
}

/** The chart's numbers from the plan (months from the node's cashflow, the 12 months of her plan year). */
export function series(plan) {
  const p = plan.plan;
  const months = (p.cashflow || []).map((m) => m.month);
  const at = Object.fromEntries(months.map((m, i) => [m, i]));
  const z = () => new Array(months.length).fill(0);
  const sales = months.map(() => []), take = z(), inputs = z(), repay = z();
  for (const r of financedRows(p)) {
    const f = r.finance;
    const h = at[ym(r.harvest)], w = at[ym(r.sow)], d = at[ym(f.due)];
    if (h !== undefined && r.value > 0) sales[h].push({ name: r.name, colour: r.colour, v: r.value });
    if (w !== undefined) {
      take[w] += (f.cash || 0) + (f.voucher_value || 0);
      inputs[w] += (f.seed || 0) + (f.cash_inputs || 0) + (f.hand_work_cash || 0);
    }
    for (const m of Object.values(f.machines || {})) {
      const u = at[ym(m.when)];
      if (u !== undefined) inputs[u] += m.value;
    }
    // Repaid from the sale: in the harvest month when it falls in the year, else in the due month.
    const back = h !== undefined && r.value > 0 ? h : d;
    if (back !== undefined) repay[back] += f.repay || 0;
  }
  for (const st of p.standing_sales || []) {
    const h = at[ym(st.harvest)];
    if (h !== undefined && st.value > 0) sales[h].push({ name: st.name, colour: st.colour, v: st.value, standing: true });
  }
  const opening = Number(p.intake?.farm_cash_now) || 0;
  let a = opening;
  const left = months.map((_, i) => { a += sales[i].reduce((t, c) => t + c.v, 0) + take[i] - inputs[i] - repay[i]; return a; });
  return { months, sales, take, inputs, repay, left };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => { const [y, mo] = m.split('-').map(Number); return `${MON[mo - 1]} ${y}`; };

export default function MoneyChart({ plan }) {
  const s = useMemo(() => series(plan), [plan]);
  const n = s.months.length;
  if (!n) return null;
  const sold = s.sales.map((x) => x.reduce((t, c) => t + c.v, 0));
  const up = s.months.map((_, i) => sold[i] + s.take[i]);
  const dn = s.months.map((_, i) => -(s.inputs[i] + Math.max(0, s.repay[i] - sold[i])));
  const hi = Math.max(0, ...up, ...s.left);
  const lo = Math.min(0, ...dn, ...s.left);
  const step = niceStep(hi - lo || 1000);
  const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
  const cy = (v) => Y0 + ((Y1 - Y0) * (top - v)) / (top - bot);
  const cx = (i) => X0 + i * BW + BW / 2;
  const ticks = [];
  for (let v = bot; v <= top + 1e-6; v += step) ticks.push(v);

  // Season bands: from each season's first month, its length (S1 Oct–Feb, S2 Mar–May, S3 Jun–Aug).
  const at = Object.fromEntries(s.months.map((m, i) => [m, i]));
  const bands = (plan.plan.seasons || []).map((se, j) => ({ i: at[ym(se.start)], len: SPAN[se.slot] || 3, label: `Season ${j + 1}` }))
    .filter((b) => b.i !== undefined);

  const bars = [];
  s.months.forEach((_, i) => {
    const x = cx(i) - 8;
    // Up: the crop share received, then the sales in their crop colours (a crop in the field now is faded).
    const ups = [['url(#cf-in)', s.take[i], 1], ...s.sales[i].map((c) => [c.colour || C.muted, c.v, c.standing ? 0.55 : 1])].filter(([, v]) => v > 0);
    let base = 0;
    ups.forEach(([fill, v, op], j) => {
      const y2 = cy(base) - (j === 0 ? 1 : 2), y1 = cy(base + v);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: j === ups.length - 1 ? 3 : 0, fill, op, key: `u${i}${j}` });
      base += v;
    });
    // The repaid part of the month's sale: hatched over the top of the sale; what the sale cannot cover goes below zero.
    const fromSale = Math.min(s.repay[i], sold[i]);
    if (fromSale > 0) {
      const y1 = cy(base), y2 = cy(base - fromSale);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: 3, fill: 'url(#cf-back)', key: `r${i}` });
    }
    base = 0;
    const dns = [[INPUTS, s.inputs[i]], ['url(#cf-back)', s.repay[i] - fromSale]].filter(([, v]) => v > 0);
    dns.forEach(([fill, v], j) => {
      const y1 = cy(base) + (j === 0 ? 1 : 2), y2 = cy(base - v);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: j === dns.length - 1 ? 3 : 0, fill, key: `d${i}${j}` });
      base -= v;
    });
  });
  const pts = s.left.map((v, i) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ');
  const min = Math.min(...s.left), iMin = s.left.indexOf(min);
  const end = s.left[n - 1];
  const crops = [...new Map(s.sales.flat().map((c) => [c.name, c.colour])).entries()];
  const tip = (i) => [monthName(s.months[i]),
    s.take[i] ? `crop share received ${rs(s.take[i])}` : null,
    ...s.sales[i].map((c) => `${c.name} sold ${rs(c.v)}`),
    s.repay[i] ? `repaid ${rs(s.repay[i])}` : null,
    s.inputs[i] ? `inputs −${rs(s.inputs[i])}` : null,
    `money left ${sg(s.left[i])}`].filter(Boolean).join(' · ');
  const key = (mark, label) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{mark}{label}</span>
  );
  const sq = (bg) => <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, flexShrink: 0 }} />;

  return (
    <figure style={{ margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <figcaption style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>Your money through the year</figcaption>
      <svg role="img" aria-label={`Money left each month with the crop plan. It is lowest at ${sg(r100(min))} in ${monthName(s.months[iMin])} and ends at ${sg(r100(end))}.`}
        width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', fontFamily: FONT }}>
        <defs>
          <pattern id="cf-in" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill={C.raised} /><rect width="2" height="4" fill={C.accent} />
          </pattern>
          <pattern id="cf-back" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="4" height="4" fill={C.ink} /><rect width="2" height="4" fill={C.text} />
          </pattern>
        </defs>
        {bands.map((b, j) => (
          <g key={b.label}>
            <rect x={X0 + b.i * BW} y={Y0 - 22} width={Math.min(b.len, 12 - b.i) * BW} height={Y1 - Y0 + 22} fill={j % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'} />
            <text x={X0 + b.i * BW + 4} y={Y0 - 8} fill={C.muted} fontSize="11" fontWeight="700">{b.label}</text>
          </g>
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={cy(v)} y2={cy(v)} stroke={v === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'} strokeWidth="1" />
            <text x={X0 - 6} y={cy(v)} fill={C.muted} fontSize="12" textAnchor="end" dominantBaseline="middle">{k(v)}</text>
          </g>
        ))}
        {bars.map((b) => <rect key={b.key} x={b.x.toFixed(1)} y={b.y.toFixed(1)} width="16" height={b.h.toFixed(1)} rx={b.rx} fill={b.fill} opacity={b.op ?? 1} />)}
        <polyline points={pts} fill="none" stroke={C.text} strokeWidth="2" strokeLinejoin="round" />
        {s.left.map((v, i) => <circle key={i} cx={cx(i)} cy={cy(v)} r={i === n - 1 ? 4 : 2.5} fill={C.text} stroke={C.ink} strokeWidth="2" />)}
        {min < 0 && <text x={cx(iMin)} y={cy(min) + 16} fill={C.text} fontSize="12" fontWeight="700" textAnchor="middle">{sg(r100(min))}</text>}
        <text x={cx(n - 1) + 6} y={cy(end) - 8} fill={C.text} fontSize="12" fontWeight="700" textAnchor="end">{sg(r100(end))}</text>
        {s.months.map((m, i) => (
          <text key={m} x={cx(i)} y={H - 4} fill={C.muted} fontSize="12" textAnchor="middle">{MON[Number(m.slice(5, 7)) - 1][0]}</text>
        ))}
        {s.months.map((m, i) => <rect key={`h${m}`} x={cx(i) - 12} y={0} width={24} height={Y1} fill="transparent"><title>{tip(i)}</title></rect>)}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12, lineHeight: 1.4, color: C.muted }}>
        {key(<span style={{ width: 14, height: 0, borderTop: `2px solid ${C.text}` }} />, 'Money left')}
        {key(sq(`repeating-linear-gradient(45deg, ${C.accent} 0 1.5px, ${C.raised} 1.5px 3px)`), 'Crop share received')}
        {crops.map(([name, colour]) => key(sq(colour || C.muted), `${name} sold`))}
        {key(sq(`repeating-linear-gradient(-45deg, ${C.text} 0 1.5px, ${C.ink} 1.5px 3px)`), 'Repaid')}
        {key(sq(INPUTS), 'Inputs')}
      </div>
    </figure>
  );
}
