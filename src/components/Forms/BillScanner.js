import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { DENOMINATIONS } from '../../utils/cashCounterHelpers';
import { detectBillFromVideo, boundingBoxCrop, dataUrlToBlob } from '../../utils/billEdgeDetection';

const API = process.env.REACT_APP_API_BASE_URL;

// stability: need N consecutive detections before we consider it "locked"
const DETECT_INTERVAL = 200;       // ms between detection runs (~5fps)
const STABLE_HITS_REQUIRED = 5;    // consecutive hits to lock (5 × 200ms = 1s visible rectangle)
const MISS_TOLERANCE = 2;          // allow this many misses before resetting streak
const COOLDOWN_MS = 2000;          // pause detection after capture (avoid rapid-fire)

// Always-on scanner: mounts = camera starts, unmounts = camera stops
const BillScanner = ({ onBillConfirmed, billCount, runningTotal, onStop }) => {
  const [cameraPermission, setCameraPermission] = useState('checking');
  const [scanState, setScanState] = useState('idle');          // 'idle' | 'locking' | 'scanning' | 'success' | 'error'
  const [lastResult, setLastResult] = useState(null);
  const [lockProgress, setLockProgress] = useState(0);         // 0-1 progress toward auto-capture
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const cornersRef = useRef(null);         // latest valid corners
  const lastCornersRef = useRef(null);     // smoothed: keeps last valid corners for drawing
  const rafRef = useRef(null);
  const streakRef = useRef(0);             // consecutive detection hits
  const missesRef = useRef(0);             // consecutive misses
  const scanStateRef = useRef('idle');     // mirror of scanState for use in rAF loop
  const cooldownUntilRef = useRef(0);      // timestamp: don't detect until after this

  // keep scanStateRef in sync
  useEffect(() => { scanStateRef.current = scanState; }, [scanState]);

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

  // ── capture + send to backend ──
  const handleCapture = useCallback(async () => {
    if (scanStateRef.current === 'scanning') return;

    // require detected corners — don't send without a visible rectangle
    if (!cornersRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, vw, vh);

    // crop to detected bounding box
    let croppedCanvas;
    try {
      croppedCanvas = boundingBoxCrop(canvas, cornersRef.current);
    } catch {
      croppedCanvas = null;
    }
    if (!croppedCanvas) return; // bad corners, skip

    const croppedDataUrl = croppedCanvas.toDataURL('image/jpeg', 0.85);

    setScanState('scanning');
    setLastResult(null);
    setLockProgress(0);
    streakRef.current = 0;
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    navigator.vibrate?.(50);

    if (!navigator.onLine) {
      setScanState('error');
      setLastResult('No internet connection');
      return;
    }

    try {
      const blob = dataUrlToBlob(croppedDataUrl);
      const formData = new FormData();
      formData.append('image', blob, `bill_${Date.now()}.jpg`);

      const { data } = await axios.post(`${API}/inr/scan`, formData);
      console.log('Bill detected:', { data });

      if (data.prediction?.source === 'error') {
        setScanState('error');
        setLastResult('Could not identify bill');
        return;
      }

      const p = data.prediction;

      if (p.denomination === null || !DENOMINATIONS.includes(p.denomination)) {
        setScanState('error');
        setLastResult('Could not detect denomination');
        return;
      }

      onBillConfirmed({
        serialNumber: `bill_${Date.now()}`,
        denomination: p.denomination,
        side: p.side || 'front',
        imageDataUrl: croppedDataUrl,
        s3Key: data.s3_key || null,
        llmScanned: true,
      });

      navigator.vibrate?.(100);
      setScanState('success');
      setLastResult(`₹${p.denomination.toLocaleString('en-IN')} ${p.side || ''}`);
    } catch (err) {
      console.error('Bill scan failed:', err?.response?.data?.detail || err.message);
      setScanState('error');
      setLastResult(err?.response?.data?.detail || 'Scan failed — try again');
    }
  }, [onBillConfirmed]);

  // ── live edge detection loop with stability tracking ──
  useEffect(() => {
    let lastDetectTime = 0;

    const loop = (timestamp) => {
      rafRef.current = requestAnimationFrame(loop);

      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) return;

      const rect = video.getBoundingClientRect();
      if (overlay.width !== rect.width || overlay.height !== rect.height) {
        overlay.width = rect.width;
        overlay.height = rect.height;
      }

      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      // always draw the last known corners (smoothing — survives brief misses)
      const drawCorners = lastCornersRef.current;
      if (drawCorners) {
        drawDetectionOverlay(ctx, video, overlay, drawCorners, streakRef.current);
      }

      // throttle detection
      if (timestamp - lastDetectTime < DETECT_INTERVAL) return;
      lastDetectTime = timestamp;

      // don't run detection while scanning/success or during cooldown
      if (scanStateRef.current === 'scanning' || scanStateRef.current === 'success') return;
      if (Date.now() < cooldownUntilRef.current) return;

      const result = detectBillFromVideo(video);

      if (result) {
        cornersRef.current = result.corners;
        lastCornersRef.current = result.corners;
        missesRef.current = 0;
        streakRef.current = Math.min(streakRef.current + 1, STABLE_HITS_REQUIRED);

        const progress = streakRef.current / STABLE_HITS_REQUIRED;
        setLockProgress(progress);

        if (streakRef.current < STABLE_HITS_REQUIRED) {
          setScanState('locking');
        }

        // auto-capture when stable
        if (streakRef.current >= STABLE_HITS_REQUIRED && scanStateRef.current !== 'scanning') {
          handleCapture();
        }
      } else {
        missesRef.current++;
        if (missesRef.current > MISS_TOLERANCE) {
          // lost the bill — reset
          cornersRef.current = null;
          lastCornersRef.current = null;
          streakRef.current = 0;
          setLockProgress(0);
          if (scanStateRef.current === 'locking') {
            setScanState('idle');
          }
        }
        // else: keep drawing last known corners (tolerance)
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [handleCapture]);

  // ── clear success/error flash ──
  useEffect(() => {
    if (scanState !== 'success' && scanState !== 'error') return;
    const delay = scanState === 'success' ? 1500 : 3000;
    const timer = setTimeout(() => {
      setScanState('idle');
      setLastResult(null);
      streakRef.current = 0;
      setLockProgress(0);
    }, delay);
    return () => clearTimeout(timer);
  }, [scanState]);

  // camera denied
  if (cameraPermission === 'denied') {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm dark:text-slate-400">Camera access denied. Please allow camera in device settings.</p>
        <button onClick={onStop} className="text-sm font-bold dark:text-white active:scale-95">Back</button>
      </div>
    );
  }

  // format total for badge
  const badgeText = runningTotal > 0
    ? `₹${runningTotal.toLocaleString('en-IN')}`
    : billCount > 0
      ? `${billCount} bill${billCount !== 1 ? 's' : ''}`
      : null;

  // status pill content
  const statusPill = scanState === 'idle'
    ? <span className="bg-black/50 text-white/80">Point at bill</span>
    : scanState === 'locking'
    ? <span className="bg-green/80 text-black">Hold steady...</span>
    : scanState === 'scanning'
    ? <span className="bg-blue-500/80 text-white animate-pulse">Analyzing...</span>
    : scanState === 'success'
    ? <span className="bg-green/90 text-black font-bold">{lastResult}</span>
    : scanState === 'error'
    ? <span className="bg-red/80 text-white">{lastResult || 'Failed'}</span>
    : null;

  return (
    <div className="flex flex-col w-full">
      {/* ── Camera container — fills the card region ── */}
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ height: '80dvh' }}>
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

        {/* edge detection overlay */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* top bar: status left, badge right */}
        <div className="absolute top-12 left-3 right-3 z-10 flex items-center justify-between">
          {/* status pill */}
          <div className="min-w-0">
            {statusPill && (
              <p className="text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur inline-block truncate">
                {statusPill}
              </p>
            )}
          </div>

          {/* badge — tapping goes to post-scan */}
          {badgeText && (
            <button
              onClick={onStop}
              className="bg-black/60 backdrop-blur rounded-full px-2.5 py-1 active:scale-95"
            >
              <p className="text-white text-xs font-bold whitespace-nowrap">{badgeText}</p>
            </button>
          )}
        </div>

        {/* capture button + stop */}
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-4">
          <button
            onClick={onStop}
            className="rounded-full w-11 h-11 flex items-center justify-center bg-white/20 backdrop-blur active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5 text-white">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>

          {/* capture button with SVG progress ring */}
          <button
            onClick={handleCapture}
            disabled={scanState === 'scanning'}
            className="relative rounded-full w-14 h-14 flex items-center justify-center active:scale-95"
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="29" fill="none" stroke="white" strokeWidth="3" opacity="0.3" />
              <circle
                cx="32" cy="32" r="29"
                fill="none"
                stroke={lockProgress >= 1 ? '#22c55e' : '#ffffff'}
                strokeWidth="3"
                strokeDasharray={`${29 * 2 * Math.PI}`}
                strokeDashoffset={`${29 * 2 * Math.PI * (1 - lockProgress)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.2s ease-out' }}
              />
            </svg>
            {scanState === 'scanning' ? (
              <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className={`w-9 h-9 rounded-full ${lockProgress >= 0.6 ? 'bg-green' : 'bg-white'}`} />
            )}
          </button>
        </div>
      </div>

      {/* offscreen canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// ── draw detection overlay (extracted for clarity) ──
function drawDetectionOverlay(ctx, video, overlay, corners, streak) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const dw = overlay.width;
  const dh = overlay.height;

  const videoAspect = vw / vh;
  const displayAspect = dw / dh;
  let sx, sy, sw, sh;
  if (videoAspect > displayAspect) {
    sh = vh; sw = vh * displayAspect; sx = (vw - sw) / 2; sy = 0;
  } else {
    sw = vw; sh = vw / displayAspect; sx = 0; sy = (vh - sh) / 2;
  }

  const mapX = (x) => ((x - sx) / sw) * dw;
  const mapY = (y) => ((y - sy) / sh) * dh;

  // color transitions from yellow (unstable) to green (stable)
  const stability = Math.min(1, streak / STABLE_HITS_REQUIRED);
  const r = Math.round(234 * (1 - stability) + 34 * stability);
  const g = Math.round(179 * (1 - stability) + 197 * stability);
  const b = Math.round(8 * (1 - stability) + 94 * stability);
  const color = `rgb(${r},${g},${b})`;
  const lineWidth = 2 + stability * 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(mapX(corners[0][0]), mapY(corners[0][1]));
  ctx.lineTo(mapX(corners[1][0]), mapY(corners[1][1]));
  ctx.lineTo(mapX(corners[2][0]), mapY(corners[2][1]));
  ctx.lineTo(mapX(corners[3][0]), mapY(corners[3][1]));
  ctx.closePath();
  ctx.stroke();

  // corner dots
  ctx.fillStyle = color;
  const dotSize = 4 + stability * 3;
  for (const c of corners) {
    ctx.beginPath();
    ctx.arc(mapX(c[0]), mapY(c[1]), dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default BillScanner;
