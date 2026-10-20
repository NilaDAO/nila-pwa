// The border map of L2a–L4 (boards LeaderBorder*): her points and the shapes per field on the satellite basemap,
// pan and zoom. Dashed white = to check, accent = being checked, solid white = accepted; numbered pins.
// Same Leaflet loader and Esri tiles as the crop-plan AreaMap (no new dependency).
import { useEffect, useRef } from 'react';
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
export default function BorderMap({ fields = [], plan = {}, active, shapeOverride, drawing, onField, height = 360 }) {
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
    // Fit once per view (all fields, or the field being checked); later redraws keep her pan and zoom.
    const key = `${active || 'all'}:${fields.length}`;
    if (fitKey.current !== key && g.getLayers().length) {
      fitKey.current = key;
      const b = focus.length ? focus.reduce((a, x) => a.extend(x), L.latLngBounds(focus[0].getSouthWest(), focus[0].getNorthEast())) : g.getBounds();
      m.fitBounds(b, { padding: [32, 32], maxZoom: 18 });
    }
  }, [ready, fields, plan, active, shapeOverride, drawing, onField]);
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
