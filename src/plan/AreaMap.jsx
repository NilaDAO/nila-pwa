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
/** The hatch for areas still to be set (13 Nov): one hidden SVG pattern in the page, used as `fill: url(#nila-hatch)`. */
function hatchPattern() {
  if (document.getElementById('nila-hatch')) return;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  box.innerHTML = '<svg width="0" height="0"><defs><pattern id="nila-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
    + '<rect width="8" height="8" fill="rgba(18,18,18,0.15)"/><rect width="2" height="8" fill="rgba(241,245,249,0.4)"/></pattern></defs></svg>';
  document.body.appendChild(box);
}

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
  // 13 Nov: a size smaller (12/11 px, tighter padding), so the labels cover less of the land.
  Object.assign(el.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 8px', borderRadius: '10px',
    background: on ? '#D4CF5A' : 'rgba(18,18,18,0.85)', color: on ? '#121212' : '#F1F5F9', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap',
    border: on ? '0' : soil ? '1.5px dashed #7FB069' : '0', opacity: faded ? '0.3' : '1', cursor: clickable ? 'pointer' : 'default', transform: 'translateY(50%)' });
  const a = document.createElement('span');
  Object.assign(a.style, { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', lineHeight: '1.4', fontWeight: '700' });
  if (acc) {
    a.insertAdjacentHTML('beforeend', `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${on ? '#121212' : '#D4CF5A'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`);
  }
  a.appendChild(document.createTextNode(text));
  el.appendChild(a);
  if (sub) {
    const b = document.createElement('span');
    Object.assign(b.style, { fontSize: '11px', lineHeight: '14px' });
    b.textContent = sub;
    el.appendChild(b);
  }
  return el;
}

export const ringsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : []);
// Every polygon with all its rings, holes included (14 Nov: an area inside another is the other's hole).
/** Stripes across a polygon (18 Nov: two crops on one area in a season, e.g. green manure then sugarcane): diagonal
 *  lines, cut to the polygon with its holes (even-odd), as [[lng, lat], [lng, lat]] segments. Google Maps fills no
 *  pattern, so the second crop's colour is drawn as these lines over the first crop's fill. */
export function stripes(poly, n = 14, dir = 1, every = 0) {
  const rings = (poly || []).filter((r) => r.length > 2);
  if (!rings.length) return [];
  const lat0 = rings[0][0][1] * Math.PI / 180;
  const k = Math.cos(lat0);   // lng degrees to the same scale as lat
  // Rotate 45°: u = x + y, v = y − x (x = lng·k, y = lat); stripes are lines of constant v.
  // dir −1 (19 Nov): the other diagonal, for a cross-hatch.
  const rot = ([lng, lat]) => { const x = lng * k * dir; return [x + lat, lat - x]; };
  const back = (u, v) => { const x = (u - v) / 2; const y = (u + v) / 2; return [x / k / dir, y]; };
  const rr = rings.map((r) => r.map(rot));
  const vs = rr.flat().map((q) => q[1]);
  const vMin = Math.min(...vs); const vMax = Math.max(...vs);
  // every (19 Nov): a fixed spacing on one grid, so the parts of an area (and its neighbours) line up.
  const step = every > 0 ? every : (vMax - vMin) / n;
  if (!(step > 0)) return [];
  const out = [];
  for (let v = every > 0 ? Math.ceil(vMin / step) * step : vMin + step / 2; v < vMax; v += step) {
    const us = [];
    for (const r of rr) for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) {
      const [ui, vi] = r[i]; const [uj, vj] = r[j];
      if ((vi > v) !== (vj > v)) us.push(ui + ((v - vi) / (vj - vi)) * (uj - ui));
    }
    us.sort((a, b) => a - b);
    for (let i = 0; i + 1 < us.length; i += 2) out.push([back(us[i], v), back(us[i + 1], v)]);
  }
  return out;
}
// A bio manure's lines (19 Nov): single, the other diagonal from a green manure's, about 8 m apart on one grid.
export const MANURE_STEP = 0.0001;
/** A ring moved `m` metres inward (20 Nov: a selected area's white line inside its own edge, so on a border shared
 *  with a neighbour it shows which side is selected): each edge shifted inward, corners where the shifted edges meet;
 *  a corner that would shoot far off (a sharp spike) is moved straight in instead. [[lng, lat]] in and out. */
export function insetRing(ring, m = 1) {
  const pts = (ring || []).slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const n = pts.length;
  if (n < 3) return ring || [];
  const lat0 = pts[0][1] * Math.PI / 180;
  const kx = 111320 * Math.cos(lat0); const ky = 110540;
  const P = pts.map(([lng, lat]) => [lng * kx, lat * ky]);
  let area = 0;
  for (let i = 0; i < n; i += 1) { const [x1, y1] = P[i]; const [x2, y2] = P[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const sgn = area > 0 ? 1 : -1;   // counter-clockwise: the inside is to the left of each edge
  const off = [];
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = P[i]; const [x2, y2] = P[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = (-(y2 - y1) / len) * sgn * m; const ny = ((x2 - x1) / len) * sgn * m;
    off.push([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [nx, ny]]);
  }
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const [a1, a2, na] = off[(i - 1 + n) % n]; const [b1, b2, nb] = off[i];
    const d1 = [a2[0] - a1[0], a2[1] - a1[1]]; const d2 = [b2[0] - b1[0], b2[1] - b1[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    let q;
    if (Math.abs(den) > 1e-9) {
      const t = ((b1[0] - a1[0]) * d2[1] - (b1[1] - a1[1]) * d2[0]) / den;
      q = [a1[0] + t * d1[0], a1[1] + t * d1[1]];
    }
    const [px, py] = P[i];
    if (!q || Math.hypot(q[0] - px, q[1] - py) > 4 * m) {
      const ax = (na[0] + nb[0]) / 2; const ay = (na[1] + nb[1]) / 2; const l = Math.hypot(ax, ay) || 1;
      q = [px + (ax / l) * m, py + (ay / l) * m];
    }
    out.push([q[0] / kx, q[1] / ky]);
  }
  out.push(out[0]);
  return out;
}
export const polysOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);

/** Joined areas (14 Nov): an area whose label has `join` (an area she added to a touching one) is drawn as part of
 *  that area — its colour, one chip, no line between them. The root of each area, and the outline of a group: the
 *  edges of its rings that no other ring in the group shares (the areas come from one raster, so shared edges match). */
export function joinRoot(labels, zone) {
  const seen = new Set([zone]);
  let z = zone;
  while (labels[z]?.join && !labels[labels[z].join]?.gone && !seen.has(labels[z].join)) { z = labels[z].join; seen.add(z); }
  return z;
}
function outlineOf(rings) {
  const key = ([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`;
  const count = new Map();
  const segs = [];
  rings.forEach((r) => { for (let i = 1; i < r.length; i += 1) {
    const a = key(r[i - 1]); const b = key(r[i]); const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    count.set(k, (count.get(k) || 0) + 1); segs.push([k, r[i - 1], r[i]]);
  } });
  return segs.filter(([k]) => count.get(k) === 1).map(([, p, q]) => [p, q]);
}

/** outline: the parcel (record meta.geometry.out), drawn as a dashed white line; areas get their crop colour as fill
 *  and border (board CP10). selected / onSelect: tapping an area or its chip picks it; the others fade. */
/** center ({ lat, lng }): where the map looks when there is no record to draw (26 Oct: a leader's filter with nothing
 *  in it shows the union's land, never a black screen). */
// focus (17 Nov): several areas shown at once (a tapped job tile's areas): they stand out, the others fade, the map fits them.
function GoogleAreaMap({ record, labels = {}, height = 220, selected = null, focus = null, onSelect, fitBottom, fitSide = 40, center, chipsOff = false }) {
  const map = useRef(null);
  const drawn = useRef([]);
  const fitted = useRef(null);
  const draw = () => {
    const m = map.current; const g = window.google?.maps;
    if (!m || !g) return;
    drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; });
    drawn.current = [];
    if (!record) {
      const key = center ? `c:${center.lat}:${center.lng}` : null;
      if (key && fitted.current !== key) { fitted.current = key; m.setCenter(center); m.setZoom(14); }
      return;
    }
    const bounds = new g.LatLngBounds();
    const pick = onSelect ? (z) => () => onSelect(selected === z ? null : z) : null;
    const all = areasOf(record);
    const labOf = (z, i) => (labels[z.zone_id] && !labels[z.zone_id].join ? labels[z.zone_id] : { text: z.name || `Area ${i + 1}` });
    const rootOf = (z) => joinRoot(labels, z.zone_id);
    all.forEach((z, i) => {
      if (rootOf(z) !== z.zone_id) return;    // drawn with the area it was added to
      const group = all.filter((y) => rootOf(y) === z.zone_id);
      const joined = group.length > 1;
      const rings = group.flatMap((y) => ringsOf(y.geometry));
      if (!rings.length) return;
      let lab = labOf(z, i);
      if (lab.gone) return;   // an area she left out of the plan (5 Nov): not drawn, not tappable
      const faded = selected ? !group.some((y) => y.zone_id === selected) : !!focus?.length && !group.some((y) => focus.includes(y.zone_id));
      // 17 Nov: picked areas on the approved plan: the others nearly vanish, so the picked ones show at once.
      const FADE = !selected && focus?.length ? 0.06 : 0.3;
      // 18 Nov: a focused area with nothing on it in the season shown (or no labels at all, the take-up screen) is
      // filled in the accent, so a tap or the crop agreement's areas show at once against the faded others.
      if (!selected && focus?.length && !faded && (!lab.colour || lab.outline)) lab = { ...lab, colour: lab.colour || '#D4CF5A', outline: false };
      // The picked area (14 Nov): a white line around it and a lighter fill, so it stands out on the map.
      // lab.sel (17 Nov): one of several areas selected at once (the areas step), as the picked area.
      const sel = (!!selected && !faded) || !!lab.sel;   // a focus (17 Nov) only fades the others, no white line
      const colour = lab.colour || '#ffffff';
      let sx = 0; let sy = 0; let k = 0;
      // Joined areas: one outline around the group, no line between its parts.
      // 20 Nov: a hatched group still to set too (its accent outline).
      if (joined && !lab.dashed) {
        outlineOf(group.flatMap((y) => polysOf(y.geometry).flat())).forEach(([p, q]) => drawn.current.push(new g.Polyline({ map: m, path: [{ lat: p[1], lng: p[0] }, { lat: q[1], lng: q[0] }],
          clickable: false, zIndex: 2, strokeColor: sel ? '#ffffff' : lab.edge || (lab.hatch ? '#D4CF5A' : colour),
          strokeOpacity: sel ? 1 : lab.hatch || lab.edge ? (faded ? FADE : 1) : (lab.colour ? 1 : 0.15) * (faded ? FADE : 1), strokeWeight: sel ? 3 : 1.5 })));
      }
      group.forEach((part) => polysOf(part.geometry).forEach((poly0) => {
        // Its holes as holes (14 Nov): an area inside it is not painted over.
        const paths = poly0.filter((r) => r.length > 2).map((r) => r.map(([lng, lat]) => ({ lat, lng })));
        if (!paths.length) return;
        const path = paths[0];
        path.forEach((q) => { bounds.extend(q); sx += q.lng; sy += q.lat; k += 1; });
        // Still to be set (13 Nov, lab.hatch): Google Maps fills no pattern, so an accent outline (solid since 14 Nov) and a faint fill.
        // 14 Nov: its outline solid in the accent, no longer dashed.
        const poly = new g.Polygon({ map: m, paths, clickable: !!pick, fillColor: lab.hatch ? '#F1F5F9' : colour,
          fillOpacity: (lab.hatch ? 0.1 : lab.outline ? 0.06 : (lab.colour ? (lab.soil ? 0.3 : 0.55) : 0.15)) * (faded ? FADE : sel ? 0.5 : 1),
          // An area with nothing on it (12 Nov): its line as faint as its fill, not solid white.
          // 20 Nov: a selected area keeps its own edge; its white line is drawn inside it (below).
          // lab.edge (20 Nov): the area's line in that colour whatever its fill (an area with a cover set keeps its line).
          strokeColor: sel && joined ? '#ffffff' : lab.edge || (lab.hatch ? '#D4CF5A' : colour),
          strokeOpacity: joined && !lab.dashed ? 0 : sel ? 1 : lab.hatch || lab.edge ? (faded ? FADE : 1) : lab.dashed ? 0 : (lab.colour ? 1 : 0.15) * (faded ? FADE : 1),
          strokeWeight: 1.5, zIndex: sel ? 3 : 1 });
        if (sel && !joined) {
          paths.slice(0, 1).forEach(() => drawn.current.push(new g.Polyline({ map: m, clickable: false, zIndex: 4, strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 3,
            path: insetRing(poly0[0]).map(([lng, lat]) => ({ lat, lng })) })));
        }
        // lab.dashed (13 Nov, the members map): a property's outline as a dashed line.
        if (lab.dashed) {
          drawn.current.push(new g.Polyline({ map: m, path: [...path, path[0]], strokeOpacity: 0, clickable: false, zIndex: 2,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: faded ? FADE : 1, strokeColor: colour, strokeWeight: 2, scale: 3 }, offset: '0', repeat: '10px' }] }));
        }
        // Each part opens itself (the leave-out step: undo the join); tapRoot (the plan): the area it is part of.
        if (pick) poly.addListener('click', pick(labels[part.zone_id]?.tapRoot ? z.zone_id : part.zone_id));
        drawn.current.push(poly);
        // lab.stripe (18 Nov): a second crop on the area this season, drawn as stripes in its colour over the fill.
        if (lab.stripe) {
          stripes(poly0).forEach(([a, b]) => drawn.current.push(new g.Polyline({ map: m, path: [{ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] }],
            clickable: false, zIndex: 2, strokeColor: lab.stripe, strokeOpacity: faded ? FADE : 0.9, strokeWeight: 3 })));
        }
        // lab.cross (19 Nov): a bio manure before the crop this season, single lines in its colour.
        if (lab.cross) {
          stripes(poly0, 0, -1, MANURE_STEP).forEach(([a, b]) => drawn.current.push(new g.Polyline({ map: m, path: [{ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] }],
            clickable: false, zIndex: 2, strokeColor: lab.cross, strokeOpacity: faded ? FADE : 0.9, strokeWeight: 2 })));
        }
      }));
      if (k && !lab.hide && !chipsOff && g.marker?.AdvancedMarkerElement) {   // hide: a shape with no chip (a member's further fields)
        const mk = new g.marker.AdvancedMarkerElement({ map: m, position: { lat: sy / k, lng: sx / k }, gmpClickable: !!pick,
          title: lab.text, content: chip(lab, sel, faded, !!pick) });
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
    const focused = !pickedArea && focus?.length ? areasOf(record).filter((z) => focus.includes(z.zone_id)) : [];
    if (pickedArea || focused.length) {
      const b = new g.LatLngBounds();
      (pickedArea ? [pickedArea] : focused).forEach((a) => ringsOf(a.geometry).forEach((ring) => ring.forEach(([lng, lat]) => b.extend({ lat, lng }))));
      if (!b.isEmpty()) target = b;
    }
    // Which land, not only which report (13 Nov): a record without a report hash gave every land the same key, so the
    // map stayed on a member's land (G2) when the leader's crop plan opened.
    const fitKey = `${record?.land_id ?? ''}:${record?.report_hash_bytes32 || record?.report_hash || ''}:${fitBottom || ''}:${selected || ''}:${(focus || []).join('+')}`;
    if (!target.isEmpty() && fitted.current !== fitKey) {
      fitted.current = fitKey;
      // Her areas sit in the part above the card (the card covers the lower part of the screen).
      const full = height === '100%';
      m.fitBounds(target, full ? { top: 80, left: fitSide, right: fitSide, bottom: fitBottom ?? Math.round(window.innerHeight * 0.6) } : 16);
    }
  };
  useEffect(draw, [record, labels, selected, focus, onSelect, height, fitBottom, center, chipsOff]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { drawn.current.forEach((x) => { if (x.setMap) x.setMap(null); else x.map = null; }); }, []);
  return (
    <div style={{ height, width: '100%', background: '#25361f' }} aria-label="Map of your areas">
      <GoogleMap mapContainerStyle={{ height: '100%', width: '100%' }} options={G_OPTIONS}
        onLoad={(m) => { map.current = m; m.setZoom(17); m.setCenter({ lat: 11.8872, lng: 78.9659 }); draw(); }} onUnmount={() => { map.current = null; }} />
    </div>
  );
}

function LeafletAreaMap({ record, labels = {}, height = 220, selected = null, focus = null, onSelect, fitBottom, center, chipsOff = false }) {
  const box = useRef();
  const ready = useLeaflet();
  useEffect(() => {
    if (!ready || !window.L || !box.current || (!record && !center)) return undefined;
    const L = window.L;
    const map = L.map(box.current, { zoomControl: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' }).addTo(map);
    if (!record) { map.setView([center.lat, center.lng], 14); return () => map.remove(); }
    const areas = areasOf(record);
    const group = L.featureGroup().addTo(map);
    const focused = [];
    // 20 Nov: joined areas as one shape, as on the Google map: no line between the parts, one outline around them.
    const groupOf = (r) => areas.filter((y) => y.geometry && joinRoot(labels, y.zone_id) === r);
    const outlined = new Set();
    areas.forEach((z, i) => {
      if (!z.geometry) return;
      const root = joinRoot(labels, z.zone_id);   // 14 Nov: an added area in its neighbour's style, no label of its own
      const joined = groupOf(root).length > 1;
      const own = labels[z.zone_id] && !labels[z.zone_id].join ? labels[z.zone_id] : { text: z.name || `Area ${i + 1}` };
      if (own.gone) return;   // an area she left out of the plan (5 Nov): not drawn, not tappable
      let lab = root === z.zone_id ? own : { ...(labels[root] || {}), hide: true };
      const tapTo = root !== z.zone_id && labels[z.zone_id]?.tapRoot ? root : z.zone_id;
      const faded = selected ? selected !== z.zone_id && joinRoot(labels, selected) !== root
        : !!focus?.length && !focus.includes(z.zone_id) && !focus.some((f) => joinRoot(labels, f) === root);
      const FADE = !selected && focus?.length ? 0.06 : 0.3;   // 17 Nov: as the Google map
      // 18 Nov: a focused area with nothing on it in the season shown (or no labels at all, the take-up screen) is
      // filled in the accent, so a tap or the crop agreement's areas show at once against the faded others.
      if (!selected && focus?.length && !faded && (!lab.colour || lab.outline)) lab = { ...lab, colour: lab.colour || '#D4CF5A', outline: false };
      const sel = (!!selected && !faded) || !!lab.sel;   // a focus (17 Nov) only fades the others, no white line   // 14 Nov: the picked area, a white line and a lighter fill (17 Nov: lab.sel, several)
      const colour = lab.colour || '#ffffff';
      // An area still to be set (13 Nov): hatched, so she sees at once which areas are left (lab.hatch).
      if (lab.hatch) hatchPattern();
      const layer = L.geoJSON(z.geometry, { style: lab.hatch
        ? { color: '#F1F5F9', weight: 2, opacity: faded ? FADE : 1, fillColor: 'url(#nila-hatch)', fillOpacity: faded ? FADE : 1 }
        : { color: lab.edge || colour, weight: 1.5, ...(lab.dashed && !sel ? { dashArray: '6 4', weight: 2 } : {}), opacity: sel || lab.edge ? (faded ? FADE : 1) : (lab.colour ? 1 : 0.15) * (faded ? FADE : 1), fillColor: colour, fillOpacity: (lab.outline ? 0.06 : lab.colour ? (lab.soil ? 0.3 : 0.55) : 0.15) * (faded ? FADE : sel ? 0.5 : 1) } });
      // A joined group whatever its fill (a hatched one still to set too): its parts without their own line.
      if (joined && !lab.dashed) layer.setStyle({ opacity: 0 });
      layer.addTo(group);
      if (joined && !lab.dashed && !outlined.has(root)) {
        outlined.add(root);
        const line = sel ? { color: '#ffffff', weight: 3, opacity: 1 } : lab.edge ? { color: lab.edge, weight: 1.5, opacity: faded ? FADE : 1 }
          : lab.hatch ? { color: '#F1F5F9', weight: 2, opacity: faded ? FADE : 1 }
          : { color: colour, weight: 1.5, opacity: (lab.colour ? 1 : 0.15) * (faded ? FADE : 1) };
        outlineOf(groupOf(root).flatMap((y) => polysOf(y.geometry).flat())).forEach(([p, q]) => L.polyline([[p[1], p[0]], [q[1], q[0]]],
          { ...line, interactive: false }).addTo(group));
      }
      // 20 Nov: a selected area's white line inside its own edge (as on the Google map); a joined group's is its outline.
      if (sel && !lab.hatch && !joined) polysOf(z.geometry).forEach((poly0) => L.polyline(insetRing(poly0[0]).map(([lng, lat]) => [lat, lng]),
        { color: '#ffffff', weight: 3, opacity: 1, interactive: false }).addTo(group));
      // 19 Nov: the lines go in the areas' group, not straight on the map: added to the map before it has a view, a
      // line made Leaflet's renderer before the group's polygons drew, and they crashed ("reading 'min'").
      if (lab.stripe) {   // 18 Nov: as on the Google map, the second crop's colour as stripes
        polysOf(z.geometry).forEach((poly0) => stripes(poly0).forEach(([a, b]) => L.polyline([[a[1], a[0]], [b[1], b[0]]],
          { color: lab.stripe, weight: 3, opacity: faded ? FADE : 0.9, interactive: false }).addTo(group)));
      }
      if (lab.cross) {    // 19 Nov: a bio manure, single lines in its colour
        polysOf(z.geometry).forEach((poly0) => stripes(poly0, 0, -1, MANURE_STEP).forEach(([a, b]) => L.polyline([[a[1], a[0]], [b[1], b[0]]],
          { color: lab.cross, weight: 2, opacity: faded ? FADE : 0.9, interactive: false }).addTo(group)));
      }
      if (focus?.length && !faded) focused.push(layer);
      if (onSelect) layer.on('click', () => onSelect(selected === tapTo ? null : tapTo));
      if (!lab.hide && !chipsOff) layer.bindTooltip(labelEl(lab.text, lab.sub), { permanent: true, direction: 'center', className: 'nila-area-label' });
    });
    const out = record?.meta?.geometry?.out;
    if (out) L.geoJSON(out, { interactive: false, style: { color: '#F1F5F9', weight: 1.5, dashArray: '6 4', fill: false } }).addTo(map);
    // 17 Nov: focused areas (a tapped tile or areas tapped on the map): the map zooms to them, above the half-open card.
    if (focused.length) map.fitBounds(L.featureGroup(focused).getBounds(), { paddingTopLeft: [24, 80], paddingBottomRight: [24, fitBottom ?? Math.round(window.innerHeight * 0.55)] });
    else if (group.getLayers().length) map.fitBounds(group.getBounds(), { padding: [16, 16] });
    return () => map.remove();
  }, [ready, record, labels, selected, focus, onSelect, fitBottom, center, chipsOff]);
  return (
    <>
      <style>{`.nila-area-label{background:${C.ink};color:${C.text};border:0;border-radius:9999px;padding:2px 8px;font:700 11px Inter,system-ui,sans-serif;box-shadow:none;text-align:center}.nila-area-label:before{display:none}`}</style>
      <div ref={box} style={{ height, width: '100%', background: '#25361f' }} aria-label="Map of your areas" />
    </>
  );
}
