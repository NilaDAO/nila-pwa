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

// The job grid (17 Nov, executive decision; replaces To do now and Coming up): per crop in the season shown, a square
// tile per action. The tile names the action; its look says how it is paid: voucher = yellow border, cash = green
// fill, self-organised = plain. A tap shows the amount, acres and month under the crop's grid.
const CASH_FILL = '#2F6B45';
const look = (kind) => (kind === 'voucher' ? { background: C.raised, border: `2px solid ${C.accent}` }
  : kind === 'cash' ? { background: CASH_FILL, border: '2px solid transparent' } : { background: C.raised, border: '2px solid transparent' });
const dayMon = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Legend() {
  const sw = (kind) => <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, boxSizing: 'border-box', ...look(kind) }} />;
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
      {[['voucher', 'Voucher'], ['cash', 'Cash'], ['self', 'Self-organised']].map(([k, t]) => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{sw(k)}{t}</span>
      ))}
    </div>
  );
}

function detailOf(t) {
  const bits = [t.label];
  if (t.acres) bits.push(`${Math.round(t.acres * 100) / 100} ac`);
  if (t.value) bits.push(inr(t.value));
  if (t.kg) bits.push(`about ${kg(t.kg)}`);
  if (t.key === 'collect') bits.push(t.done ? 'collected' : t.ready ? 'ready at the union office' : `from ${dayMon(t.date)}${t.until ? `, use it by ${dayMon(t.until)}` : ''}`);
  else if (t.afterHarvest) bits.push('21 days after your harvest');
  else if (t.date) bits.push(month(t.date));
  if (t.kind === 'self' && t.key !== 'repay') bits.push('you organise it');
  return bits.join(' · ');
}

function JobGrids({ plan, si, areaNo, areaName, shares }) {
  const [open, setOpen] = useState(null);
  const grids = gridsOf(plan, si, { areaNo, areaName, shares });
  if (!grids.length) return <p style={{ fontSize: 14, color: C.muted, margin: '16px 0 0' }}>Nothing is sown in this season.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
      <Legend />
      {grids.map((g) => {
        const shown = g.tiles.find((t) => open === `${g.key}|${t.key}`);
        return (
          <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14 }}><b>{g.crop}</b><span style={{ color: C.muted }}>{g.area ? ` · ${g.area}` : ''}{g.sow ? ` · sown ${dayMon(g.sow)}` : ''}</span></span>
            <div role="list" aria-label={g.crop} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {g.tiles.map((t) => {
                const k = `${g.key}|${t.key}`;
                return (
                  <button key={t.key} type="button" role="listitem" aria-pressed={open === k} aria-label={detailOf(t)} onClick={() => setOpen(open === k ? null : k)}
                    style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 12, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 6, color: C.text, fontFamily: FONT, cursor: 'pointer', padding: 4,
                      opacity: t.done ? 0.55 : 1, outline: open === k ? `2px solid ${C.text}` : 'none', outlineOffset: 2, ...look(t.kind) }}>
                    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t.kind === 'cash' ? C.text : C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={IC[t.icon] || IC.tractor} />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</span>
                    {(t.ready || t.done) && (
                      <span style={{ position: 'absolute', top: 6, right: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999,
                        background: t.done ? C.ink : C.accent, color: t.done ? C.muted : C.ink }}>{t.done ? '✓' : 'Ready'}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {shown && <span role="status" style={{ fontSize: 13, color: C.muted }}>{detailOf(shown)}</span>}
          </div>
        );
      })}
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
