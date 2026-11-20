// Advice on the year row by code (17 Nov, executive decision): no LLM, no node call. For the next free spot on the
// row each crop gets short tags; some are faded, some moved to the front. Advice only, never a rule: every crop can
// still be tapped. The rotation facts come from nila-sensing plan/reference/rules_v1.json (a placeholder until TNAU
// and the unions confirm it): a pulse before maize, paddy or sorghum is good; a crop after one of its own family
// tires the soil. Dry months from soil_v1 (Mar–May).
import { GREEN_MANURE, cropOf, fill, isBio, whyNoRoom } from './yearRow';

export const DRY_MONTHS = [3, 4, 5];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lower = (s) => String(s || '').toLowerCase();

/** { tags: { key: [{ text, good }] }, faded: Set, front: Set, sentence } for the crops `list` after the row `keys`.
 *  wells: false = confirmed no well (a high-water crop is faded); hardMonths: her months (1–12) needing money. */
export function rowAdvice(list, keys, { seasons, cat, free0 = null, wells, hardMonths = [] }) {
  // A bio manure (19 Nov) is not a crop on the row: the rotation advice looks past it.
  const bars = fill(keys, { seasons, cat, free0 }).bars.filter((b) => !b.bio);
  const crop = (k) => cropOf(k, cat);
  const last = bars.length ? crop(bars[bars.length - 1].key) : null;
  const lastKey = bars.length ? bars[bars.length - 1].key : null;
  const pulseOnRow = bars.some((b) => crop(b.key)?.legume);
  const tags = {}; const faded = new Set(); const front = new Set();
  const tag = (k, text, good) => { (tags[k] = tags[k] || []).push({ text, good }); };
  for (const c of list) {
    const k = c.key;
    const next = fill([...keys, k], { seasons, cat, free0 });
    if (next.dropped.includes(k)) { tag(k, whyNoRoom(k, keys, { seasons, cat, free0 }), false); faded.add(k); continue; }
    const bar = next.bars[next.bars.length - 1];
    if (isBio(k)) continue;
    if (k === GREEN_MANURE.key) {
      if (DRY_MONTHS.includes(bar.sow.getMonth() + 1)) { tag(k, 'Covers the dry months', true); front.add(k); }
      continue;
    }
    const me = crop(k) || {};
    if (last && lastKey !== GREEN_MANURE.key && me.family && me.family === last.family && !me.legume) {
      tag(k, `Same family as ${lower(last.name)}`, false); faded.add(k);
    }
    if (me.legume && !pulseOnRow) { tag(k, 'Feeds the soil', true); front.add(k); }
    if (wells === false && me.water === 'high') { tag(k, 'Needs a well', false); faded.add(k); }
    const hm = bar.end.getMonth() + 1;
    if (hardMonths.includes(hm)) { tag(k, `Harvest in ${MON[hm - 1]}`, true); front.add(k); }
  }
  // One sentence under the row: a warning on the row itself first, else the best next step.
  let sentence = null;
  if (bars.length >= 2) {
    const a = crop(bars[bars.length - 2].key); const b = crop(bars[bars.length - 1].key);
    if (a && b && a.family && a.family === b.family && !b.legume && bars[bars.length - 1].key !== GREEN_MANURE.key) {
      sentence = `${b.name} after ${lower(a.name)}: the same family, so the soil gets tired.`;
    }
  }
  if (!sentence && last && last.family === 'grass' && !pulseOnRow) {
    const pulse = list.find((c) => crop(c.key)?.legume && !faded.has(c.key));
    if (pulse) sentence = `After ${lower(last.name)}, a pulse such as ${lower(pulse.name)} feeds the soil.`;
  }
  return { tags, faded, front, sentence };
}

/** The crops in the row's order: advised first, then the rest, then the faded ones (each keeps its own order). */
export function ordered(list, { faded, front }) {
  const f = (c) => (front.has(c.key) && !faded.has(c.key) ? 0 : faded.has(c.key) ? 2 : 1);
  return list.map((c, i) => [c, i]).sort((x, y) => f(x[0]) - f(y[0]) || x[1] - y[1]).map(([c]) => c);
}
