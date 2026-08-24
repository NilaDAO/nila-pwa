const DAY_MS = 86_400_000;

/** Days from now to an ISO date string (positive = future, negative = past) */
function daysToDate(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate + 'T00:00:00Z').getTime();
  return Math.round((target - Date.now()) / DAY_MS);
}

/**
 * Derives the full display/scheduling shape (eosDate, loanStage, sos,
 * displayName, ...) from a raw loan record — the same transformation
 * ActiveLoansCard.js's own `enriched` memo has always computed inline (that
 * memo now just calls this). Extracted 2026-08-24 so any other consumer
 * (useFilterTasks.js's health-warning task, building portfolioLoans for the
 * "view property outline" map link) can produce loans in the shape
 * staticCards.js's portfolio Gantt/graph actually reads — it silently
 * renders nothing without eosDate/sos/cropFamily/etc., which raw loan
 * records from useActiveLoans don't carry on their own.
 *
 * opts.isPending/resolveName/hasName/eosMap mirror ActiveLoansCard's own —
 * all optional. isPending defaults to the same active/!chainClosed/
 * !drawdownTs/!fastDraw check; resolveName/hasName default to identity/false
 * (displayName just falls back to farmName or the raw address); eosMap's
 * landId/farmName fallback is skipped entirely if omitted — harmless since
 * chain sync already backfills those onto the loan directly in the common
 * case.
 */
export function enrichLoan(l, opts = {}) {
  const {
    isPending = (loan) => Boolean(loan?.active && !loan?.chainClosed && !loan?.drawdownTs && !loan?.fastDraw),
    resolveName = (addr) => addr,
    hasName = () => false,
    eosMap = null,
  } = opts;

  const eos = eosMap?.get ? eosMap.get(l.id) : null;

  const maturityDate = l.maturityTs
    ? new Date(Number(l.maturityTs) * 1000).toISOString().slice(0, 10)
    : null;
  const satProjectedDate = l.satProjectedEos || null;
  const satPaybackDate = satProjectedDate
    ? (() => {
        const d = new Date(satProjectedDate + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 21);
        return d.toISOString().slice(0, 10);
      })()
    : null;
  const minRepayDate = l.drawdownTs
    ? (() => {
        const d = new Date(Number(l.drawdownTs) * 1000);
        d.setUTCMonth(d.getUTCMonth() + 3);
        d.setUTCDate(d.getUTCDate() + 21);
        return d.toISOString().slice(0, 10);
      })()
    : null;
  let eosDate = maturityDate;
  let eosSource = maturityDate ? 'contract' : null;
  if (!eosDate) {
    if (minRepayDate && (!satPaybackDate || minRepayDate > satPaybackDate)) {
      eosDate = minRepayDate;
      eosSource = 'minimum';
    } else if (satPaybackDate) {
      eosDate = satPaybackDate;
      eosSource = 'satellite';
    }
  }
  const daysEos = daysToDate(eosDate);
  const sosDate = l.satSos ? new Date(l.satSos).toISOString().slice(0, 10) : null;
  const seasonEosDate = maturityDate || satProjectedDate;
  let loanStage = null;
  if (sosDate && seasonEosDate && l.drawdownTs) {
    const sosMs = new Date(sosDate + 'T00:00:00Z').getTime();
    const eosMs = new Date(seasonEosDate + 'T00:00:00Z').getTime();
    const seasonMs = eosMs - sosMs;
    if (seasonMs > 0) {
      const frac = (Number(l.drawdownTs) * 1000 - sosMs) / seasonMs;
      loanStage = frac < 1 / 3 ? 'Operating' : frac < 2 / 3 ? 'Cultivation' : 'Pre-harvest';
    }
  }
  const hasContact = hasName(l.borrower);
  const contactName = resolveName(l.borrower);
  const landId = l.landId ?? eos?.land_id ?? null;
  const farmName = l.farmName || eos?.farm_name || null;
  const displayName = hasContact ? contactName : (farmName || contactName);

  return {
    ...l,
    farmName,
    landId,
    hasContact,
    displayName,
    isPending: isPending(l),
    totalAmount: l.amount,
    eosDate,
    maturityDate,
    satProjectedDate,
    loanStage,
    daysToEos: daysEos,
    eosSource,
    sos: sosDate,
  };
}

// Crop-health enum from the satellite record's current_cycle — see
// resolveCropFromRecords in useActiveLoans.js. Previously duplicated
// (identically) as PORTFOLIO_HEALTH_COLOR/LABEL in staticCards.js and
// HEALTH_COLOR/LABEL in ActiveLoansCard.js — centralized here so both stay
// in sync.
// dark:text-green (not the custom green_dark token) — green_dark is
// #d4a634, a golden-amber hex despite the name, which made "good health" in
// dark mode look indistinguishable from the stressed/amber tier (2026-08-24).
export const HEALTH_COLOR = {
  excellent: 'text-green dark:text-green',
  on_track: 'text-green dark:text-green',
  stressed: 'text-amber dark:text-amber-300',
  underperforming: 'text-red dark:text-red',
};
export const HEALTH_LABEL = {
  excellent: 'Excellent',
  on_track: 'On track',
  stressed: 'Stressed',
  underperforming: 'Underperforming',
};

/**
 * Shared crop-health indicator derivation — tone/color/title only, not a
 * rendered icon, so this stays a plain utility with no icon-library/JSX
 * dependency; the caller picks the actual icon component (e.g.
 * CheckCircleIcon vs ExclamationTriangleIcon) based on `tone`. Returns null
 * when there's no health data to show at all (matches loan.health/
 * loan.healthSummary field names, but works from any {health, healthSummary}
 * pair — e.g. a future task object, not just a loan). Extracted 2026-08-24
 * from ActiveLoansCard's StatusIcon so TaskMessage (tasks.js) can reuse the
 * same tone/color/title logic once a task type carries health data.
 */
export function getHealthIndicator(health, healthSummary) {
  if (!health) return null;
  const tone = (health === 'excellent' || health === 'on_track') ? 'good' : 'warn';
  return {
    tone,
    colorClass: HEALTH_COLOR[health] ?? 'text-amber dark:text-amber-300',
    title: `Crop health: ${healthSummary || HEALTH_LABEL[health] || health}`,
  };
}

// Schematic (hardcoded, NOT derived from real NDVI/satellite data) per-crop
// biomass-over-cycle shape: 0 at sowing, rises to 1 (peak biomass) by
// peakFrac, holds near-peak until plateauEnd, then gradually declines toward
// `floor` (senescence — the crop is still standing, just past peak) right up
// to harvest, where it drops to 0 abruptly (the cut itself). Grouped into a
// few archetypes rather than bespoke-tuned per crop — this is illustrative,
// not a model output. Keyed by the same numeric cropFamily code as
// CROP_CODE_COLOR_KEY/CROP_CODE_NAMES. Used both for the portfolio card's
// CycleCurve chart and (below) as the anchor for the placeholder per-crop
// stage schedule, so the visual curve and the stage comparison stay
// internally consistent.
export const CROP_CURVE_SHAPE = {
  0:  { peakFrac: 0.30, plateauEnd: 0.55, floor: 0.35 }, // Paddy
  1:  { peakFrac: 0.30, plateauEnd: 0.50, floor: 0.35 }, // Groundnut
  2:  { peakFrac: 0.20, plateauEnd: 0.85, floor: 0.70 }, // Sugarcane — perennial, long plateau
  3:  { peakFrac: 0.25, plateauEnd: 0.80, floor: 0.65 }, // Banana
  4:  { peakFrac: 0.35, plateauEnd: 0.55, floor: 0.40 }, // Potato
  5:  { peakFrac: 0.35, plateauEnd: 0.55, floor: 0.40 }, // Onion
  6:  { peakFrac: 0.30, plateauEnd: 0.45, floor: 0.30 }, // Sesame
  7:  { peakFrac: 0.25, plateauEnd: 0.80, floor: 0.65 }, // Cassava — slow root crop
  8:  { peakFrac: 0.30, plateauEnd: 0.50, floor: 0.35 }, // Maize
  9:  { peakFrac: 0.35, plateauEnd: 0.45, floor: 0.30 }, // Green Gram — fast pulse
  10: { peakFrac: 0.35, plateauEnd: 0.45, floor: 0.30 }, // Horse Gram
  11: { peakFrac: 0.35, plateauEnd: 0.45, floor: 0.30 }, // Black Gram
  12: { peakFrac: 0.20, plateauEnd: 0.90, floor: 0.80 }, // Coconut — near-constant tree crop
  13: { peakFrac: 0.30, plateauEnd: 0.60, floor: 0.40 }, // Cotton
};
export const DEFAULT_CURVE_SHAPE = { peakFrac: 0.30, plateauEnd: 0.55, floor: 0.35 };

// Approximate biomass (0-1) at a given x fraction (0-1) along the schematic
// curve — a simplified piecewise-linear stand-in for the smoother bezier
// actually drawn, close enough for positioning the health-icon placeholders.
export function schematicBiomassAt(xFrac, shape) {
  const { peakFrac, plateauEnd, floor } = shape;
  if (xFrac <= peakFrac) return xFrac / peakFrac;
  if (xFrac <= plateauEnd) return 1;
  if (xFrac < 0.98) {
    const t = (xFrac - plateauEnd) / (0.98 - plateauEnd);
    return 1 - t * (1 - floor);
  }
  return floor;
}

// The 5 stage names, in cycle order — matches the vocabulary the satellite
// side is expected to report (loan.stage), so comparison is a plain index
// lookup, not string-guessing.
export const STAGE_NAMES = ['vegetative', 'flowering', 'grain_fill', 'maturity', 'harvest_ready'];
export const STAGE_LABELS = {
  vegetative: 'Vegetative',
  flowering: 'Flowering',
  grain_fill: 'Grain fill',
  maturity: 'Maturity',
  harvest_ready: 'Harvest ready',
};

// ROUGH PLACEHOLDER per-crop stage-duration lookup — "from the book" data
// hasn't landed yet, so each crop's 5 stage boundaries are DERIVED from
// CROP_CURVE_SHAPE's own peakFrac/plateauEnd (reusing the same schematic
// numbers the curve is drawn from) rather than independently invented.
// Replace with real per-crop durations once available — only this function
// needs to change, the comparison logic below doesn't care where the
// boundaries come from.
export function stageScheduleForCrop(cropFamily) {
  const { peakFrac, plateauEnd } = CROP_CURVE_SHAPE[cropFamily] ?? DEFAULT_CURVE_SHAPE;
  return [
    { stage: 'vegetative',    endFrac: peakFrac * 0.7 },
    { stage: 'flowering',     endFrac: peakFrac },
    { stage: 'grain_fill',    endFrac: plateauEnd },
    { stage: 'maturity',      endFrac: 0.92 },
    { stage: 'harvest_ready', endFrac: 1.00 },
  ];
}
export function expectedStageAt(todayFrac, cropFamily) {
  const schedule = stageScheduleForCrop(cropFamily);
  for (const s of schedule) if (todayFrac <= s.endFrac) return s.stage;
  return 'harvest_ready';
}

// Compares the satellite's reported stage against the expected one by
// STAGE_NAMES index, not just equal/not-equal — lets a mismatch be reported
// as "running behind" or "running ahead" with a stage-count, not just "off".
// Returns null when either side is missing or unrecognized (can't judge).
export function compareStage(actualStage, expectedStage) {
  if (!actualStage || !expectedStage) return null;
  const norm = (s) => String(s).toLowerCase().trim().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
  const ai = STAGE_NAMES.indexOf(norm(actualStage));
  const ei = STAGE_NAMES.indexOf(norm(expectedStage));
  if (ai === -1 || ei === -1) return null; // satellite's vocabulary didn't match ours — can't compare
  if (ai === ei) return { status: 'on_track', deltaStages: 0 };
  return { status: ai < ei ? 'behind' : 'ahead', deltaStages: Math.abs(ai - ei) };
}

/**
 * Derives a unified list of "issues" for a loan — stage conformance (see
 * compareStage above) plus crop health — each as
 * { tone: 'ok'|'warn', icon: '✓'|'⚠', text, title }. Used by both the
 * portfolio Harvest Calendar card (rendered as a full bullet list) and the
 * Cash & Liquidity active-loans list (rendered as a single worst-tone
 * summary icon via worstIssueTone below), so the two views never disagree
 * about what counts as "off track."
 *
 * A plain function, not a React hook — both consumers build their rows via
 * .map() callbacks rather than actual per-row components, and a real hook
 * (e.g. one using useMemo) can't legally be called from inside a .map()
 * callback (Rules of Hooks). The computation here is cheap enough (a few
 * date/string ops) that memoization wouldn't earn its keep anyway.
 */
export function getLoanIssues(loan) {
  const issues = [];

  if (loan?.sos && loan?.eosDate) {
    const sosMs = new Date(loan.sos + 'T00:00:00Z').getTime();
    const eosMs = new Date(loan.eosDate + 'T00:00:00Z').getTime();
    const todayFrac = Math.min(1, Math.max(0, (Date.now() - sosMs) / (eosMs - sosMs)));
    const expectedStage = expectedStageAt(todayFrac, loan.cropFamily);
    const stageCompare = compareStage(loan.stage, expectedStage);
    const expectedUpper = (STAGE_LABELS[expectedStage] ?? expectedStage).toUpperCase();
    const actualUpper = loan.stage ? (STAGE_LABELS[loan.stage] ?? loan.stage).toUpperCase() : null;

    if (!stageCompare) {
      issues.push({
        tone: 'warn', icon: '⚠', text: `Stage: ${expectedUpper}`,
        title: 'Expected stage only — not yet confirmed by satellite (rough placeholder per-crop schedule, not yet real stage-duration data).',
      });
    } else if (stageCompare.status === 'on_track') {
      issues.push({
        tone: 'ok', icon: '✓', text: `Stage: ${actualUpper}`,
        title: 'Confirmed on track with the expected schedule (rough placeholder per-crop schedule, not yet real stage-duration data).',
      });
    } else {
      const dir = stageCompare.status === 'behind' ? 'behind' : 'ahead of';
      issues.push({
        tone: 'warn', icon: '⚠', text: `Stage: ${actualUpper}`,
        title: `Running ${stageCompare.deltaStages} stage${stageCompare.deltaStages > 1 ? 's' : ''} ${dir} schedule — expected ${expectedUpper} (rough placeholder per-crop schedule, not yet real stage-duration data).`,
      });
    }
  }

  if (loan?.health) {
    const isGood = loan.health === 'excellent' || loan.health === 'on_track';
    issues.push({
      tone: isGood ? 'ok' : 'warn',
      icon: isGood ? '✓' : '⚠',
      text: `Health: ${loan.healthSummary || HEALTH_LABEL[loan.health] || loan.health}`,
      title: loan.healthDescription || loan.healthSummary || HEALTH_LABEL[loan.health] || loan.health,
    });
  }

  return issues;
}

// Single worst-of tone across an issues list — 'warn' if anything needs
// attention, 'ok' if everything's fine, null if there's nothing to judge
// yet. Used where only one summary icon fits (e.g. next to CropIcon in the
// Cash & Liquidity list), unlike the portfolio card's full bullet list.
export function worstIssueTone(issues) {
  if (!issues?.length) return null;
  return issues.some((i) => i.tone === 'warn') ? 'warn' : 'ok';
}
