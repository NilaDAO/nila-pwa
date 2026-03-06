import { useState, useEffect, useRef } from 'react';
import { useFieldRegContext } from '../utils/FieldRegContext';
import { useViewModeContext } from '../utils/NavigationContext';
import usePosition from './usePosition';
import usePollingApi from './UsePollingApi';
import axios from 'axios';
import useVerifyFlow from './useVerifyFlow';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 

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
 */

export const parsePolygons = (features) =>
  features.map((f) =>
    // f.geometry.coordinates is an array of linear rings; `.flat()` flattens
    f.geometry.coordinates.flat().map(([lng, lat]) => ({ lat, lng }))
  );

export const isPointInPolygon = (point, vs) => {
  // ray-casting algorithm based on
  // https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = (yi > y) !== (yj > y)
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const useRegFlow = () => {
  const { fieldReg , updateFieldReg } = useFieldRegContext()
  const [ geoPerm, setGeoPerm ] = useState(false)
  const { handleVerificationMode } = useVerifyFlow()
  const { hasOnlineAPI, forceStopTracking, getCurrentPosition } = usePosition();
  const { setCardView } = useViewModeContext();
  const timerRef = useRef(0); // Used in counter
  const {track, flow, apiOnline, positions, approvedFields, results, remote,neighbours, property, alts } = fieldReg
  const [ altIndex, setAltIndex ] = useState(0);
  const taskIdRef = useRef(null);

  const handleDeleteApprovedFields = () => {
    if (confirm('Are you sure you want to remove all fields made?')) {
      // reset context state
      updateFieldReg({flow: 0, positions: [], approvedFields: []})
      // remove local storage
      localStorage.removeItem('fields')
      localStorage.removeItem('positions')
      fieldReg.approvedFields = []
      fieldReg.positions = []
      // reset cookies
      document.cookie = "offsite=; Max-Age=0; path=/;";
    }
  }

  const checkgeoPermission = async () => {
      const geoPermission = await navigator.permissions.query({ name: "geolocation" })
      setGeoPerm(geoPermission.state === 'granted' ? true : false) 
  }

  const { startPolling, forceStopPolling, isPolling } = usePollingApi(
    () => `${API_BASE_URL}/fencing/result/${taskIdRef.current}`,  // pass a *function*
    (p) => p.state === 'SUCCESS' || p.state === 'FAILURE',
    timerRef
  );


  const handleRequestBorders = async (coordinate) => {
      try {
          if (flow === 4) return; // already processing
          console.log('[fencing] request coordinate', coordinate);
          console.log('[fencing] positions (last 3)', positions.slice(-3));
          console.log('[fencing] remote', remote, 'flow', flow, 'track', track);
          const formData = new FormData();
          formData.append('lat', coordinate['lat']);
          formData.append('lon', coordinate['lng']); // backend expects "lon"
          formData.append('scale', 4);
          formData.append('period', 24);
          formData.append('force', true);
          
          console.info('formData', formData.get('lat'), formData.get('lon'))
          const { data } = await axios.post(`${API_BASE_URL}/fencing`, formData);
          console.info('CALL INITIATED')
          console.log('[fencing] taskId', data?.task_id);
          // important to poll for the right task
          taskIdRef.current = data.task_id
          updateFieldReg({ flow: 4, messages: 4})
          // initiate polling
          startPolling()
          
      } catch (e) {
          if (e.code === 'ERR_NETWORK')
          console.error('API offline');
          updateFieldReg({ apiOnline: false, flow: 0, track: false, messages: 12})

      }
  };

  const handleTryAgain = () => {
    if (alts.length > 0) {
      // user rejected current alternative; drop it and clear state
      const nextNeighbours = neighbours.filter((_, idx) => idx !== alts[0]);
      updateFieldReg(prev => ({ 
         ...prev, 
         alts: [], 
         neighbours: nextNeighbours, // new array so state updates
         polygons: [],
         results: null,
         messages: 1,
         flow: 2,
         track: true
      }));
      return;
    }

    // no alternatives available: prompt user to add a new coordinate point
    updateFieldReg(prev => ({
      ...prev,
      alts: [],
      polygons: [],
      results: null,
      messages: 10, // "move to center and try again" style prompt
      flow: 2,
      track: true
    }));
  }

  const handleStopPolling = async () => {
    const taskId = taskIdRef.current;
    forceStopPolling();
    try {
      if (taskId) {
        await axios.delete(`${API_BASE_URL}/fencing/${taskId}`);
        console.log('[fencing] task stopped', taskId);
      } else {
        console.warn('[fencing] stop requested without taskId');
      }
    } catch (e) {
      console.warn('[fencing] stop failed', e?.response?.data || e?.message || e);
    } finally {
      taskIdRef.current = null;
      updateFieldReg(prev => ({
        ...prev,
        flow: 2,
        messages: 27,
        results: null,
        polygons: [],
        alts: [],
        track: true,
      }));
    }
  };

  const handleCorrect = async () => {
    /**
     * reset flow and messages, remove polygon and move to approvedfields,set polygon as object
    */

    const fields = { 'name':  `field ${approvedFields.length + 1}`, 'shape': alts.length > 0 ? alts[1][0] : fieldReg.polygons}  
    console.log('added field', fields)
    updateFieldReg(prev => ({ 
        ...prev,
        alts: [], 
        flow: 2,
        messages: approvedFields.length > 1 ? 13 : 11,
        polygons: [],
        results: null,
        approvedFields: [...prev.approvedFields, fields],  
        }))
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

  useEffect(() => {
  }, []);

  // persist positions/fields as they change
  useEffect(() => {
    localStorage.setItem('positions', JSON.stringify(positions));
    if (approvedFields.length !== 0) {
      localStorage.setItem('fields', JSON.stringify(approvedFields));
      localStorage.setItem('property', JSON.stringify(property));
    } else {
      localStorage.removeItem('fields');
      localStorage.removeItem('property');
    }
  }, [positions, approvedFields, property]);

  // unmount cleanup
  useEffect(() => {
    // reset flow on unmount
    return () => {
      console.log('WE ARE UNMOUNTING')
      updateFieldReg({ flow: 0, panMode: null, polygons: []})
      forceStopTracking()
      forceStopPolling()
      // clear offsite cookie on close to avoid stale remote/verification state
      document.cookie = "offsite=; Max-Age=0; path=/;";
    };
  }, []);

  // store approved fields in local storage
  useEffect(() => {
    // store approvedfields in session data once there is one.
    if (approvedFields.length != 0){
        localStorage.setItem('fields', JSON.stringify(approvedFields));
    } 
    }, [approvedFields]); // only has to run on new position, as api call of self will not result in new secondary samples

  // on each new position, if available, show the ALT of lowest score 
  useEffect(() => {
      // On new point, set list of alternatives for that field (has PointInPolygon)
      let score = 1000
      // clean alts on each new point
      updateFieldReg(prev => ({  ...prev, alts: [], messages: remote ? 20 : 1 }))
      if(positions.length > 0){
          let pos = positions.at(-1)
          fieldReg.neighbours.map((shape,idx) => {
              // change 
              const geom = shape.geometry.coordinates[0]
              if (isPointInPolygon([pos['lng'],pos['lat']], geom)){
                  // only set as alt if lower score then previous or initial
                  if (shape.properties.score < score){
                    // change array to object
                    const alt_object = parsePolygons([shape])
                    updateFieldReg(prev => ({ 
                      ...prev,
                      messages: 9,
                      alts: [idx,alt_object]}))
                    }}})
      }

  }, [positions]); // only has to run on new position, as api call of self will not result in new secondary samples

  console.log('FLOW:', flow)

  useEffect( () => {
    /** FLOW:
       * 0 -> initiate field registration
       * 1 -> check for signal and data (use img)
       * 2 -> check accuracy of GPS signal
       * 3 -> wait for user coordinate input
       * 4 -> set flow to received new point (usePosition.js)
       * 5 -> set flow to received new point (usePosition.js)
       * 6 -> wait for fencing task initiation
       * 7 -> wait for preliminary result validation
       * 8 -> call finished, wait for final result validation
     */
    if (flow === 0){
      setCardView('mapview')
      // check if API is online
      hasOnlineAPI()
      // check local storage for already stored fields and positions
      const storedFields = JSON.parse(localStorage.getItem('fields'));  
      const storedPositions = JSON.parse(localStorage.getItem('positions'));    
      // set flow to 1 if api is online, get items from localstorage
      if (storedFields){
        // reset approvedfields & positions
        updateFieldReg({ approvedFields: storedFields, positions: storedPositions})
      }
      // check if geolocation is allowed
      console.log('apiOnline' , apiOnline, positions)
      checkgeoPermission()
      if (geoPerm && apiOnline){ 
        updateFieldReg({ flow: 1 })
      }
      return;
    }
    if (flow === 1){ // no GPS and no Data
      // skip the accuracy if offsite cookie is set
      const cookieArray = document.cookie.split(';');
      if (cookieArray.find(c => c.startsWith('offsite=1'))){
        updateFieldReg({ flow: 2, messages: 20, remote: true, track: false }) 
        getCurrentPosition()
        return;
      } else {
        updateFieldReg({ flow: 2, messages: 1, remote: false, track: true })
        getCurrentPosition()
      }
      // check accuracy of GPS
      const isAccurate = (positions) => { 
        let epoch = Date.now()
        // last position was registered more then 10 seconds ago
        let outdated = positions.length === 0 || positions.length > 0 && (positions.at(-1).date + (1000 * 20)) < epoch 
        // true/false if accuracy is below threshold and not outdated.
        const acc = positions.length >= 2 && positions?.slice(-2).every(item => item.acc < 30) && !outdated ? true : false
        return acc
      }
      // set flow to 2 if GPS and tracking is accurate/working.
      const accurate = isAccurate(positions)
      if (track && accurate) {   
        updateFieldReg({ flow: 2, messages: 1 }) 
      }
      return;
    }
    if (flow === 2){
      // check if this user is in verification mode
      const cookieArray = document.cookie.split(';');
      apiOnline && handleVerificationMode(cookieArray)
      return;
    }
    // all set, wait for user action to border field..
    if (flow === 3){
      handleRequestBorders(positions.at(-1))
      // turn off tracking
      updateFieldReg({ track: false })   
      timerRef.current = 0; // reset timer
      return;
    }      
    // ------------- PROCESS POLLING RESULTS
    if (flow === 4){
      console.log('[fencing] results raw', results);
      if (results && results.principal){
        const PRIMARY = results.principal
        const NEIGBOURS = results.alternatives;

        console.log('[fencing] PRIMARY', PRIMARY);
        console.log('[fencing] NEIGHBOURS', NEIGBOURS);
        // parse geojson objects received
        const primary_object = parsePolygons([PRIMARY])
        console.log('[fencing] PRIMARY parsed', primary_object);
        console.log('[fencing] last requested point', positions.at(-1));
        updateFieldReg(prev => ({ 
          ...prev,
          flow: 5,
          messages: 8,
          polygons: primary_object[0], 
          neighbours: [...prev.neighbours, ...NEIGBOURS],  
          }))
      }}
  
  }, [flow,results?.result,positions.length, isPolling]); // only update when result attr changes.


  return { handleTryAgain, handleCorrect, handleDeleteApprovedFields, handleStopPolling, timerRef, geoPerm, getCurrentPosition };
};

export default useRegFlow;
