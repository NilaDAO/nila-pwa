// Records made before 14 Nov: the "unknown" area was every leftover border pixel of the land in one area, in many
// pieces (DEF · 9). Each piece counts with the area it shares the most border with (ties: the first area by id); a
// piece that touches none stays. The node does the same (nila-sensing plan/record_view.py, scattered_parts), so the
// map and the plan agree: the record itself is never changed (its bytes are checked against its hash).
const polysOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);
const ringArea = (r) => { let a = 0; for (let i = 1; i < r.length; i += 1) a += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return Math.abs(a) / 2; };
// Python's round(x, 7) on the edge ends; equal shared edges give equal keys on both sides.
const r7 = (x) => Math.round(x * 1e7) / 1e7;
function segments(rings) {
  const out = [];
  rings.forEach((ring) => { for (let i = 1; i < ring.length; i += 1) {
    const a = [r7(ring[i - 1][0]), r7(ring[i - 1][1])]; const b = [r7(ring[i][0]), r7(ring[i][1])];
    const lo = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
    const key = lo ? `${a[0]},${a[1]}|${b[0]},${b[1]}` : `${b[0]},${b[1]}|${a[0]},${a[1]}`;
    out.push([key, Math.hypot(b[0] - a[0], b[1] - a[1])]);
  } });
  return out;
}
const order = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/** { unknown zone id: [{ to: neighbour id | null, share, poly }] } */
export function scatteredParts(zones = []) {
  const out = {};
  for (const z of zones) {
    const polys = polysOf(z.geometry);
    if (z.category !== 'unknown' || polys.length < 2) continue;
    const others = zones.filter((o) => o !== z && o.geometry).sort((a, b) => order(a.zone_id, b.zone_id))
      .map((o) => [String(o.zone_id), new Set(segments(polysOf(o.geometry).flat()).map(([k]) => k))]);
    const total = polys.reduce((s, p) => s + ringArea(p[0]), 0) || 1;
    out[String(z.zone_id)] = polys.map((p) => {
      const mine = segments(p);
      let best = null; let bestLen = 0;
      for (const [id, keys] of others) {
        const shared = mine.reduce((s, [k, l]) => (keys.has(k) ? s + l : s), 0);
        if (shared > bestLen + 1e-12) { best = id; bestLen = shared; }
      }
      return { to: best, share: ringArea(p[0]) / total, poly: p };
    });
  }
  return out;
}

/** The zones with each piece of a scattered unknown zone drawn and counted with its neighbour; the unknown zone keeps
 *  only the pieces that touch nothing (and is gone when none). New objects; the record is not changed. */
export function absorbScattered(zones = []) {
  const parts = scatteredParts(zones);
  if (!Object.keys(parts).length) return zones;
  const byId = new Map(zones.map((z) => [String(z.zone_id), { ...z }]));
  for (const [zid, list] of Object.entries(parts)) {
    const u = byId.get(zid);
    const whole = u.area_m2 || 0;
    const left = [];
    for (const { to, share, poly } of list) {
      const n = to && byId.get(to);
      if (!n) { left.push(poly); continue; }
      n.geometry = { type: 'MultiPolygon', coordinates: [...polysOf(n.geometry), poly] };
      n.area_m2 = (n.area_m2 || 0) + whole * share;
    }
    if (left.length) {
      u.area_m2 = whole * list.filter((x) => !x.to || !byId.get(x.to)).reduce((s, x) => s + x.share, 0);
      u.geometry = { type: 'MultiPolygon', coordinates: left };
    } else byId.delete(zid);
  }
  return zones.filter((z) => byId.has(String(z.zone_id))).map((z) => byId.get(String(z.zone_id)));
}
