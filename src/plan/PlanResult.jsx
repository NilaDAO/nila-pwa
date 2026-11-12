// CP10 (board CropPlanQ3-xdlz): the map is the list. The bar on top of the card switches seasons (overview) or
// slides through her areas (an area picked); the area card shows her year as bars, its sales, and Accept Area N.
// Spec: nila-design notes/page-member.md "cp-result". DESIGN GAPs, not built: Split this area and Merge with other
// areas (no node call yet). A crop is changed on its season row (28 Oct): a tap opens a list of the catalogue's crops.
import { useRef, useState } from 'react';
import { C, FONT, R } from '../shell/tokens';
import { Notice, inr, muted } from './ui';

export const SEASON = { S1: 'Oct–Feb', S2: 'Mar–May', S3: 'Jun–Aug' };
const SPAN = { S1: 4, S2: 2, S3: 2 };   // months after the season's first month
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AXIS = ['O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S'];
export const fmtKg = (kg) => (kg >= 1000 ? `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(kg).toLocaleString('en-IN')} kg`);

/** "Season 1 · Oct 2026 to Feb 2027", "Season 2 · Mar to May 2027". */
export function seasonLabel(s, i) {
  const a = new Date(s.start);
  const b = new Date(a.getFullYear(), a.getMonth() + (SPAN[s.slot] ?? 2), 1);
  const from = a.getFullYear() === b.getFullYear() ? MON[a.getMonth()] : `${MON[a.getMonth()]} ${a.getFullYear()}`;
  return `Season ${i + 1} · ${from} to ${MON[b.getMonth()]} ${b.getFullYear()}`;
}

/** The plan year a date falls in: October to September, named by the year it starts in. */
export const planYear = (d) => { const t = new Date(d || Date.now()); return t.getMonth() >= 9 ? t.getFullYear() : t.getFullYear() - 1; };
/** Her plan year on the bar (12 Nov: just the years): "2026–27". */
export function yearLabel(seasons, y = planYear(seasons?.[0]?.start)) {
  return `${y}–${String(y + 1).slice(2)}`;
}

/** A row's areas: areas with the same crop in a season are one row (executive decision 21 Oct), `zones` lists them. */
export const zonesOf = (r) => r.zones || [r.zone];
/** "Area 1" or, merged, "Area 1 + 2". */
// areaName (12 Nov): the record's names for the areas (after their field), else "Area n".
export const areaLabel = (r, areaNo, areaName) => (areaName ? zonesOf(r).map(areaName).join(' + ') : `Area ${zonesOf(r).map(areaNo).join(' + ')}`);

/** The row on each area in season i (a merged row on each of its areas); a whole-year crop from an earlier season
 *  carries on. */
export function rowsInSeason(seasons, i) {
  const out = {};
  (seasons || []).slice(0, i + 1).forEach((s, k) => s.rows.forEach((r) => {
    for (const z of zonesOf(r)) if (k === i || (r.continues && !out[z])) out[z] = r;
  }));
  return out;
}

const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const ringsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);
const centre = (g) => { const pts = ringsOf(g).flat(); return pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : null; };

/** How many of her fields (record meta.geometry.field_features) lie in an area; 0 when the record has none. */
export function fieldsIn(record, zone) {
  const rings = ringsOf(zone?.geometry);
  const fc = record?.meta?.geometry?.field_features;   // a GeoJSON FeatureCollection
  const feats = Array.isArray(fc) ? fc : fc?.features;
  if (!rings.length || !Array.isArray(feats)) return 0;
  return feats.filter((f) => { const c = centre(f.geometry || f); return c && rings.some((r) => inRing(c, r)); }).length;
}

const barBtn = { width: 44, height: 44, border: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' };
const Chevron = ({ left }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={left ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
);

/** The bar on top of the card: ‹ label ›, and a swipe sideways does the same. */
export function SlideBar({ label, onPrev, onNext, prevLabel, nextLabel }) {
  const x0 = useRef(null);
  return (
    <div role="group" aria-label={prevLabel.replace(/^Previous /, '')}
      onPointerDown={(e) => { x0.current = e.clientX; }}
      onPointerUp={(e) => { const dx = x0.current == null ? 0 : e.clientX - x0.current; x0.current = null; if (dx > 40) onPrev(); else if (dx < -40) onNext(); }}
      style={{ height: 44, borderRadius: 16, background: 'rgba(18,18,18,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', touchAction: 'pan-y', fontFamily: FONT }}>
      <button type="button" aria-label={prevLabel} onClick={onPrev} style={barBtn}><Chevron left /></button>
      <span aria-live="polite" style={{ flexGrow: 1, textAlign: 'center', fontSize: 14, lineHeight: 1.5, color: C.text }}>{label}</span>
      <button type="button" aria-label={nextLabel} onClick={onNext} style={barBtn}><Chevron /></button>
    </div>
  );
}

/** A crop key from the record ("sugarcane_ratoon") as the catalogue's crop: its name and colour; no key = Unidentified. */
export function cropLook(key, crops = []) {
  if (!key || key === 'unknown') return { name: 'Unidentified', colour: '#8A94A6' };
  const hit = crops.find((x) => x.key === key) || crops.find((x) => key.startsWith(`${x.key}_`));
  return { name: hit && hit.key === key ? hit.name : key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), colour: hit?.colour || '#7BA05B' };
}

/** The record's finished cycles (12 Nov: plan history): those on an area that overlap plan year y0. */
export function pastCycles(record, zone, y0) {
  const today = new Date().toISOString().slice(0, 10);
  const from = `${y0}-10-01`, to = `${y0 + 1}-10-01`;
  return (Array.isArray(record?.cycles) ? record.cycles : [])
    .filter((c) => c.zone_id === zone && c.sos && c.eos && c.eos <= today && c.eos > from && c.sos < to);
}

/** The first plan year the record holds a finished cycle in (the year bar steps back to it). */
export const firstRecordYear = (record) => {
  const ys = (Array.isArray(record?.cycles) ? record.cycles : []).filter((c) => c.sos && c.eos).map((c) => planYear(c.sos));
  return ys.length ? Math.min(...ys) : null;
};

/** The map in a past year: each area's main crop that year (the cycle that covers most of it). */
export function pastLabels(record, zones, y0, crops) {
  const a = new Date(`${y0}-10-01`).getTime(), b = new Date(`${y0 + 1}-10-01`).getTime();
  const days = (c) => Math.min(b, new Date(c.eos).getTime()) - Math.max(a, new Date(c.sos).getTime());
  const out = {};
  for (const z of zones) {
    const best = pastCycles(record, z, y0).sort((x, y) => days(y) - days(x))[0];
    if (!best) continue;
    const look = cropLook(best.crop_type, crops);
    out[z] = { text: look.name, sub: yearLabel(null, y0), colour: look.colour, unknown: !best.crop_type };
  }
  return out;
}

const monthsFrom = (y0) => (d) => { const t = new Date(d); return (t.getFullYear() - y0) * 12 + t.getMonth() - 9 + (t.getDate() - 1) / 31; };

/** One area's year as bars on one lane (12 Nov): crops follow each other, so one lane holds them all, the crop's name in
 *  its bar. Crops in their colour; soil covers hatched; a crop she picked and has not sent yet in its colour.
 *  → [{ key, slot, s0, s1, name, fill, ink, editable, row }] for plan year y0 (months 0–12 from October). */
export function laneOf(plan, zone, { y0, picked = {}, cropOf = () => null, readOnly, record, crops } = {}) {
  const at = monthsFrom(y0);
  const clamp = (a, b) => { const s0 = Math.max(0, Math.min(12, at(a))); return [s0, Math.max(s0 + 0.3, Math.min(12, at(b)))]; };
  const out = [];
  const taken = new Set();
  // What grew before (12 Nov): the record's finished cycles, faded, never changed here.
  for (const c of pastCycles(record, zone, y0)) {
    const [s0, s1] = clamp(c.sos, c.eos);
    const look = cropLook(c.crop_type, crops);
    out.push({ key: `past-${c.sos}`, s0, s1, name: look.name, fill: look.colour, ink: lightBg(look.colour) ? C.ink : C.text,
      faded: true, editable: false, row: {} });
  }
  // The crop in the field now (12 Nov, plan.standing): a faded bar until its (estimated) end of season, before the
  // plan's first crop there. Set on the field record, so not changed here.
  for (const st of (plan.plan.standing || []).filter((x) => x.zone === zone)) {
    if (at(st.until) <= 0) continue;
    const s0 = Math.max(0, Math.min(12, at(st.sow || st.until)));
    const s1 = Math.max(s0 + 0.3, Math.min(12, at(st.until)));
    const m = MON[new Date(st.until).getMonth()];
    out.push({ key: `standing-${st.crop}`, s0, s1, name: `${st.name}, until ${st.estimate ? '~' : ''}${m}`, fill: st.colour || C.muted,
      ink: lightBg(st.colour) ? C.ink : C.text, faded: true, editable: false, row: {} });
  }
  for (const se of plan.plan.seasons || []) {
    for (const r of se.rows.filter((x) => zonesOf(x).includes(zone))) {
      if (at(r.harvest) <= 0 || at(r.sow) >= 12) continue;
      const [s0, s1] = clamp(r.sow, r.harvest);
      const pick = picked[se.slot] && cropOf(picked[se.slot]);
      const colour = (pick && pick.colour) || r.colour || C.muted;
      taken.add(se.slot);
      out.push({ key: `${se.slot}-${r.crop}`, slot: se.slot, s0, s1, name: pick ? pick.name : r.name, fill: colour,
        ink: lightBg(colour) ? C.ink : C.text, editable: !readOnly, row: { ...r, slot: se.slot } });
    }
  }
  for (const c of (plan.plan.soil_cover || []).filter((x) => x.zone === zone)) {
    const from = c.mulch_first || !c.sow ? c.from : c.sow;
    if (at(c.turn_in || c.until) <= 0 || at(from) >= 12) continue;
    const [s0, s1] = clamp(from, c.turn_in || c.until);
    const slot = (c.slots || [])[0];
    const short = c.name.replace(/^(Mulch, then )?green manure: /i, '').replace(/ \(.*\)$/, '');
    const pick = slot && !taken.has(slot) && picked[slot] && cropOf(picked[slot]);
    const label = pick ? pick.name : c.kind === 'bare' ? 'Bare' : c.kind === 'mulch' ? 'Mulch' : short.charAt(0).toUpperCase() + short.slice(1);
    const fill = pick ? pick.colour || C.muted : c.kind === 'bare' ? `repeating-linear-gradient(45deg, ${C.coral} 0 3px, transparent 3px 6px)`
      : `repeating-linear-gradient(45deg, ${c.colour || '#7FB069'} 0 3px, rgba(127,176,105,0.25) 3px 6px)`;
    // A soil cover is advice (21 Oct): a crop may be picked in its season instead (28 Oct).
    out.push({ key: `soil-${c.from}`, slot, s0, s1, name: label, fill, ink: C.text, soil: true, cover: c,
      editable: !readOnly && !!slot && !taken.has(slot), row: { slot } });
  }
  return out.sort((a, b) => a.s0 - b.s0);
}

/** One lane: the bars with their names inside. onBar(item): a bar tapped (its crops open); open: the open bar's key. */
export function Lane({ items, height = 40, onBar, open }) {
  return (
    <div style={{ position: 'relative', height }}>
      {items.map((it) => {
        const style = { position: 'absolute', left: `${(it.s0 / 12) * 100}%`, width: `calc(${((it.s1 - it.s0) / 12) * 100}% - 2px)`, top: 0, bottom: 0,
          borderRadius: 6, background: it.fill, opacity: it.faded ? 0.4 : 1, color: it.ink, border: open === it.key ? `2px solid ${C.text}` : 0, padding: '0 6px', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', fontFamily: FONT, fontSize: 12, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap',
          textShadow: it.soil ? '0 0 3px #000' : undefined };
        const text = <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>;
        return onBar && it.editable
          ? <button key={it.key} type="button" aria-label={`Change ${it.name}`} aria-expanded={open === it.key} onClick={() => onBar(it)} style={{ ...style, cursor: 'pointer' }}>{text}</button>
          : <span key={it.key} title={it.name} style={style}>{text}</span>;
      })}
    </div>
  );
}

export const MonthAxis = ({ inset = 0 }) => (
  <div aria-hidden="true" style={{ display: 'flex', marginLeft: inset, fontSize: 12, lineHeight: '16px', color: C.muted }}>
    {AXIS.map((m, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{m}</span>)}
  </div>
);

/** The area card (an area picked): her year as bars, sales, Back and Accept Area N. */
// Ink on a light crop colour, white on a dark one (black gram's grey, Cumbu Napier's green).
const lightBg = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 140;
};

export const sortedCrops = (crops) => (crops || []).slice().sort((a, b) => a.name.localeCompare(b.name));

/** One area's crop in one season, picked from the catalogue (28 Oct): the crops as chips inside the row itself, which
 *  grows to hold them (no list over the map); the crop now is marked. A tap on another crop sends the change.
 *  label: a line above the chips (the overview's "Area N"). */
export function CropSelect({ label, crops, current, currentName, disabled, onPick }) {
  const list = current && !crops.some((c) => c.key === current) ? [{ key: current, name: currentName || current }, ...crops] : crops;
  return (
    <div role="group" aria-label={`Crop${label ? ` for ${label}` : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 2px' }}>
      {label && <span style={{ fontSize: 14, fontWeight: 700 }}>{label}{!current && <span style={{ color: C.muted, fontWeight: 400 }}> · no crop</span>}</span>}
      {/* The month selector's style (CP intake, 28 Oct): a grid of buttons in the crop's colour; the crop now is full,
          the others faded; no ring. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {list.map((c) => {
          const on = c.key === current;
          return (
            <button key={c.key} type="button" disabled={disabled} aria-pressed={on} onClick={() => { if (!on) onPick(c.key); }}
              style={{ minHeight: 44, padding: '4px 6px', borderRadius: 12, border: 0, background: c.colour || C.muted, opacity: disabled ? 0.3 : on ? 1 : 0.45,
                color: lightBg(c.colour) ? C.ink : C.text, fontFamily: FONT, fontSize: 13, fontWeight: 700, lineHeight: 1.2, cursor: on || disabled ? 'default' : 'pointer' }}>
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** How a crop's cost is made (12 Nov): every action with its price, all from the plan's rows (the node's reference
 *  tables, no AI): seed and inputs per acre, each machine job per acre (a voucher), hired work, interest; the sale as
 *  kg × price. k: this area's share of a row merged with other areas. */
export function CostList({ r, k = 1 }) {
  const f = r.finance || {};
  const ac = (r.acres || 0) * k;
  const n = (v) => Math.round((v || 0) * k);
  const per = (v) => (ac ? ` · ${inr(Math.round(n(v) / ac))}/acre` : '');
  const lines = [
    f.seed ? ['Seed', `${ac.toFixed(2)} acres${per(f.seed)}`, n(f.seed)] : null,
    f.cash_inputs ? ['Fertiliser and sprays', `${ac.toFixed(2)} acres${per(f.cash_inputs)}`, n(f.cash_inputs)] : null,
    ...Object.values(f.machines || {}).map((m) => [m.for.replace(/^./, (c) => c.toUpperCase()), `${(m.acres * k).toFixed(2)} acres${m.acres ? ` · ${inr(Math.round(m.value / m.acres))}/acre` : ''} · voucher`, n(m.value)]),
    ...Object.values(f.hand_work || {}).map((m) => [`${m.for.replace(/^./, (c) => c.toUpperCase())}, hired`, `${(m.acres * k).toFixed(2)} acres · ${inr(m.rate_inr_acre)}/acre · no union machine`, n(m.value)]),
  ].filter(Boolean);
  if (f.harvest_cost) lines.push(['Harvest work and transport', `${ac.toFixed(2)} acres${per(f.harvest_cost)} · paid by you`, n(f.harvest_cost)]);
  const total = lines.reduce((a, l) => a + l[2], 0);
  const row = (a, b, v, bold) => (
    <div key={a} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, lineHeight: 1.4, fontWeight: bold ? 700 : 400 }}>
      <span style={{ display: 'flex', flexDirection: 'column' }}><span>{a}</span>{b && <span style={{ color: C.muted }}>{b}</span>}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
      {lines.map(([a, b, v]) => row(a, b, inr(v)))}
      {f.harvest_cost == null && row('Harvest work and transport', 'not counted yet: no figures in the catalogue', '—')}
      {row('Cost', f.own_cost ? 'not financed: you pay it yourself (fodder crop)' : null, inr(total), true)}
      {f.interest ? row('Interest', `${((f.interest / Math.max(1, (f.cash || 0) + (f.voucher_value || 0))) * 100).toFixed(1)}% of the loan, sowing to repayment`, inr(n(f.interest))) : null}
      {r.kg > 0 && row('Sale (estimate)', `${fmtKg(r.kg * k)} × ${inr(Math.round(r.value / r.kg))}/kg`, inr(n(r.value)), true)}
    </div>
  );
}

/** crops: the catalogue's crops for the season rows' list; onCrop(row, cropKey): that crop instead on this area in that
 *  row's season; changing: a change is being sent. */
export function AreaCard({ plan, zone, name, area, record, accepted, onAccept, onNext, nextName, onAll, onCrop, onRemove, readOnly, crops, changing, picked = {}, onUpdate, acceptLabel = 'Accept the plan', y0, total }) {
  // picked (28 Oct): crops chosen on this area's rows, not sent yet (slot → crop key); the button then reads Update
  // crop plan and sends them all (onUpdate).
  // Simplified (12 Nov): one lane with the crops' names in their bars, one money line, the soil covers as one line each
  // (ⓘ for the long text); no Back (the header ← goes back), no split / merge (not built).
  const changed = Object.keys(picked).length > 0;
  const cropOf = (key) => (crops || []).find((c) => c.key === key);
  const [open, setOpen] = useState(null);   // the bar whose crop list is open
  const [why, setWhy] = useState(null);     // the soil cover whose long text is open
  const [costs, setCosts] = useState(false); // how the cost is made, action by action
  const seasons = plan.plan.seasons || [];
  const year = y0 ?? planYear(seasons[0]?.start);
  const own = area?.area_m2 ? area.area_m2 / 4046.86 : null;
  // A row merged with other areas (same crop that season) counts here by this area's share of its acres.
  const share = (r) => (zonesOf(r).length < 2 || !own || !r.acres ? 1 : own / r.acres);
  const rows = seasons.flatMap((se) => se.rows.filter((r) => zonesOf(r).includes(zone)).map((r) => ({ ...r, k: share(r) })));
  const acres = own ?? rows[0]?.acres ?? 0;
  const sales = Math.round(rows.reduce((a, r) => a + (r.value || 0) * r.k, 0));
  // Her cost of the crops: what the plan finances, what she pays herself (fodder's inputs) and the harvest cost.
  const cost = Math.round(rows.reduce((a, r) => a + ((r.finance?.cash || 0) + (r.finance?.voucher_value || 0) + (r.finance?.own_cost || 0)
    + (r.finance?.harvest_cost || 0)) * r.k, 0));
  const items = laneOf(plan, zone, { y0: year, picked, cropOf, readOnly: readOnly || !onCrop, record, crops });
  const openItem = items.find((it) => it.key === open);
  const covers = items.filter((it) => it.soil && it.cover && it.cover.kind !== 'bare');
  const off = rows.filter((r) => r.off_catalogue && !r.continues);
  return (
    <>
      <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{name} · {acres.toFixed(2)} acres</span>
      <figure style={{ margin: '16px 0 0' }} aria-label={`${name}: ${items.map((it) => it.name).join(', ')}`}>
        <Lane items={items} height={40} open={open} onBar={(it) => setOpen(open === it.key ? null : it.key)} />
        <div style={{ marginTop: 4 }}><MonthAxis /></div>
      </figure>
      {openItem && (
        <div style={{ background: C.raised, borderRadius: 12, padding: '10px 10px 12px', marginTop: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{openItem.name}: change to</span>
          <CropSelect crops={sortedCrops(crops)} current={picked[openItem.slot] || (openItem.soil ? undefined : openItem.row.crop)} currentName={openItem.name}
            disabled={changing} onPick={(key) => { onCrop(openItem.row, key); setOpen(null); }} />
        </div>
      )}
      <p style={{ ...muted, margin: '12px 0 0' }}>
        {sales ? `Sales ${inr(sales)}` : 'No sales planned'} · Cost {inr(cost)}{!readOnly && onCrop ? ' · tap a crop to change it' : ''}
      </p>
      {rows.some((r) => !r.continues && !r.off_catalogue) && (
        <button type="button" onClick={() => setCosts((v) => !v)} aria-expanded={costs}
          style={{ marginTop: 6, border: 0, background: 'transparent', padding: 0, color: C.accent, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
          {costs ? 'Hide the costs' : 'What it costs, step by step ›'}
        </button>
      )}
      {costs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8, background: C.raised, borderRadius: 12, padding: 12 }}>
          {rows.filter((r) => !r.continues && !r.off_catalogue).map((r) => <CostList key={`${r.slot || r.sow}-${r.crop}`} r={r} k={r.k} />)}
        </div>
      )}
      {covers.map((it) => {
        const c = it.cover;
        const long = c.kind === 'mulch' ? 'The last crop\'s residue stays on the soil through the dry months, so it does not erode.'
          : `Sown so it stands through the driest weeks and is ploughed in before the next crop, to rebuild the soil.${c.finance ? ` It is its own crop share (${inr(c.finance.cash + c.finance.voucher_value)}: seed and machine work), repaid with the next crop.` : c.unfinanced_reason ? ` Not in the loan: ${c.unfinanced_reason}.` : ''}${c.risks?.includes('water source not confirmed') ? ' Needs some water: your water source is not confirmed.' : ''}`;
        return (
          <div key={it.key} style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setWhy(why === it.key ? null : it.key)} aria-expanded={why === it.key}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', padding: 0, color: C.muted, fontFamily: FONT, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
              <span aria-hidden="true" style={{ width: 14, height: 10, borderRadius: 2, background: it.fill, flexShrink: 0 }} />
              {it.name}: {c.kind === 'mulch' ? 'mulch' : 'green manure'}
              <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${C.muted}`, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>i</span>
            </button>
            {why === it.key && <p style={{ ...muted, margin: '4px 0 0' }}>{long}</p>}
          </div>
        );
      })}
      {items.filter((it) => it.soil && it.cover?.kind === 'bare').map((it) => (
        <Notice key={it.key} title="Bare soil in the dry months">You keep this area bare in the dry months: bare soil erodes.</Notice>
      ))}
      {off.map((r) => (
        <Notice key={`off-${r.crop}`} title={`${r.name}: not in Nila's crop list`}>
          Its yield, costs and sowing months are not checked by Nila, so it gets no loan or voucher.
          {r.estimate?.kg ? ` Estimate (not checked): about ${fmtKg(r.estimate.kg)}.` : ''}
        </Notice>
      ))}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {/* Remove this area (21 Oct): left-over bits leave the plan; a confirm first (CropPlanFlow). */}
          {onRemove && total > 1 && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${name} from your plan`} style={{ ...btn, flex: 'none', width: 44, padding: 0, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </button>
          )}
          {changed ? <button type="button" disabled={changing} onClick={onUpdate} style={{ ...btn, background: C.accent, color: C.ink, opacity: changing ? 0.5 : 1 }}>{changing ? 'Updating…' : 'Update crop plan'}</button>
            : !accepted ? <button type="button" onClick={onAccept} style={{ ...btn, background: C.accent, color: C.ink }}>Accept</button>
              : nextName ? <button type="button" onClick={onNext} style={{ ...btn, background: C.accent, color: C.ink }}>Next area</button>
                : <button type="button" onClick={onAll} style={{ ...btn, background: C.accent, color: C.ink }}>{acceptLabel}</button>}
        </div>
      )}
    </>
  );
}

/** The overview chart (12 Nov): one lane per area, its name on the left (✓ when she checked it); a tap opens the area.
 *  Areas left out are named and greyed. */
export function PlanChart({ plan, zones, areaName, checked, y0, crops, pending = {}, onArea, record }) {
  const cropOf = (key) => (crops || []).find((c) => c.key === key);
  const CL = 104;
  const out = plan.plan.left_out || [];
  return (
    <figure style={{ margin: '12px 0 0' }} aria-label="Your plan per area">
      <MonthAxis inset={CL} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {zones.map((z) => (
          <button key={z} type="button" onClick={onArea ? () => onArea(z) : undefined} disabled={!onArea}
            style={{ display: 'flex', alignItems: 'center', border: 0, padding: 0, background: 'transparent', color: C.text, fontFamily: FONT, cursor: onArea ? 'pointer' : 'default', width: '100%' }}>
            <span style={{ width: CL - 8, marginRight: 8, textAlign: 'left', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {checked?.has(z) && <span aria-label="checked" style={{ color: C.accent }}>✓ </span>}{areaName(z)}
            </span>
            <span style={{ flexGrow: 1 }}><Lane items={laneOf(plan, z, { y0, picked: pending[z] || {}, cropOf, readOnly: true, record, crops })} height={30} /></span>
          </button>
        ))}
        {/* Left-out areas (corners, trees; 12 Nov): one muted line, not a row each. */}
        {out.length > 0 && (
          <p title={out.map(areaName).join(', ')} style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>
            {out.length === 1 ? `${areaName(out[0])} left out` : `${out.length} small areas left out`}
          </p>
        )}
      </div>
    </figure>
  );
}

const btn = { flex: 1, height: 44, borderRadius: R.button, border: 0, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' };

/** The overview line (board: the hand icon, then the count). */
export function TapLine({ done, total }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4CF5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11V6a2 2 0 0 1 4 0v5" /><path d="M13 10a2 2 0 0 1 4 0v1" /><path d="M17 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-1a8 8 0 0 1-6.6-3.5L3 15.5a2 2 0 0 1 3.2-2.4L9 16" />
      </svg>
      <span style={{ fontWeight: 700 }}>{done === total ? 'All areas accepted.' : 'Tap each area on the map to check and accept it.'}</span>
      <span style={{ color: C.muted }}>{done} of {total} accepted</span>
    </div>
  );
}
