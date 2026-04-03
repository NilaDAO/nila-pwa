import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { dataUrlToBlob } from '../../utils/billEdgeDetection';

const API = process.env.REACT_APP_API_BASE_URL;

// Always-on camera. User taps shutter → full-frame capture → LLM counts all bills.
const BulkBillScanner = ({ onBulkConfirmed, onStop }) => {
  const [cameraPermission, setCameraPermission] = useState('checking');
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'counting' | 'success' | 'error'
  const [statusText, setStatusText] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // ── camera start on mount, stop on unmount ──
  useEffect(() => {
    let cancelled = false;
    const startCamera = async () => {
      try {
        if (navigator.permissions?.query) {
          try {
            const result = await navigator.permissions.query({ name: 'camera' });
            if (result.state === 'denied') { setCameraPermission('denied'); return; }
          } catch { /* not supported */ }
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraPermission('granted');
      } catch (err) {
        if (!cancelled) { console.error('Camera failed:', err); setCameraPermission('denied'); }
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    };
  }, []);

  const handleCapture = useCallback(async () => {
    if (scanState === 'counting') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    setScanState('counting');
    setStatusText('Counting bills…');
    navigator.vibrate?.(50);

    if (!navigator.onLine) {
      setScanState('error');
      setStatusText('No internet connection');
      return;
    }

    try {
      const blob = dataUrlToBlob(dataUrl);
      const formData = new FormData();
      formData.append('image', blob, `bulk_${Date.now()}.jpg`);

      const { data } = await axios.post(`${API}/inr/scan-bulk`, formData);
      console.log('Bulk scan result:', data);

      if (data.source === 'error' || !data.bills?.length) {
        setScanState('error');
        setStatusText('No bills detected — try again');
        return;
      }

      navigator.vibrate?.(100);
      setScanState('success');
      setStatusText(`₹${data.total_inr.toLocaleString('en-IN')} counted`);

      onBulkConfirmed({
        bills: data.bills,
        total: data.total_inr,
        imageDataUrl: dataUrl,
        s3Key: data.s3_key || null,
      });
    } catch (err) {
      console.error('Bulk scan failed:', err?.response?.data?.detail || err.message);
      setScanState('error');
      setStatusText(err?.response?.data?.detail || 'Scan failed — try again');
    }
  }, [scanState, onBulkConfirmed]);

  // clear success/error flash
  useEffect(() => {
    if (scanState !== 'success' && scanState !== 'error') return;
    const delay = scanState === 'success' ? 2000 : 3500;
    const timer = setTimeout(() => {
      setScanState('idle');
      setStatusText(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [scanState]);

  if (cameraPermission === 'denied') {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm dark:text-slate-400">Camera access denied. Please allow camera in device settings.</p>
        <button onClick={onStop} className="text-sm font-bold dark:text-white active:scale-95">Back</button>
      </div>
    );
  }

  const statusPill = scanState === 'idle'
    ? <span className="bg-black/50 text-white/80">Lay bills flat, then tap shutter</span>
    : scanState === 'counting'
    ? <span className="bg-blue-500/80 text-white animate-pulse">Counting…</span>
    : scanState === 'success'
    ? <span className="bg-green/90 text-black font-bold">{statusText}</span>
    : scanState === 'error'
    ? <span className="bg-red/80 text-white">{statusText || 'Failed'}</span>
    : null;

  return (
    <div className="flex flex-col w-full">
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ height: '45dvh' }}>
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

        {/* top: status pill */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
          <div className="min-w-0">
            {statusPill && (
              <p className="text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur inline-block truncate">
                {statusPill}
              </p>
            )}
          </div>
        </div>

        {/* bottom: stop + shutter */}
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-4">
          <button
            onClick={onStop}
            className="rounded-full w-11 h-11 flex items-center justify-center bg-white/20 backdrop-blur active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5 text-white">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>

          <button
            onClick={handleCapture}
            disabled={scanState === 'counting'}
            className="relative rounded-full w-14 h-14 flex items-center justify-center active:scale-95 disabled:opacity-50"
          >
            <div className="absolute inset-0 rounded-full border-4 border-white/60" />
            {scanState === 'counting' ? (
              <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white" />
            )}
          </button>
        </div>
      </div>

      {/* offscreen canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default BulkBillScanner;
