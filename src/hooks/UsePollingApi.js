import { useState, useEffect, useRef } from "react";
import { useFieldRegContext } from '../utils/FieldRegContext';

/**
* Generic polling hook that understands the backend‑specific envelope:
* {
* state: 'PENDING' | 'STARTED' | 'PROGRESS' | 'SUCCESS' | 'FAILURE',
* meta?: any,
* data?: any,
* }
*/
export default function usePollingApi(
  apiUrl,
  stopWhen,
  timerRef,
  intervalMs = 3000,
) {
  const { updateFieldReg } = useFieldRegContext();
  const [isPolling, setIsPolling] = useState(false);
  const timeoutRef = useRef(null);


  // Resolve URL lazily to pick up the latest taskId each tick.
  const resolveUrl = () => (typeof apiUrl === 'function' ? apiUrl() : apiUrl);


  const callApi = async () => {
    const url = resolveUrl();
    if (!url || /null$/.test(url)) {
      console.warn('Polling aborted: taskId not set yet');
      setIsPolling(false);
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();

      // Normalise + push into global context
      if (payload.state === 'SUCCESS') {
        updateFieldReg(prev => ({ ...prev, results: payload.data, state: payload.state }));
      } else {
        updateFieldReg(prev => ({ ...prev, results: payload.meta ?? payload, state: payload.state }));
      }

      const done = stopWhen ? stopWhen(payload) : payload.state === 'SUCCESS';
      if (done) {
        setIsPolling(false);
        return;
      }
      timeoutRef.current = setTimeout(callApi, intervalMs);
    } catch (err) {
      console.error('Polling failed:', err);
      updateFieldReg({ flow: 2, results: null, messages: 12, state: 'FAILURE' });
      setIsPolling(false);
    }
  };


  useEffect(() => () => clearTimeout(timeoutRef.current), []);


  const startPolling = () => {
    if (!isPolling) {
      timerRef.current = 0;
      setIsPolling(true);
      timeoutRef.current = setTimeout(callApi, intervalMs);
    }
  };


  const forceStopPolling = () => {
    clearTimeout(timeoutRef.current);
    setIsPolling(false);
  };


  return { startPolling, forceStopPolling, isPolling };
}