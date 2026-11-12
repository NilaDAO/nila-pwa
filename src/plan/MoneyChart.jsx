// CP11, the accept screen's chart (12 Nov, with Carst): month by month, two overlapping filled areas (not stacked, not
// added up over the year): what comes in that month (the crop share at sowing, the sales at harvest) and what she keeps
// of it (in, less inputs and repayment that month; below zero in a month she pays more than she gets). Seasons as
// shaded bands. Earlier versions (bars per kind, a running "money left" line, a "what you owe" line) were too complex.
//
// Every series is a direct sum of the plan's rows (no new numbers): sales = the row's value in its harvest month (and
// 12 Nov: not the crop already in the field, named on a line under the chart); crop share = its cash and voucher value in its
// sowing month; inputs = seed, cash inputs and hand or hired work at sowing, machine work in the month it is used;
// repayment = its repay in its harvest month (she repays from that sale; the due date is 21 days after).
import { useMemo } from 'react';
import { C, FONT } from '../shell/tokens';

const W = 330, H = 210, X0 = 34, X1 = 324, Y0 = 40, Y1 = 190;
const BW = (X1 - X0) / 12;
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
  const inflow = s.months.map((_, i) => sold[i] + s.take[i]);
  const keep = s.months.map((_, i) => inflow[i] - s.inputs[i] - s.repay[i]);
  const hi = Math.max(1000, ...inflow, ...keep);
  const lo = Math.min(0, ...keep);
  const step = niceStep(hi - lo);
  const top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step;
  const cy = (v) => Y0 + ((Y1 - Y0) * (top - v)) / (top - bot);
  const cx = (i) => X0 + i * BW + BW / 2;
  const ticks = [];
  for (let v = bot; v <= top + 1e-6; v += step) ticks.push(v);
  const at = Object.fromEntries(s.months.map((m, i) => [m, i]));
  const bands = (plan.plan.seasons || []).map((se, j) => ({ i: at[ym(se.start)], len: SPAN[se.slot] || 3, label: `Season ${j + 1}` }))
    .filter((b) => b.i !== undefined);
  // A filled area from zero: the line through the months, closed along the zero line at both ends.
  const area = (vals) => `M${cx(0).toFixed(1)},${cy(0).toFixed(1)} ${vals.map((v, i) => `L${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ')} L${cx(n - 1).toFixed(1)},${cy(0).toFixed(1)} Z`;
  const line = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ');
  const best = Math.max(...keep), iBest = keep.indexOf(best);
  const worst = Math.min(...keep), iWorst = keep.indexOf(worst);
  const tip = (i) => [monthName(s.months[i]),
    s.take[i] ? `crop share ${rs(s.take[i])}` : null,
    ...s.sales[i].map((c) => `${c.name} sold ${rs(c.v)}`),
    s.inputs[i] ? `inputs −${rs(s.inputs[i])}` : null,
    s.repay[i] ? `repaid −${rs(s.repay[i])}` : null,
    `you keep ${keep[i] < 0 ? '−' : ''}${rs(keep[i])}`].filter(Boolean).join(' · ');
  const IN = 'rgba(212,207,90,0.22)';
  const key = (mark, label) => <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{mark}{label}</span>;
  const sq = (bg, border) => <span style={{ width: 12, height: 10, borderRadius: 2, background: bg, border, boxSizing: 'border-box', flexShrink: 0 }} />;

  return (
    <figure style={{ margin: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <svg role="img" aria-label={`Month by month: what comes in and what you keep. Most kept: ${rs(r100(best))} in ${monthName(s.months[iBest])}.`}
        width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', fontFamily: FONT }}>
        <defs>
          <clipPath id="cf-up"><rect x={0} y={0} width={W} height={cy(0)} /></clipPath>
          <clipPath id="cf-dn"><rect x={0} y={cy(0)} width={W} height={H} /></clipPath>
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
        <path d={area(inflow)} fill={IN} />
        <path d={line(inflow)} fill="none" stroke={C.accent} strokeWidth="1.5" strokeOpacity="0.6" strokeLinejoin="round" />
        <path d={area(keep)} fill={C.accent} clipPath="url(#cf-up)" />
        <path d={area(keep)} fill={C.coral} clipPath="url(#cf-dn)" />
        {best > 0 && <text x={cx(iBest)} y={cy(best) - 6} fill={C.text} fontSize="12" fontWeight="700" textAnchor="middle">+{k(r100(best))}</text>}
        {worst < 0 && <text x={cx(iWorst)} y={cy(worst) + 14} fill={C.text} fontSize="12" fontWeight="700" textAnchor="middle">−{rs(r100(worst))}</text>}
        {s.months.map((m, i) => (
          <text key={m} x={cx(i)} y={H - 4} fill={C.muted} fontSize="12" textAnchor="middle">{MON[Number(m.slice(5, 7)) - 1][0]}</text>
        ))}
        {s.months.map((m, i) => <rect key={`h${m}`} x={cx(i) - 12} y={0} width={24} height={Y1} fill="transparent"><title>{tip(i)}</title></rect>)}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: 8, fontSize: 12, lineHeight: 1.4, color: C.muted }}>
        {key(sq(IN, `1.5px solid ${C.accent}`), 'Comes in (crop share, sales)')}
        {key(sq(C.accent), 'You keep')}
        {worst < 0 && key(sq(C.coral), 'You pay more than you get')}
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
