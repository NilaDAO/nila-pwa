// Areas that touch (14 Nov): before a plan she may add a small area to a touching one instead of leaving it out.
// Two areas touch when a corner of one lies within a few metres of the other's border (the areas come from a raster,
// so shared borders are near, not exact).
// The outer rings of a Polygon or MultiPolygon (as AreaMap's ringsOf), here without the map code.
const ringsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);

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
  const mine = ringsOf(me?.geometry);
  if (!mine.length || !mine[0].length) return [];
  const p = project(mine[0][0][1]);
  return areas.filter((a) => a.zone_id !== zone).filter((a) => {
    const theirs = ringsOf(a.geometry);
    return theirs.length && (near(mine, theirs, p) || near(theirs, mine, p));
  }).map((a) => a.zone_id);
}
