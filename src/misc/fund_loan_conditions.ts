
export type FundTuple = [msg: string, flag: boolean, code: number, help: string];
export type FundConditions = {
  PLANTING: FundTuple[];
};

// Calculate MINCAP as a number (format only when you render text)
export function calculateMINCAP(
  debtsCount: number,
  baseEnv: string | number | undefined = process.env.REACT_APP_MIN_CAP
): number {
  const base = Number(baseEnv ?? 0);
  const denom = (debtsCount ?? 0) + 1;
  const value = base / (denom ** 2);
  return Number.isFinite(value) ? value : 0;
}

// Build the object with the current minCap
export function LoanConditions(minCap: number, smallPropertyFlag: number, thresholdPct: number = 10): Readonly<FundConditions> {
  const minCapDisplay = minCap.toFixed(0); // or toFixed(2) if you want decimals
  const safeArea = Number.isFinite(smallPropertyFlag) ? smallPropertyFlag : 2000;
  const minArea = safeArea > 2000 ? 2000 : safeArea * 0.9; // if total land is less then 2000, take entire area with 10% margin (for borders and stuff)
  const thresholdDisplay = Number.isFinite(thresholdPct) ? thresholdPct.toFixed(0) : '10';
  return Object.freeze({
    PLANTING: [
      ['Your property is near the union hub.',                              false, 4, 'Change to a union closer to your fields.'],
      [`Your union invested share must be ${thresholdDisplay}% plus.`,     false, 3, 'Ask your union and members to deposit additional funds.'],
      [`Your property has an area ready to grow crops of minimal ${minArea} m².`, false, 1, 'Make sure you cleared sufficient land.'],
      [`You have a cap rate lower then ${minCapDisplay}.`, false, -1,
        'Make sure to invest more nIN in your favorite fund.'],
    ],
  });
}
