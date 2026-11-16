import { googlePaths } from '../overlap';

const sq = (x, y) => [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]];

describe('googlePaths (16 Nov: a MultiPolygon shape crashed the border map)', () => {
  test('a Polygon: its outer ring as lat/lng numbers', () => {
    const p = googlePaths({ type: 'Polygon', coordinates: [sq(78, 11)] });
    expect(p).toHaveLength(1);
    expect(p[0][0]).toEqual({ lat: 11, lng: 78 });
  });

  test('a MultiPolygon: every part, each point with numbers (no arrays for lat and lng)', () => {
    const p = googlePaths({ type: 'MultiPolygon', coordinates: [[sq(78, 11)], [sq(80, 12), sq(80.2, 12.2)]] });
    expect(p).toHaveLength(2);
    p.flat().forEach((q) => { expect(typeof q.lat).toBe('number'); expect(typeof q.lng).toBe('number'); });
    expect(p[1][0]).toEqual({ lat: 12, lng: 80 });
  });

  test('no geometry: no paths', () => {
    expect(googlePaths(undefined)).toEqual([]);
  });
});
