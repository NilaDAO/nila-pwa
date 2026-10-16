// The area map on the crop-plan screens (CP1/CP2/CP4/CP10/CP13): her areas from the field record on a
// satellite basemap, each labelled ("Area n", or what grows there in the season shown). Leaflet and the
// Esri World Imagery tiles, loaded at runtime as the app's record viewer already does (no new dependency).
import { useEffect, useRef, useState } from 'react';
import { C } from '../shell/tokens';
import { areasOf } from './record';

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

/** labels: zone_id → { text, sub, colour } (default "Area n"). */
export default function AreaMap({ record, labels = {}, height = 220 }) {
  const box = useRef();
  const [ready, setReady] = useState(!!window.L);
  useEffect(() => {
    if (window.L) return undefined;
    let live = true;
    load('link', { rel: 'stylesheet', ...CSS }).catch(() => {});
    load('script', JS).then(() => live && window.L && setReady(true)).catch(() => {});
    return () => { live = false; };
  }, []);
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
