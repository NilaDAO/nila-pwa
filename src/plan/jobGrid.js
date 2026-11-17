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
      tiles.push({ key: `h:${h}`, label: actionOf(v.for), kind: 'cash', icon: 'weed', acres: v.acres, value: v.value, date: v.when || r.sow });
    }
    const labels = new Set(tiles.map((t) => t.label));
    // Harvest labour (17 Nov): lent in cash with the crop (collected at sowing, paid at harvest); in an older plan, hers.
    if (r.harvest && !labels.has('Harvest')) tiles.push({ key: 'harvest', label: 'Harvest', kind: f.harvest_financed ? 'cash' : 'self', icon: 'harvest', value: f.harvest_cost ?? null, date: r.harvest, kg: r.kg });
    if (r.harvest && !labels.has('Transport')) tiles.push({ key: 'transport', label: 'Transport', kind: 'self', icon: 'transport', value: null, date: r.harvest });
    // Repay: what this crop's agreement comes to, 21 days after its harvest.
    const owe = Math.round((f.cash || 0) + (f.voucher_value || 0) + (f.interest || 0));
    if (owe && f.due) tiles.push({ key: 'repay', label: 'Repay', kind: 'self', icon: 'repay', value: owe, date: f.due, afterHarvest: true });
    const area = typeof areaNo(r.zone) === 'number' && areaName ? areaLabel(r, areaNo, areaName) : '';
    out.push({ key: `${r.zone}:${r.crop}`, crop: r.name, colour: r.colour, area, sow: r.sow, until: sh?.final_date || null, tiles });
  }
  return out;
}
