// The area map on the crop-plan screens (CP1/CP2/CP4/CP10/CP13): her areas from the field record on a
// satellite basemap, each labelled ("Area n", or what grows there in the season shown). Leaflet and the
// Esri World Imagery tiles, loaded at runtime as the app's record viewer already does (no new dependency).
import { useEffect, useRef, useState } from 'react';
import { C } from '../shell/tokens';
import { areasOf } from './record';
import { GoogleMap } from '@react-google-maps/api';
import { useFieldMapLoaded } from '../register/FieldMap';

// Pinned 1.9.4 with Subresource Integrity (Leaflet's published hashes): unpkg cannot change the code.
const CSS = { href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=' };
const JS = { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=' };
/** Adds the tag once; when it is already there (a remount, the record viewer) waits for it to load. */
const load = (tag, attrs) => new Promise((res, rej) => {
  const url = attrs.href || attrs.src;
  const found = document.querySelector(`${tag}[${tag === 'link' ? 'href' : 'src'}="${url}"]`);
  if (found) {
    if (tag === 'link' || found.dataset.loaded || window.L) return res();
    found.addEventListener('load', res, { once: true }); found.addEventListener('error', rej, { once: true });
    return undefined;
  }
  const el = Object.assign(document.createElement(tag), attrs, { crossOrigin: 'anonymous' });
  el.onload = () => { el.dataset.loaded = '1'; res(); }; el.onerror = rej; document.head.appendChild(el);
  return undefined;
});
/** Text for a label: crop names come from the node, never as HTML. */
const labelEl = (text, sub) => {
  const el = document.createElement('span');
  const b = document.createElement('b'); b.textContent = text; el.appendChild(b);
  if (sub) { el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(sub)); }
  return el;
};

/** True once Leaflet is loaded (shared with the border map, P11). */
export function useLeaflet() {
  const [ready, setReady] = useState(!!window.L);
  useEffect(() => {
    if (window.L) return undefined;
    let live = true;
    load('link', { rel: 'stylesheet', ...CSS }).catch(() => {});
    load('script', JS).then(() => live && window.L && setReady(true)).catch(() => {});
    return () => { live = false; };
  }, []);
  return ready;
}

/** labels: zone_id → { text, sub, colour } (default "Area n"). The Google satellite map (the same key and loader as
 *  R5–R8 and L2–L4, executive decision 21 Oct); Leaflet/Esri only when Google cannot load. height '100%' fills. */
export default function AreaMap(props) {
  const { ok } = useFieldMapLoaded();
  return ok ? <GoogleAreaMap {...props} /> : <LeafletAreaMap {...props} />;
}

const G_OPTIONS = { mapTypeId: 'satellite', disableDefaultUI: true, gestureHandling: 'none', keyboardShortcuts: false, clickableIcons: false,
  maxZoom: 20, tilt: 0, mapId: '8fa18e8fd7e4c318' };

function chip(text, sub) {
  const el = labelEl(text, sub);
  Object.assign(el.style, { background: 'rgba(18,18,18,0.8)', color: '#F1F5F9', borderRadius: '9999px', padding: '0 8px', font: '700 14px/1.5 Inter, system-ui, sans-serif',
    whiteSpace: 'nowrap', textAlign: 'center', transform: 'translateY(50%)' });
  return el;
}

function GoogleAreaMap({ record, labels = {}, height = 220 }) {
  const map = useRef(null);
  const drawn = useRef([]);
  const draw = () => {
    const m = map.current; const g = window.google?.maps;
    if (!m || !g || !record) return;
    drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; });
    drawn.current = [];
    const bounds = new g.LatLngBounds();
    areasOf(record).forEach((z, i) => {
      const rings = z.geometry?.type === 'Polygon' ? [z.geometry.coordinates[0]] : z.geometry?.type === 'MultiPolygon' ? z.geometry.coordinates.map((p) => p[0]) : [];
      if (!rings.length) return;
      const lab = labels[z.zone_id] || { text: `Area ${i + 1}` };
      let sx = 0; let sy = 0; let k = 0;
      rings.forEach((ring) => {
        const path = ring.map(([lng, lat]) => ({ lat, lng }));
        path.forEach((q) => { bounds.extend(q); sx += q.lng; sy += q.lat; k += 1; });
        drawn.current.push(new g.Polygon({ map: m, paths: path, clickable: false, strokeOpacity: 0,
          fillColor: lab.colour || '#ffffff', fillOpacity: lab.colour ? 0.55 : 0.15 }));
        drawn.current.push(new g.Polyline({ map: m, path: [...path, path[0]], strokeOpacity: 0, clickable: false,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#ffffff', scale: 2 }, offset: '0', repeat: '8px' }] }));
      });
      if (k && g.marker?.AdvancedMarkerElement) {
        drawn.current.push(new g.marker.AdvancedMarkerElement({ map: m, position: { lat: sy / k, lng: sx / k }, content: chip(lab.text, lab.sub) }));
      }
    });
    if (!bounds.isEmpty()) {
      // Her areas sit in the part above the card (the card covers the lower part of the screen).
      const full = height === '100%';
      m.fitBounds(bounds, full ? { top: 90, left: 40, right: 40, bottom: Math.round(window.innerHeight * 0.6) } : 16);
    }
  };
  useEffect(draw); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; }); }, []);
  return (
    <div style={{ height, width: '100%', background: '#25361f' }} aria-label="Map of your areas">
      <GoogleMap mapContainerStyle={{ height: '100%', width: '100%' }} options={G_OPTIONS}
        onLoad={(m) => { map.current = m; m.setZoom(17); m.setCenter({ lat: 11.8872, lng: 78.9659 }); draw(); }} onUnmount={() => { map.current = null; }} />
    </div>
  );
}

function LeafletAreaMap({ record, labels = {}, height = 220 }) {
  const box = useRef();
  const ready = useLeaflet();
  useEffect(() => {
    if (!ready || !window.L || !box.current || !record) return undefined;
    const L = window.L;
    const map = L.map(box.current, { zoomControl: false, scrollWheelZoom: false, dragging: false, doubleClickZoom: false, touchZoom: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }).addTo(map);
    const areas = areasOf(record);
    const group = L.featureGroup().addTo(map);
    areas.forEach((z, i) => {
      if (!z.geometry) return;
      const lab = labels[z.zone_id] || { text: `Area ${i + 1}` };
      const layer = L.geoJSON(z.geometry, { style: { color: '#ffffff', weight: 1.5, dashArray: '4 3', fillColor: lab.colour || '#ffffff', fillOpacity: lab.colour ? 0.55 : 0.15 } });
      layer.addTo(group);
      layer.bindTooltip(labelEl(lab.text, lab.sub), { permanent: true, direction: 'center', className: 'nila-area-label' });
    });
    if (group.getLayers().length) map.fitBounds(group.getBounds(), { padding: [16, 16] });
    return () => map.remove();
  }, [ready, record, labels]);
  return (
    <>
      <style>{`.nila-area-label{background:${C.ink};color:${C.text};border:0;border-radius:9999px;padding:4px 10px;font:700 12px Inter,system-ui,sans-serif;box-shadow:none;text-align:center}.nila-area-label:before{display:none}`}</style>
      <div ref={box} style={{ height, width: '100%', background: '#25361f' }} aria-label="Map of your areas" />
    </>
  );
}
