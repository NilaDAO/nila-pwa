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
// Choose on the map (R5, executive decision 20 Oct): today's off-site options — she moves the map; her point is its centre.
const PAN_OPTIONS = { ...OPTIONS, draggable: true, gestureHandling: 'greedy', scrollwheel: true, zoomControl: false };
const STYLE = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

// Her point (board R6 SendLocation-af51-95is: black inside, amber border) with its field name as a chip (A4's map
// labels: dark pill; selected = accent). Tapping the chip selects it.
function pointMark(p, on) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'relative', width: '18px', height: '18px', transform: 'translateY(50%)' });
  const d = document.createElement('div');
  Object.assign(d.style, { width: '18px', height: '18px', boxSizing: 'border-box', borderRadius: '50%', background: '#121212', border: '3px solid #D4A634' });
  box.appendChild(d);
  if (p.name) {
    const c = document.createElement('span');
    c.textContent = p.name;
    Object.assign(c.style, { position: 'absolute', left: '50%', bottom: '24px', transform: 'translateX(-50%)', padding: '0 8px', borderRadius: '9999px',
      fontSize: '14px', lineHeight: '1.5', fontWeight: '700', whiteSpace: 'nowrap', border: '0', fontFamily: 'Inter, system-ui, sans-serif',
      background: on ? '#D4CF5A' : 'rgba(18,18,18,0.8)', color: on ? '#121212' : '#F1F5F9', cursor: 'pointer' });
    box.appendChild(c);
  }
  return box;
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
/** Choose on the map (26 Oct): the pin sits in the middle of the map left open above the card (half the card's top),
 *  not the map's own centre, which is often behind the card. Followed while the card grows or is dragged. */
export function usePinY(on) {
  const [y, setY] = useState(null);
  useEffect(() => {
    if (!on) return undefined;
    const f = () => {
      const el = document.querySelector('[data-reg-card]');
      const top = el ? el.getBoundingClientRect().top : window.innerHeight;
      const v = Math.round(Math.max(80, top / 2));          // never under the header chip
      setY((o) => (o != null && Math.abs(o - v) < 4 ? o : v));
    };
    f();
    const t = setInterval(f, 300);
    window.addEventListener('resize', f);
    return () => { clearInterval(t); window.removeEventListener('resize', f); };
  }, [on]);
  return y;
}

/** The place under screen height y (px) of the map: the centre moved by y − half the map's height. */
function placeAt(m, y) {
  const g = window.google?.maps; const proj = m?.getProjection?.(); const c = m?.getCenter();
  if (!c || !proj || y == null) return c;
  const p = proj.fromLatLngToPoint(c);
  return proj.fromPointToLatLng(new g.Point(p.x, p.y + (y - m.getDiv().clientHeight / 2) / 2 ** m.getZoom()));
}

export default function FieldMap({ points = [], me = null, pan = false, onCenter, start = null, selected = null, onSelect, pinY = null, shapes = null }) {
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
    if (!map.current || !pan || placed.current || (!here && !points.length) || pinY == null) return;
    placed.current = true;
    map.current.setCenter(center);
    if (pinY != null) map.current.panBy(0, Math.round(map.current.getDiv().clientHeight / 2 - pinY));   // her place under the pin
  }, [pan, here, points.length, center, pinY]); // eslint-disable-line react-hooks/exhaustive-deps
  const report = () => { const c = placeAt(map.current, pinY); if (pan && c && onCenter) onCenter({ lat: c.lat(), lng: c.lng() }); };
  useEffect(() => { if (map.current) report(); }, [pinY]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const m = map.current;
    const g = window.google?.maps;
    if (!m || !g || authFailed) return;
    try {
      marks.current.forEach((x) => { x.map = null; });
      marks.current = g.marker?.AdvancedMarkerElement
        ? points.map((p, i) => {
          // A tap on her point or its chip selects it (the marker's own click event; DOM clicks inside a marker are not delivered).
          const mk = new g.marker.AdvancedMarkerElement({ position: { lat: p.lat, lng: p.lng }, map: m, title: p.name || `P${i + 1}`,
            content: pointMark(p, selected === i), gmpClickable: true });
          mk.addListener('click', () => onSelect?.(selected === i ? null : i));
          return mk;
        })
        : [];
      // A field taken with two edge points: the two as small rings, joined by a dashed line through the middle point.
      (m.__parts || []).forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; });
      m.__parts = [];
      points.forEach((p) => {
        if (!p.parts || p.parts.length !== 2) return;
        m.__parts.push(new g.Polyline({ map: m, path: p.parts.map((x) => ({ lat: x.lat, lng: x.lng })), strokeOpacity: 0, clickable: false,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#D4A634', scale: 2 }, offset: '0', repeat: '8px' }] }));
        p.parts.forEach((x) => m.__parts.push(new g.Circle({ map: m, center: { lat: x.lat, lng: x.lng }, radius: 1.5, clickable: false,
          strokeColor: '#D4A634', strokeWeight: 2, fillColor: '#121212', fillOpacity: 1 })));
      });
      // Fields already accepted (28 Oct, adding points to a border job): solid white outlines, not tappable.
      (m.__shapes || []).forEach((x) => x.setMap(null));
      m.__shapes = (shapes || []).map((geo) => new g.Polygon({ map: m, clickable: false,
        paths: (geo?.coordinates?.[0] || []).map(([lng, lat]) => ({ lat, lng })),
        strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 2, fillColor: '#ffffff', fillOpacity: 0.08 }));
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
      if (!pan) {                            // panning: she moves the map, it never jumps back
        // Her points sit in the part above the card (the card covers the lower half of the screen).
        const pad = { top: 120, bottom: Math.round(window.innerHeight * 0.55), left: 48, right: 48 };
        if (points.length > 1) {
          const b = new g.LatLngBounds();
          points.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
          m.fitBounds(b, pad);
        } else {
          m.setCenter(center);
          m.panBy(0, Math.round(window.innerHeight * 0.2));
        }
      }
    } catch (e) { console.error('[field map] markers not drawn', e); }
  }, [points, center, me, pan, selected, onSelect, shapes]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => () => {
    marks.current.forEach((x) => { x.map = null; }); line.current?.setMap(null);
    if (meMark.current) meMark.current.map = null; meCircle.current?.setMap(null);
  }, []);

  return (
    <GoogleMap mapContainerStyle={STYLE} center={pan ? undefined : center} zoom={21} options={pan ? PAN_OPTIONS : OPTIONS}
      onLoad={(m) => { map.current = m; m.setCenter(center); draw(); }} onUnmount={() => { map.current = null; }}
      onIdle={report} />
  );
}
