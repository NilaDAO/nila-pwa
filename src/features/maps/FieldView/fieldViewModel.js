/**
 * Plan 044 §5.2/5.3 — the FieldView model and feature selector.
 *
 * This is the "derive, don't store" core. Before this, the rendered `features`
 * array was written into `fieldActivity` and mutated in place from ~11 call
 * sites, guarded by the `_featuresBefore` / `_selectBeforeFeatures` snapshot
 * stacks. Now there is one pure function — `featuresFor(record, tokenData,
 * view, cultivations)` — that returns the features for whatever the screen is
 * currently showing. "Back" is just `view.mode = 'overview'`, recomputed.
 *
 * Nothing here mutates its inputs.
 */
import { mergeZonesWithSubzones } from '../../../utils/recordZones.js';
import { normalizeCropType } from '../../../utils/cropColors.js';
import {
  cropName,
  sameCropFamily,
  zoneIdsFromBitmask,
  heldFoodTokens,
} from '../../../utils/foodToken.ts';

const zoneIdOf = (c) => c?.zone_id ?? c?.cluster_id;
const stripSub = (zid) => String(zid ?? '').replace(/_(a|b)$/, '');

/**
 * Build the merged per-crop cultivation model (§5.3). One entry per crop
 * family currently growing, folding the satellite `current_cycle` together
 * with held food tokens. Food-token self-attestation vs satellite truth is a
 * field (`source`, `confirmed`), never silently merged into one colour.
 *
 *   { crop_family, crop_variant, zone_ids[], area_m2,
 *     source: 'satellite' | 'food_token' | 'both',
 *     attested, confirmed, sos, eos }
 */
export function buildCultivations(record, tokenData) {
  const cc = Array.isArray(record?.current_cycle) ? record.current_cycle : [];
  const zoneArea = new Map(
    (Array.isArray(record?.zones) ? record.zones : []).map((z) => [z.zone_id, Number(z.area_m2) || 0]),
  );

  // ── Satellite cultivations, grouped by crop family ──────────────────────
  const byFamily = new Map(); // family → entry
  for (const c of cc) {
    if (c?.is_open === false) continue;
    const zid = zoneIdOf(c);
    if (!zid) continue;
    const family = normalizeCropType(String(c.crop_type ?? '').toLowerCase());
    if (!family) continue;
    let e = byFamily.get(family);
    if (!e) {
      e = {
        crop_family: family,
        crop_variant: c.crop_type ?? family,
        zone_ids: [],
        area_m2: 0,
        source: 'satellite',
        attested: false,
        confirmed: false,
        sos: c.sos ?? null,
        eos: c.eos ?? (Array.isArray(c.predicted_eos) ? c.predicted_eos[1] : null) ?? null,
      };
      byFamily.set(family, e);
    }
    if (!e.zone_ids.includes(zid)) {
      e.zone_ids.push(zid);
      e.area_m2 += zoneArea.get(zid) ?? zoneArea.get(stripSub(zid)) ?? 0;
    }
  }

  // ── Fold in held food tokens ────────────────────────────────────────────
  for (const t of heldFoodTokens(tokenData)) {
    const family = cropName(t.cropCode); // already lowercased
    if (!family) continue;
    const zids = zoneIdsFromBitmask(t.fieldsBitmask); // ['*'] or ['z0','z2',...]
    const sos = t.sosTs ? new Date(t.sosTs * 1000).toISOString().slice(0, 10) : null;

    // Match against an existing satellite cultivation of the same family.
    const match = [...byFamily.values()].find((e) => sameCropFamily(e.crop_family, family));
    if (match) {
      match.source = match.source === 'satellite' ? 'both' : match.source;
      match.attested = true;
      match.confirmed = true; // satellite agrees with the farmer's token
      if (!match.sos && sos) match.sos = sos;
      // Entire-property token (['*']) covers all satellite zones already.
      if (zids[0] !== '*') {
        for (const z of zids) if (!match.zone_ids.includes(z)) match.zone_ids.push(z);
      }
      continue;
    }

    // No satellite match → a food-token-only cultivation (self-attested,
    // unconfirmed by the oracle). Entire-property tokens cover every zone.
    const allZoneIds =
      zids[0] === '*' ? mergeZonesWithSubzones(record).map((z) => z.zone_id) : zids;
    let e = byFamily.get(family);
    if (!e) {
      e = {
        crop_family: family,
        crop_variant: family,
        zone_ids: [],
        area_m2: 0,
        source: 'food_token',
        attested: true,
        confirmed: false,
        sos,
        eos: null,
      };
      byFamily.set(family, e);
    }
    for (const z of allZoneIds) {
      if (!e.zone_ids.includes(z)) {
        e.zone_ids.push(z);
        e.area_m2 += zoneArea.get(z) ?? zoneArea.get(stripSub(z)) ?? 0;
      }
    }
  }

  return [...byFamily.values()];
}

/**
 * Build map features for a set of merged zones, stamping `activity: 'active'`
 * + `crop_type` on any zone in `activeSet`. Subzones with no direct crop
 * inherit the parent's. Pure — replaces the old in-component buildZoneFeatures.
 */
function buildZoneFeatures(record, cropForZone, activeZoneIds) {
  const merged = mergeZonesWithSubzones(record);
  const activeSet = activeZoneIds instanceof Set ? new Set(activeZoneIds) : new Set(activeZoneIds || []);
  // Expand subdivided parents to their subzone ids.
  for (const z of merged) {
    if (z.subzone_of && activeSet.has(z.subzone_of)) activeSet.add(z.zone_id);
  }
  const cropFor = (z) => {
    const direct = cropForZone(z.zone_id);
    if (direct) return direct;
    if (z.subzone_of) return cropForZone(z.subzone_of) ?? null;
    return null;
  };
  return merged.map((z) => {
    const isActive = activeSet.has(z.zone_id);
    return {
      type: 'Feature',
      properties: {
        zone_id: z.zone_id,
        category: z.category,
        area_m2: z.area_m2,
        ...(z.subzone_of ? { subzone_of: z.subzone_of } : {}),
        ...(z._backdrop ? { backdrop: true } : {}),
        ...(isActive ? { crop_type: cropFor(z) ?? null, activity: 'active' } : {}),
      },
      geometry: z.geometry,
    };
  });
}

/** Crop resolver for the live overview: current_cycle, food tokens, override. */
function liveCropForZone(record, cultivations, override) {
  const cc = Array.isArray(record?.current_cycle) ? record.current_cycle : [];
  // zone_id → crop, from cultivations (already merges satellite + food token).
  const byZone = new Map();
  for (const cu of cultivations) {
    for (const z of cu.zone_ids) {
      if (!byZone.has(z)) byZone.set(z, cu.crop_variant ?? cu.crop_family);
    }
  }
  return (zid) => {
    if (override && override[zid]) return override[zid];
    if (byZone.has(zid)) return byZone.get(zid);
    const zc = cc.find((c) => zoneIdOf(c) === zid);
    return zc?.crop_type ?? null;
  };
}

/** Active zone ids for the live overview (any zone any cultivation covers). */
function liveActiveZoneIds(record, cultivations, override) {
  const ids = new Set();
  for (const cu of cultivations) for (const z of cu.zone_ids) ids.add(z);
  for (const c of Array.isArray(record?.current_cycle) ? record.current_cycle : []) {
    const zid = zoneIdOf(c);
    if (zid) ids.add(zid);
  }
  if (override) for (const z of Object.keys(override)) ids.add(z);
  return ids;
}

/** Features for a closed historical season window (sos..eos). */
function seasonFeatures(record, cycle) {
  if (cycle?.is_open) {
    const cropForZone = (zid) => {
      if (zid === cycle?.zone_id) return cycle?.crop_type ?? null;
      const zc = (record?.current_cycle ?? []).find((c) => zoneIdOf(c) === zid);
      return zc?.crop_type ?? null;
    };
    const allZoneIds = mergeZonesWithSubzones(record).map((z) => z.zone_id);
    return buildZoneFeatures(record, cropForZone, allZoneIds);
  }
  const tgtSos = cycle?.sos || '';
  const tgtEos = cycle?.eos || tgtSos;
  const allCycles = Array.isArray(record?.cycles) ? record.cycles : Object.values(record?.cycles || {});
  const overlapDays = (c) => {
    const a = c?.sos || '';
    const b = c?.eos || c?.sos || '';
    if (!a || !tgtSos) return -1;
    const s = a > tgtSos ? a : tgtSos;
    const e = b && tgtEos && b < tgtEos ? b : tgtEos;
    return s && e && e >= s ? Math.max(0, (new Date(e) - new Date(s)) / 86400000) : -1;
  };
  const cropForZone = (zid) => {
    if (zid === cycle?.zone_id) return cycle?.crop_type ?? null;
    const matches = allCycles
      .filter((c) => {
        const cz = c?.zone_id || '';
        return (cz === zid || stripSub(cz) === zid) && overlapDays(c) > 0;
      })
      .sort((a, b) => overlapDays(b) - overlapDays(a));
    return matches[0]?.crop_type ?? null;
  };
  const allZoneIds = mergeZonesWithSubzones(record).map((z) => z.zone_id);
  return buildZoneFeatures(record, cropForZone, allZoneIds);
}

/** Selectable outlines for select mode; `selected` stamped from view.selected. */
function selectFeatures(record, selected) {
  const sel = selected instanceof Set ? selected : new Set(selected || []);
  return mergeZonesWithSubzones(record)
    .filter((z) => !z._backdrop)
    .map((z) => ({
      type: 'Feature',
      properties: {
        zone_id: z.zone_id,
        area_m2: z.area_m2,
        ...(z.subzone_of ? { subzone_of: z.subzone_of } : {}),
        activity: 'selectable',
        selected: sel.has(z.zone_id),
      },
      geometry: z.geometry,
    }));
}

/**
 * The one feature selector. Returns the GeoJSON features to render for the
 * current `view`. `cultivations` is the output of buildCultivations() (passed
 * in so callers can memoize it once).
 */
export function featuresFor(record, tokenData, view, cultivations) {
  if (!record) return [];
  const mode = view?.mode ?? 'overview';
  const cults = cultivations ?? buildCultivations(record, tokenData);

  switch (mode) {
    case 'select':
      return selectFeatures(record, view?.selected);

    case 'season':
      return view?.season ? seasonFeatures(record, view.season) : [];

    case 'zone': {
      // `view.focus` is the array of zone ids in focus (the WHOLE cultivation
      // group, never just zids[0]). Filter the overview down to them, matching
      // subzone overlays (zN_a/zN_b) of any focused parent.
      const all = featuresFor(record, tokenData, { ...view, mode: 'overview' }, cults);
      const focusZones = Array.isArray(view?.focus) ? view.focus : view?.focus ? [view.focus] : [];
      if (!focusZones.length) return all;
      const wanted = new Set(focusZones.map(stripSub));
      return all.filter((f) => {
        const zid = f.properties?.zone_id ?? f.properties?.cluster_id;
        return wanted.has(stripSub(zid)) || focusZones.includes(zid);
      });
    }

    case 'overview':
    default: {
      const cropForZone = liveCropForZone(record, cults, view?.override);
      const active = liveActiveZoneIds(record, cults, view?.override);
      return buildZoneFeatures(record, cropForZone, active);
    }
  }
}
