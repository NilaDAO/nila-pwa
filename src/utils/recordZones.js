/**
 * Merge `record.zones` with subzone partitions found in `record.cycles`.
 *
 * A subzone is a cycle whose `zone_id` ends in `_a`/`_b` and carries its own
 * `subzone_geometry` + `subzone_of` (parent zone id). When a parent zone has
 * been partitioned, we replace it in the zone list with one pseudo-zone per
 * subzone so downstream code (map rendering, select-mode) sees the live
 * partition without having to overlay anything.
 *
 * Returns a new array; the original `record.zones` is not mutated. Pseudo-
 * subzones carry their parent id under `subzone_of` so callers can fall back
 * to the parent's crop when the subzone has no direct classification.
 */
export function mergeZonesWithSubzones(record) {
  const baseZones = Array.isArray(record?.zones) ? record.zones : [];
  const cycles = Array.isArray(record?.cycles)
    ? record.cycles
    : Object.values(record?.cycles || {});

  // Pick the latest subzone cycle per subzone id (e.g. z1_a, z1_b).
  const latestByZone = {};
  for (const c of cycles) {
    const sg = c?.subzone_geometry;
    if (!sg || !sg.type || !sg.coordinates?.length) continue;
    const zid = c.zone_id;
    if (!zid) continue;
    const cur = latestByZone[zid];
    if (!cur || (c.sos || '') > (cur.sos || '')) latestByZone[zid] = c;
  }

  const pseudo = Object.values(latestByZone).map((c) => ({
    zone_id: c.zone_id,
    category: 'crop_zone',
    area_m2: c.subzone_area_m2 ?? 0,
    geometry: c.subzone_geometry,
    subzone_of: c.subzone_of,
  }));

  const subdivided = new Set(pseudo.map((z) => z.subzone_of));

  // Subdivided parents stay as a non-selectable backdrop layer (rendered
  // first, below the subzones) so any tiny rendering gap between adjacent
  // subzone polygons is filled by the parent. _backdrop is checked by the
  // map and select-mode to skip stroke + click.
  const parentBackdrops = baseZones
    .filter((z) => subdivided.has(z.zone_id))
    .map((z) => ({ ...z, _backdrop: true }));

  return [
    ...parentBackdrops,
    ...baseZones.filter((z) => !subdivided.has(z.zone_id)),
    ...pseudo,
  ];
}
