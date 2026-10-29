// Her land as on her land title (executive decision 24 Oct): the land title map (A5, a member's Assets map, the
// leader's Assets map) draws the title's FIELDS from the land title NFT's metadata, not the field record's areas.
// Areas are merged fields and change per cycle or year; fields stay fixed.
//  - Polygon: tokenURI(landId) → decodeMetadataUri → the compact metadata (parseCompactMeta: `out`, `fields`, `names`).
//  - Stellar: the node passes the title metadata's shape (`shape` on GET /stellar/titles and the union members list)
//    only when its hash matches the title's metadata_hash on-chain.
//  - Neither (the demo titles carry `{v, farm}` only): the record's meta.geometry.field_features, else its areas.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { parseCompactMeta } from '../utils/fetch_landTitleMeta.ts';
import { areasOf } from './record';

const closed = (ring) => {
  const c = ring.map((p) => [p.lng, p.lat]);
  if (c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1])) c.push(c[0]);
  return c;
};

/** { outline, fields: [{ id, name, geometry }] } from the title's compact metadata, or null when it has no fields. */
export function shapeToFields(shape) {
  if (!shape) return null;
  let p;
  try { p = parseCompactMeta(shape); } catch { return null; }
  const fields = (p.fieldRings || []).filter((f) => f.coordinates?.length > 2)
    .map((f, i) => ({ id: `f${i}`, name: f.name || `Field ${i + 1}`, geometry: { type: 'Polygon', coordinates: [closed(f.coordinates)] } }));
  const rings = (p.outlineRings || []).filter((r) => r.length > 2);
  const outline = !rings.length ? null : rings.length === 1 ? { type: 'Polygon', coordinates: [closed(rings[0])] }
    : { type: 'MultiPolygon', coordinates: rings.map((r) => [closed(r)]) };
  return fields.length || outline ? { outline, fields } : null;
}

/** The fallback from the field record: its listed fields, else its areas. */
export function recordFields(record) {
  if (!record) return null;
  const outline = record.meta?.geometry?.out || null;
  const feats = record.meta?.geometry?.field_features?.features || [];
  if (feats.length) {
    return { outline, fields: feats.map((f, i) => ({ id: `f${i}`, name: f.properties?.name || `Field ${i + 1}`, geometry: f.geometry })) };
  }
  return { outline, fields: areasOf(record).map((z, i) => ({ id: String(z.zone_id), name: `Area ${i + 1}`, geometry: z.geometry })) };
}

/** For AreaMap: { record, labels } with one area per field and the title's outline. */
export function fieldsMap(t) {
  if (!t || (!t.fields.length && !t.outline)) return { record: null, labels: undefined };
  return {
    record: { zones: t.fields.map((f) => ({ zone_id: f.id, geometry: f.geometry })), meta: { geometry: { out: t.outline || undefined } } },
    labels: Object.fromEntries(t.fields.map((f) => [f.id, { text: f.name }])),
  };
}

/** Her title's fields: the NFT's metadata (Polygon tokenURI, or the Stellar title's shape from the node), else the
 *  field record (`record`, already read by the screen). */
export function useTitleFields(landId, onPolygon, stellarTitle, record) {
  const { provider } = useProvider();
  const poly = useQuery({
    queryKey: ['polygon', 'titleShape', landId], enabled: !!onPolygon && landId != null && !!provider, staleTime: Infinity,
    queryFn: async () => {
      const { decodeMetadataUri } = await import('../utils/decodeMetadataUri.ts');
      const c = new ethers.Contract(process.env.REACT_APP_LAND_TITLE_MAIN, ['function tokenURI(uint256) view returns (string)'], provider);
      return decodeMetadataUri(await c.tokenURI(landId));
    },
  });
  const shape = onPolygon ? poly.data : stellarTitle?.shape;
  return useMemo(() => shapeToFields(shape) || recordFields(record), [shape, record]);
}
