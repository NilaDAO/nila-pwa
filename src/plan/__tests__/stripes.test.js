import { stripes } from '../AreaMap';

const sq = (x0, y0, d) => [[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]];
const inside = ([x, y], [x0, y0, d]) => x >= x0 - 1e-9 && x <= x0 + d + 1e-9 && y >= y0 - 1e-9 && y <= y0 + d + 1e-9;

test('stripes stay inside the area and skip its hole (18 Nov)', () => {
  const s = stripes([sq(78, 11, 0.001)], 10);
  expect(s.length).toBeGreaterThan(5);
  for (const [a, b] of s) { expect(inside(a, [78, 11, 0.001])).toBe(true); expect(inside(b, [78, 11, 0.001])).toBe(true); }
  const holed = stripes([sq(78, 11, 0.001), sq(78.0004, 11.0004, 0.0002)], 10);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const [a, b] of holed) expect(inside(mid(a, b), [78.0004, 11.0004, 0.0002]) && !inside(a, [78.0004, 11.0004, 0.0002]) && !inside(b, [78.0004, 11.0004, 0.0002])).toBe(false);
});

test('the other diagonal (19 Nov cross-hatch) gives as many lines, mirrored', () => {
  const { stripes } = require('../AreaMap');
  const sq = [[[78, 11], [78.001, 11], [78.001, 11.001], [78, 11.001], [78, 11]]];
  const a = stripes(sq, 10, 1); const b = stripes(sq, 10, -1);
  expect(b.length).toBe(a.length);
  // a / line rises one way, a \ line the other
  const slope = ([p, q]) => Math.sign((q[1] - p[1]) / (q[0] - p[0]));
  expect(slope(a[3])).toBe(-slope(b[3]));
});

test('a fixed spacing lines up across two parts of an area (19 Nov: bio manure lines)', () => {
  const { stripes, MANURE_STEP } = require('../AreaMap');
  const left = [[[78, 11], [78.001, 11], [78.001, 11.001], [78, 11.001], [78, 11]]];
  const right = [[[78.001, 11], [78.0023, 11], [78.0023, 11.001], [78.001, 11.001], [78.001, 11]]];
  // a line leaving the left part at its right edge carries on in the right part at the same point
  const atEdge = (segs) => segs.flat().filter(([lng]) => Math.abs(lng - 78.001) < 1e-9).map(([, lat]) => lat.toFixed(7)).sort();
  const l = atEdge(stripes(left, 0, -1, MANURE_STEP)); const r = atEdge(stripes(right, 0, -1, MANURE_STEP));
  expect(l.length).toBeGreaterThan(0);
  expect(l).toEqual(r);
});

test('a selected area\'s line is inside it (20 Nov): every corner of the inset ring is inside the square', () => {
  const { insetRing } = require('../AreaMap');
  const ring = [[78, 11], [78.001, 11], [78.001, 11.001], [78, 11.001], [78, 11]];
  for (const r of [ring, [...ring].reverse()]) {
    const out = insetRing(r, 3);
    expect(out.length).toBe(5);
    for (const [x, y] of out.slice(0, 4)) {
      expect(x).toBeGreaterThan(78); expect(x).toBeLessThan(78.001);
      expect(y).toBeGreaterThan(11); expect(y).toBeLessThan(11.001);
    }
    // about 3 m in (0.000027° of latitude)
    expect(Math.min(...out.map(([, y]) => y)) - 11).toBeGreaterThan(0.00002);
    expect(Math.min(...out.map(([, y]) => y)) - 11).toBeLessThan(0.00004);
  }
});
