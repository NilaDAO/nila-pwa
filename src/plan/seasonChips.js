// The season chips (13 Nov on the approved plan, 16 Nov also on the plan overview): which seasons they show and which
// are on. Pure, so the overview's sums can be tested.
import { planYear } from './PlanResult';

/** The seasons of the plan year season i is in (indices). */
export const yearSeasons = (ss, i) => ss.map((_, k) => k).filter((k) => planYear(ss[k].start) === planYear(ss[i]?.start));
/** Those of them whose chip is on (all when none of this year's is: another year may have other slots). */
export const seasonsOn = (ss, i, on) => { const ys = yearSeasons(ss, i); const k = ys.filter((x) => on.has(ss[x].slot)); return k.length ? k : ys; };
/** The year's seasons whose chip is off. */
export const seasonsOff = (ss, i, on) => { const k = seasonsOn(ss, i, on); return yearSeasons(ss, i).filter((x) => !k.includes(x)); };

/** The overview's part of a plan (16 Nov): its seasons without those whose chip is off (a season of another plan year
 *  has no chip and stays), and its financed green manures not growing in a season that is off. */
export function seasonsCounted(p, off = []) {
  const ss = p.seasons || [];
  const offSlots = new Set(off.map((k) => ss[k]?.slot));
  return {
    seasons: ss.filter((_, k) => !off.includes(k)),
    // The extra crop agreements without a season row of their own: green manures (4 Nov). A bio manure is part of its
    // crop's row (20 Nov), so it is counted there.
    // 20 Nov: a green manure in its next crop's agreement (c.agreement) is counted in that crop's row too.
    gm: (p.soil_cover || []).filter((c) => c.finance && !c.agreement && !offSlots.has((c.slots || [])[0])),
  };
}
