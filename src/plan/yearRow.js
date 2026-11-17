// The year row (17 Nov, executive decision): an area's whole plan year is edited as one row on the phone. Each crop
// tapped goes into the first free spot: the next season after the crop before it, from the first month it can be
// sown there and not before the field is free, for its own grow days. A whole-year crop (sugarcane, banana) fills
// the row. Nothing is sent until Update: then the row goes to the node as one change per season (one crop per
// season, as the node plans), so a field never holds two crops at once (sugarcane from October: no green gram in
// March). The sowing rule mirrors nila-sensing plan/engine._sow_date.

export const GREEN_MANURE = { key: 'green_manure', name: 'Green manure', colour: '#7FB069', days: 60,
  sow_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], whole_year: false };
export const SLOT_MONTHS = { S1: [10, 11, 12, 1, 2], S2: [3, 4, 5], S3: [6, 7, 8] };

const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`) : null);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The plan's seasons as slots: [{ slot, start: Date, months }] in order. */
export const slotsOf = (seasons = []) => seasons.map((s) => ({ slot: s.slot, start: day(s.start), months: SLOT_MONTHS[s.slot] || [] }));

/** The earliest day in the slot the crop may be sown, or null (engine._sow_date). */
export function sowDate(crop, slot, notBefore) {
  const sow = crop?.sow_months || [];
  for (const m of slot.months) {
    if (!sow.includes(m)) continue;
    const y = slot.start.getFullYear() + (m < slot.months[0] ? 1 : 0);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    if (notBefore && notBefore > last) continue;
    return notBefore && notBefore > first ? notBefore : first;
  }
  return null;
}

const cropOf = (key, cat) => (key === GREEN_MANURE.key ? GREEN_MANURE : cat[key]);

/** The row from the crops tapped, in order: { bars: [{ key, slot, whole, sow, end }], dropped: [key] }. A crop with
 *  no room left in the year (or no grow days) is dropped. `free0`: the day the field is free (a crop standing now). */
export function fill(keys, { seasons, cat, free0 = null }) {
  const slots = slotsOf(seasons);
  const yearEnd = slots.length ? new Date(slots[0].start.getFullYear() + 1, slots[0].start.getMonth(), 0) : null;
  const bars = []; const dropped = [];
  let free = day(free0); let next = 0;
  for (const key of keys) {
    const c = cropOf(key, cat);
    if (!c || !(c.days > 0) || next >= slots.length) { dropped.push(key); continue; }
    if (c.whole_year) {
      // A whole-year crop holds every season: only on an empty row.
      const sow = bars.length ? null : slots.map((s) => sowDate(c, s, free)).find(Boolean);
      if (!sow) { dropped.push(key); continue; }
      bars.push({ key, slot: null, whole: true, sow, end: yearEnd && yearEnd > sow ? yearEnd : addDays(sow, c.days) });
      next = slots.length;
      continue;
    }
    let placed = false;
    for (let i = next; i < slots.length; i += 1) {
      const sow = sowDate(c, slots[i], free);
      if (!sow) continue;
      const end = addDays(sow, c.days);
      bars.push({ key, slot: slots[i].slot, whole: false, sow, end });
      free = end; next = i + 1; placed = true;
      break;
    }
    if (!placed) dropped.push(key);
  }
  return { bars, dropped };
}

/** The node's change for one area: every season that is not locked gets the row's crop sown in it, Green manure, or
 *  nothing (a whole-year crop: every season). */
export function toChanges(bars, seasons, locked = {}) {
  const whole = bars.find((b) => b.whole);
  const out = {};
  for (const s of seasons) {
    if (locked[s.slot]) continue;
    out[s.slot] = whole ? whole.key : (bars.find((b) => b.slot === s.slot)?.key ?? null);
  }
  return out;
}

/** An area's row as planned now: the crops (and green manures) after anything locked or standing, in time order,
 *  and the day the field is free for them. */
export function rowOf(plan, zone) {
  const p = plan?.plan || {};
  const locked = p.locked?.[zone] || {};
  const inZone = (r) => (r.zones || [r.zone]).includes(zone);
  const items = []; let free = null;
  const later = (d) => { const t = day(d); if (t && (!free || t > free)) free = t; };
  for (const st of (p.standing || []).filter((x) => x.zone === zone)) later(st.until);
  for (const se of p.seasons || []) {
    for (const r of se.rows.filter(inZone)) {
      if (r.continues) continue;
      if (locked[se.slot]) { later(r.harvest); continue; }
      items.push([r.sow || String(se.start).slice(0, 10), r.crop]);
    }
  }
  for (const c of (p.soil_cover || []).filter((x) => x.zone === zone && x.kind === 'green_manure')) items.push([c.sow || c.from, GREEN_MANURE.key]);
  items.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return { keys: items.map(([, k]) => k), free0: free ? iso(free) : null, locked };
}
