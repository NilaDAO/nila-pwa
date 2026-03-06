/**
 * buildFieldsFromGroups — transforms v3 milestones FeatureCollection
 * with field_groups into an array of "field" objects that replace the
 * v2 `dominant` array.
 *
 * Each field_group merges adjacent clusters sharing the same crop_type.
 * The largest-area cluster is the representative for stage, signals, yield.
 * All features are preserved for granular map rendering via geometry_indices.
 */

export function isV3Response(collection) {
  return collection?.schema_version === 'milestones.v3' ||
         Boolean(collection?.clusters?.properties?.field_groups);
}

export function buildFieldsFromGroups(clusters) {
  if (!clusters || !Array.isArray(clusters.features)) return [];

  const features = clusters.features;
  const fieldGroups = clusters.properties?.field_groups || [];

  const groupedClusterIds = new Set(fieldGroups.flat());

  // index features by cluster_id
  const featuresByCluster = new Map();
  features.forEach((f, idx) => {
    const cid = f?.properties?.cluster_id;
    if (cid === undefined || cid === null) return;
    if (!featuresByCluster.has(cid)) featuresByCluster.set(cid, []);
    featuresByCluster.get(cid).push({ feature: f, index: idx });
  });

  const M2_PER_ACRE = 4046.8564224;

  const buildField = (clusterIds) => {
    let totalArea = 0;
    let representative = null;
    let repArea = 0;
    const geometryIndices = [];
    let fieldName = null;
    let weightedYieldSum = 0; // area-weighted yield_kg_per_acre accumulator

    clusterIds.forEach((cid) => {
      const entries = featuresByCluster.get(cid) || [];
      entries.forEach(({ feature, index }) => {
        const area = Number(feature.properties?.area_m2 || 0);
        const ypa = Number(feature.properties?.yield_kg_per_acre || 0);
        totalArea += area;
        weightedYieldSum += area * ypa;
        geometryIndices.push(index);
        if (area > repArea) { repArea = area; representative = feature; }
        if (!fieldName) {
          fieldName = feature.properties?.field_name || feature.properties?.name || null;
        }
      });
    });

    if (!representative) return null;
    const p = representative.properties;

    // area-weighted yield rate, then total estimated yield for this field
    const yieldKgPerAcre = totalArea > 0 ? weightedYieldSum / totalArea : 0;
    const fieldAcres = totalArea / M2_PER_ACRE;
    const yieldTotalKg = yieldKgPerAcre * fieldAcres;

    return {
      cluster_ids: clusterIds,
      cluster_id: clusterIds[0],
      geometry_indices: geometryIndices,

      crop_type: p.crop_type,
      crop_group: p.crop_group,
      crop_confidence: p.crop_confidence,
      classification_log: p.classification_log,

      stage: p.stage,

      yield_kg_per_acre: yieldKgPerAcre,
      yield_total_kg: yieldTotalKg,
      yield_index: p.yield_index || 0,

      signals: p.signals,
      activity: p.activity,
      area_m2: totalArea,

      harvest_window: p.harvest_window,
      season: p.season,
      field_name: fieldName,
      farmer_advice: p.classification_log?.farmer_advice || null,
    };
  };

  const fields = [];

  // grouped clusters → one field per group
  fieldGroups.forEach((group) => {
    const ids = Array.isArray(group) ? group : [group];
    const field = buildField(ids);
    if (field) fields.push(field);
  });

  // ungrouped clusters → singleton fields
  const ungrouped = new Map();
  features.forEach((f, idx) => {
    const cid = f?.properties?.cluster_id;
    if (cid !== undefined && cid !== null && !groupedClusterIds.has(cid)) {
      if (!ungrouped.has(cid)) ungrouped.set(cid, []);
      ungrouped.get(cid).push(idx);
    }
  });
  ungrouped.forEach((_, cid) => {
    const field = buildField([cid]);
    if (field) fields.push(field);
  });

  return fields;
}
