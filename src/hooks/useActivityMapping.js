import { useRef } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import { setDBitem } from '../utils/db';
import { buildFieldsFromGroups, isV3Response } from '../utils/buildFieldsFromGroups';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pollTask(taskId, { intervalMs = 2500, timeoutMs = 60000, signal } = {}) {
  const start = Date.now();
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { data } = await axios.get(`${API_BASE_URL}/map_activity/status/${taskId}`, { signal });
    if (data.state === 'SUCCESS' && data.result) return data.result;
    if (data.state === 'FAILURE') throw new Error(data.error || 'Task failed');
    if (Date.now() - start > timeoutMs) throw new Error('Task polling timeout');
    await sleep(intervalMs);
  }
}

const useActivityMapping = () => {
  const { db, setFieldActivity } = useDataContext();
  const inflight = useRef(false);

  const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);

  const getFeatureFieldName = (feature = {}) =>
    feature?.properties?.field_name ||
    feature?.properties?.name ||
    null;

  const mergeDominantClusters = (dominant, fc) => {
    const list = toArray(dominant);
    if (!list.length) return dominant ?? null;

    const features = Array.isArray(fc?.features) ? fc.features : [];
    const fieldNameByCluster = new Map();
    features.forEach((feature) => {
      const clusterId = feature?.properties?.cluster_id;
      if (clusterId === undefined || clusterId === null || clusterId === '') return;
      const key = String(clusterId);
      if (fieldNameByCluster.has(key)) return;
      const fieldName = getFeatureFieldName(feature);
      if (fieldName) fieldNameByCluster.set(key, fieldName);
    });

    const byCluster = new Map();
    list.forEach((item, idx) => {
      const hasCluster = item?.cluster_id !== undefined && item?.cluster_id !== null && item?.cluster_id !== '';
      const key = hasCluster ? String(item.cluster_id) : `__idx_${idx}`;
      const existing = byCluster.get(key);
      if (!existing) {
        byCluster.set(key, { ...(item || {}) });
        return;
      }

      const areaCurrent = Number(existing?.area_m2 || 0);
      const areaNext = Number(item?.area_m2 || 0);
      const source = areaNext > areaCurrent ? item : existing;
      const fallback = areaNext > areaCurrent ? existing : item;
      byCluster.set(key, { ...(source || {}), ...(fallback || {}), ...(source || {}) });
    });

    const merged = Array.from(byCluster.entries()).map(([key, item]) => {
      const fieldName = item?.field_name || item?.name || fieldNameByCluster.get(key);
      return fieldName ? { ...item, field_name: fieldName } : item;
    });

    return Array.isArray(dominant) ? merged : (merged[0] || null);
  };

  const resetCached = (data) => {
    const ttl = 259_200_000; // 3 days
    setDBitem('reloadActivity', { expired: Date.now() + ttl, act: data }, 'FarmData');
  };

  const handleFieldActivity = async (LAND) => {
    console.log('FETCHING activity mapping...', LAND);

    if (!LAND?.current?.hasLand) return;

    // return when cached
    if (db && Date.now() < db?.reloadActivity?.expired) {
      console.log('field activity cache loaded.');
      setFieldActivity(db.reloadActivity.act);
      return;
    }

    // prevent concurrent API calls
    if (inflight.current) {
      console.log('activity mapping already in-flight, skipping.');
      return;
    }
    inflight.current = true;

    const url = `${API_BASE_URL}/map_activity`;

    const payload = {
      landID: LAND.current.LAND.id,
      address: db?.address,
      chain: db?.chain,
      test_mode: false
    };

    console.log('calldata', payload);
    const controller = new AbortController();
    try {
      // 1) enqueue
      const { data: enq } = await axios.post(url, payload, { signal: controller.signal });

      // 2) poll until ready
      const collection = await pollTask(enq.task_id, { signal: controller.signal });

      // 3) normalize payload shape
      console.log('activity collection (raw):', collection);

      let processed;
      if (isV3Response(collection)) {
        // --- v3: build fields from field_groups ---
        const clusters = collection.clusters;
        const fc = clusters?.type === 'FeatureCollection' ? clusters : null;
        const fields = buildFieldsFromGroups(clusters);
        processed = {
          ...collection,
          ...(fc || {}),
          geojson: fc,
          dominant: fields,
          featurelength: fc?.features?.length || 0,
          meta: collection.meta,
        };
      } else {
        // --- v2: legacy dominant parsing ---
        const fc = collection?.geojson?.type === 'FeatureCollection'
          ? collection.geojson
          : Array.isArray(collection?.features)
            ? { type: 'FeatureCollection', features: collection.features }
            : null;
        processed = {
          ...collection,
          ...(fc || {}),
          dominant: mergeDominantClusters(collection?.dominant, fc),
          featurelength: fc?.features?.length || 0,
        };
      }
      setFieldActivity(processed);
      resetCached(processed);
    } catch (err) {
      console.log('Activity error:', err?.response?.data || err.message);
    } finally {
      inflight.current = false;
      controller.abort(); // prevent leaks on unmount
    }
  };

  return { handleFieldActivity };
};

export default useActivityMapping;
