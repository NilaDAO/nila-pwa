import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { GoogleMap, useJsApiLoader, Polygon } from '@react-google-maps/api';
import { useNavContext, useDataContext } from '../../../utils/NavigationContext';
import { cropColor, normalizeCropType } from '../../../utils/cropColors.js';
import { CROP_CODE_NAMES } from '../../../hooks/useFoodTokenBatches.ts';

const containerStyle = {
  position: 'absolute',  
  zIndex: 0,
  width: window.screen.width,
  height: window.innerHeight
};

const GOOGLE_MAP_LIBRARIES = ['maps','marker']
const GOOGLE_MAP_ID = '8fa18e8fd7e4c318'

const options = {
    mapId: GOOGLE_MAP_ID,
    mapTypeId: 'satellite',
    streetViewControl: false, // disables the Street View Pegman control
    fullscreenControl: false, // disables the fullscreen control
    zoomControl: false,       // disables the zoom control
    mapTypeControl: false,    // disables the map type control
    rotateControl: false,
    gestureHandling:'greedy',
    scrollwheel: true,
    draggable: true,
    zoom: 21,
    tilt:0,
    };

// AdvancedMarkerElement requires mapId with Advanced Markers enabled in Google Cloud Console.
// Use this wrapper — falls back to a no-op if the capability isn't available.
function addMarkerLabel(map, position, el) {
  if (!map?.mapCapabilities?.isAdvancedMarkersAvailable) return null;
  try {
    return new window.google.maps.marker.AdvancedMarkerElement({ map, position, content: el });
  } catch (e) {
    console.warn('[map] AdvancedMarkerElement failed:', e.message);
    return null;
  }
}

const centroidOf = (feature) => {
  const coords = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates.flat(2)
    : feature.geometry.coordinates[0];
  const sum = coords.reduce((acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
};

function StaticMaps({metadata,fieldActivity,onFeatureClick}) {
  const [map, setMap]                       = useState(null)
  const [selectFeatures]                    = useState(false)
  const [outline, setOutline]               = useState([])
  const [portfolioOutlines, setPortfolioOutlines] = useState([])
  const [portfolioPrevOutlines, setPortfolioPrevOutlines] = useState([])
  const portfolioMarkersRef                 = useRef([])
  const portfolioBoundsRef                  = useRef(null)
  const preZoneViewRef                      = useRef(null) // { zoom, center } saved before zone-click fit
  const { cardIx }                          = useNavContext()
  const { setFieldActivity, tokenData }     = useDataContext()

  // Food token priority: user self-attested a crop; unconfirmed until oracle matches it
  const ft            = (tokenData ?? []).find(t => t.type === 'ERC1155' && (t.bal ?? 0) > 0)
  const ftCropName    = ft ? (CROP_CODE_NAMES[ft.cropCode] ?? null) : null
  const ftCropColor   = ftCropName ? cropColor(ftCropName) : null
  const satelliteCrop = fieldActivity?.activeCycle?.[0]?.crop_type?.toLowerCase() ?? null
  const ftConfirmed   = !!(ftCropName && satelliteCrop && ftCropName.toLowerCase() === satelliteCrop)
  const ftUnconfirmed = !!(ftCropName && !ftConfirmed)
  const features                            = fieldActivity?.geojson?.features || fieldActivity?.features || []
  const dominant                            = fieldActivity?.dominant
  const featureIds                          = cardIx !== null ? (dominant?.[cardIx]?.geometry_indices ?? Array.from({length: features.length}, (_, i) => i)) : Array.from({length: features.length}, (_, i) => i)

  const { isLoaded } = useJsApiLoader({
    id: 'script-loader',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS,
    libraries: GOOGLE_MAP_LIBRARIES,
    version: 'weekly',
    mapIds: [GOOGLE_MAP_ID]
  })

  const onLoad = useCallback((map) => setMap(map), []);
  const onUnmount = useCallback(() => setMap(null), []);

  // ------------------ ACTIVITY LAYER -------------------------
  /*
  useEffect(() => {
      if (!map || !fieldActivity?.geojson?.features?.length) return
      const bounds = new window.google.maps.LatLngBounds()
      // only print dominant layers
      // use all layers only has outline? 
      
      fieldActivity.geojson.features.forEach(f => {
        const coords = f.geometry.coordinates
        // handle both Polygon and MultiPolygon
        const rings = f.geometry.type === 'MultiPolygon' ? coords.flat(2): coords[0]
        rings.forEach(([lng, lat]) =>
          bounds.extend(new window.google.maps.LatLng(lat, lng))
        )
      })
      map.fitBounds(bounds)
      setCardView('mapview')
  }, [map, fieldActivity, setCardView])
  */
  // ------------------ outline polygons (no fit) -------------------------
  // Build the parcel-outline shapes once per metadata change. Map fitting
  // happens in the consolidated fit-effect below.
 useEffect(() => {
  if (!metadata?.outline || !map || fieldActivity?.portfolioMode) return;
  const polygons = [];
  metadata.outline.forEach((poly) => {
    const latLngs = [];
    poly.forEach((point) => {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) latLngs.push({ lat, lng });
    });
    if (latLngs.length) polygons.push({ latLngs });
  });
  setOutline(polygons);
}, [map, metadata, fieldActivity?.portfolioMode]);

  // ------------------ map fit (single source of truth) -------------------------
  // Cases handled:
  //   1. Initial open / metadata change → fit to parcel outline.
  //   2. Zone clicked (viewmode=true)  → save pre-zone view, fit to filtered features.
  //   3. X button after zone click     → restore saved pre-zone view (no fitBounds bounce).
  //   4. X button / mapRefitNonce with no saved view → fit to parcel outline.
  // Cycle navigation (features change without viewmode) does not refit — the
  // user stays oriented on the parcel while flipping through seasons.
  useEffect(() => {
    if (!map || fieldActivity?.portfolioMode) return;

    const wantFeatureFit = fieldActivity?.viewmode && features.length > 0;

    if (wantFeatureFit) {
      // Save current view before zooming into zone so we can restore it on X
      preZoneViewRef.current = { zoom: map.getZoom(), center: map.getCenter()?.toJSON() };

      const target = new window.google.maps.LatLngBounds();
      for (const f of features) {
        const coords = f.geometry?.coordinates;
        if (!coords) continue;
        const rings = f.geometry.type === 'MultiPolygon'
          ? coords.flatMap(p => p)
          : coords;
        for (const ring of rings) {
          for (const pt of ring) {
            if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
              target.extend(new window.google.maps.LatLng(pt[1], pt[0]));
            }
          }
        }
      }
      if (target.isEmpty()) return;
      map.fitBounds(target, 20);
      const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
        const z = map.getZoom();
        map.setZoom(Math.min(20, (z ?? 17) + 1));
        const center = map.getCenter();
        const span = map.getBounds()?.toSpan();
        if (span) map.panTo({ lat: center.lat() - span.lat() * 0.2, lng: center.lng() });
      });
      return () => window.google.maps.event.removeListener(listener);

    } else if (preZoneViewRef.current) {
      // Returning from zone click — restore saved view directly, no fitBounds dance
      const saved = preZoneViewRef.current;
      preZoneViewRef.current = null;
      map.setZoom(saved.zoom);
      map.panTo(saved.center);

    } else {
      // Initial open (metadata change) or explicit refit (mapRefitNonce)
      if (!metadata?.outline) return;
      const target = new window.google.maps.LatLngBounds();
      for (const poly of metadata.outline) {
        for (const p of poly) {
          const lat = Number(p.lat), lng = Number(p.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            target.extend(new window.google.maps.LatLng(lat, lng));
          }
        }
      }
      if (target.isEmpty()) return;
      map.fitBounds(target, 20);
      const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
        // One zoom bump (fitBounds is conservative on small parcels), then a
        // small vertical pan so the polygon isn't hidden behind the bottom card.
        const z = map.getZoom();
        map.setZoom(Math.min(20, (z ?? 17) + 1));
        const center = map.getCenter();
        const span = map.getBounds()?.toSpan();
        if (span) map.panTo({ lat: center.lat() - span.lat() * 0.2, lng: center.lng() });
      });
      return () => window.google.maps.event.removeListener(listener);
    }
    // Re-fit only on the three transitions that should reposition the map:
    // open/metadata change, zone click (selectedZoneId), and X click
    // (mapRefitNonce). Feature changes from cycle navigation are intentionally
    // excluded so the user's view doesn't jump while flipping seasons.
  }, [map, metadata, fieldActivity?.viewmode, fieldActivity?.selectedZoneId, fieldActivity?.mapRefitNonce, fieldActivity?.portfolioMode]);

  // ------------------ one field-name label per field -------------------------
  // Group zones by which field (metadata.fields) contains their centroid, then
  // drop ONE label per field at the area-weighted average of the contained
  // zones' centroids.
  useEffect(() => {
    if (!map || !features.length) return;
    const fields = metadata?.fields;
    if (!Array.isArray(fields) || fields.length === 0) return;

    // ray-cast point-in-polygon, ring = [{lat, lng}, ...]
    const inRing = (pt, ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].lng, yi = ring[i].lat;
        const xj = ring[j].lng, yj = ring[j].lat;
        const hit = ((yi > pt.lat) !== (yj > pt.lat))
          && (pt.lng < (xj - xi) * (pt.lat - yi) / (yj - yi + 1e-12) + xi);
        if (hit) inside = !inside;
      }
      return inside;
    };
    const fieldIxAt = (pt) => {
      for (let i = 0; i < fields.length; i++) {
        const ring = fields[i]?.coordinates;
        if (Array.isArray(ring) && ring.length >= 3 && inRing(pt, ring)) return i;
      }
      return -1;
    };

    // Accumulate centroids per field, weighted by zone area_m2. Only active
    // zones contribute — grey/unknown zones don't drive field labels.
    const acc = new Map();  // field idx → { sumLat, sumLng, sumW }
    for (const f of features) {
      const p = f.properties || {};
      if (p.activity !== 'active') continue;
      if (p.cluster_id === 0) continue;
      const c = centroidOf(f);
      if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lng)) continue;
      const fx = fieldIxAt(c);
      if (fx < 0) continue;
      const w = Number(p.area_m2) > 0 ? Number(p.area_m2) : 1;
      const cur = acc.get(fx) || { sumLat: 0, sumLng: 0, sumW: 0 };
      cur.sumLat += c.lat * w;
      cur.sumLng += c.lng * w;
      cur.sumW += w;
      acc.set(fx, cur);
    }

    const markers = [];
    for (const [fx, v] of acc) {
      if (v.sumW <= 0) continue;
      const center = { lat: v.sumLat / v.sumW, lng: v.sumLng / v.sumW };
      const name = fields[fx]?.name;
      if (!name) continue;
      const el = document.createElement('div');
      el.style.cssText = 'background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);color:white;padding:3px 7px;border-radius:6px;font-size:10px;font-weight:600;white-space:nowrap;pointer-events:none;';
      el.textContent = name;
      const m = addMarkerLabel(map, center, el);
      if (m) markers.push(m);
    }
    return () => markers.forEach(m => { if (m) m.map = null; });
  }, [map, features, metadata]);

  // ------------------ signal markers -------------------------
  useEffect(() => {
    if (!map || !features.length) return;
    const markers = features
      .filter(f => {
        const status = f.properties?.signals?.status;
        return status === 'ACTIVE_GOOD' || status === 'POSSIBLE_STRESS';
      })
      .map(f => {
        const status = f.properties?.signals?.status;
        const dotColor = status === 'ACTIVE_GOOD' ? '#16a34a' : '#f59e0b';
        const crop = normalizeCropType(f.properties?.crop_type);
        const iconUrl = crop ? `/images/crop_icons/${crop}.svg` : null;
        const el = document.createElement('div');
        el.style.cssText = 'position:relative;width:28px;height:28px;';
        if (iconUrl) {
          const img = document.createElement('img');
          img.src = iconUrl;
          img.style.cssText = 'width:24px;height:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));';
          el.appendChild(img);
        }
        const dot = document.createElement('span');
        dot.style.cssText = `position:absolute;bottom:0;right:0;width:9px;height:9px;border-radius:50%;background:${dotColor};border:1.5px solid #fff;`;
        el.appendChild(dot);
        return addMarkerLabel(map, centroidOf(f), el);
      });
    return () => markers.forEach(m => { if (m) m.map = null; });
  }, [map, features]);

  // ------------------ info labels (dormant / historical) -------------------------
  useEffect(() => {
    if (!map) return;
    const markers = [];
    const labelStyle = 'background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);color:white;padding:8px 14px;border-radius:12px;font-size:11px;line-height:1.6;white-space:nowrap;';

    if (ftUnconfirmed && ftCropName && outline.length) {
      // Food token declared but oracle hasn't confirmed — show crop name only, no monitoring info
      const poly = outline[0];
      if (!poly?.latLngs?.length) return;
      const center = poly.latLngs.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
        { lat: 0, lng: 0 }
      );
      center.lat /= poly.latLngs.length;
      center.lng /= poly.latLngs.length;
      if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
      const el = document.createElement('div');
      el.style.cssText = labelStyle;
      el.innerHTML = `<span class="animate-pulse" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ftCropColor};margin-right:6px;vertical-align:middle;"></span><b>${ftCropName}</b><br><span style="font-size:9px;color:rgba(255,255,255,0.6);">Oracle is confirming your claim</span>`;
      markers.push(addMarkerLabel(map, center, el));

    } else if (fieldActivity?.dormant && !fieldActivity?.historical && outline.length) {
      // Current state: fallow / dormant — single label at outline centroid
      const poly = outline[0];
      if (!poly?.latLngs?.length) return;
      const center = poly.latLngs.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
        { lat: 0, lng: 0 }
      );
      center.lat /= poly.latLngs.length;
      center.lng /= poly.latLngs.length;
      if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;

      const d = fieldActivity.dormantStatus || {};
      const el = document.createElement('div');
      el.style.cssText = labelStyle;
      el.innerHTML = [
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${fieldActivity.dormantColor || '#8B6914'};margin-right:6px;vertical-align:middle;"></span><b>Fallow</b>`,
        d.surface ? `Surface: ${d.surface}` : '',
        d.moisture ? `Soil: ${d.moisture}` : '',
        d.ploughed || '',
        d.daysSinceCrop != null ? `Last crop: ${d.daysSinceCrop}d ago` : '',
      ].filter(Boolean).join('<br>');

      markers.push(addMarkerLabel(map, center, el));

    }

    return () => markers.forEach(m => { if (m) m.map = null; });
  }, [map, fieldActivity?.dormant, fieldActivity?.activeCycle, fieldActivity?.historical, fieldActivity?.historicalCycle, features, outline, ftUnconfirmed, ftCropName, ftCropColor]);

  // ------------------ portfolio outlines + labels -------------------------
  useEffect(() => {
    if (!map || !fieldActivity?.portfolioMode || !fieldActivity?.portfolioProperties) {
      // Clean up if leaving portfolio mode
      if (portfolioOutlines.length) setPortfolioOutlines([]);
      if (portfolioPrevOutlines.length) setPortfolioPrevOutlines([]);
      portfolioMarkersRef.current.forEach(m => { m.map = null; });
      portfolioMarkersRef.current = [];
      portfolioBoundsRef.current = null;
      return;
    }

    const props = fieldActivity.portfolioProperties;
    const bounds = new window.google.maps.LatLngBounds();
    const polys = [];
    const labelStyle = 'background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);color:white;padding:6px 10px;border-radius:10px;font-size:10px;line-height:1.5;white-space:nowrap;cursor:pointer;';
    const markers = [];

    for (const [lid, meta] of Object.entries(props)) {
      if (!meta.outline?.length) continue;

      // Build outline polygons (colours applied in render via portfolioSelected)
      for (const ring of meta.outline) {
        const latLngs = ring.map(([lat, lng]) => ({ lat, lng }));
        latLngs.forEach(p => bounds.extend(p));
        polys.push({ latLngs, lid });
      }

      // Label at centroid — clickable
      if (meta.centroid) {
        const pos = { lat: meta.centroid[0], lng: meta.centroid[1] };
        bounds.extend(pos);

        const el = document.createElement('div');
        el.style.cssText = labelStyle;
        el.innerHTML = `<b>${meta.farm}</b>`;
        el.addEventListener('click', () =>
          setFieldActivity(prev => prev ? { ...prev, portfolioSelected: lid } : prev)
        );

        markers.push(addMarkerLabel(map, pos, el));
      }
    }

    setPortfolioOutlines(polys);
    portfolioBoundsRef.current = bounds;

    // Clean up previous markers, store new ones
    portfolioMarkersRef.current.forEach(m => { if (m) m.map = null; });
    portfolioMarkersRef.current = markers;

    return () => markers.forEach(m => { m.map = null; });
  }, [map, fieldActivity?.portfolioMode, fieldActivity?.portfolioProperties, setFieldActivity]);

  // ------------------ portfolio: center on selected / re-fit all -------------------------
  useEffect(() => {
    if (!map || !fieldActivity?.portfolioMode) return;
    const selected = fieldActivity?.portfolioSelected;
    const props = fieldActivity?.portfolioProperties;

    if (selected && props?.[selected]) {
      // Fit to the selected property
      const meta = props[selected];
      const bounds = new window.google.maps.LatLngBounds();
      (meta.outline || []).forEach(ring => ring.forEach(([lat, lng]) => bounds.extend({ lat, lng })));
      if (meta.centroid) bounds.extend({ lat: meta.centroid[0], lng: meta.centroid[1] });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 80);
        const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
          const center = map.getCenter();
          const span = map.getBounds()?.toSpan();
          if (span) map.panTo({ lat: center.lat() - span.lat() * 0.18, lng: center.lng() });
        });
        return () => window.google.maps.event.removeListener(listener);
      }
    } else if (portfolioBoundsRef.current && !portfolioBoundsRef.current.isEmpty()) {
      // No selection — fit to all properties
      map.fitBounds(portfolioBoundsRef.current, 40);
      const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
        const center = map.getCenter();
        const span = map.getBounds()?.toSpan();
        if (span) map.panTo({ lat: center.lat() - span.lat() * 0.15, lng: center.lng() });
      });
      return () => window.google.maps.event.removeListener(listener);
    }
  }, [map, fieldActivity?.portfolioMode, fieldActivity?.portfolioSelected, fieldActivity?.portfolioProperties]);

  // ------------------ portfolio: previous borrower outlines (grey, not clickable) ----------------
  useEffect(() => {
    if (!map || !fieldActivity?.portfolioMode || !fieldActivity?.portfolioPrevProperties) {
      if (portfolioPrevOutlines.length) setPortfolioPrevOutlines([]);
      return;
    }
    const polys = [];
    for (const [lid, meta] of Object.entries(fieldActivity.portfolioPrevProperties)) {
      if (!meta.outline?.length) continue;
      for (const ring of meta.outline) {
        const latLngs = ring.map(([lat, lng]) => ({ lat, lng }));
        polys.push({ latLngs, lid });
      }
    }
    setPortfolioPrevOutlines(polys);
  }, [map, fieldActivity?.portfolioMode, fieldActivity?.portfolioPrevProperties]);

  // ------------------ portfolio label visibility (no refit) ----------------
  useEffect(() => {
    if (!map || !portfolioMarkersRef.current.length) return;
    const show = fieldActivity?.portfolioLabels !== false;
    portfolioMarkersRef.current.forEach(m => { m.map = show ? map : null; });
  }, [map, fieldActivity?.portfolioLabels]);

  return isLoaded ? (
      <GoogleMap
        mapContainerStyle={containerStyle}
        onLoad={onLoad}
        options={options}
        onUnmount={onUnmount}
      >
        {/* Outline — dormant color when fallow, white when active. Hidden when zone features tile the parcel. */}
        { metadata?.outline && !features.length && outline.map((poly, i) => (
          <Polygon
            key={i}
            paths={poly.latLngs}
            options={{
              fillColor: ftUnconfirmed
                ? ftCropColor
                : (fieldActivity?.dormant && !fieldActivity?.historical) ? fieldActivity.dormantColor : "#9ca3af",
              fillOpacity: ftUnconfirmed ? 0.15
                : (fieldActivity?.dormant && !fieldActivity?.historical) ? 0.5 : 0.4,
              strokeColor: ftUnconfirmed
                ? ftCropColor
                : (fieldActivity?.dormant && !fieldActivity?.historical) ? "#5C4A1E" : "#9ca3af",
              strokeOpacity: 1,
              strokeWeight: 1,
              clickable: false,
              zIndex: 1,
            }}
          />
        ))}
        {/* Previous borrower outlines — grey, not clickable */}
        {portfolioPrevOutlines.map((poly, i) => (
          <Polygon
            key={`pfprev-${poly.lid}-${i}`}
            paths={poly.latLngs}
            options={{
              fillColor: 'rgba(156,163,175,0.12)',
              fillOpacity: 1,
              strokeColor: '#9CA3AF',
              strokeOpacity: 0.65,
              strokeWeight: 1,
              clickable: false,
              zIndex: 1,
            }}
          />
        ))}
        {/* Portfolio outlines — amber, clickable, highlight selected */}
        {portfolioOutlines.map((poly, i) => {
          const isSelected = String(fieldActivity?.portfolioSelected) === String(poly.lid);
          return (
            <Polygon
              key={`pf-${poly.lid}-${i}`}
              paths={poly.latLngs}
              onClick={() => setFieldActivity(prev => prev ? { ...prev, portfolioSelected: poly.lid } : prev)}
              options={{
                fillColor: isSelected ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.15)',
                fillOpacity: 1,
                strokeColor: isSelected ? '#D97706' : '#F59E0B',
                strokeOpacity: 0.95,
                strokeWeight: isSelected ? 2.5 : 1.5,
                clickable: true,
                zIndex: isSelected ? 4 : 2,
              }}
            />
          );
        })}
        // ------------------ Dominant features -------------------------
        {/* Activity / Select mode */}
        {features && features.filter((_f, i) => featureIds.includes(i)).flatMap((f, i) => {
          // Skip features with missing/empty geometry — upstream filters may
          // strip whole zones (e.g. sub-threshold noise) and leave bare metadata.
          const gtype = f?.geometry?.type;
          if (!gtype || !f.geometry.coordinates?.length) return [];
          const isBorderArea = f.properties?.activity === 'border_area' || f.properties?.cluster_id === 0;
          const isSelectMode = fieldActivity?.selectMode;
          const isSelected = f.properties?.selected;
          // Backdrop = the subdivided parent zone rendered under its subzones
          // to fill any rendering gaps between adjacent partition polygons.
          // Skipped in select mode entirely.
          const isBackdrop = f.properties?.backdrop === true;
          if (isBackdrop && isSelectMode) return [];

          let fillColor, fillOpacity, strokeWeight;
          if (isSelectMode) {
            // Select mode: outline only, fill on select
            fillColor = isSelected ? '#16a34a' : 'transparent';
            fillOpacity = isSelected ? 0.45 : 0;
            strokeWeight = 1;
          } else {
            // Active = feature belongs to an open cycle (stamped activity='active' upstream).
            // Active zones get the crop color; inactive zones/subzones get grey shading
            // (subzones lighter than bare zones). Every zone carries a visible border.
            const yieldIndex = Number(f.properties?.yield_index ?? f.properties?.yield_kg_per_acre ?? NaN);
            const GREY_SHADES = ['#4a4a4a','#606060','#747474','#888888','#9c9c9c','#b0b0b0','#636363','#797979'];
            const isActive = f.properties?.activity === 'active';
            const zid = f.properties?.zone_id;
            const zIdx = typeof zid === 'number' ? zid : (String(zid).match(/(\d+)/)?.[1] ?? 0);
            if (isBorderArea) {
              fillColor = '#c0c0c0';
              fillOpacity = 0.3;
            } else if (isActive) {
              fillColor = cropColor(f.properties?.crop_type);
              fillOpacity = Number.isFinite(yieldIndex) && yieldIndex > 0
                ? Math.min(0.95, 0.25 + yieldIndex * 0.7)
                : 0.55;
            } else {
              fillColor = GREY_SHADES[Number(zIdx) % GREY_SHADES.length];
              fillOpacity = 0.7;
            }
            strokeWeight = isBorderArea ? 0.5 : 1;
          }

          const cropTypeStr = typeof f.properties?.crop_type === 'string' ? f.properties.crop_type : '';
          const isPlant = /plant/i.test(cropTypeStr);
          const isRatoon = /ratoon/i.test(cropTypeStr);
          const polygons = f.geometry.type === 'MultiPolygon'
            ? f.geometry.coordinates.map(poly => poly[0].map(([lng, lat]) => ({ lat, lng })))
            : [f.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }))];
          const isSubzone = !!f.properties?.subzone_of;
          return polygons.map((paths, j) => (
          <Polygon
            key={`${i}-${j}`}
            paths={paths}
            options={{
              fillColor,
              fillOpacity,
              // Subzones: stroke colour matches the fill so adjacent
              // partitions visually grow into the gap (~50/50 split). Plant
              // and ratoon borders still take priority so the subtype is
              // distinguishable.
              strokeColor: isSelectMode
                ? (isSelected ? '#16a34a' : '#ffffff')
                : isBorderArea ? '#c0c0c0'
                : isPlant ? '#000000'
                : isRatoon ? '#9ca3af'
                : isSubzone ? fillColor
                : '#ffffff',
              // Backdrop gets no stroke + sits below subzones; subzones
              // always show their (fill-matching) stroke so adjacent
              // partitions seal up.
              strokeOpacity: isBackdrop
                ? 0
                : isSelectMode ? 1
                : isBorderArea ? 0.5
                : (isPlant || isRatoon) ? 0.9
                : isSubzone ? 1
                : 0,
              strokeWeight: isSubzone && !isPlant && !isRatoon ? 2 : strokeWeight,
              clickable: !isBackdrop && (isSelectMode || (!!onFeatureClick && !isBorderArea)),
              zIndex: isBackdrop ? 1 : 2,
            }}
            onClick={() => {
              if (isBackdrop) return;
              if (isSelectMode) {
                onFeatureClick?.({ ...f, _toggle: true });
              } else if (!isBorderArea) {
                onFeatureClick?.(f);
              }
            }}
          />
          ));
        })}
        // ------------------ All Cluster features -------------------------
        {selectFeatures && features && features.map((f, i) => (
          <Polygon
            key={i}
            paths={f.geometry.coordinates.flatMap(poly => poly).map(([lng, lat]) => ({ lat, lng }))}
            options={{
              fillColor: "rgba(255, 255, 255, 0.3)",
              strokeColor: "#333333",
              strokeOpacity: 0.8,
              strokeWeight: 0.5,
            }}
          />
        ))}
      </GoogleMap>
  ) : <></>
}

export default memo(StaticMaps)
