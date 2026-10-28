// The border map of L2a–L4 (boards LeaderBorder*): her points and the shapes per field on the satellite basemap,
// pan and zoom. Dashed white = to check, accent = being checked, solid white = accepted; numbered pins.
// The Google satellite map, with the same key and loader as the member's R5–R8 map (src/register/FieldMap.jsx,
// executive decision 21 Oct); the Leaflet/Esri map only when Google Maps cannot load (offline, a refused key).
import { useEffect, useRef } from 'react';
import { GoogleMap } from '@react-google-maps/api';
import { useFieldMapLoaded } from '../register/FieldMap';
import { useLeaflet } from '../plan/AreaMap';
import { C } from '../shell/tokens';
import { shapeFor } from './api';

const pinHtml = (n, on) => {
  const el = document.createElement('span');
  el.textContent = String(n);
  el.style.cssText = `width:24px;height:24px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font:700 14px Inter,system-ui,sans-serif;background:${on ? C.accent : C.raised};color:${on ? C.ink : C.text}`;
  return el;
};

/**
 * fields: the job's fields; plan: field n → shape id (the job's, or a preview); active: the field being
 * checked (or drawn); drawing: show the points only, in accent; onField(n): a pin or shape was tapped.
 */
export default function BorderMap(props) {
  const { ok } = useFieldMapLoaded();
  return ok ? <GoogleBorderMap {...props} /> : <LeafletBorderMap {...props} />;
}

// maxZoom 20: satellite imagery stops there in rural Tamil Nadu (zoom 22 tiles answer 404); no + / − buttons.
const G_OPTIONS = { mapTypeId: 'satellite', disableDefaultUI: true, zoomControl: false, maxZoom: 20, gestureHandling: 'greedy', tilt: 0,
  clickableIcons: false, mapId: '8fa18e8fd7e4c318' };

/** Google: the same drawing rules as below, on the satellite map. */
function GoogleBorderMap({ fields = [], plan = {}, active, shapeOverride, drawing, onField, height = 360, fitBottom, plots = [], plotOn, onPlot }) {
  const map = useRef(null);
  const drawn = useRef([]);
  const fitKey = useRef();
  const draw = () => {
    const m = map.current; const g = window.google?.maps;
    if (!m || !g) return;
    drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; });
    drawn.current = [];
    const bounds = new g.LatLngBounds(); const focus = new g.LatLngBounds(); let hasFocus = false;
    fields.forEach((f) => {
      const on = f.n === active;
      const shape = drawing && f.state === 'drawing' ? null
        : on && shapeOverride ? f.shapes?.find((s) => s.id === shapeOverride) : shapeFor(f, plan);
      const ring = shape?.geometry?.coordinates?.[0];
      if (ring?.length) {
        const path = ring.map(([lng, lat]) => ({ lat, lng }));
        const accepted = !!f.accepted && !on;
        const dashed = !on && !accepted;
        const poly = new g.Polygon({ map: m, paths: path, clickable: !!onField,
          strokeColor: on ? C.accent : '#ffffff', strokeOpacity: dashed ? 0 : 1, strokeWeight: on ? 3 : 2,
          fillColor: on ? C.accent : '#ffffff', fillOpacity: on ? 0.28 : accepted ? 0.08 : 0 });
        if (onField) poly.addListener('click', () => onField(f.n));
        drawn.current.push(poly);
        if (dashed) {   // dashed white = to check (a dashed polyline over the outline)
          drawn.current.push(new g.Polyline({ map: m, path: [...path, path[0]], strokeOpacity: 0, clickable: false,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#ffffff', scale: 2 }, offset: '0', repeat: '10px' }] }));
        }
        path.forEach((q) => { bounds.extend(q); if (on) { focus.extend(q); hasFocus = true; } });
      }
      const p = f.moved || f.point;
      if (p) {
        const pinOn = on || (drawing && f.state === 'drawing');
        if (g.marker?.AdvancedMarkerElement) {
          const mk = new g.marker.AdvancedMarkerElement({ map: m, position: { lat: p.lat, lng: p.lng }, content: pinHtml(f.n, pinOn), gmpClickable: !!onField });
          if (onField) mk.addListener('click', () => onField(f.n));
          drawn.current.push(mk);
        }
        bounds.extend(p);
        if (on && !shape) { focus.extend(p); hasFocus = true; }
      }
    });
    // Neighbour plots (28 Oct): a thin dotted outline; the one picked in amber. A tap opens its choices.
    plots.forEach((p) => {
      const ring = p.geometry?.coordinates?.[0];
      if (!ring?.length) return;
      const path = ring.map(([lng, lat]) => ({ lat, lng }));
      const on = p.id === plotOn;
      const poly = new g.Polygon({ map: m, paths: path, clickable: !!onPlot, strokeOpacity: on ? 1 : 0, strokeColor: C.accent, strokeWeight: 2,
        fillColor: on ? C.accent : '#ffffff', fillOpacity: on ? 0.2 : 0.04 });
      if (onPlot) poly.addListener('click', () => onPlot(p.id));
      drawn.current.push(poly);
      if (!on) {
        drawn.current.push(new g.Polyline({ map: m, path: [...path, path[0]], strokeOpacity: 0, clickable: false,
          icons: [{ icon: { path: g.SymbolPath.CIRCLE, fillOpacity: 1, fillColor: '#ffffff', strokeOpacity: 0, scale: 1.5 }, offset: '0', repeat: '8px' }] }));
      }
    });
    const key = `${active || 'all'}:${fields.length}`;
    if (fitKey.current !== key && !bounds.isEmpty()) {
      fitKey.current = key;
      // Full height behind a card (26 Oct): the fields sit in the part above the card.
      m.fitBounds(hasFocus ? focus : bounds, fitBottom ? { top: 72, left: 32, right: 32, bottom: fitBottom } : 32);
    }
  };
  useEffect(draw); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; }); }, []);
  return (
    <div style={{ height, width: '100%' }} aria-label="Satellite map with field shapes">
      <GoogleMap mapContainerStyle={{ height: '100%', width: '100%' }} options={G_OPTIONS}
        onLoad={(m) => { map.current = m; m.setZoom(18); m.setCenter(fields[0]?.point ? { lat: fields[0].point.lat, lng: fields[0].point.lng } : { lat: 11.8872, lng: 78.9659 }); draw(); }}
        onUnmount={() => { map.current = null; }} />
    </div>
  );
}

/** Leaflet + Esri: only when Google Maps cannot load. */
function LeafletBorderMap({ fields = [], plan = {}, active, shapeOverride, drawing, onField, height = 360, plots = [], plotOn, onPlot }) {
  const ready = useLeaflet();
  const box = useRef();
  const map = useRef();
  const layer = useRef();
  const fitKey = useRef();
  useEffect(() => {
    if (!ready || !box.current || map.current) return undefined;
    const L = window.L;
    const m = L.map(box.current, { zoomControl: false });
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }).addTo(m);
    layer.current = L.featureGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = undefined; fitKey.current = undefined; };
  }, [ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const L = window.L;
    const g = layer.current;
    g.clearLayers();
    const focus = [];
    fields.forEach((f) => {
      const on = f.n === active;
      const shape = drawing && f.state === 'drawing' ? null
        : on && shapeOverride ? f.shapes?.find((s) => s.id === shapeOverride) : shapeFor(f, plan);
      if (shape?.geometry) {
        const accepted = !!f.accepted && !on;
        const style = on ? { color: C.accent, weight: 3, fillColor: C.accent, fillOpacity: 0.28 }
          : accepted ? { color: '#ffffff', weight: 2, fillOpacity: 0.08, fillColor: '#ffffff' }
            : { color: '#ffffff', weight: 1.5, dashArray: '6 4', fillOpacity: 0 };
        const shp = L.geoJSON(shape.geometry, { style });
        if (onField) shp.on('click', () => onField(f.n));
        shp.addTo(g);
        if (on) focus.push(shp.getBounds());
      }
      const p = f.moved || f.point;
      if (p) {
        const pinOn = on || (drawing && f.state === 'drawing');
        const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ html: pinHtml(f.n, pinOn), className: '', iconSize: [24, 24] }), keyboard: false });
        if (onField) mk.on('click', () => onField(f.n));
        mk.addTo(g);
        if (on && !shape) focus.push(L.latLngBounds([p.lat, p.lng], [p.lat, p.lng]).pad(0.002));
      }
    });
    plots.forEach((p) => {
      const on = p.id === plotOn;
      const shp = L.geoJSON(p.geometry, { style: on ? { color: C.accent, weight: 2, fillColor: C.accent, fillOpacity: 0.2 }
        : { color: '#ffffff', weight: 1.5, dashArray: '1 6', fillOpacity: 0.04, fillColor: '#ffffff' } });
      if (onPlot) shp.on('click', () => onPlot(p.id));
      shp.addTo(g);
    });
    // Fit once per view (all fields, or the field being checked); later redraws keep her pan and zoom.
    const key = `${active || 'all'}:${fields.length}`;
    if (fitKey.current !== key && g.getLayers().length) {
      fitKey.current = key;
      const b = focus.length ? focus.reduce((a, x) => a.extend(x), L.latLngBounds(focus[0].getSouthWest(), focus[0].getNorthEast())) : g.getBounds();
      m.fitBounds(b, { padding: [32, 32], maxZoom: 18 });
    }
  }, [ready, fields, plan, active, shapeOverride, drawing, onField, plots, plotOn, onPlot]);
  return <div ref={box} style={{ height, width: '100%', background: '#25361f' }} aria-label="Satellite map with field shapes" />;
}

/** A small picture of one shape for the L3 thumbnails (no tiles: the outline in its own box). */
export function ShapeThumb({ geometry, size = 72 }) {
  const ring = geometry?.coordinates?.[0] || [];
  if (!ring.length) return <div style={{ width: size, height: size }} />;
  const xs = ring.map((q) => q[0]); const ys = ring.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = (size - 12) / Math.max(x1 - x0, y1 - y0, 1e-9);
  const d = ring.map((q, i) => `${i ? 'L' : 'M'}${(6 + (q[0] - x0) * k).toFixed(1)} ${(size - 6 - (q[1] - y0) * k).toFixed(1)}`).join(' ');
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <rect width={size} height={size} fill="#25361f" />
      <path d={`${d} Z`} fill="rgba(212,207,90,0.28)" stroke={C.accent} strokeWidth="2" />
    </svg>
  );
}
