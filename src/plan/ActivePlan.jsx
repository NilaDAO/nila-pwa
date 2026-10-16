// CP13 (nila-design boards/CropPlanActive): her approved plan as a calendar — the season shown, what to
// do now, what is coming up, the plan year, "Update my plan". Built from the plan itself: plant (sow),
// the machine jobs (when, for), harvest, repay (due, amount). DESIGN GAPs: no "Done" chips and no
// "Done · n" group (no activity-done store yet, design Q26), no mismatch card (no crop-seen check yet,
// open-cp/3-4), no farm improvements (not in the record or plan), no "Sell" steps (not in the plan).
import { C } from '../shell/tokens';
import { Primary, inr, muted } from './ui';

const month = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short' });
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
// Machine jobs as the board words them ("Weed maize"); the catalogue's `for` text otherwise.
const VERB = [[/weeding/i, 'Weed'], [/spraying|spray/i, 'Spray'], [/harvest/i, 'Harvest'], [/cutting|cut/i, 'Cut']];
const SLOT = { S1: 'Oct to Feb', S2: 'Mar to May', S3: 'Jun to Aug' };
const job = (m, name) => { const v = VERB.find(([re]) => re.test(m.for)); return v ? `${v[1]} ${name}` : `${m.for.charAt(0).toUpperCase()}${m.for.slice(1)} · ${name}`; };
const kg = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(n).toLocaleString('en-IN')} kg`);

export function tasksOf(plan, areaNo) {
  const out = [];
  for (const s of plan.seasons || []) {
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
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function Row({ t }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
      <span><b>{t.text}</b><br /><span style={muted}>{[month(t.date), t.area].filter(Boolean).join(' · ')}</span></span>
    </div>
  );
}

export default function ActivePlan({ plan, areaNo, today = new Date(), onUpdate }) {
  const seasons = plan.plan.seasons || [];
  const now = today.toISOString().slice(0, 10);
  const idx = Math.max(0, seasons.findIndex((s, i) => !seasons[i + 1] || seasons[i + 1].start > now));
  const season = seasons[idx];
  const lastDue = seasons.flatMap((s) => s.rows.map((r) => r.finance?.due)).filter(Boolean).sort().pop();
  const end = season?.rows.map((r) => r.harvest).filter(Boolean).sort().pop();
  const tasks = tasksOf(plan.plan, areaNo).filter((t) => t.date >= now.slice(0, 7));
  const thisMonth = tasks.filter((t) => t.date.slice(0, 7) === now.slice(0, 7));
  const later = tasks.filter((t) => t.date.slice(0, 7) > now.slice(0, 7)).slice(0, 8);
  const approvedAt = plan.approval?.ts ? new Date(plan.approval.ts * 1000) : null;
  return (
    <>
      {season && <p style={{ textAlign: 'center', fontWeight: 700, margin: '0 0 4px' }}>Season {idx + 1} · {monthYear(season.start)}{end ? ` to ${monthYear(end)}` : ''}</p>}
      {approvedAt && <p style={{ ...muted, textAlign: 'center' }}>Your plan · {approvedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>To do now</h2>
      {thisMonth.length ? thisMonth.map((t) => <Row key={t.date + t.text + t.area} t={t} />) : <p style={muted}>Nothing this month.</p>}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>Coming up</h2>
      {later.map((t) => <Row key={t.date + t.text + t.area} t={t} />)}
      <div style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', marginTop: 8 }}>
        <b>Your plan</b>
        {seasons[0] && lastDue && <div style={muted}>Plan year {monthYear(seasons[0].start)} to {monthYear(lastDue)}</div>}
        <div style={muted}>Now Season {idx + 1} of {seasons.length}{idx === seasons.length - 1 ? ' · last season' : ''}</div>
      </div>
      <Primary onClick={onUpdate}>{idx === seasons.length - 1 ? 'Plan next year' : 'Update my plan'}</Primary>
    </>
  );
}
