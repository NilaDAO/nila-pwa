// CP13 (nila-design boards/CropPlanActive): her approved plan as a calendar — the season shown, what to
// do now, what is coming up, the plan year, "Update my plan". Built from the plan itself: plant (sow),
// the machine jobs (when, for), harvest, repay (due, amount). DESIGN GAPs: no "Done" chips and no
// "Done · n" group (no activity-done store yet, design Q26), no mismatch card (no crop-seen check yet,
// open-cp/3-4), no farm improvements (not in the record or plan), no "Sell" steps (not in the plan).
// As the board (21 Oct): a group without items is not shown; a coming-up row is one line — icon, task, month; the
// season bar on top of the card steps through the seasons (the map's chips follow, CropPlanFlow); the card title is
// "Your plan · <approval date>" in the season she is in, "<months> season" in the others.
import { C, FONT } from '../shell/tokens';
import { inr } from './ui';

const month = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep');
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).replace('Sept', 'Sep');
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
  cash: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 12h.01M18 12h.01',
};
const iconOf = (text) => (/^Receive/.test(text) ? 'cash' : /^Plant/.test(text) ? 'plant' : /^Weed/.test(text) ? 'weed' : /^Cut/.test(text) ? 'cut'
  : /^Harvest/.test(text) ? 'harvest' : /^Repay/.test(text) ? 'repay' : 'tractor');
const SLOT = { S1: 'Oct to Feb', S2: 'Mar to May', S3: 'Jun to Aug' };

/** The season she is in today: the last one that has started (the first before any has). */
export function currentSeason(seasons, today = new Date()) {
  const now = today.toISOString().slice(0, 10);
  return Math.max(0, seasons.findIndex((s, i) => !seasons[i + 1] || seasons[i + 1].start > now));
}
const job = (m, name) => { const v = VERB.find(([re]) => re.test(m.for)); return v ? `${v[1]} ${name}` : `${m.for.charAt(0).toUpperCase()}${m.for.slice(1)} · ${name}`; };
const kg = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(n).toLocaleString('en-IN')} kg`);

export function tasksOf(plan, areaNo) {
  const out = [];
  for (const [si, s] of (plan.seasons || []).entries()) {
    const at = out.length;
    for (const r of s.rows) {
      const no = areaNo(r.zone);
      const area = typeof no === 'number' ? `Area ${no}` : '';
      if (r.sow && !r.continues) out.push({ date: r.sow, text: `Plant ${r.name}`, area });
      for (const m of Object.values(r.finance?.machines || {})) {
        if (m.when && m.for && !/sowing|land preparation/.test(m.for)) out.push({ date: m.when, text: job(m, r.name), area });
      }
      if (r.harvest) out.push({ date: r.harvest, text: `Harvest ${r.name}`, area: [area, r.kg ? `about ${kg(r.kg)}` : ''].filter(Boolean).join(' · ') });
    }
    const due = s.rows.map((r) => r.finance?.due).filter(Boolean).sort().pop();
    if (due && s.repay) out.push({ date: due, text: `Repay ${inr(s.repay)}`, area: `${SLOT[s.slot] || ''} finance`.trim() });
    for (const t of out.slice(at)) t.season = si;
  }
  // Receive cash + vouchers: one per crop share, from its from_date (the season's SOS), in the season it starts in.
  const ss = plan.seasons || [];
  for (const sh of plan.shares || []) {
    if (!sh.from_date || (!sh.loan_amount && !sh.hours)) continue;
    const si = Math.max(0, ss.reduce((k, s, i) => (s.start <= sh.from_date ? i : k), 0));
    const no = areaNo(sh.zone);
    out.push({ date: sh.from_date, text: sh.hours ? 'Receive cash + vouchers' : 'Receive cash', share: sh.key, season: si,
      area: [typeof no === 'number' ? `Area ${no}` : '', sh.loan_amount ? inr(sh.loan_amount) : '', sh.hours ? `${sh.hours} h` : '', 'union office'].filter(Boolean).join(' · ') });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// To do now: a raised row with the task's area under it; coming up: one plain line (board CropPlanActive).
function Row({ t, now }) {
  return (
    <div role="listitem" aria-label={`${t.text}, ${month(t.date)}, ${now ? 'to do' : 'coming up'}`}
      style={{ display: 'flex', alignItems: now ? 'center' : 'flex-start', gap: 10, borderRadius: 12, fontSize: 14, lineHeight: 1.5,
        ...(now ? { background: C.raised, padding: '12px 16px' } : { padding: '8px 0' }) }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        <path d={IC[iconOf(t.text)]} />
      </svg>
      <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ display: 'flex', gap: 10 }}>
          <span style={{ flexGrow: 1, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.text}</span>
          <span style={{ whiteSpace: 'nowrap', color: C.muted }}>{month(t.date)}</span>
        </span>
        {now && t.area && <span style={{ color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.area}</span>}
      </span>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, textAlign: 'right', color: C.text }}>{v}</span>
    </div>
  );
}

function Group({ name, items, now }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{name}</span>
      <div role="list" aria-label={name} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((t) => <Row key={t.date + t.text + t.area} t={t} now={now} />)}
      </div>
    </div>
  );
}

/** shares: her crop shares as A1 reads them (useMyShares): a share she can collect now (ready) is a to-do whatever its
 *  month; a drawn one is done and not listed. assist: a shared phone, where the leader updates the plan. */
export default function ActivePlan({ plan, areaNo, season, shares, assist, today = new Date(), onUpdate }) {
  const seasons = plan.plan.seasons || [];
  const now = today.toISOString().slice(0, 10);
  const idx = currentSeason(seasons, today);
  const shown = Math.min(season ?? idx, Math.max(0, seasons.length - 1));
  const lastDue = seasons.flatMap((s) => s.rows.map((r) => r.finance?.due)).filter(Boolean).sort().pop();
  const byKey = Object.fromEntries((shares || []).map((x) => [x.share?.key || x.share, x]));
  const all = tasksOf(plan.plan, areaNo).filter((t) => t.season === shown && !(t.share && byKey[t.share]?.drawn));
  const ready = (t) => !!(t.share && byKey[t.share]?.ready);
  const thisMonth = all.filter((t) => ready(t) || (t.date.slice(0, 7) === now.slice(0, 7) && !(t.share && byKey[t.share] && !ready(t))));
  const later = all.filter((t) => !thisMonth.includes(t) && t.date.slice(0, 7) > now.slice(0, 7));
  const approvedAt = plan.approval?.ts ? new Date(plan.approval.ts * 1000) : null;
  const title = shown === idx && approvedAt
    ? `Your plan · ${approvedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${SLOT[seasons[shown]?.slot] || 'This'} season`;
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', padding: '8px 0' }}>{title}</div>
      <Group name="To do now" items={thisMonth} now />
      <Group name="Coming up" items={later} />
      {/* Your plan (board CropPlanActive): a group like the others — Plan year and Now as rows, then the secondary button. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>Your plan</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {seasons[0] && lastDue && <KV k="Plan year" v={`${monthYear(seasons[0].start)} to ${monthYear(lastDue)}`} />}
          <KV k="Now" v={`Season ${idx + 1} of ${seasons.length}${idx === seasons.length - 1 ? ' · last season' : ''}`} />
        </div>
        {assist
          ? <span style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>Ask your leader to update your plan.</span>
          : <button type="button" onClick={onUpdate} style={{ height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' }}>
            {idx === seasons.length - 1 ? 'Plan next year' : 'Update my plan'}
          </button>}
      </div>
    </>
  );
}
