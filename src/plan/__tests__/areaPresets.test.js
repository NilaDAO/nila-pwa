import { presetOf, presets } from '../areaPresets';

// A rectangle w × h metres near 11.9° N (Tamil Nadu), as GeoJSON.
const rect = (w, h) => {
  const mx = 111320 * Math.cos((11.9 * Math.PI) / 180); const my = 110540;
  const x = w / mx; const y = h / my;
  return { type: 'Polygon', coordinates: [[[79, 11.9], [79 + x, 11.9], [79 + x, 11.9 + y], [79, 11.9 + y], [79, 11.9]]] };
};

test('trees and water from the record, strips and small areas as bushes, a field left to her', () => {
  expect(presetOf({ category: 'perennial', geometry: rect(60, 60) })).toBe('trees');
  expect(presetOf({ category: 'water', geometry: rect(60, 60) })).toBe('water');
  expect(presetOf({ geometry: rect(15, 15) })).toBe('bushes');          // 225 m², under 0.1 acre
  expect(presetOf({ geometry: rect(200, 6) })).toBe('bushes');          // a long thin strip
  expect(presetOf({ geometry: rect(80, 60) })).toBeNull();              // a field
});

test('no preset where she set it or the satellite named a crop', () => {
  const areas = [{ zone_id: 'a', geometry: rect(10, 10) }, { zone_id: 'b', geometry: rect(10, 10) }, { zone_id: 'c', geometry: rect(10, 10) }];
  expect(presets(areas, { b: { unknown: false } }, { a: 'maize' })).toEqual({ c: 'bushes' });
});
