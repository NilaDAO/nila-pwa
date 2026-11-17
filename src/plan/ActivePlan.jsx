// CP13 (nila-design boards/CropPlanActive): her approved plan as a calendar — the season shown, what to
// do now, what is coming up, the plan year, "Update my plan". Built from the plan itself: plant (sow),
// the machine jobs (when, for), harvest, repay (due, amount). DESIGN GAPs: no "Done" chips and no
// "Done · n" group (no activity-done store yet, design Q26), no mismatch card (no crop-seen check yet,
// open-cp/3-4), no farm improvements (not in the record or plan), no "Sell" steps (not in the plan).
// As the board (21 Oct): a group without items is not shown; a coming-up row is one line — icon, task, month; the
// year bar on top of the card steps plan years; season chips above the tasks filter them (CropPlanFlow, 13 Nov). No title and
// no "Your plan" rows (the crop bars above the card's list show the plan); the plan's date is a muted line at the end.
import { useState } from 'react';
import { C, FONT } from '../shell/tokens';
import { inr } from './ui';
import { areaLabel } from './PlanResult';
import { gridsOf } from './jobGrid';

const month = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep');
// Machine jobs as the board words them ("Weed maize"); the catalogue's `for` text otherwise.
const VERB = [[/weeding/i, 'Weed'], [/spraying|spray/i, 'Spray'], [/harvest/i, 'Harvest'], [/cutting|cut/i, 'Cut']];
// The board's row icons (lucide paths, gold #D4A634).
const IC = {
  plant: 'M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z',
  weed: 'M2 22v-5l5-5 5 5-5 5zM9.5 14.5 16 8M17 2l5 5-.5.5a3.54 3.54 0 0 1-5 0 3.54 3.54 0 0 1 0-5z',
  tractor: 'M4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 17h6M4 14V7h7l2 5h6v4M8 7V4',
  cut: 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12',
  harvest: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  repay: 'M7 17 17 7M7 7h10v10',
  inputs: 'M10 2v7.31M14 9.3V1.99M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.52 16h12.96',
  transport: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14M7 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  cash: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 12h.01M18 12h.01',
};
const SLOT = { S1: 'Oct to Feb', S2: 'Mar to May', S3: 'Jun to Aug' };

/** The season she is in today: the last one that has started (the first before any has). */
export function currentSeason(seasons, today = new Date()) {
  const now = today.toISOString().slice(0, 10);
  return Math.max(0, seasons.findIndex((s, i) => !seasons[i + 1] || seasons[i + 1].start > now));
}
const job = (m, name) => { const v = VERB.find(([re]) => re.test(m.for)); return v ? `${v[1]} ${name}` : `${m.for.charAt(0).toUpperCase()}${m.for.slice(1)} · ${name}`; };
const kg = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(n).toLocaleString('en-IN')} kg`);

export function tasksOf(plan, areaNo, areaName) {
  const out = [];
  for (const [si, s] of (plan.seasons || []).entries()) {
    const at = out.length;
    for (const r of s.rows) {
      const area = typeof areaNo(r.zone) === 'number' ? areaLabel(r, areaNo, areaName) : '';
      if (r.sow && !r.continues) out.push({ date: r.sow, text: `Plant ${r.name}`, area });
      for (const m of Object.values(r.finance?.machines || {})) {
        if (m.when && m.for && !/sowing|land preparation/.test(m.for)) out.push({ date: m.when, text: job(m, r.name), area });
      }
      if (r.harvest) out.push({ date: r.harvest, text: `Harvest ${r.name}`, area: [area, r.kg ? `about ${kg(r.kg)}` : ''].filter(Boolean).join(' · ') });
    }
    const due = s.rows.map((r) => r.finance?.due).filter(Boolean).sort().pop();
    // Repay follows the detected harvest (21 days after it, LOAN_RULES §1): no calendar date on screen (25 Oct); the
    // plan's estimate only places it in the list.
    if (due && s.repay) out.push({ date: due, when: 'after harvest', text: `Repay ${inr(s.repay)}`, area: `21 days after your harvest · ${SLOT[s.slot] || ''} finance`.trim() });
    for (const t of out.slice(at)) t.season = si;
  }
  // Receive cash + vouchers: one per crop agreement, at its planned sowing (from_date), in the season it starts in; it can be
  // used from now until its last draw date (25 Oct), shown with it.
  const lastDayText = (d) => (d ? `use it by ${new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '');
  const ss = plan.seasons || [];
  for (const sh of plan.shares || []) {
    const work = sh.acres_work ?? sh.hours;
    if (!sh.from_date || (!sh.loan_amount && !work)) continue;
    const si = Math.max(0, ss.reduce((k, s, i) => (s.start <= sh.from_date ? i : k), 0));
    out.push({ date: sh.from_date, text: work ? 'Receive cash + vouchers' : 'Receive cash', share: sh.key, season: si,
      area: [typeof areaNo(sh.zone) === 'number' ? areaLabel(sh, areaNo, areaName) : '', sh.loan_amount ? inr(sh.loan_amount) : '', work ? `${Math.round(work * 100) / 100} ac of machine work` : '', lastDayText(sh.final_date), 'union office'].filter(Boolean).join(' · ') });
  }
  // Same month: she receives the cash before she plants.
  return out.sort((a, b) => a.date.slice(0, 7).localeCompare(b.date.slice(0, 7)) || (!!b.share - !!a.share) || a.date.localeCompare(b.date));
}

// The job grid (17 Nov, executive decision; replaces To do now and Coming up): one grid for every crop in the season
// shown, a small tile per action filled in its crop's colour, in time order left to right, top to bottom; the border
// says how it is paid: voucher = red, cash = green, self-organised = none; the amount in a darker strip at the bottom. A tap shows what it is worth.
// The app's red and green (17 Nov): voucher red (coral), cash green.
const VOUCHER_EDGE = C.coral;
const CASH_EDGE = '#7BA05B';
const edge = (kind) => (kind === 'voucher' ? `3px solid ${VOUCHER_EDGE}` : kind === 'cash' ? `3px solid ${CASH_EDGE}` : '3px solid transparent');
const dayMon = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// Text and icon on a crop's colour (17 Nov): black on a light colour, white on a dark one (relative luminance).
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return C.text;
  const n = parseInt(m[1], 16);
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.18 ? C.ink : '#ffffff';
}

function Legend({ grids }) {
  const sw = (style) => <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, boxSizing: 'border-box', flexShrink: 0, ...style }} />;
  const row = { display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: C.muted, flexWrap: 'wrap' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={row}>
        {[['voucher', 'Voucher'], ['cash', 'Cash'], ['self', 'Self-organised']].map(([k, t]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{sw({ background: C.raised, border: k === 'self' ? `1px solid ${C.muted}` : edge(k).replace('3px', '2px') })}{t}</span>
        ))}
      </div>
      {/* The crops by colour, each with its sowing window (no field names). */}
      <div style={row}>
        {grids.map((g) => (
          <span key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{sw({ background: g.colour || C.muted })}
            <span><b style={{ color: C.text }}>{g.crop}</b>{g.sow ? ` · sow ${dayMon(g.sow)}${g.until && g.until > g.sow ? ` – ${dayMon(g.until)}` : ''}` : ''}</span></span>
        ))}
      </div>
    </div>
  );
}

// A tap shows only what it is worth (17 Nov): the cash or voucher value; self-organised work has none.
function detailOf(t) {
  if (t.key === 'collect') return `${t.crop} · ${t.label} · ${inr(t.value)}${t.done ? ' · collected' : t.ready ? ' · ready at the union office' : ''}`;
  if (t.key === 'repay') return `${t.crop} · ${t.label} · ${inr(t.value)} · 21 days after your harvest`;
  if (t.kind === 'self') return `${t.crop} · ${t.label} · you organise it`;
  return `${t.crop} · ${t.label} · ${t.value ? inr(t.value) : '—'}`;
}

function JobGrids({ plan, si, areaNo, areaName, shares }) {
  const [open, setOpen] = useState(null);
  // TRIAL (17 Nov): the tiles as a grid or as one scrolling row, switched here to compare; one goes once chosen.
  const [asRow, setAsRow] = useState(false);
  const grids = gridsOf(plan, si, { areaNo, areaName, shares });
  if (!grids.length) return <p style={{ fontSize: 14, color: C.muted, margin: '16px 0 0' }}>Nothing is sown in this season.</p>;
  // In time order across the crops (17 Nov), not crop by crop; the same day keeps each crop's own order (stable sort).
  const tiles = grids.flatMap((g) => g.tiles.map((t) => ({ ...t, id: `${g.key}|${t.key}`, crop: g.crop, colour: g.colour })))
    .sort((a, b) => String(a.date || '9999').slice(0, 10).localeCompare(String(b.date || '9999').slice(0, 10)));
  const shown = tiles.find((t) => t.id === open);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <Legend grids={grids} />
        <span role="radiogroup" aria-label="Layout" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {[[false, 'Grid'], [true, 'Row']].map(([v, t]) => (
            <button key={t} type="button" role="radio" aria-checked={asRow === v} onClick={() => setAsRow(v)} style={{ height: 24, padding: '0 8px', borderRadius: 9999, border: 0,
              background: asRow === v ? C.accent : C.raised, color: asRow === v ? C.ink : C.muted, fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t}</button>
          ))}
        </span>
      </div>
      <div role="list" aria-label="Jobs" style={asRow
        ? { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }
        : { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoFlow: 'row', gap: 6 }}>
        {tiles.map((t) => {
          const ink = inkOn(t.colour || C.muted);
          const amount = t.value ? inr(t.value) : t.kind === 'self' ? 'You' : '—';
          return (
            <button key={t.id} type="button" role="listitem" aria-pressed={open === t.id} aria-label={detailOf(t)} onClick={() => setOpen(open === t.id ? null : t.id)}
              style={{ position: 'relative', borderRadius: 10, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                color: ink, fontFamily: FONT, cursor: 'pointer', padding: 0, background: t.colour || C.muted, border: edge(t.kind), ...(asRow ? { flex: '0 0 76px' } : {}),
                opacity: t.done ? 0.55 : 1, outline: open === t.id ? `2px solid ${C.text}` : 'none', outlineOffset: 2 }}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 2px 6px', flexGrow: 1 }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={IC[t.icon] || IC.tractor} />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>{t.label}</span>
              </span>
              {/* The amount in a darker strip at the bottom, as the crop cards' name row. */}
              <span style={{ background: 'rgba(0,0,0,0.45)', color: '#ffffff', fontSize: 11, fontWeight: 700, padding: '3px 2px', textAlign: 'center', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis' }}>{amount}</span>
              {(t.ready || t.done) && (
                <span style={{ position: 'absolute', top: 3, right: 3, fontSize: 9, fontWeight: 700, padding: '0 5px', borderRadius: 9999,
                  background: C.ink, color: t.done ? C.muted : C.accent }}>{t.done ? '✓' : 'Ready'}</span>
              )}
            </button>
          );
        })}
      </div>
      {shown && <span role="status" style={{ fontSize: 14, color: C.text }}>{detailOf(shown)}</span>}
    </div>
  );
}

/** shares: her crop agreements as A1 reads them (useMyShares): a share she can collect now (ready) is a to-do whatever its
 *  month; a drawn one is done and not listed. assist: a shared phone, where the leader extends the plan.
 *  Extend, not update (executive decision 25 Oct): `plan` is her approved chain as one (the plan and its extensions);
 *  canExtend: the cycles "Extend my plan" adds (none: it covers the next three); onExtend starts it. */
export default function ActivePlan({ plan, areaNo, areaName, season, shares, assist, today = new Date(), canExtend = [], onExtend, extending, extendError, chart, chartTitle = "This year's plan", past = false, seasons, filter }) {
  const approvedAt = plan.approval?.ts ? new Date(plan.approval.ts * 1000) : null;
  const madeOn = approvedAt && approvedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <>
      {/* 17 Nov: the job grid of the season shown replaces To do now and Coming up. */}
      {!past && <JobGrids plan={plan} si={season} areaNo={areaNo} areaName={areaName} shares={shares} />}
      {/* 13 Nov: the whole plan as crop bars, below the tasks, under its own title. */}
      {chart && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16, borderTop: `1px solid ${C.raised}`, paddingTop: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{chartTitle}</span>
          {chart}
          {/* 13 Nov: the plan's date right under its bars. */}
          {madeOn && !past && <span style={{ fontSize: 13, color: C.muted }}>Plan made {madeOn}</span>}
        </div>
      )}
      {/* 13 Nov: the "Your plan" rows are gone (the crop bars above show the plan); the extend button stays, disabled. */}
      {/* Always one year ahead: the three cycles after this one (25 Oct). The seasons planned stay as they are. */}
      {!past && <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {!canExtend.length
          ? <span style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>Your plan covers the next three seasons.</span>
          : assist
            ? <span style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>Ask your leader to extend your plan.</span>
            // Disabled for now (13 Nov, executive decision): shown, not tappable.
            : <button type="button" disabled aria-disabled="true" style={{ height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'default', opacity: 0.5 }}>
              {extending ? 'Planning…' : `Extend my plan · ${canExtend.length} season${canExtend.length > 1 ? 's' : ''}`}
            </button>}
        {extendError && <span style={{ fontSize: 14, color: C.coral }}>{extendError}</span>}
      </div>}
      {/* 13 Nov: the plan's date as a small muted line, under the bars when they show, else at the bottom. */}
      {madeOn && !chart && <p style={{ margin: '16px 0 0', fontSize: 13, color: C.muted, textAlign: 'center' }}>Plan made {madeOn}</p>}
    </>
  );
}
