// The approved plan's job grid (17 Nov, executive decision; replaces "To do now" and "Coming up"): per crop in the
// season shown, a square tile per action. A tile names only the action (Plough, Weed, Seed); how it is paid shows in
// its look: voucher (union machine work), cash (seed, inputs, hired or hand work), or self-organised (her own work and
// cost, never financed: harvest, transport). Collect and Repay come first: the crop agreement's money.
import { areaLabel } from './PlanResult';

// The action of a machine or hired job, from the finance table's `for` text ("weeding" → Weed).
const ACTIONS = [[/plough/i, 'Plough'], [/land preparation|harrow|tillage/i, 'Prepare'], [/ridg/i, 'Ridge'], [/puddl/i, 'Puddle'],
  [/transplant/i, 'Transplant'], [/sowing|planting|plant/i, 'Plant'], [/weed/i, 'Weed'], [/spray/i, 'Spray'],
  [/harvest/i, 'Harvest'], [/cut/i, 'Cut'], [/thresh/i, 'Thresh'], [/transport|trailer/i, 'Transport']];
export const actionOf = (forText = '') => {
  const hit = ACTIONS.find(([re]) => re.test(forText));
  if (hit) return hit[1];
  const w = String(forText).trim().split(/\s+/)[0] || 'Work';
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** [{ key, crop, area, sow, tiles: [{ key, label, kind: 'voucher'|'cash'|'self', icon, acres, value, date, ready, done }] }]
 *  for the crops sown in season `si`. `shares`: her crop agreements as A1 reads them (ready, drawn). */
export function gridsOf(plan, si, { areaNo = (z) => z, areaName, shares = [] } = {}) {
  const p = plan.plan || plan;
  const se = (p.seasons || [])[si];
  if (!se) return [];
  const byKey = Object.fromEntries((shares || []).map((x) => [x.share?.key || x.share, x]));
  const out = [];
  for (const r of se.rows) {
    if (r.continues) continue;
    const f = r.finance || {};
    const tiles = [];
    // Collect: her crop agreement for this crop (its planned sowing), ready at the union office or already collected.
    const sh = (p.shares || []).find((x) => x.zone === r.zone && x.from_date === r.sow && (x.loan_amount || x.acres_work || x.hours));
    if (sh) {
      const st = byKey[sh.key] || {};
      tiles.push({ key: 'collect', label: 'Collect', kind: 'cash', icon: 'cash', value: sh.loan_amount || 0, date: sh.from_date,
        until: sh.final_date, ready: !!st.ready, done: !!st.drawn });
    }
    if (f.seed) tiles.push({ key: 'seed', label: 'Seed', kind: 'cash', icon: 'plant', value: f.seed, date: r.sow });
    if (f.cash_inputs) tiles.push({ key: 'inputs', label: 'Inputs', kind: 'cash', icon: 'inputs', value: f.cash_inputs, date: r.sow });
    for (const [m, v] of Object.entries(f.machines || {})) {
      tiles.push({ key: `m:${m}`, label: actionOf(v.for), kind: 'voucher', icon: 'tractor', acres: v.acres, value: v.value, date: v.when || r.sow });
    }
    for (const [h, v] of Object.entries(f.hand_work || {})) {
      // Hired work on its machine's date (17 Nov, `when` from the node); a plan made before that: haulage at harvest.
      const label = actionOf(v.for);
      tiles.push({ key: `h:${h}`, label, kind: 'cash', icon: label === 'Transport' ? 'transport' : 'weed', acres: v.acres, value: v.value,
        date: v.when || (label === 'Transport' && r.harvest) || r.sow });
    }
    const labels = new Set(tiles.map((t) => t.label));
    // Harvest labour (17 Nov): lent in cash with the crop (collected at sowing, paid at harvest); in an older plan, hers.
    if (r.harvest && !labels.has('Harvest')) tiles.push({ key: 'harvest', label: 'Harvest', kind: f.harvest_financed ? 'cash' : 'self', icon: 'harvest', value: f.harvest_cost ?? null, date: r.harvest, kg: r.kg });
    if (r.harvest && !labels.has('Transport')) tiles.push({ key: 'transport', label: 'Transport', kind: 'self', icon: 'transport', value: null, date: r.harvest });
    // Repay: what this crop's agreement comes to, 21 days after its harvest.
    const owe = Math.round((f.cash || 0) + (f.voucher_value || 0) + (f.interest || 0));
    if (owe && f.due) tiles.push({ key: 'repay', label: 'Repay', kind: 'self', icon: 'repay', value: owe, date: f.due, afterHarvest: true });
    const area = typeof areaNo(r.zone) === 'number' && areaName ? areaLabel(r, areaNo, areaName) : '';
    out.push({ key: `${r.zone}:${r.crop}`, crop: r.name, colour: r.colour, area, zones: r.zones || [r.zone], sow: r.sow, until: sh?.final_date || null, tiles });
  }
  return out;
}

/** A green manure's tiles (17 Nov): its own crop agreement — Collect, Seed, its machine work in the week it is done
 *  (sowing, turning in), hired work, Turn in (hers) when no machine does it, Repay with the next crop. Areas the node
 *  merged into one agreement (same green manure, same sowing day, repaid with the same next crop) are one grid, their
 *  amounts added up, as merged crops are one row. Same shape as gridsOf's grids. */
export function coverGrids(plan, { areaNo = (z) => z, areaName, shares = [] } = {}) {
  const p = plan.plan || plan;
  const byKey = Object.fromEntries((shares || []).map((x) => [x.share?.key || x.share, x]));
  const groups = new Map();
  for (const c of (p.soil_cover || []).filter((x) => x.finance && x.kind === 'green_manure' && x.sow)) {
    const sh = (p.shares || []).find((x) => x.green_manure && (x.zones || [x.zone]).includes(c.zone) && x.from_date === c.sow && (!x.crop || x.crop === c.cover));
    const k = sh?.key || `${c.zone}:gm:${c.cover}:${c.sow}`;
    if (!groups.has(k)) groups.set(k, { sh, covers: [] });
    groups.get(k).covers.push(c);
  }
  const out = [];
  for (const [k, { sh, covers }] of groups) {
    const c0 = covers[0];
    const sum = (f) => covers.reduce((a, c) => a + (f(c.finance) || 0), 0);
    const tiles = [];
    if (sh) {
      const st = byKey[sh.key] || {};
      tiles.push({ key: 'collect', label: 'Collect', kind: 'cash', icon: 'cash', value: sh.loan_amount || 0, date: sh.from_date,
        until: sh.final_date, ready: !!st.ready, done: !!st.drawn });
    }
    const seed = sum((f) => f.seed);
    if (seed) tiles.push({ key: 'seed', label: 'Seed', kind: 'cash', icon: 'plant', value: seed, date: c0.sow });
    // Machine work: one tile per machine and week, the areas' acres and values added up.
    const work = new Map();
    for (const c of covers) {
      for (const w of c.finance.machine_weeks || []) {
        const m = (c.finance.machines || {})[w.machine] || {};
        const value = m.acres ? Math.round((m.value || 0) * (w.acres / m.acres)) : (m.value || 0);
        const wk = `${w.slot}|${w.machine}|${w.when}`;
        const t = work.get(wk) || { key: `w:${wk}`, label: w.slot === 'cover_turn_in' ? 'Turn in' : actionOf(m.for), kind: 'voucher', icon: 'tractor', acres: 0, value: 0, date: w.when };
        t.acres += w.acres; t.value += value;
        work.set(wk, t);
      }
    }
    tiles.push(...work.values());
    const hand = new Map();
    for (const c of covers) {
      for (const [h, v] of Object.entries(c.finance.hand_work || {})) {
        const t = hand.get(h) || { key: `h:${h}`, label: actionOf(v.for), kind: 'cash', icon: 'weed', acres: 0, value: 0, date: c0.sow };
        t.acres += v.acres || 0; t.value += v.value || 0;
        hand.set(h, t);
      }
    }
    tiles.push(...hand.values());
    const turned = covers.some((c) => (c.finance.machine_weeks || []).some((w) => w.slot === 'cover_turn_in'));
    if (c0.turn_in && !turned) tiles.push({ key: 'turn_in', label: 'Turn in', kind: 'self', icon: 'plant', value: null, date: c0.turn_in });
    const owe = Math.round(sum((f) => (f.cash || 0) + (f.voucher_value || 0) + (f.interest || 0)));
    const due = c0.finance.due;
    if (owe && due) tiles.push({ key: 'repay', label: 'Repay', kind: 'self', icon: 'repay', value: owe, date: due, afterHarvest: true });
    const zones = covers.map((c) => c.zone);
    const area = typeof areaNo(c0.zone) === 'number' && areaName ? areaLabel({ zones }, areaNo, areaName) : '';
    out.push({ key: `gm:${k}`, crop: 'Green manure', colour: c0.colour, area, zones, sow: c0.sow, until: sh?.final_date || null, tiles });
  }
  return out;
}
