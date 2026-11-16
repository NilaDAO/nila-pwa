// Overlap of a field's drawn shape with other members' land titles (16 Nov): the node sends each field's fencing
// output before the planner cuts it ("drawn"); the app samples points inside it and counts those on another member's
// field. Above OVERLAP_SHARE of the shape, the shape is marked red with "Overlap with <land>". No follow-up.

export const OVERLAP_SHARE = 0.2;
const GRID = 30;   // GRID x GRID sample points over the shape's box: the share to about 1–2 %

const rings = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Inside a polygon's outer ring and outside its holes, for any part.
const inGeom = (x, y, g) => rings(g).some(([outer, ...holes]) => outer && inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)));

function box(g) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  rings(g).forEach(([outer]) => (outer || []).forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
  return [x0, y0, x1, y1];
}

const touches = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** The lands (labels) that cover more than OVERLAP_SHARE of the drawn shape. others: [{ land, geometry }]. */
export function overlaps(drawn, others) {
  if (!drawn || !others?.length) return [];
  const b = box(drawn);
  const near = others.filter((o) => o.geometry && touches(b, box(o.geometry)));
  if (!near.length) return [];
  let n = 0;
  const hits = new Map();
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const x = b[0] + ((i + 0.5) / GRID) * (b[2] - b[0]);
      const y = b[1] + ((j + 0.5) / GRID) * (b[3] - b[1]);
      if (!inGeom(x, y, drawn)) continue;
      n += 1;
      const seen = new Set();
      near.forEach((o) => { if (!seen.has(o.land) && inGeom(x, y, o.geometry)) { seen.add(o.land); hits.set(o.land, (hits.get(o.land) || 0) + 1); } });
    }
  }
  return n ? [...hits].filter(([, k]) => k / n > OVERLAP_SHARE).map(([land]) => land) : [];
}
