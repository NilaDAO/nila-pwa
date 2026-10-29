// One rule for map taps on every map screen (executive decision 24 Oct, LOAN_RULES "Map-centred app"): a tap on a
// field or property opens its details in the card; a tap on the same one again goes back to the previous view; a tap
// on another one loads its details instead. AreaMap already sends null for a tap on the selected area.

/** onSelect for AreaMap: `current` (an id or a list of ids now shown), `open(id)`, `back()`. */
export const tapRule = (current, { open, back }) => (z) => {
  const shown = current == null ? [] : [].concat(current);
  if (z == null || shown.includes(z)) back();
  else open(z);
};

/** Area of a GeoJSON Polygon / MultiPolygon in m² (spherical, enough for a field). */
export function areaM2(geometry) {
  const R = 6378137;
  const ring = (c) => {
    let a = 0;
    for (let i = 0; i < c.length - 1; i++) {
      const [x1, y1] = c[i]; const [x2, y2] = c[i + 1];
      a += ((x2 - x1) * Math.PI / 180) * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
    }
    return Math.abs(a * R * R / 2);
  };
  const poly = (p) => (p.length ? ring(p[0]) - p.slice(1).reduce((t, h) => t + ring(h), 0) : 0);
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return poly(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.reduce((t, p) => t + poly(p), 0);
  return 0;
}
