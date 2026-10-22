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

// Every map can be zoomed and panned with one finger or the wheel (22 Oct, G1); a tap on an area still picks it.
const G_OPTIONS = { mapTypeId: 'satellite', disableDefaultUI: true, gestureHandling: 'greedy', keyboardShortcuts: false, clickableIcons: false,
  maxZoom: 20, tilt: 0, mapId: '8fa18e8fd7e4c318', isFractionalZoomEnabled: true };

// CP10's map label (board CropPlanQ3-xdlz): one chip, the crop bold and the yield under it; the picked area's chip
// is filled in the accent with on-accent (ink) text (21 Oct), the others fade; an accepted area shows a check. Text from the node, never as HTML.
function chip({ text, sub, acc, soil }, on, faded, clickable) {
  const el = document.createElement('div');
  // A soil cover's chip (21 Oct) has a dashed green border, so it never reads as a crop for sale.
  Object.assign(el.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 10px', borderRadius: '12px',
    background: on ? '#D4CF5A' : 'rgba(18,18,18,0.85)', color: on ? '#121212' : '#F1F5F9', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap',
    border: on ? '0' : soil ? '1.5px dashed #7FB069' : '0', opacity: faded ? '0.3' : '1', cursor: clickable ? 'pointer' : 'default', transform: 'translateY(50%)' });
  const a = document.createElement('span');
  Object.assign(a.style, { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', lineHeight: '1.5', fontWeight: '700' });
  if (acc) {
    a.insertAdjacentHTML('beforeend', `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${on ? '#121212' : '#D4CF5A'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`);
  }
  a.appendChild(document.createTextNode(text));
  el.appendChild(a);
  if (sub) {
    const b = document.createElement('span');
    Object.assign(b.style, { fontSize: '12px', lineHeight: '16px' });
    b.textContent = sub;
    el.appendChild(b);
  }
  return el;
}

const ringsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);

/** outline: the parcel (record meta.geometry.out), drawn as a dashed white line; areas get their crop colour as fill
 *  and border (board CP10). selected / onSelect: tapping an area or its chip picks it; the others fade. */
function GoogleAreaMap({ record, labels = {}, height = 220, selected = null, onSelect, fitBottom, fitSide = 40 }) {
  const map = useRef(null);
  const drawn = useRef([]);
  const fitted = useRef(null);
  const draw = () => {
    const m = map.current; const g = window.google?.maps;
    if (!m || !g || !record) return;
    drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; });
    drawn.current = [];
    const bounds = new g.LatLngBounds();
    const pick = onSelect ? (z) => () => onSelect(selected === z ? null : z) : null;
    areasOf(record).forEach((z, i) => {
      const rings = ringsOf(z.geometry);
      if (!rings.length) return;
      const lab = labels[z.zone_id] || { text: `Area ${i + 1}` };
      const faded = !!selected && selected !== z.zone_id;
      const colour = lab.colour || '#ffffff';
      let sx = 0; let sy = 0; let k = 0;
      rings.forEach((ring) => {
        const path = ring.map(([lng, lat]) => ({ lat, lng }));
        path.forEach((q) => { bounds.extend(q); sx += q.lng; sy += q.lat; k += 1; });
        const poly = new g.Polygon({ map: m, paths: path, clickable: !!pick, fillColor: colour, fillOpacity: (lab.colour ? (lab.soil ? 0.3 : 0.55) : 0.15) * (faded ? 0.3 : 1),
          strokeColor: colour, strokeOpacity: faded ? 0.3 : 1, strokeWeight: 1.5 });
        if (pick) poly.addListener('click', pick(z.zone_id));
        drawn.current.push(poly);
      });
      if (k && g.marker?.AdvancedMarkerElement) {
        const mk = new g.marker.AdvancedMarkerElement({ map: m, position: { lat: sy / k, lng: sx / k }, gmpClickable: !!pick,
          title: lab.text, content: chip(lab, selected === z.zone_id, faded, !!pick) });
        if (pick) mk.addListener('click', pick(z.zone_id));
        drawn.current.push(mk);
      }
    });
    ringsOf(record?.meta?.geometry?.out).forEach((ring) => {
      const path = ring.map(([lng, lat]) => ({ lat, lng }));
      path.forEach((q) => bounds.extend(q));
      drawn.current.push(new g.Polyline({ map: m, path: [...path, path[0]], strokeOpacity: 0, clickable: false, zIndex: 3,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#F1F5F9', strokeWeight: 1.5, scale: 3 }, offset: '0', repeat: '10px' }] }));
    });
    // A picked area: the map centres on it (CP10, 21 Oct); none picked: all her areas.
    const pickedArea = selected && areasOf(record).find((z) => z.zone_id === selected);
    let target = bounds;
    if (pickedArea) {
      const b = new g.LatLngBounds();
      ringsOf(pickedArea.geometry).forEach((ring) => ring.forEach(([lng, lat]) => b.extend({ lat, lng })));
      if (!b.isEmpty()) target = b;
    }
    const fitKey = `${record?.report_hash_bytes32 || ''}:${fitBottom || ''}:${selected || ''}`;
    if (!target.isEmpty() && fitted.current !== fitKey) {
      fitted.current = fitKey;
      // Her areas sit in the part above the card (the card covers the lower part of the screen).
      const full = height === '100%';
      m.fitBounds(target, full ? { top: 80, left: fitSide, right: fitSide, bottom: fitBottom ?? Math.round(window.innerHeight * 0.6) } : 16);
    }
  };
  useEffect(draw, [record, labels, selected, onSelect, height, fitBottom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; }); }, []);
  return (
    <div style={{ height, width: '100%', background: '#25361f' }} aria-label="Map of your areas">
      <GoogleMap mapContainerStyle={{ height: '100%', width: '100%' }} options={G_OPTIONS}
        onLoad={(m) => { map.current = m; m.setZoom(17); m.setCenter({ lat: 11.8872, lng: 78.9659 }); draw(); }} onUnmount={() => { map.current = null; }} />
    </div>
  );
}

function LeafletAreaMap({ record, labels = {}, height = 220, selected = null, onSelect }) {
  const box = useRef();
  const ready = useLeaflet();
  useEffect(() => {
    if (!ready || !window.L || !box.current || !record) return undefined;
    const L = window.L;
    const map = L.map(box.current, { zoomControl: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }).addTo(map);
    const areas = areasOf(record);
    const group = L.featureGroup().addTo(map);
    areas.forEach((z, i) => {
      if (!z.geometry) return;
      const lab = labels[z.zone_id] || { text: `Area ${i + 1}` };
      const faded = !!selected && selected !== z.zone_id;
      const colour = lab.colour || '#ffffff';
      const layer = L.geoJSON(z.geometry, { style: { color: colour, weight: 1.5, opacity: faded ? 0.3 : 1, fillColor: colour, fillOpacity: (lab.colour ? (lab.soil ? 0.3 : 0.55) : 0.15) * (faded ? 0.3 : 1) } });
      layer.addTo(group);
      if (onSelect) layer.on('click', () => onSelect(selected === z.zone_id ? null : z.zone_id));
      layer.bindTooltip(labelEl(lab.text, lab.sub), { permanent: true, direction: 'center', className: 'nila-area-label' });
    });
    const out = record?.meta?.geometry?.out;
    if (out) L.geoJSON(out, { interactive: false, style: { color: '#F1F5F9', weight: 1.5, dashArray: '6 4', fill: false } }).addTo(map);
    if (group.getLayers().length) map.fitBounds(group.getBounds(), { padding: [16, 16] });
    return () => map.remove();
  }, [ready, record, labels, selected, onSelect]);
  return (
    <>
      <style>{`.nila-area-label{background:${C.ink};color:${C.text};border:0;border-radius:9999px;padding:4px 10px;font:700 12px Inter,system-ui,sans-serif;box-shadow:none;text-align:center}.nila-area-label:before{display:none}`}</style>
      <div ref={box} style={{ height, width: '100%', background: '#25361f' }} aria-label="Map of your areas" />
    </>
  );
}
