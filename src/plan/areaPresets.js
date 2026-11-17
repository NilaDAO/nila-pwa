// What is on her land now, preset (17 Nov): before she taps, an area the record shows as trees or water gets that
// land cover, and a small or long thin area (a bund, a hedge, a path along a field) gets Bushes. A larger area is left
// to her (a crop). Every preset is only a starting answer: she changes it with one tap.

const ACRE_M2 = 4046.86;
export const SMALL_M2 = 0.1 * ACRE_M2;   // under 0.1 acre
export const THIN = 1 / 3;                // compactness (4πA/P², a circle = 1) under a third: a strip

const outer = (g) => (g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);

/** Area (m²) and perimeter (m) of a GeoJSON geometry's outer rings, on a local flat projection. */
export function measure(geometry) {
  const rings = outer(geometry).filter((r) => r && r.length > 2);
  if (!rings.length) return { area: 0, perimeter: 0 };
  const lat0 = (rings[0][0][1] * Math.PI) / 180;
  const mx = 111320 * Math.cos(lat0); const my = 110540;
  let area = 0; let perimeter = 0;
  for (const r of rings) {
    let a = 0;
    for (let i = 0; i < r.length; i += 1) {
      const [x1, y1] = r[i]; const [x2, y2] = r[(i + 1) % r.length];
      a += (x1 * mx) * (y2 * my) - (x2 * mx) * (y1 * my);
      perimeter += Math.hypot((x2 - x1) * mx, (y2 - y1) * my);
    }
    area += Math.abs(a) / 2;
  }
  return { area, perimeter };
}

/** The preset land cover of one area (a COVERS key), or null for an area left to her. */
export function presetOf(zone) {
  const cat = String(zone?.category || '');
  if (cat === 'perennial') return 'trees';
  if (cat === 'water') return 'water';
  const { area, perimeter } = measure(zone?.geometry);
  const m2 = zone?.area_m2 || area;
  if (!m2) return null;
  if (m2 < SMALL_M2) return 'bushes';
  const compact = perimeter ? (4 * Math.PI * area) / (perimeter * perimeter) : 1;
  return compact < THIN ? 'bushes' : null;
}

/** Presets for every area she has not set and the satellite did not name (`now`: growingNow's readings). */
export function presets(areas, now = {}, growing = {}) {
  const out = {};
  for (const z of areas || []) {
    const id = z.zone_id;
    if (growing[id] || (now[id] && !now[id].unknown)) continue;
    const p = presetOf(z);
    if (p) out[id] = p;
  }
  return out;
}
