// Overlap of a field's drawn shape with other members' land titles (16 Nov): the node sends each field's fencing
// output before the planner cuts it ("drawn"); the app samples points inside it and counts those on another member's
// field. Above OVERLAP_SHARE of the shape, the shape is marked red with "Overlap with <land>". No follow-up.

export const OVERLAP_SHARE = 0.2;
const GRID = 30;   // GRID x GRID sample points over the shape's box: the share to about 1–2 %

const rings = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);

/** A Polygon or MultiPolygon as Google Maps paths (16 Nov): each part's outer ring as [{ lat, lng }]. A MultiPolygon
 *  read as one ring gave Google arrays for lat and lng, and the border map crashed on that shape. */
export const googlePaths = (g) => rings(g).map((poly) => (poly[0] || []).map(([lng, lat]) => ({ lat, lng })));

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

/** The lands (labels) that cover more than `share` of the shape. others: [{ land, geometry }]. */
export function overlaps(drawn, others, share = OVERLAP_SHARE) {
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
  return n ? [...hits].filter(([, k]) => k / n > share).map(([land]) => land) : [];
}

/** Hatching for a land title (16 Nov): diagonal segments every `spacingM` metres, clipped to the shape (holes
 *  left open), as [[lat, lng], [lat, lng]] pairs. The map draws them as thin lines: no fill, no border. */
export function hatch(geometry, spacingM = 4) {
  const polys = rings(geometry);
  if (!polys.length) return [];
  const b = box(geometry);
  const lat0 = (b[1] + b[3]) / 2;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180); const ky = 110540;   // metres per degree
  const out = [];
  polys.forEach((poly) => {
    // local metres; lines u = x + y = c (45°)
    const edges = poly.flatMap((ring) => ring.slice(1).map((p, i) => [[ring[i][0] * kx, ring[i][1] * ky], [p[0] * kx, p[1] * ky]]));
    const us = edges.flatMap(([a, c]) => [a[0] + a[1], c[0] + c[1]]);
    const [u0, u1] = [Math.min(...us), Math.max(...us)];
    for (let u = Math.ceil(u0 / spacingM) * spacingM; u <= u1; u += spacingM) {
      const xs = [];
      edges.forEach(([a, c]) => {
        const ua = a[0] + a[1]; const uc = c[0] + c[1];
        if ((ua > u) === (uc > u)) return;
        const t = (u - ua) / (uc - ua);
        xs.push(a[0] + t * (c[0] - a[0]));
      });
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const [xa, xb] = [xs[i], xs[i + 1]];
        out.push([[(u - xa) / ky, xa / kx], [(u - xb) / ky, xb / kx]]);
      }
    }
  });
  return out;
}


/** The shortest distance in metres between two shapes (20 Nov: a neighbour plot is offered only to the fields that
 *  touch it): 0 when they overlap; else the nearest corner of one to an edge of the other. */
export function gapM(a, b) {
  const pa = rings(a); const pb = rings(b);
  if (!pa.length || !pb.length) return Infinity;
  const lat0 = ((box(a)[1] + box(a)[3]) / 2) * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0); const ky = 110540;
  const xy = ([lng, lat]) => [lng * kx, lat * ky];
  const pts = (p) => p.flatMap(([outer]) => (outer || []).map(xy));
  const segs = (p) => p.flatMap((poly) => poly.flatMap((ring) => ring.slice(1).map((q, i) => [xy(ring[i]), xy(q)])));
  const toSeg = ([px, py], [[x1, y1], [x2, y2]]) => {
    const dx = x2 - x1; const dy = y2 - y1; const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  // A corner of one inside the other: they overlap.
  if (pa.some(([outer]) => (outer || []).some(([x, y]) => inGeom(x, y, b)))
    || pb.some(([outer]) => (outer || []).some(([x, y]) => inGeom(x, y, a)))) return 0;
  let d = Infinity;
  const sa = segs(pa); const sb = segs(pb);
  for (const p of pts(pa)) for (const s of sb) d = Math.min(d, toSeg(p, s));
  for (const p of pts(pb)) for (const s of sa) d = Math.min(d, toSeg(p, s));
  return d;
}
