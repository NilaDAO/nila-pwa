export type LatLngObj = { lat: number; lng: number };
export type RingObj = LatLngObj[];
export type RingsObj = RingObj[];

type CompactMeta = {
  v: number;
  ch?: string;
  addr?: string;
  out: number[][];
  names: string[];
  fields: any;
  field_features?: any;
  s: number;                 // scale (e.g. 1e5)
  c?: [number, number];      // centroid [lat, lng] * s
  b?: [number, number, number, number]; // bbox [minLat,minLng,maxLat,maxLng] * s
  q?: number;                // GPS walk quality 0-6 (absent on pre-q titles)
};

const EARTH_RADIUS_M = 6378137;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Approx geodesic area on a sphere (WGS84 radius). Returns positive m^2.
export function ringAreaMeters2(ring: RingObj): number {
  if (!ring || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % ring.length];
    const lat1 = toRad(p1.lat);
    const lat2 = toRad(p2.lat);
    const lon1 = toRad(p1.lng);
    const lon2 = toRad(p2.lng);
    sum += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(sum) * (EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

export function ringsAreaMeters2(rings: RingsObj): number {
  if (!rings || !rings.length) return 0;
  return rings.reduce((acc, ring) => acc + ringAreaMeters2(ring), 0);
}

// DISCOVER CENTROID FOR V0 LAND TITLES (CAN BE REMOVED IF WE DONT USE THEM ANYMORE)
export function getCenter(data : any, method = 'mean') {
  const flat = Array.isArray(data?.[0]) ? data.flat(2) : (data || []);
  const pts = flat.filter((p : any) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return null;

  if (method === 'bbox') {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const { lat, lng } of pts) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  }

  // mean (centroid-ish)
  let sumLat = 0, sumLng = 0;
  for (const { lat, lng } of pts) { sumLat += lat; sumLng += lng; }
  return { lat: sumLat / pts.length, lng: sumLng / pts.length };
}

/** Decode one delta-encoded ring → [{lat,lng}, ...] */
export function decodeRingD(arr: number[], s: number): RingObj {
  if (arr.length < 2 || arr.length % 2 !== 0) return [];
  let lat = arr[0], lng = arr[1];
  const out: RingObj = [{ lat: lat / s, lng: lng / s }];
  for (let i = 2; i < arr.length; i += 2) {
    lat += arr[i];
    lng += arr[i + 1];
    out.push({ lat: lat / s, lng: lng / s });
  }
  return out;
}

function isDeltaRing(value: any): value is number[] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number';
}

function toLatLngRingFromGeoJson(ring: any): RingObj {
  if (!Array.isArray(ring)) return [];
  return ring
    .map((pt: any) => {
      if (!Array.isArray(pt) || pt.length < 2) return null;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean) as RingObj;
}

function decodeFields(m: CompactMeta, s: number) {
  const names = Array.isArray(m.names) ? m.names : [];

  if (m.field_features?.type === 'FeatureCollection' && Array.isArray(m.field_features.features)) {
    return m.field_features.features
      .map((feature: any, idx: number) => {
        const coords = feature?.geometry?.coordinates;
        const firstRing = Array.isArray(coords?.[0]?.[0]?.[0]) ? coords[0][0] : coords?.[0];
        const coordinates = toLatLngRingFromGeoJson(firstRing);
        if (!coordinates.length) return null;
        return {
          name: feature?.properties?.name || names[idx] || `Field ${idx + 1}`,
          coordinates,
        };
      })
      .filter(Boolean);
  }

  const rawFields = Array.isArray(m.fields) ? m.fields : [];
  if (rawFields.length === 0) return [];

  // Legacy compact deltas.
  if (isDeltaRing(rawFields[0])) {
    return rawFields
      .map((ring: number[], idx: number) => ({
        name: names[idx] || `Field ${idx + 1}`,
        coordinates: decodeRingD(ring, s),
      }))
      .filter((f) => f.coordinates.length > 0);
  }

  // New GeoJSON MultiPolygon coordinates: [[[ [lng,lat], ... ]], ...]
  return rawFields
    .map((poly: any, idx: number) => {
      const firstRing = Array.isArray(poly?.[0]?.[0]) ? poly[0] : poly;
      const coordinates = toLatLngRingFromGeoJson(firstRing);
      if (!coordinates.length) return null;
      return {
        name: names[idx] || `Field ${idx + 1}`,
        coordinates,
      };
    })
    .filter(Boolean);
}

/** Parse compact metadata (obj or JSON string) to rings + quick props */
export function parseCompactMeta(metaLike: string | CompactMeta) {
  const m: CompactMeta = typeof metaLike === 'string' ? JSON.parse(metaLike) : metaLike;
  const s = m.s || 1e5;

  const outlineRings: RingsObj = (m.out || []).map(r => decodeRingD(r, s));
  const fieldRings = decodeFields(m, s);

  const centroid = m.c ? { lat: m.c[0] / s, lng: m.c[1] / s } : undefined;
  // append fieldnames to rings
  const bbox = m.b
    ? { minLat: m.b[0] / s, minLng: m.b[1] / s, maxLat: m.b[2] / s, maxLng: m.b[3] / s }
    : undefined;

  return { version: m.v, outlineRings, fieldRings, centroid, bbox, scale: s, gpsQuality: m.q ?? null };
}
