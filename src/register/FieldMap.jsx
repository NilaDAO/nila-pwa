// R5–R7: the satellite map behind the point sheet, with the same settings as today's field registration
// (features/maps/FieldRegistration/fieldRegMaps.js, the on-site options): satellite, zoom 21, tilt 0, no controls,
// not draggable, map ID 8fa18e8fd7e4c318, her points as the same small gold markers joined by a faint line, centred
// on her last point (before the first one: the union's location, as today). The script loader id is today's, so the
// two never load Maps twice. Offline or without a key it is not shown and the field scene stays (FieldFrame).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';

const LIBRARIES = ['maps', 'marker'];
const MAP_ID = '8fa18e8fd7e4c318';
const UNION_LOCATION = { lat: 11.878671, lng: 78.964561 };   // today's one union (components/Forms/memberUnion.js)
const OPTIONS = {
  mapTypeId: 'satellite', streetViewControl: false, fullscreenControl: false, zoomControl: false, mapTypeControl: false,
  rotateControl: false, scrollwheel: false, draggable: false, zoom: 21, tilt: 0, keyboardShortcuts: false,
  clickableIcons: false, disableDefaultUI: true, mapId: MAP_ID,
};
// Pan the map (R5, executive decision 20 Oct): today's off-site options — she moves the map; her point is its centre.
const PAN_OPTIONS = { ...OPTIONS, draggable: true, gestureHandling: 'greedy', scrollwheel: true, zoomControl: true };
const STYLE = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

function dot() {   // today's marker (fieldRegMaps.js createCircleIcon)
  const c = document.createElement('div');
  Object.assign(c.style, { width: '12px', height: '12px', backgroundColor: '#D4CF5A', borderRadius: '50%', border: '1px solid green',
    opacity: '0.45', transform: 'translate(0%, 50%)' });
  return c;
}

// A refused key (RefererNotAllowedMapError, a wrong key) calls window.gm_authFailure: from then on the field scene
// shows instead, and no marker is made (they throw on a refused map).
let authFailed = false;
const listeners = new Set();
if (typeof window !== 'undefined') {
  const prev = window.gm_authFailure;
  window.gm_authFailure = () => { authFailed = true; listeners.forEach((f) => f()); if (typeof prev === 'function') prev(); };
}

export function useFieldMapLoaded() {
  const [failed, setFailed] = useState(authFailed);
  useEffect(() => { const f = () => setFailed(true); listeners.add(f); return () => listeners.delete(f); }, []);
  const key = process.env.REACT_APP_GOOGLE_MAPS;
  const { isLoaded, loadError } = useJsApiLoader({ id: 'script-loader', googleMapsApiKey: key || '', libraries: LIBRARIES,
    version: 'weekly', mapIds: [MAP_ID] });
  return { ok: !!key && isLoaded && !loadError && !failed && navigator.onLine };
}

function meDot() {   // R5 #on: her location, a blue dot (board SendLocation-v3np #on)
  const c = document.createElement('div');
  Object.assign(c.style, { width: '16px', height: '16px', backgroundColor: '#3B82F6', borderRadius: '50%', border: '3px solid #FFFFFF',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transform: 'translate(0%, 50%)' });
  return c;
}

/** points: her saved points; me: {lat, lng, acc} her live location (R5 #on: blue dot and accuracy circle). */
export default function FieldMap({ points = [], me = null, pan = false, onCenter, start = null }) {
  const map = useRef(null);
  const marks = useRef([]);
  const line = useRef(null);
  const meMark = useRef(null);
  const meCircle = useRef(null);
  // Her last point, else where she is (`me`, or `start` in pan mode); the union's spot only until the phone answers.
  const here = me || start;
  const center = useMemo(() => (points.length ? { lat: points.at(-1).lat, lng: points.at(-1).lng }
    : here ? { lat: here.lat, lng: here.lng } : UNION_LOCATION), [points, here]);
  const placed = useRef(false);   // pan mode: centred on her once, then she moves the map
  useEffect(() => {
    if (!map.current || !pan || placed.current || (!here && !points.length)) return;
    placed.current = true;
    map.current.setCenter(center);
  }, [pan, here, points.length, center]);

  const draw = useCallback(() => {
    const m = map.current;
    const g = window.google?.maps;
    if (!m || !g || authFailed) return;
    try {
      marks.current.forEach((x) => { x.map = null; });
      marks.current = g.marker?.AdvancedMarkerElement
        ? points.map((p, i) => new g.marker.AdvancedMarkerElement({ position: { lat: p.lat, lng: p.lng }, map: m, title: `P${i + 1}`, content: dot() }))
        : [];
      if (line.current) line.current.setPath(points);
      else if (points.length) {
        line.current = new g.Polyline({ path: points, geodesic: true, strokeColor: '#D4CF5A', strokeOpacity: 0.3, strokeWeight: 1 });
        line.current.setMap(m);
      }
      if (meMark.current) meMark.current.map = null;
      meCircle.current?.setMap(null);
      meMark.current = null; meCircle.current = null;
      if (me) {
        meCircle.current = new g.Circle({ map: m, center: { lat: me.lat, lng: me.lng }, radius: Math.max(5, me.acc || 10),
          fillColor: '#3B82F6', fillOpacity: 0.18, strokeColor: '#3B82F6', strokeOpacity: 0.4, strokeWeight: 1, clickable: false });
        if (g.marker?.AdvancedMarkerElement) meMark.current = new g.marker.AdvancedMarkerElement({ position: { lat: me.lat, lng: me.lng }, map: m, content: meDot() });
      }
      if (!pan) m.setCenter(center);          // panning: she moves the map, it never jumps back
    } catch (e) { console.error('[field map] markers not drawn', e); }
  }, [points, center, me, pan]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => () => {
    marks.current.forEach((x) => { x.map = null; }); line.current?.setMap(null);
    if (meMark.current) meMark.current.map = null; meCircle.current?.setMap(null);
  }, []);

  return (
    <GoogleMap mapContainerStyle={STYLE} center={pan ? undefined : center} zoom={21} options={pan ? PAN_OPTIONS : OPTIONS}
      onLoad={(m) => { map.current = m; m.setCenter(center); draw(); }} onUnmount={() => { map.current = null; }}
      onIdle={() => { const c = map.current?.getCenter(); if (pan && c && onCenter) onCenter({ lat: c.lat(), lng: c.lng() }); }} />
  );
}
