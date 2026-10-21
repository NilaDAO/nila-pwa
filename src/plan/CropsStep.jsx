// CP4 (board CropPlanCrops, crop plan intake 1 / 4): the crops she can grow. Crops from her field record are
// ticked ("In your record · Area n"); "Add a crop" searches the catalogue for the others (up to 3 hits) and adds
// the one she taps, ticked ("Added by you"). DESIGN GAP: no suggested crops for next year yet (useCropSuggestions
// has no source), so the "Suggested · …" rows are not shown. Record crops not in the catalogue are left out:
// the plan cannot plan them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { C, FONT } from '../shell/tokens';
import { Primary, Sheet, muted } from './ui';
import { areasOf } from './record';

const ROW = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, borderRadius: 12, background: C.raised, color: C.text,
  padding: '10px 14px', minHeight: 56, boxSizing: 'border-box', fontFamily: FONT, fontSize: 14, lineHeight: 1.5, cursor: 'pointer', textAlign: 'left' };
const HIT = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, background: 'transparent', color: C.text, padding: '0 14px',
  minHeight: 44, boxSizing: 'border-box', fontFamily: FONT, fontSize: 14, lineHeight: 1.5, cursor: 'pointer' };

// A record crop type → its catalogue key: the same key, else the catalogue crop of the same family (sugarcane_ratoon → sugarcane_plant).
function toKey(type, catalogue) {
  if (!type) return null;
  if (catalogue.some((c) => c.key === type)) return type;
  const fam = String(type).split('_')[0];
  return catalogue.find((c) => c.key.split('_')[0] === fam)?.key || null;
}

function Row({ name, colour, sub, on, onClick }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} style={ROW}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 9999, background: colour, flexShrink: 0 }} />
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
        <span style={{ fontWeight: 700 }}>{name}</span>
        <span style={{ fontWeight: 400, color: C.muted }}>{sub}</span>
      </span>
      <span aria-hidden="true" style={{ width: 22, height: 22, flexShrink: 0, boxSizing: 'border-box', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? C.accent : 'transparent', border: `2px solid ${on ? C.accent : C.muted}` }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={on ? C.ink : 'transparent'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
    </button>
  );
}

/** crops / setCrops: the ticked catalogue keys (a Set), kept by the flow for the intake. */
export default function CropsStep({ map, name, onBack, record, catalogue = [], crops, setCrops, onContinue }) {
  // Her record's crops, one row per catalogue crop, with the areas it was grown in.
  const fromRecord = useMemo(() => {
    const order = areasOf(record).map((z) => z.zone_id);
    const cycles = Array.isArray(record?.cycles) ? record.cycles : Object.values(record?.cycles || {});
    const by = new Map();
    cycles.forEach((c) => {
      const key = toKey(c.crop_type, catalogue);
      if (!key) return;
      const areas = by.get(key) || new Set();
      (c.zone_ids || [c.zone_id]).forEach((z) => { const n = order.indexOf(z) + 1; if (n) areas.add(n); });
      by.set(key, areas);
    });
    return [...by].map(([key, areas]) => ({ key, areas: [...areas].sort((a, b) => a - b) }));
  }, [record, catalogue]);
  const recordKeys = useMemo(() => new Set(fromRecord.map((r) => r.key)), [fromRecord]);
  // Added by her: crops ticked before (coming back to CP4) that are not from the record, then each one she adds.
  const [added, setAdded] = useState(() => [...crops].filter((k) => !recordKeys.has(k)));
  const [q, setQ] = useState('');
  const input = useRef(null);
  const ticked = useRef(crops.size > 0);
  useEffect(() => {   // her record's crops start ticked, once
    if (ticked.current || !fromRecord.length) return;
    ticked.current = true;
    setCrops(new Set(fromRecord.map((r) => r.key)));
  }, [fromRecord, setCrops]);

  const byKey = Object.fromEntries(catalogue.map((c) => [c.key, c]));
  const toggle = (key) => setCrops((x) => { const n = new Set(x); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const add = (key) => {
    setAdded((a) => [...a, key]);
    setCrops((x) => new Set(x).add(key));
    setQ('');
    input.current?.blur();
  };
  const listed = new Set([...recordKeys, ...added]);
  const s = q.trim().toLowerCase();
  const hits = s ? catalogue.filter((c) => !listed.has(c.key) && c.name.toLowerCase().includes(s)).slice(0, 3) : [];

  return (
    <Sheet map={map} landName={name} onBack={onBack}>
      <p style={{ ...muted, fontWeight: 700, textAlign: 'center', margin: 0 }}>1 / 4</p>
      <h1 id="cropplan-q-crops" style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Which crops can you grow?</h1>
      <div role="group" aria-labelledby="cropplan-q-crops" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fromRecord.map((r) => byKey[r.key] && (
          <Row key={r.key} name={byKey[r.key].name} colour={byKey[r.key].colour} sub={`In your record · Area ${r.areas.join(', ')}`}
            on={crops.has(r.key)} onClick={() => toggle(r.key)} />
        ))}
        {added.map((k) => byKey[k] && (
          <Row key={k} name={byKey[k].name} colour={C.muted} sub="Added by you" on={crops.has(k)} onClick={() => toggle(k)} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <div style={{ position: 'relative' }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 14, top: 13, pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input ref={input} id="crop-search" type="search" aria-label="Add a crop" placeholder="Add a crop" autoComplete="off" value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ height: 44, border: 0, borderRadius: 12, background: C.raised, color: C.text, fontFamily: FONT, fontSize: 16, padding: '0 14px 0 42px', boxSizing: 'border-box', width: '100%' }} />
        </div>
        {hits.length > 0 && (
          <div role="listbox" aria-label="Crops" style={{ display: 'flex', flexDirection: 'column', background: C.raised, borderRadius: 12, padding: '4px 0' }}>
            {hits.map((c, k) => (
              <button key={c.key} type="button" role="option" aria-selected="false" onClick={() => add(c.key)} style={{ ...HIT, borderTop: k ? `1px solid ${C.ink}` : 0 }}>
                <span style={{ flexGrow: 1, textAlign: 'left', fontWeight: 700 }}>{c.name}</span>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 5v14M5 12h14" /></svg>
              </button>
            ))}
          </div>
        )}
        {s && !hits.length && <div style={{ fontSize: 14, lineHeight: 1.5, color: C.muted, padding: '0 14px' }}>No crop found. We can't plan this crop yet.</div>}
      </div>
      {crops.size ? <Primary onClick={onContinue}>Continue</Primary> : (
        <button type="button" disabled aria-disabled="true" style={{ height: 44, borderRadius: 12, fontSize: 14, fontWeight: 700, padding: '0 24px', width: '100%', marginTop: 16,
          color: C.muted, background: C.raised, border: 0, fontFamily: FONT, cursor: 'not-allowed' }}>Continue</button>
      )}
    </Sheet>
  );
}
