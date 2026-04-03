import { useState, useRef, useEffect } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import "./qrScan.css";

const parseQrAddress = (raw) => {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parseQrAddress(parsed);
    if (parsed && typeof parsed === "object" && typeof parsed.address === "string") {
      return parsed.address.trim();
    }
  } catch {}
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
};

const isFront = (label = '') => /front|user|selfie/i.test(label);
const isBack  = (label = '') => /back|rear|environment|main/i.test(label);

export default function QRScanner({ sendTo }) {
  const [ permissionState, setPermissionState ] = useState('checking');
  const [ cameras, setCameras ] = useState([]);
  const [ activeCamId, setActiveCamId ] = useState(null);
  const scannerRef = useRef(null);
  const permRef = useRef(null);

  async function isCameraAllowed() {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: "camera" });
      permRef.current = status;
      setPermissionState(status.state);
      status.onchange = () => {
        setPermissionState(status.state);
        if (status.state === "granted") initCameras();
      };
      if (status.state === "granted") {
        initCameras();
        return;
      }
      return;
    }
    setPermissionState('prompt');
  }

  useEffect(() => {
    isCameraAllowed();
    return () => {
      stopScanner();
      if (permRef.current) permRef.current.onchange = null;
    };
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
  };

  const initCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);

      // pick default: prefer back camera
      const back = devices.find(d => isBack(d.label));
      const chosen = back ?? devices[0];
      if (chosen) {
        setActiveCamId(chosen.id);
        startScanner(chosen.id);
      }
    } catch (err) {
      console.warn("getCameras failed", err);
      // fall back: start with environment constraint
      startScanner(null);
    }
  };

  const startScanner = (cameraId) => {
    const tryStart = () => {
      const target = document.getElementById("qr-reader");
      if (!target) { requestAnimationFrame(tryStart); return; }

      if (scannerRef.current) return;

      const viewport = {
        w: typeof window !== 'undefined' ? window.innerWidth  : 320,
        h: typeof window !== 'undefined' ? window.innerHeight : 320,
      };
      const qrBoxSize = Math.max(180, Math.min(320, Math.floor(0.8 * Math.min(viewport.w, viewport.h))));

      const config = {
        fps: 10,
        qrbox: { width: qrBoxSize, height: qrBoxSize },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        disableFlip: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      const cameraConfig = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: { ideal: 'environment' } };

      scanner.start(cameraConfig, config, (result) => {
        const address = parseQrAddress(result);
        if (!address) { console.warn("QR scan payload not recognized", result); return; }
        sendTo(address);
        stopScanner();
      }).catch(err => console.warn("Scanner start failed", err));
    };
    tryStart();
  };

  const switchCamera = async (cam) => {
    if (cam.id === activeCamId) return;
    setActiveCamId(cam.id);
    await stopScanner();
    startScanner(cam.id);
  };

  const requestPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      setPermissionState('granted');
      initCameras();
    } catch (e) {
      console.warn("Camera permission denied", e);
      setPermissionState('denied');
    }
  };

  const showPrompt = permissionState === 'prompt' || permissionState === 'checking';
  const showDenied = permissionState === 'denied';

  // Build front/back button list; fall back to index labels if names are ambiguous
  const camButtons = cameras.map((cam, i) => {
    let label;
    if (isFront(cam.label))      label = 'Front';
    else if (isBack(cam.label))  label = 'Back';
    else                          label = `Camera ${i + 1}`;
    return { ...cam, displayLabel: label };
  });

  return (
    <>
      { (showPrompt || showDenied) ?
          <div className="flex justify-center w-full">
            <div className="qr-shell qr-shell--idle flex flex-col items-center justify-center gap-4">
              {showDenied ? (
                <>
                  <p className="text-slate-300 dark:text-slate-500 text-sm text-center px-6">
                    Camera blocked. Enable it in browser settings and retry.
                  </p>
                  <button type="button" onClick={requestPermission}
                    className="px-5 py-2 rounded-full bg-black text-white text-sm font-semibold dark:bg-white dark:text-black">
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <p className="text-slate-300 dark:text-slate-500 text-sm text-center px-6">
                    Camera is off
                  </p>
                  <button type="button" onClick={requestPermission}
                    className="px-5 py-2 rounded-full bg-black text-white text-sm font-semibold dark:bg-white dark:text-black">
                    Open camera
                  </button>
                </>
              )}
            </div>
          </div>
        :
          <div className="flex flex-col items-center w-full gap-3">
            <div className="flex justify-center w-full">
              <div className="qr-shell">
                <div id="qr-reader" />
              </div>
            </div>
            {camButtons.length > 1 && (
              <div className="flex gap-2">
                {camButtons.map(cam => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => switchCamera(cam)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors
                      ${cam.id === activeCamId
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300'}`}
                  >
                    {cam.displayLabel}
                  </button>
                ))}
              </div>
            )}
          </div>
      }
    </>
  );
}
