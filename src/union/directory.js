// The unions R9 offers (decision 008, 3 Nov): the anchor's public union directory, `GET <anchor_url>/unions`
// (`?near=lat,lon&limit=20`), nearest first. The list is a public index with no authority: the member's account names
// the union she picks itself (`set_union`), and the contracts refuse a union the trust has not admitted.
// Without a directory (no anchor_url, the anchor down with nothing kept, or no admitted union yet) R9 offers the node's
// own union (cfg.union) as the only choice, as before, with no error screen.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export const UNIONS_CACHE_KEY = 'nila.unions';
const LIMIT = 20;

/** The last good directory, kept on the phone so a slow or offline start shows it at once. */
export function readCachedUnions() {
  try { const v = JSON.parse(localStorage.getItem(UNIONS_CACHE_KEY)); return v && Array.isArray(v.unions) ? v : null; } catch { return null; }
}
function writeCachedUnions(v) {
  try { localStorage.setItem(UNIONS_CACHE_KEY, JSON.stringify(v)); } catch { /* shown from the network next time */ }
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The R9 choices from a directory answer: `{ stellar, name, location, distance_km, matches }`, nearest first when a
 * position or the anchor's distance is known, else by name. The node's own union (cfg.union) keeps today's Polygon
 * entry (`known`: polygon address, representative), so its leader check and record stay as before. No directory or
 * an empty one: the node's union alone (`fallback: true`).
 */
export function unionChoices({ dir, cfgUnion, known, position }) {
  const rows = (dir?.unions || []).filter((u) => u && u.union && u.name);
  if (!rows.length) {
    return cfgUnion ? [{ ...(known || {}), stellar: cfgUnion, name: known?.name || 'Your union', matches: true, fallback: true }] : [];
  }
  const out = rows.map((u) => {
    const at = Number.isFinite(u.lat) && Number.isFinite(u.lon) ? { lat: u.lat, lon: u.lon } : null;
    const d = position && at ? distanceKm(position, at) : (Number.isFinite(u.distance_km) ? u.distance_km : undefined);
    const own = cfgUnion && u.union === cfgUnion ? known : null;
    return { ...(own || {}), stellar: u.union, name: u.name, location: at ? [at.lat, at.lon] : own?.location, geohash: u.geohash,
      distance_km: d, matches: u.matches !== false };
  });
  return out.sort((a, b) => {
    const da = a.distance_km ?? Infinity;
    const db = b.distance_km ?? Infinity;
    return da !== db ? da - db : a.name.localeCompare(b.name);
  });
}

async function fetchUnions(anchorUrl, position) {
  const u = new URL('unions', anchorUrl.endsWith('/') ? anchorUrl : `${anchorUrl}/`);
  u.searchParams.set('limit', String(LIMIT));
  if (position) u.searchParams.set('near', `${position.lat.toFixed(4)},${position.lon.toFixed(4)}`);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`union directory: ${r.status}`);
  const body = await r.json();
  if (!body || !Array.isArray(body.unions)) throw new Error('union directory: no list');
  return body;
}

/**
 * The anchor's union directory near `position` ({ lat, lon } or null: all unions). Fresh 60 s (the anchor caches as
 * long). Until the network answers, the last good list from the phone; when it fails, that list stays.
 * Returns the react-query result; `data` is the directory answer `{ updated_at, unions }` or undefined.
 */
export function useUnions(anchorUrl, position) {
  const near = position ? `${position.lat.toFixed(2)},${position.lon.toFixed(2)}` : '';
  return useQuery({
    queryKey: ['anchor', 'unions', anchorUrl || '', near],
    enabled: !!anchorUrl,
    staleTime: 60_000,
    retry: 1,
    placeholderData: (prev) => prev || readCachedUnions() || undefined,
    queryFn: async () => {
      try {
        const body = await fetchUnions(anchorUrl, position);
        writeCachedUnions(body);
        return body;
      } catch (e) {
        const kept = readCachedUnions();
        if (kept) return kept;
        throw e;
      }
    },
  });
}

/** The phone's rough location, asked once with a short timeout and low accuracy. Never waited for: null until it
 *  answers, and stays null on a deny, a timeout or no geolocation (R9 then lists all unions). */
export function useRoughLocation(timeout = 6000) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    let live = true;
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
      navigator.geolocation.getCurrentPosition(
        (p) => { if (live) setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        () => { /* denied or no fix: all unions */ },
        { enableHighAccuracy: false, timeout, maximumAge: 30 * 60_000 },
      );
    } catch { /* no location */ }
    return () => { live = false; };
  }, [timeout]);
  return pos;
}
