// R5–R7: the satellite map behind the point sheet, with the same settings as today's field registration
// (features/maps/FieldRegistration/fieldRegMaps.js, the on-site options): satellite, zoom 21, tilt 0, no controls,
// not draggable, map ID 8fa18e8fd7e4c318, her points as the same small gold markers joined by a faint line, centred
// on her last point (before the first one: the union's location, as today). The script loader id is today's, so the
// two never load Maps twice. Offline or without a key it is not shown and the field scene stays (FieldFrame).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';

const LIBRARIES = ['maps', 'marker'];
const MAP_ID = '8fa18e8fd7e4c318';
const UNION_LOCATION = { lat: 11.878671, lng: 78.964561 };   // today's one union (components/Forms/memberUnion.js)
const OPTIONS = {
  mapTypeId: 'satellite', streetViewControl: false, fullscreenControl: false, zoomControl: false, mapTypeControl: false,
  rotateControl: false, scrollwheel: false, draggable: false, zoom: 21, tilt: 0, keyboardShortcuts: false,
  clickableIcons: false, disableDefaultUI: true, mapId: MAP_ID,
};
const STYLE = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

function dot() {   // today's marker (fieldRegMaps.js createCircleIcon)
  const c = document.createElement('div');
  Object.assign(c.style, { width: '12px', height: '12px', backgroundColor: '#D4CF5A', borderRadius: '50%', border: '1px solid green',
    opacity: '0.45', transform: 'translate(0%, 50%)' });
  return c;
}

export function useFieldMapLoaded() {
  const key = process.env.REACT_APP_GOOGLE_MAPS;
  const { isLoaded, loadError } = useJsApiLoader({ id: 'script-loader', googleMapsApiKey: key || '', libraries: LIBRARIES,
    version: 'weekly', mapIds: [MAP_ID] });
  return { ok: !!key && isLoaded && !loadError && navigator.onLine };
}

export default function FieldMap({ points = [] }) {
  const map = useRef(null);
  const marks = useRef([]);
  const line = useRef(null);
  const center = useMemo(() => (points.length ? { lat: points.at(-1).lat, lng: points.at(-1).lng } : UNION_LOCATION), [points]);

  const draw = useCallback(() => {
    const m = map.current;
    const g = window.google?.maps;
    if (!m || !g) return;
    marks.current.forEach((x) => { x.map = null; });
    marks.current = points.map((p, i) => new g.marker.AdvancedMarkerElement({ position: { lat: p.lat, lng: p.lng }, map: m, title: `P${i + 1}`, content: dot() }));
    if (line.current) line.current.setPath(points);
    else if (points.length) {
      line.current = new g.Polyline({ path: points, geodesic: true, strokeColor: '#D4CF5A', strokeOpacity: 0.3, strokeWeight: 1 });
      line.current.setMap(m);
    }
    m.setCenter(center);
  }, [points, center]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => () => { marks.current.forEach((x) => { x.map = null; }); line.current?.setMap(null); }, []);

  return (
    <GoogleMap mapContainerStyle={STYLE} center={center} zoom={21} options={OPTIONS}
      onLoad={(m) => { map.current = m; draw(); }} onUnmount={() => { map.current = null; }} />
  );
}
