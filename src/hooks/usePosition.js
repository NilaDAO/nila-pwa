import { useEffect, useCallback, useRef } from 'react';
import { useFieldRegContext } from '../utils/FieldRegContext';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 

const usePosition = () => {
  const watchIdRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const { fieldReg , updateFieldReg} = useFieldRegContext()
  const { apiOnline, track, remote } = fieldReg
 
  const onChange = useCallback(({ coords }) => {
    const now = Date.now();
    console.log('[geo] callback success', coords);
    // Uncomment to throttle updates:
    // if (now - lastUpdateRef.current < 10000) {
    //   console.log('[geo] throttled update', { now, last: lastUpdateRef.current });
    //   return;
    // }
    lastUpdateRef.current = now;
    const newLocation = {
      lat: coords.latitude,
      lng: coords.longitude,
      acc: coords.accuracy,
      manual: false,
      date: Date.now()
    };
    console.log('[geo] newLocation', newLocation)
    updateFieldReg(prev => ({ ...prev, panMode: null, positions: [...prev.positions, newLocation]
    }))  }, [fieldReg.positions]);

  const onError = useCallback((e) => {
    console.log('[geo] callback error', e)// if we never got a fix, return to "waiting for location" UI
    const positions = fieldReg.positions || []
    if (!remote && (!positions || positions.length === 0)) {
      updateFieldReg({ track: false, flow: 1 })
    }
  }, [remote, fieldReg.positions, updateFieldReg]);

  const hasOnlineAPI = () => {
     const callAPI = async () => {
        // test if API is online
        axios.get(API_BASE_URL)
        .then(response => {
          updateFieldReg({ apiOnline: response.status === 200 })
          console.log('API',API_BASE_URL ,'ONLINE:', response.status === 200)
          return true
        })
        .catch(e => {
          updateFieldReg({ apiOnline: false })
          console.error('api offline:',API_BASE_URL)
        });
          
          return false
      }
      callAPI()
    }

  useEffect(() => {
    // skip if tracking is not enabled
    console.log('[geo] effect', { track, remote, hasGeo: !!navigator.geolocation });
    if (!track || remote || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(onChange, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
    });
    console.log('[geo] watchPosition started', watchIdRef.current)
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        console.log('[geo] watchPosition cleared', watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [track]);

  const forceStopTracking = useCallback(() => {
    console.log('[geo] stop tracking', watchIdRef.current)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const onClick = useCallback(({ coords }) => {
    const newLocation = {
      lat: coords.latitude,
      lng: coords.longitude,
      acc: coords.accuracy,
      manual: true,
      date: Date.now()
    };    
    updateFieldReg(prev => ({ ...prev, panMode: null, positions: [...prev.positions, newLocation]}))
  }, [fieldReg.positions]);

  const getCurrentPosition = useCallback(() => {
    console.log('[geo] getCurrentPosition called')
    navigator.geolocation.getCurrentPosition(onClick, onError, { enableHighAccuracy: true })
    // we have two instances to call getCurrentLocation
    // 1. when location sharing needs to be toggled on.
    // 2. when user clicks on the location button
  }, []);

  return { hasOnlineAPI,getCurrentPosition, forceStopTracking, apiOnline };
};

export default usePosition;
