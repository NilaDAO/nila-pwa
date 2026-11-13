// A13 claim limit (27 Oct, acres): the most a machine owner may claim on a scanned voucher code, in whole hundredths of
// an acre, as machinery.claim checks it: the units her code allows (≤ what is left on her voucher) at this machine's
// price for her crop against the tractor's price, never more than the crop agreement's area, never more than the machine's
// acres a week (whole acres; this week's use in hundredths). Integer math only: 0.29 ac is 29, not 28.999….
// Returns null when a price is unknown (not read yet or the read failed), so the screen can say so instead of "0 ac".

/** { signed, units, used }: her signed max and her voucher; price/tractor: ₹ an acre; centiAcres: the share's area
 *  (0 = none in the token id); acresPerWeek: whole acres; usedCenti: this week's hundredths. */
export function claimMaxCenti({ signed, units, used, price, tractor, centiAcres, acresPerWeek, usedCenti }) {
  if (!(price > 0) || !(tractor > 0)) return null;
  const left = Math.max(0, Math.min(Number(signed) || 0, (Number(units) || 0) - (Number(used) || 0)));
  // Hundredths of an acre whose units (ceil(centi × price ÷ tractor), the contract's rounding) fit in `left`.
  let byUnits = Math.floor(Math.round(((left * tractor) / price) * 1e6) / 1e6);
  while (byUnits > 0 && Math.ceil(Math.round(((byUnits * price) / tractor) * 1e6) / 1e6) > left) byUnits -= 1;
  const byArea = centiAcres > 0 ? centiAcres : Infinity;
  const byWeek = Math.max(0, Math.round(Number(acresPerWeek || 0) * 100) - Math.round(Number(usedCenti || 0)));
  return Math.max(0, Math.min(byUnits, byArea, byWeek));
}
