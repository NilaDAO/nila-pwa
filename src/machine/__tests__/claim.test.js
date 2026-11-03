import { claimMaxCenti } from '../claim';

const base = { signed: 100, units: 100, used: 0, price: 1100, tractor: 1100, centiAcres: 101, acresPerWeek: 20, usedCenti: 0 };

describe('claimMaxCenti (A13)', () => {
  it('100 centi tractor acres on a type-1 machine at ₹1,100 an acre pay for 1 acre', () => {
    expect(claimMaxCenti(base)).toBe(100);
  });
  it('is capped by the crop share area in whole hundredths (0.29 ac stays 29)', () => {
    expect(claimMaxCenti({ ...base, centiAcres: 29 })).toBe(29);
  });
  it('another machine by price ratio, rounded as the contract (₹350 power weeder)', () => {
    // 314 hundredths use ceil(314 × 350 / 1100) = 100 units; 315 would use 101.
    expect(claimMaxCenti({ ...base, price: 350, centiAcres: 0 })).toBe(314);
  });
  it('is capped by what is left on the voucher and by the week', () => {
    expect(claimMaxCenti({ ...base, used: 60 })).toBe(40);
    expect(claimMaxCenti({ ...base, acresPerWeek: 1, usedCenti: 30 })).toBe(70);
  });
  it('says "unknown" (null), not 0, while the tractor price is missing', () => {
    expect(claimMaxCenti({ ...base, tractor: 0 })).toBeNull();
    expect(claimMaxCenti({ ...base, price: undefined })).toBeNull();
  });
});
