import { useEffect } from 'react';
import { useFieldRegContext } from '../utils/FieldRegContext';
import { useDataContext, useNavContext, useViewModeContext } from '../utils/NavigationContext';
import axios from 'axios';
import { updateItem, readItem, setDBitem } from '../utils/db';
import { useReloadDB } from '../utils/reloadDb';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 

  /**
   * - Maps_nav
   *    - Static
   *    - Registration 
   * - Maps_card
   *    - 
   *  vars:
        - flow
        - result (polling api)
        - message
        - track 
        - Pan
        - isOnline
   */   

/**
 * determines flow
 * - 0 -> initiate field registration
 * - 1 -> check for signal and data (use img)
 * - 2 -> check accuracy of GPS signal
 * - 3 -> wait for user coordinate input
 * - 4 -> set flow to received new point (usePosition.js)
 * - 5 -> set flow to received new point (usePosition.js) 
 * - 6 -> wait for fencing task initiation
 * - 7 -> wait for preliminary result validation
 * - 8 -> call finished, wait for final result validation 
 *    
 * @returns { handleGetPosition, setCenter, timerRef, handleNotCorrect, handleCorrect, handleTx, handleVerifyRegistration, geoperm, remote }
 */

const useVerifyFlow = (LAND = null) => {
  const { fieldReg , updateFieldReg}         = useFieldRegContext()
  const { db }                               = useDataContext();
  const { setCardView, setTokenview }        = useViewModeContext();
  const { setIx }                            = useNavContext();
  const reloadDB                             = useReloadDB();

  const { positions,approvedFields, remote, property } = fieldReg

  const animateToMapView = () => {
    // If we're already in mapview, toggling through transactionview guarantees
    // a visible slide-down transition when verification completes.
    setCardView('transactionview');
    requestAnimationFrame(() => setCardView('mapview'));
  };

  const updateReloadLand = async (landValue) => {
    const ttl = 86_400_000; // 24h
    const rec = await readItem('reload', 'Init');
    const value = rec?.value || {};
    console.log('current reload land value', landValue)
    const updated = {
      ...value,
      expired: Date.now() + ttl,
      grant: value?.grant,
      land: landValue,
    };
    await setDBitem('reload', updated, 'Init');
  };

  const toLatLngObjects = (ring = []) =>
    ring.map((p) => Array.isArray(p) ? { lat: Number(p[0]), lng: Number(p[1]) } : p);

  const isPointTuple = (p) =>
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(Number(p[0])) &&
    Number.isFinite(Number(p[1]));

  const normalizeOutline = (rawOutline) => {
    if (!Array.isArray(rawOutline) || rawOutline.length === 0) {
      return { outline: [], mp: false };
    }

    // Polygon ring: [[lat,lng], ...]
    if (rawOutline.every(isPointTuple)) {
      return {
        outline: toLatLngObjects(rawOutline),
        mp: false,
      };
    }

    // Polygon wrapped in one ring: [[[lat,lng], ...]]
    if (Array.isArray(rawOutline[0]) && rawOutline[0].every(isPointTuple)) {
      return {
        outline: toLatLngObjects(rawOutline[0]),
        mp: false,
      };
    }

    // MultiPolygon-ish: [[[[lat,lng], ...]], ...] or [[[lat,lng], ...], ...]
    const polys = rawOutline
      .map((poly) => {
        if (Array.isArray(poly) && poly.every(isPointTuple)) return toLatLngObjects(poly);
        if (Array.isArray(poly?.[0]) && poly[0].every?.(isPointTuple)) return toLatLngObjects(poly[0]);
        return [];
      })
      .filter((ring) => ring.length > 0);

    if (polys.length > 0) {
      return {
        outline: polys,
        mp: true,
      };
    }

    // fallback to empty instead of poisoning state with NaN
    return {
      outline: [],
      mp: false,
    };
  };

  const handleThumbApi = async (outline) => {
    // load the thumbnail image
    const thumb_url = `${API_BASE_URL}/map_thumb/`;
    const ring = Array.isArray(outline?.[0]) && Array.isArray(outline?.[0]?.[0]) ? outline[0] : outline;
    const thumb_data = {
      /**
       * coordinates is only used to find the center of the property, but as properties are large or far apart, we might find the center in a strange place, we therefore just take the
       * FIRST field, that is either the entire property, so we always now we get a familiar blob, and we dont send in huge amount of data for a such a trivial issue.
       */
      coordinates: ring, // Ensure this is always a single ring [[lat,lng],...]
      screen_width: window.screen.width
    };
    try {
        const ThumbResponse = await axios.post(thumb_url, thumb_data, {
          responseType: "blob", // Ensure we get the data as a Blob
          headers: {'Content-Type': 'application/json'}
        });
        console.log('thumb', ThumbResponse.data);
        await updateItem({ id: 'thumb', value: ThumbResponse.data },'FarmData')
      } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
      }
  }

  const handleMarkerAPI = async () => {
    try {
      const url = `${API_BASE_URL}/detect_marker/`;
      const data = {'address':db['address']}
      const response = await axios.post(url, data,{
          headers: {
            'Content-Type': 'application/json',
          }
        });
      console.log('result', response)
      return response
    } catch (e){
      console.error('marker API issue', e)
    }
  }

  const handleVerifyAPI = async ({ action = 'verify' } = {}) => {
    const url = `${API_BASE_URL}/verify_prop/`;
    const address = JSON.stringify(db['address'])
    const chain = JSON.stringify(db['chain'])
    const queueMint = action === 'generate';
    const data = {
        //pos: encodePosition,
        fields: approvedFields,
        farm: property.name,
        pos: positions.reduce((acc, pos) => {
            acc.push({ lat: pos.lat, lng: pos.lng, acc: Math.round(pos.acc), date: pos.date });
            return acc;
        }, []),
        address: JSON.parse(address),
        chain: JSON.parse(chain),
        verification_action: action,
        queue_mint: queueMint,
        require_generate_click: true,
      };
    console.log('data to verify:', data)
    const response = await axios.post(url, data,{
        headers: {
          'Content-Type': 'application/json',
        }
      });
    return response
  }

  const verifySign = async ({ action = 'verify' } = {}) => {
      updateFieldReg({ messages: 14})
      /**
       * call backend to verify positions and generate the property outline.
       * Backend queues the land title mint (gas-optimized) and returns metadata.
       */
      try {
          const response = await handleVerifyAPI({ action })
          console.log('set verification method', response)

          if(response.data.result === 1){
              const outline = JSON.parse(response.data.output)
              const { outline: normalizedOutline, mp } = normalizeOutline(outline);
              const normalizedMetadata = {
                outline: normalizedOutline,
                mp,
                fields: approvedFields.map((f) => f.shape || []).map((ring) => toLatLngObjects(ring)),
              };
              const mintStatus = response.data.mint_status
              const mintQueued = action === 'generate' &&
                (mintStatus === 'pending' || response.data?.queued === true || response.data?.queue_status === 'pending')
              // set cookie just in case user doesnt progress
              const date = new Date();
              date.setTime(date.getTime() + (11 * 24 * 60 * 60 * 1000));
              document.cookie = "offsite=2; expires=" + date.toUTCString() + "; path=/";
              handleThumbApi(outline) // no need to wait

              if (mintQueued) {
                const pendingLand = {
                  hasLand: false,
                  pendingMint: true,
                  mint_status: mintStatus || 'pending',
                  metadata: normalizedMetadata,
                  outline: normalizedOutline,
                  farmname: property.name,
                };
                if (LAND?.current) {
                  LAND.current = pendingLand;
                }
                await updateReloadLand(pendingLand);
                await reloadDB();
                setCardView('default');
                setTokenview(false);
                setIx(null);
                updateFieldReg({
                  flow: 0,
                  track: false,
                  panMode: null,
                  polygons: [],
                  approvedFields: [],
                  positions: [],
                  property: { name: '', shape: [] },
                });

                const permissionOverride = localStorage.getItem('notificationPermissionOverride');
                const notificationPermission = permissionOverride || (typeof Notification !== 'undefined' ? Notification.permission : 'default');
                alert(
                  notificationPermission === 'granted'
                    ? 'Your new title is queued. Until available, you are not able to mint valuable food tokens or take a loan. You can invest in funds.'
                    : 'Your new title is queued. Enable notifications to get alerted when you can start taking a loan or mint valuable food tokens.'
                );
                return;
              }

              updateFieldReg(prev => ({
                ...prev,
                messages: 15,
                flow: 10,
                property: ({
                  ...prev.property,
                  shape: [mp ? (normalizedOutline[0] || []) : normalizedOutline],
                  address: db.address,
                  metadata: normalizedMetadata,
                  outline: normalizedOutline,
                  named: property.name,
                  mint_status: mintStatus || null,
                })
              }))
              animateToMapView()
          }
          if(response.data.result === 2){ // ON-SITE DATA COLLECTION IS NOT SUFFICIENT
              console.log('OBJECT VERIFICATION REQUIRED')
              updateFieldReg({ messages: 17, flow: 11, track: false })
              const date = new Date();
              date.setTime(date.getTime() + (11 * 24 * 60 * 60 * 1000));
              document.cookie = "offsite=3; expires=" + date.toUTCString() + "; path=/";
              setCardView('transactionview')
          }
      } catch (e) {
        if (e.code === 'ERR_NETWORK'){
          console.error('API offline');
          updateFieldReg({ apiOnline: false, flow: 2, track: false, messages: 12})
        }
        else {
           console.error('error', e);
          }
      }
  }

  const handleBackToBordering = () => {
    updateFieldReg({ flow: 2 , messages: remote ? 20 : 1, polygons: [] })
    // reset verification mode 
    const date = new Date();
    date.setTime(date.getTime() + (11 * 24 * 60 * 60 * 1000)); // 11 days expiration date, 
    document.cookie = `offsite=${remote ? 1 : 0}; expires=" + date.toUTCString() + "; path=/`;

  }

  const markerCheck = async () => {
    console.log('MarkerCheck API called.')
    /**
     * backend has stored signature, outline and user reference
     * on call, check if marker has been detected.
     */
    try {
      const response = await handleMarkerAPI()
      console.log('markerCheck response', response)
      // make sure the outline and signature are available
      if (response.data.result && response.data.signature && response.data.output){
        updateFieldReg(prev => ({ ...prev,  marker: true, messages: 24, property: { ...prev.property, outline: response?.data.output, sign: response?.data.signature } }))
      } else {
        // set message and check if notifications are granted
        console.log('notifications ', Notification.permission)
        updateFieldReg({ marker: false, messages: Notification.permission !== 'granted' ? 22 : 19 })
      }
    } catch (e){
      console.error('marker check API error:', e)
    }
  }

  const handleVerificationMode = async (cookieArray) => {
    if (cookieArray.find(c => c.startsWith('offsite=2'))){
      console.log('offsite=2')
      updateFieldReg({ messages: 15, flow: 10, track: false })
      setCardView('mapview')
    }
    if (cookieArray.find(c => c.startsWith('offsite=3'))){
      console.log('offsite=3')
      updateFieldReg({ messages: 17, flow: 11, track: false })
      setCardView('mapview')
    }
    if (cookieArray.find(c => c.startsWith('offsite=4'))){
      /**
       * NOTE
       * this will unmount useRegFlow, which will cause useEffect to reset flow to 0 and render wrong UI ONLY WHEN RELOADED APP
       */
      
      // call API to check if marker has been detected.
      setCardView('transactionview')
      updateFieldReg({ messages: Notification.permission === 'granted' ? 18 : 25, flow: 13, track: false, verificationMode: true })
      // dont wait for api..
      const verified = await markerCheck()
      console.log("verified?", verified)
    }
  }

  const handleObjectPlaced = () => {
    updateFieldReg({ flow: 12 , messages: Notification.permission === 'granted' ? 18 : 25 })
    setCardView('transactionview')
    const date = new Date();
    date.setTime(date.getTime() + (11 * 24 * 60 * 60 * 1000)); // 11 days expiration date, 
    // set cookie to offsite 3
    document.cookie = "offsite=4; expires=" + date.toUTCString() + "; path=/";
    console.log('UNDER REVIEW')
    
  }

  const handleVerify = () => {
    /**
     * verify flow uses flow 11 -> 20
     */
    updateFieldReg({ messages: 16, polygons: [] })
    // fetch signature and outline
    return verifySign({ action: 'verify' })
  }

  const handleGenerateLandTitle = () => {
    updateFieldReg({ messages: 16, polygons: [] })
    return verifySign({ action: 'generate' })
  }

  // alert if sure to unmount
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome to display the confirmation dialog
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return { handleVerificationMode, handleVerify, handleGenerateLandTitle, handleBackToBordering, handleObjectPlaced };
};

export default useVerifyFlow;
