import React, { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react'
import debounce from 'lodash.debounce';
import { useFieldRegContext } from '../../../utils/FieldRegContext'
import { rectangularize, sharpenCorners } from '../../../hooks/useRegFlow'
import { useDataContext } from "../../../utils/NavigationContext";
import { GoogleMap, useJsApiLoader, Polygon, InfoBox } from '@react-google-maps/api';

const GOOGLE_MAP_LIBRARIES = ['maps','marker']


const containerStyle = {
  position: 'absolute',  
  zIndex: 0,
  top:0, 
  left:0, 
  width:'100vw', 
  height:'100vh'
};

const hasOffsiteCookie = (remote) => {
  const cookieArray = document.cookie.split(';');
  if (remote || cookieArray.find(c => c.startsWith('offsite=1'))){
    console.log('offsite cookie found', remote, cookieArray);
    return offSite_options
  } else {
    return onSite_options
  }
}

const offSite_options = {
  mapTypeId: 'satellite',
  streetViewControl: false, // disables the Street View Pegman control
  fullscreenControl: false, // disables the fullscreen control
  zoomControl: true,       // disables the zoom control
  mapTypeControl: false,    // disables the map type control
  rotateControl: true,
  gestureHandling:'greedy',
  scrollwheel: true,
  draggable: true,
  zoom: 21,
  tilt:0,
  };

const onSite_options = {
    mapTypeId: 'satellite',
    streetViewControl: false, // disables the Street View Pegman control
    fullscreenControl: false, // disables the fullscreen control
    zoomControl: false,       // disables the zoom control
    mapTypeControl: false,    // disables the map type control
    rotateControl: false,
    scrollwheel: false,
    draggable: false,
    zoom: 21,
    tilt:0,
    };

function Maps({ onMapLoad, parentFlow }) {
  const [ newMap, setMap ]                                         = useState(null) // map instance
  const { fieldReg, updateFieldReg }                               = useFieldRegContext()
  const { db }                                                     = useDataContext()
  const { flow, polygons, approvedFields, positions, remote, alts, rectStrength, cornerStrength } = fieldReg
  const markersRef                                                 = useRef([]);
  const polylineRef                                                = useRef(null);
  const mapRef                                                     = useRef(null);
  const didInitialOverviewRef                                      = useRef(false);
  const map                                                        = mapRef.current


  const { isLoaded } = useJsApiLoader({ 
    id: 'script-loader',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS,
    libraries: GOOGLE_MAP_LIBRARIES,
    version: 'weekly',
    mapIds: ["8fa18e8fd7e4c318"]
  })

  const onLoad = useCallback(map => {
    setMap(map);
    map.setOptions({
      mapId: '8fa18e8fd7e4c318',  // Replace with your actual Map ID
    });
    mapRef.current = map;
    if (onMapLoad) onMapLoad(mapRef);
  }, []);

  const onUnmount = useCallback(() => setMap(null), []);

  const roughFieldCenterCalc = (points) => {
    const latitudes = points.map(point => point.lat);
    const longitudes = points.map(point => point.lng);

    const centerLat = latitudes.reduce((sum, lat) => sum + lat, 0) / latitudes.length;
    const centerLng = longitudes.reduce((sum, lng) => sum + lng, 0) / longitudes.length;

    return { lat: centerLat, lng: centerLng };
  }

  const handleMapMove = (map) => {
    const center = map.getCenter();
    const newLocation = {
      lat: center.lat(),
      lng: center.lng(),
      acc: 0,
      manual: false,
      date: Date.now()
    };
    console.log('new center', newLocation);
    if (typeof parentFlow === 'number' && parentFlow < 10){ // only add position if in Registration flow
      updateFieldReg(prev => ({ ...prev, panMode: false, positions: [...prev.positions, newLocation] }));
    }
    setMap(map);
  };

  /** ⏲debounce wrapper — recreated when dependencies above change */
  const debouncedMove = useMemo(
    () => debounce(handleMapMove, 400),    // 400 ms after last dragEnd
     [handleMapMove]
  );

  useEffect(() => {
    if (mapRef.current && newMap) {
      const map = mapRef.current;
      const dragEndListener = map.addListener('dragend', () =>
        debouncedMove(map)
      );
      return () => {
        window.google.maps.event.removeListener(dragEndListener);
        debouncedMove.cancel();
      };
    }
  }, [newMap, flow]);


  useEffect(() => {
    if (map && positions.length > 0) {
        // Clear existing markers
        markersRef.current.forEach(marker => marker.setMap(null));
        markersRef.current = [];

        function createCircleIcon() {
          const circle = document.createElement('div');
          circle.style.width = '12px';
          circle.style.height = '12px';
          circle.style.backgroundColor = '#D4CF5A';
          circle.style.borderRadius = '50%';
          circle.style.border = '1px solid green';
          circle.style.opacity = '0.45';
          circle.style.display = 'flex';  // Center content (if any)
          circle.style.alignItems = 'center';
          circle.style.justifyContent = 'center';
          circle.style.transform = 'translate(0%, 50%)'; // <- this line
          return circle;
        }
        if(flow < 10){
          // Add markers
          positions.forEach((pos, index) => {
            const marker = new window.google.maps.marker.AdvancedMarkerElement({
              position: { lat: pos.lat, lng: pos.lng },
              map: map,
              title: `P${index + 1}`,
              content: createCircleIcon()
            });
            markersRef.current.push(marker);
          });

          // Update or create the polyline
          if (polylineRef.current) {
            polylineRef.current.setPath(positions);
          } else {
            polylineRef.current = new window.google.maps.Polyline({
              path: positions,
              geodesic: true,
              strokeColor: "#D4CF5A",
              strokeOpacity: 0.3,
              strokeWeight: 1
            });
            polylineRef.current.setMap(map);
          }
        // On first load with existing fields, fit to show all approved fields once
        if (!didInitialOverviewRef.current && approvedFields.length > 0) {
          didInitialOverviewRef.current = true;
          const bounds = new window.google.maps.LatLngBounds();
          approvedFields.forEach((polygon) => {
            polygon.shape.forEach((path) => {
              bounds.extend(new window.google.maps.LatLng(path.lat, path.lng));
            });
          });
          map.fitBounds(bounds);
        } else {
          const lastCoordinate = positions.at(-1);
          map.setCenter({ lat: lastCoordinate.lat, lng: lastCoordinate.lng });
        }
        } else {
          // Center map and zoom to 
          const bounds = new window.google.maps.LatLngBounds();
          
          // Loop through each polygons in the array
          approvedFields.forEach((polygon) => {
            polygon.shape.forEach((path) => {
              bounds.extend(new window.google.maps.LatLng(path.lat, path.lng));
            });
          });
          // Fit the bounds to the polygons
          map.fitBounds(bounds);
          map.panBy(0, 100)
          // ✅ remove markers
          markersRef.current.forEach(marker => marker.setMap(null));
          markersRef.current = [];

          // ✅ remove polyline
          if (polylineRef.current) {
            polylineRef.current.setMap(null);
            polylineRef.current = null;
          }
        }        
  }
  }, [map, fieldReg]);

  useEffect(() => {
    if (map && polygons.length > 0) {
      // Create a LatLngBounds object
      const bounds = new window.google.maps.LatLngBounds();

      // Extend the bounds to include each point of the polygons
      polygons.forEach((path) => {
          bounds.extend(new window.google.maps.LatLng(path.lat, path.lng));
      });

      // Fit the bounds to the polygons
      map.fitBounds(bounds);
    }
  }, [map, fieldReg.polygons]);
  
  const fallbackCenter = useMemo(() => {
    if (positions.length > 0) return positions.at(-1);
    if (approvedFields.length > 0 && approvedFields[0].shape?.length) {
      return roughFieldCenterCalc(approvedFields[0].shape);
    }
    // v2.25 getCurrentPosition() // bluntly call to prompt geolocation
    // safe default to avoid undefined center
    const coords = db?.union.location || [0,0];
    return { lat: coords[0], lng: coords[1] };
  }, [positions, approvedFields]);

  return isLoaded ? (
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={fallbackCenter}
        onLoad={onLoad}
        options={hasOffsiteCookie(remote)}
        onUnmount={onUnmount}
      >
        {/* polygons component */}
        {approvedFields.map((field, index) => (
          <Polygon
            key={index}
            paths={field.shape}
            options={flow >= 10 ? {
              fillColor: "rgba(255, 255, 255, 0.65)",
              fillOpacity: 0.15,
              strokeColor: "white",
              strokeOpacity: 0.3,
              strokeWeight: 3,
              clickable: false,
            } : {
              fillColor: "rgba(255, 255, 255, 0.4)",
              fillOpacity: 0.4,
              strokeColor: "white",
              strokeOpacity: 1,
              strokeWeight: 2,
            }}
            onClick={flow >= 10 ? undefined : () => updateFieldReg({ polygons: field.shape, panMode: index + 1, rectStrength: 0, cornerStrength: 0 })}
          />
        ))}
        {/* field names on outline */}
        {(fieldReg.property && flow > 10) && approvedFields.map((field, index) => (
          <InfoBox key={index} position={roughFieldCenterCalc(field.shape)} options={{ closeBoxURL: '', enableEventPropagation: true }} >
            <div className="text-xs text-center text-white bg-black bg-opacity-30 p-1rounded-lg whitespace-nowrap">
              {field.name}
            </div>
          </InfoBox>
        ))}
        {/* Alt output */}
        {alts.length > 0 && (flow === 2 || flow === 3) && (
          <Polygon
            paths={[sharpenCorners(rectangularize(alts[1][0], rectStrength), cornerStrength)]}
            options={{
              fillColor: "rgba(212, 207, 90, 0.4)",
              fillOpacity: 0.4,
              strokeColor: "#D4CF5A",
              strokeOpacity: 1,
              strokeWeight: 2,
            }}></Polygon>
        )}
        {/* Outline */}
        {(fieldReg.property && flow >= 10) && (fieldReg.property.shape || []).map((ring, idx) => (
          <Polygon key={idx} paths={ring} options={{
            fillColor: "rgba(212, 207, 90, 0.4)", strokeColor: "#D4CF5A", strokeOpacity: 1, strokeWeight: 2,
          }} />
        ))}
        {/* Fencing output */}
        {polygons.length > 0 && (
          <Polygon
            paths={sharpenCorners(rectangularize(polygons, rectStrength), cornerStrength)}
            options={{
              fillColor: "rgba(212, 207, 90, 0.4)",
              fillOpacity: 0.4,
              strokeColor: "#D4CF5A",
              strokeOpacity: 1,
              strokeWeight: 2,
            }}></Polygon>
        )}
        <></>
      </GoogleMap>
  ) : <></>
}

export default memo(Maps)
