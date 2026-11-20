import { gapM } from '../overlap';

// 20 Nov: a neighbour plot is offered only to the fields that touch it.
const sq = (lng, lat, d) => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] });

test('touching, a path apart, and far', () => {
  const a = sq(78, 11, 0.001);                       // ~110 m square
  expect(gapM(a, sq(78.001, 11, 0.001))).toBeLessThan(0.5);            // sharing an edge
  const path = gapM(a, sq(78.00105, 11, 0.001));                         // ~5 m apart
  expect(path).toBeGreaterThan(4); expect(path).toBeLessThan(7);
  expect(gapM(a, sq(78.003, 11, 0.001))).toBeGreaterThan(200);          // a field away
  expect(gapM(a, sq(78.0002, 11.0002, 0.0003))).toBe(0);                // inside
});
