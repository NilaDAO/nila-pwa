// Areas that touch (14 Nov): before a plan she may add a small area to a touching one instead of leaving it out.
// Two areas touch when a corner of one lies within a few metres of the other's border (the areas come from a raster,
// so shared borders are near, not exact).
// An area inside another counts too (14 Nov): the outer one's hole is its border, or (no hole cut) it lies within it.
// Every ring of a Polygon or MultiPolygon, holes included; and the outer rings only.
const allRings = (g) => (g?.type === 'Polygon' ? g.coordinates : g?.type === 'MultiPolygon' ? g.coordinates.flat() : []);
const outerRings = (g) => (g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);

function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const within = (a, b) => a.some((r) => r.length && b.some((o) => o.length > 2 && inside(r[0], o)));

const NEAR_M = 6;

function project(lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return ([lng, lat]) => [lng * kx, lat * 110540];
}

function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax; const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function near(ra, rb, p) {
  for (const ring of rb) {
    const q = ring.map(p);
    for (const r of ra) {
      for (const c of r) {
        const pt = p(c);
        for (let i = 1; i < q.length; i += 1) if (segDist(pt, q[i - 1], q[i]) <= NEAR_M) return true;
      }
    }
  }
  return false;
}

/** The areas (zone ids) that touch `zone`, in the given order. areas: [{ zone_id, geometry }]. */
export function neighboursOf(areas, zone) {
  const me = areas.find((a) => a.zone_id === zone);
  const mine = allRings(me?.geometry);
  if (!mine.length || !mine[0].length) return [];
  const p = project(mine[0][0][1]);
  return areas.filter((a) => a.zone_id !== zone).filter((a) => {
    const theirs = allRings(a.geometry);
    return theirs.length && (near(mine, theirs, p) || near(theirs, mine, p)
      || within(outerRings(me.geometry), outerRings(a.geometry)) || within(outerRings(a.geometry), outerRings(me.geometry)));
  }).map((a) => a.zone_id);
}
