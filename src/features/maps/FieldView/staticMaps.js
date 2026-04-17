import { useState,useCallback, useEffect, memo } from 'react'
import { GoogleMap, useJsApiLoader, Polygon } from '@react-google-maps/api';
import { useNavContext } from '../../../utils/NavigationContext';
import { cropColor } from '../../../utils/cropColors.js';

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
  const { cardIx }                          = useNavContext()
  const features                            = fieldActivity?.geojson?.features || fieldActivity?.features || []
  const dominant                            = fieldActivity?.dominant
  const featureIds                          = cardIx !== null ? dominant?.[cardIx]?.geometry_indices : Array.from({length: features.length}, (_, i) => i)

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
  // ------------------ outline -------------------------
 useEffect(() => {
  if (!metadata?.outline || !map || fieldActivity?.portfolioMode) return;

  const outline = metadata.outline;

  const polygons = [];
  
  outline.forEach((poly) => {
    const latLngs = [];
    const polyBounds = new window.google.maps.LatLngBounds();
    poly.forEach((point) => {
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      const latLng = new window.google.maps.LatLng(lat, lng);
      latLngs.push({ lat, lng });
      polyBounds.extend(latLng);
    });
    if (latLngs.length) polygons.push({ latLngs, bounds: polyBounds });
  })
  
  // Build global bounds
  const globalBounds = new window.google.maps.LatLngBounds();
  polygons.forEach(({ bounds }) => globalBounds.union(bounds));

  setOutline(polygons);
  map.fitBounds(globalBounds, 20);
  // shift center upward so polygon isn't hidden behind the bottom card
  const listener = window.google.maps.event.addListenerOnce(map, 'idle', () => {
    const center = map.getCenter();
    const bounds = map.getBounds();
    const latSpan = bounds.toSpan().lat();
    // nudge center up by ~25% of visible lat span
    map.panTo({ lat: center.lat() - latSpan * 0.2, lng: center.lng() });
  });
  return () => window.google.maps.event.removeListener(listener);
}, [map, metadata]);

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
        const emoji = status === 'ACTIVE_GOOD' ? '✅' : '⚠️';
        const el = document.createElement('div');
        el.style.fontSize = '20px';
        el.style.lineHeight = '1';
        el.textContent = emoji;
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: centroidOf(f),
          content: el,
        });
        return marker;
      });
    return () => markers.forEach(m => { m.map = null; });
  }, [map, features]);

  // ------------------ info labels (dormant / historical) -------------------------
  useEffect(() => {
    if (!map) return;
    const markers = [];
    const labelStyle = 'background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);color:white;padding:8px 14px;border-radius:12px;font-size:11px;line-height:1.6;white-space:nowrap;';

    const fmtDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    };

    if (fieldActivity?.dormant && !fieldActivity?.historical && outline.length) {
      // Current state: fallow / dormant — single label at outline centroid
      const poly = outline[0];
      const center = poly.latLngs.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
        { lat: 0, lng: 0 }
      );
      center.lat /= poly.latLngs.length;
      center.lng /= poly.latLngs.length;

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

      markers.push(new window.google.maps.marker.AdvancedMarkerElement({
        map, position: center, content: el,
      }));

    } else if (fieldActivity?.activeCycle?.length > 0 && features.length) {
      // Active crop: label per cluster with health + stage
      const ac = fieldActivity.activeCycle[0];
      const healthIcon = ac.health === 'stressed' ? '⚠️' : ac.health === 'poor' ? '🔴' : '✅';
      const eos = ac.predicted_eos;
      const daysToHarvest = eos?.[0] ? Math.round((new Date(eos[0]) - new Date()) / 86400000) : null;

      features.forEach(f => {
        const p = f.properties || {};
        if (p.cluster_id === 0 || p.activity === 'border_area') return;

        const el = document.createElement('div');
        el.style.cssText = labelStyle;
        el.innerHTML = [
          `${healthIcon} <b>${ac.crop_type}</b> · ${ac.stage}`,
          daysToHarvest != null && daysToHarvest > 0 ? `Harvest: ${daysToHarvest}d` : '',
          ac.expected_yield_kg_acre ? `${ac.expected_yield_kg_acre} kg/acre` : '',
        ].filter(Boolean).join('<br>');

        markers.push(new window.google.maps.marker.AdvancedMarkerElement({
          map, position: centroidOf(f), content: el,
        }));
      });

    } else if (fieldActivity?.historical && features.length) {
      // Historical state: one label per cluster at its centroid
      const cycle = fieldActivity.historicalCycle || {};
      features.forEach(f => {
        const p = f.properties || {};
        if (p.cluster_id === 0 || p.activity === 'border_area') return;

        const el = document.createElement('div');
        el.style.cssText = labelStyle;
        el.innerHTML = [
          `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.class_color || '#888'};margin-right:6px;vertical-align:middle;"></span><b>${cycle.crop_type || p.class || '?'}</b>`,
          cycle.sos ? `${fmtDate(cycle.sos)} → ${fmtDate(cycle.eos)}` : '',
          p.area_m2 ? `${Number(p.area_m2).toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²` : '',
          cycle.peak_ndvi ? `Peak NDVI: ${cycle.peak_ndvi.toFixed(2)}` : '',
        ].filter(Boolean).join('<br>');

        markers.push(new window.google.maps.marker.AdvancedMarkerElement({
          map, position: centroidOf(f), content: el,
        }));
      });
    }

    return () => markers.forEach(m => { m.map = null; });
  }, [map, fieldActivity?.dormant, fieldActivity?.activeCycle, fieldActivity?.historical, fieldActivity?.historicalCycle, features, outline]);

  return isLoaded ? (
      <GoogleMap
        mapContainerStyle={containerStyle}
        onLoad={onLoad}
        options={options}
        onUnmount={onUnmount}
      >
        {/* Outline — dormant color when fallow, white when active */}
        { metadata?.outline  && outline.map((poly, i) => (
          <Polygon
            key={i}
            paths={poly.latLngs}
            options={{
              fillColor: (fieldActivity?.dormant && !fieldActivity?.historical) ? fieldActivity.dormantColor : "rgba(255, 255, 255, 0.4)",
              fillOpacity: (fieldActivity?.dormant && !fieldActivity?.historical) ? 0.5 : 0.4,
              strokeColor: (fieldActivity?.dormant && !fieldActivity?.historical) ? "#5C4A1E" : "#333333",
              strokeOpacity: 0.8,
              strokeWeight: (fieldActivity?.dormant && !fieldActivity?.historical) ? 1.5 : 0.5,
              clickable: false,
              zIndex: 1,
            }}
          />
        ))}
        // ------------------ Dominant features -------------------------
        {/* Activity / Select mode */}
        {features && features.filter((_f, i) => featureIds.includes(i)).flatMap((f, i) => {
          const isBorderArea = f.properties?.activity === 'border_area' || f.properties?.cluster_id === 0;
          const isSelectMode = fieldActivity?.selectMode;
          const isSelected = f.properties?.selected;

          let fillColor, fillOpacity, strokeWeight;
          if (isSelectMode) {
            // Select mode: outline only, fill on select
            fillColor = isSelected ? '#16a34a' : 'transparent';
            fillOpacity = isSelected ? 0.45 : 0;
            strokeWeight = 1.5;
          } else {
            const yieldIndex = Number(f.properties?.yield_index ?? f.properties?.yield_kg_per_acre ?? NaN);
            fillColor = isBorderArea ? '#c0c0c0' : cropColor(f.properties?.crop_type);
            fillOpacity = isBorderArea
              ? 0.3
              : Number.isFinite(yieldIndex) && yieldIndex > 0
                ? Math.min(0.95, 0.25 + yieldIndex * 0.7)
                : 0.55;
            strokeWeight = 0.5;
          }

          const polygons = f.geometry.type === 'MultiPolygon'
            ? f.geometry.coordinates.map(poly => poly[0].map(([lng, lat]) => ({ lat, lng })))
            : [f.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }))];
          return polygons.map((paths, j) => (
          <Polygon
            key={`${i}-${j}`}
            paths={paths}
            options={{
              fillColor,
              fillOpacity,
              strokeColor: isSelectMode ? (isSelected ? '#16a34a' : '#ffffff') : "#333333",
              strokeOpacity: isSelectMode ? 1 : 0.8,
              strokeWeight,
              clickable: isSelectMode || (!!onFeatureClick && !isBorderArea),
            }}
            onClick={() => {
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
              fillColor: "rgba(255, 255, 255, 0.1)",
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
