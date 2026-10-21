// CP10 (board CropPlanQ3-xdlz): the map is the list. The bar on top of the card switches seasons (overview) or
// slides through her areas (an area picked); the area card shows her year as bars, its sales, and Accept Area N.
// Spec: nila-design notes/page-member.md "cp-result". DESIGN GAPs, not built: Split this area and Merge with other
// areas (no node call yet), changing a crop on the bars (a tap opens Change my plan with the crop named instead).
import { useRef } from 'react';
import { C, FONT, R } from '../shell/tokens';
import { inr, muted } from './ui';

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

/** Her plan year: October of the first season to September a year on. */
export function yearLabel(seasons) {
  const y = new Date(seasons?.[0]?.start || Date.now()).getFullYear();
  return `year plan, Oct ${y} to Sep ${y + 1}`;
}

/** The row on each area in season i; a whole-year crop from an earlier season carries on. */
export function rowsInSeason(seasons, i) {
  const out = {};
  (seasons || []).slice(0, i + 1).forEach((s, k) => s.rows.forEach((r) => {
    if (k === i || (r.continues && !out[r.zone])) out[r.zone] = r;
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

const monthsFrom = (y0) => (d) => { const t = new Date(d); return (t.getFullYear() - y0) * 12 + t.getMonth() - 9 + (t.getDate() - 1) / 31; };

/** The area card (an area picked): her year as bars, sales, Back and Accept Area N. */
export function AreaCard({ plan, zone, name, record, area, accepted, total, done, onBack, onAccept, onNext, nextName, onAll, onCrop, onRemove, readOnly }) {
  const seasons = plan.plan.seasons || [];
  const rows = seasons.flatMap((s) => s.rows.filter((r) => r.zone === zone).map((r) => ({ ...r, slot: s.slot })));
  const y0 = new Date(seasons[0]?.start || Date.now()).getFullYear();
  const at = monthsFrom(y0);
  const acres = rows[0]?.acres ?? (area?.area_m2 ? area.area_m2 / 4046.86 : 0);
  const fields = fieldsIn(record, area);
  const sales = rows.reduce((a, r) => a + (r.value || 0), 0);
  const fodder = rows.some((r) => !r.value);
  const salesLine = `${sales ? `Estimated sales this year: ${inr(sales)}` : 'No sales planned here'}${fodder ? (sales ? ', plus fodder.' : ', fodder for your animals.') : '.'}`;
  const CL = 116;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
          {name} · {acres.toFixed(2)} acres{fields ? ` · ${fields} ${fields === 1 ? 'field' : 'fields'}` : ''}
        </span>
        <span style={{ ...muted, margin: 0, whiteSpace: 'nowrap' }}>{done} of {total} areas accepted</span>
      </div>
      <figure style={{ margin: '20px 0 0' }} aria-label={`${name} year plan: ${rows.map((r) => r.name).join('; ')}`}>
        <div style={{ position: 'relative' }}>
          {rows.map((r) => {
            const s0 = Math.max(0, Math.min(12, at(r.sow))); const s1 = Math.max(s0 + 0.3, Math.min(12, at(r.harvest)));
            return (
              <button key={`${r.slot}-${r.crop}`} type="button" disabled={readOnly} onClick={() => onCrop?.(r)} aria-label={`Change ${r.name}`}
                style={{ display: 'flex', alignItems: 'center', width: '100%', height: 30, padding: 0, border: 0, background: 'transparent', color: C.text, fontFamily: FONT, cursor: readOnly ? 'default' : 'pointer' }}>
                <span style={{ width: CL - 8, marginRight: 8, textAlign: 'left', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                <span style={{ position: 'relative', flexGrow: 1, height: 14 }}>
                  <span style={{ position: 'absolute', left: `${(s0 / 12) * 100}%`, width: `${((s1 - s0) / 12) * 100}%`, top: 0, height: 14, borderRadius: 4, background: r.colour || C.muted }} />
                </span>
              </button>
            );
          })}
          <div aria-hidden="true" style={{ display: 'flex', marginLeft: CL, marginTop: 4, fontSize: 12, lineHeight: '16px', color: C.muted }}>
            {AXIS.map((m, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{m}</span>)}
          </div>
        </div>
      </figure>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14, lineHeight: 1.5, color: C.muted, marginTop: 12 }}>
        <span>{salesLine}</span>
        {!readOnly && <span>Tap a crop to change it.</span>}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
          {/* NOT BUILT: split and merge need a node call (an area is a group of fields with one plan). */}
          {fields > 1 && <button type="button" disabled aria-disabled="true" style={{ ...pill, opacity: 0.5, cursor: 'not-allowed' }}><SplitIcon />Split this area · {fields} fields</button>}
          {total > 1 && <button type="button" disabled aria-disabled="true" style={{ ...pill, opacity: 0.5, cursor: 'not-allowed' }}><MergeIcon />Merge with other areas</button>}
          {(fields > 1 || total > 1) && <span style={{ ...muted, margin: 0, fontSize: 12 }}>Split and merge are not built yet.</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onBack} style={{ ...btn, background: C.raised, color: C.text }}>Back</button>
        {!readOnly && !accepted && <button type="button" onClick={onAccept} style={{ ...btn, background: C.accent, color: C.ink }}>Accept {name}</button>}
        {!readOnly && accepted && nextName && <button type="button" onClick={onNext} style={{ ...btn, background: C.accent, color: C.ink }}>Next: {nextName}</button>}
        {!readOnly && accepted && !nextName && <button type="button" onClick={onAll} style={{ ...btn, background: C.accent, color: C.ink }}>Accept the plan</button>}
        {/* Remove this area (21 Oct): left-over bits leave the plan; a confirm first (CropPlanFlow). */}
        {!readOnly && onRemove && total > 1 && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${name} from your plan`} style={{ ...btn, flex: 'none', width: 44, padding: 0, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
          </button>
        )}
      </div>
    </>
  );
}

const btn = { flex: 1, height: 44, borderRadius: R.button, border: 0, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' };
const pill = { height: 36, border: 0, borderRadius: 12, background: C.raised, color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6 };
const SplitIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /></svg>
);
const MergeIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 6 4-4 4 4" /><path d="M12 2v10.3a4 4 0 0 1-1.17 2.83L4 22" /><path d="m20 22-5-5" /></svg>
);

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
