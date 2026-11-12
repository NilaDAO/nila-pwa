// CP11, the accept screen's chart (12 Nov, rethought with Carst; back to bars and the line after a month-by-month area
// version: money comes at once, not as a build-up): one chart for the whole plan year. Seasons as shaded
// bands with their names; up at sowing the crop share received (hatched yellow); at harvest the sale in the crop's
// colour, the part repaid from it hatched over its top; inputs (grey) below zero; what she owes as one white line.
// The scale follows the crop share, not the sales (12 Nov, option B): a sale taller than the chart is cut at its top
// with its amount written above it. No running "money left" line: a year of estimated sales added up looked unreal.
//
// Every series is a direct sum of the plan's rows (no new numbers): sales = the row's value in its harvest month (and
// 12 Nov: not the crop already in the field, named on a line under the chart); crop share = its cash and voucher value in its
// sowing month; inputs = seed, cash inputs and hand or hired work at sowing, machine work in the month it is used;
// repayment = its repay in its harvest month (she repays from that sale; the due date is 21 days after).
import { useMemo } from 'react';
import { C, FONT } from '../shell/tokens';

const W = 330, H = 210, X0 = 34, X1 = 324, Y0 = 40, Y1 = 190;
const BW = (X1 - X0) / 12;
const INPUTS = '#64748B';
const SPAN = { S1: 5, S2: 3, S3: 3 };   // months in the season
const ym = (d) => (d ? d.slice(0, 7) : null);
const rs = (v) => `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
const k = (v) => (v === 0 ? '₹0' : `${v < 0 ? '−' : ''}₹${Math.abs(v) >= 1000 ? `${Math.abs(v) / 1000}k` : Math.abs(v)}`);
const r100 = (v) => Math.round(v / 100) * 100;

function niceStep(range) {
  const raw = range / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
}

/** All the plan's rows that carry a crop share: the seasons' rows and the green manures. */
const financedRows = (p) => [...(p.seasons || []).flatMap((s) => s.rows), ...(p.soil_cover || []).filter((c) => c.finance)];

/** What she gets (cash and machine vouchers), the interest on it, and when she repays (the headline). */
export function repayment(plan) {
  const rows = financedRows(plan.plan).filter((r) => r.finance?.repay);
  const dues = [...new Set(rows.map((r) => ym(r.finance.due)).filter(Boolean))].sort();
  const get = rows.reduce((a, r) => a + (r.finance.cash || 0) + (r.finance.voucher_value || 0), 0);
  const total = rows.reduce((a, r) => a + r.finance.repay, 0);
  return { get, interest: total - get, total, parts: dues.length, first: dues[0], last: dues[dues.length - 1] };
}

/** The chart's numbers from the plan (months from the node's cashflow, the 12 months of her plan year). */
export function series(plan) {
  const p = plan.plan;
  const months = (p.cashflow || []).map((m) => m.month);
  const at = Object.fromEntries(months.map((m, i) => [m, i]));
  const z = () => new Array(months.length).fill(0);
  const sales = months.map(() => []), take = z(), inputs = z(), repay = z(), principal = z();
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
    if (back !== undefined) { repay[back] += f.repay || 0; principal[back] += (f.cash || 0) + (f.voucher_value || 0); }
  }
  // Harvest work and transport (12 Nov): hers, at harvest; usually none yet (no figures in the catalogue).
  for (const r of financedRows(p)) {
    const h = at[ym(r.harvest)];
    if (h !== undefined && r.finance?.harvest_cost) inputs[h] += r.finance.harvest_cost;
  }
  // The crop already in the field (plan.standing_sales) is not in the chart (12 Nov): its costs fell before the plan,
  // so its sale alone would read as profit. It is named on one line under the chart.
  // What she owes (12 Nov, option B): the crop share received, less what is paid back of it (interest apart).
  let o = 0;
  const owed = months.map((_, i) => { o = Math.max(0, o + take[i] - principal[i]); return o; });
  return { months, sales, take, inputs, repay, owed };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => { const [y, mo] = m.split('-').map(Number); return `${MON[mo - 1]} ${y}`; };

export default function MoneyChart({ plan }) {
  const s = useMemo(() => series(plan), [plan]);
  const n = s.months.length;
  if (!n) return null;
  const sold = s.sales.map((x) => x.reduce((t, c) => t + c.v, 0));
  const fromSale = s.months.map((_, i) => Math.min(s.repay[i], sold[i]));
  // The scale: the crop share, what she owes and what she repays; sales are cut at the top.
  const hi = Math.max(1000, ...s.take, ...s.owed, ...s.repay) * 1.25;
  const lo = Math.min(0, ...s.months.map((_, i) => -(s.inputs[i] + s.repay[i] - fromSale[i])));
  const step = niceStep(hi - lo);
  const top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step;
  const cy = (v) => Y0 + ((Y1 - Y0) * (top - Math.min(v, top))) / (top - bot);
  const cx = (i) => X0 + i * BW + BW / 2;
  const ticks = [];
  for (let v = bot; v <= top + 1e-6; v += step) ticks.push(v);

  // Season bands: from each season's first month, its length (S1 Oct–Feb, S2 Mar–May, S3 Jun–Aug).
  const at = Object.fromEntries(s.months.map((m, i) => [m, i]));
  const bands = (plan.plan.seasons || []).map((se, j) => ({ i: at[ym(se.start)], len: SPAN[se.slot] || 3, label: `Season ${j + 1}` }))
    .filter((b) => b.i !== undefined);

  const bars = [], cut = [];
  s.months.forEach((_, i) => {
    const x = cx(i) - 8;
    // Up: the crop share received, then the sales in their crop colours (a crop in the field now is faded).
    const ups = [['url(#cf-in)', s.take[i], 1], ...s.sales[i].map((c) => [c.colour || C.muted, c.v, c.standing ? 0.55 : 1])].filter(([, v]) => v > 0);
    let base = 0;
    ups.forEach(([fill, v, op], j) => {
      if (base >= top) return;
      const y2 = cy(base) - (j === 0 ? 1 : 2), y1 = cy(base + v);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: j === ups.length - 1 || base + v > top ? 3 : 0, fill, op, key: `u${i}${j}` });
      base += v;
    });
    if (base > top) cut.push({ i, v: sold[i] });
    // The repaid part of the month's sale: hatched over the top of the (shown) sale; what the sale cannot cover goes
    // below zero.
    if (fromSale[i] > 0) {
      const shownTop = Math.min(base, top);
      const y1 = cy(shownTop), y2 = cy(Math.max(shownTop - fromSale[i], 0));
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: 3, fill: 'url(#cf-back)', key: `r${i}` });
    }
    base = 0;
    const dns = [[INPUTS, s.inputs[i]], ['url(#cf-back)', s.repay[i] - fromSale[i]]].filter(([, v]) => v > 0);
    dns.forEach(([fill, v], j) => {
      const y1 = cy(base) + (j === 0 ? 1 : 2), y2 = cy(base - v);
      bars.push({ x, y: y1, h: Math.max(y2 - y1, 0.5), rx: j === dns.length - 1 ? 3 : 0, fill, key: `d${i}${j}` });
      base -= v;
    });
  });
  const pts = s.owed.map((v, i) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ');
  const peak = Math.max(...s.owed), iPeak = s.owed.indexOf(peak);
  const crops = [...new Map(s.sales.flat().map((c) => [c.name, c.colour])).entries()];
  const tip = (i) => [monthName(s.months[i]),
    s.take[i] ? `crop share received ${rs(s.take[i])}` : null,
    ...s.sales[i].map((c) => `${c.name} sold ${rs(c.v)}`),
    s.repay[i] ? `repaid ${rs(s.repay[i])}` : null,
    s.inputs[i] ? `inputs −${rs(s.inputs[i])}` : null,
    `you owe ${rs(s.owed[i])}`].filter(Boolean).join(' · ');
  const key = (mark, label) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{mark}{label}</span>
  );
  const sq = (bg) => <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, flexShrink: 0 }} />;

  return (
    <figure style={{ margin: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <svg role="img" aria-label={`What you owe each month: at most ${rs(r100(peak))} in ${monthName(s.months[iPeak])}, paid back from your harvests.`}
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
            <rect x={X0 + b.i * BW} y={0} width={Math.min(b.len, 12 - b.i) * BW} height={Y1} fill={j % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'} />
            <text x={X0 + b.i * BW + 4} y={13} fill={C.muted} fontSize="11" fontWeight="700">{b.label}</text>
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
        {s.owed.map((v, i) => <circle key={i} cx={cx(i)} cy={cy(v)} r={2.5} fill={C.text} stroke={C.ink} strokeWidth="2" />)}
        {/* A sale cut at the top: its amount above it. */}
        {cut.map((c) => <text key={`c${c.i}`} x={cx(c.i)} y={Y0 - 6} fill={C.text} fontSize="11" fontWeight="700" textAnchor="middle">{k(r100(c.v))}↑</text>)}
        {s.months.map((m, i) => (
          <text key={m} x={cx(i)} y={H - 4} fill={C.muted} fontSize="12" textAnchor="middle">{MON[Number(m.slice(5, 7)) - 1][0]}</text>
        ))}
        {s.months.map((m, i) => <rect key={`h${m}`} x={cx(i) - 12} y={0} width={24} height={Y1} fill="transparent"><title>{tip(i)}</title></rect>)}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: 8, fontSize: 12, lineHeight: 1.4, color: C.muted }}>
        {key(<span style={{ width: 14, height: 0, borderTop: `2px solid ${C.text}` }} />, 'What you owe')}
        {key(sq(`repeating-linear-gradient(45deg, ${C.accent} 0 1.5px, ${C.raised} 1.5px 3px)`), 'Crop share received')}
        {crops.map(([name, colour]) => key(sq(colour || C.muted), `${name} sold`))}
        {key(sq(`repeating-linear-gradient(-45deg, ${C.text} 0 1.5px, ${C.ink} 1.5px 3px)`), 'Repaid')}
        {key(sq(INPUTS), 'Inputs')}
      </div>
      {[...(plan.plan.standing_sales || []).reduce((m, st) => {
        const x = m.get(st.name) || { name: st.name, v: 0, month: st.harvest };
        x.v += st.value; if (st.harvest > x.month) x.month = st.harvest;
        return m.set(st.name, x);
      }, new Map()).values()].map((x) => (
        <p key={x.name} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.muted }}>
          {x.name} already in your field: you sell about {rs(r100(x.v))} around {monthName(ym(x.month))}. Not part of this plan, so not in the chart.
        </p>
      ))}
    </figure>
  );
}
