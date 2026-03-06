import { useState, useRef, useEffect } from "react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";
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

export default function QRScanner({ sendTo }) {
  const [ scanmode, setScanMode ] = useState();
  const [ permissionState, setPermissionState ] = useState('checking');
  const scannerRef = useRef(null);
  const permRef = useRef(null);
  
  async function isCameraAllowed() {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: "camera" });
      permRef.current = status;
      setPermissionState(status.state);
      status.onchange = () => {
        setPermissionState(status.state);
        if (status.state === "granted") {
          setScanMode(undefined);
          startScanner();
        }
      };
      if (status.state === "granted"){
        startScanner();
        return;
      }
    }
    // fallback: try getUserMedia once & stop tracks
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      setPermissionState('granted');
      startScanner();
    } catch {
      console.log('Cant activate camera');
      setPermissionState('denied');
      setScanMode('You didn’t allow camera access. Please enable it and retry.');
    }
  }

  console.log("QR Scanner permission state:", scannerRef.current, permissionState);
  useEffect(() => {
    isCameraAllowed()
    return () => {
      if (scannerRef.current) {
        // stops camera, removes UI
        scannerRef.current.clear()
          .catch(err => console.warn("Failed to clear QR scanner:", err))
        scannerRef.current = null
      }
      if (permRef.current) {
        permRef.current.onchange = null;
      }
      }
  }, [])

  const startScanner = () => {
    if (scannerRef.current) return;
    const target = document.getElementById("qr-reader");
    if (!target) {
      // try again next paint once the element is in the DOM
      requestAnimationFrame(startScanner);
      return;
    }

    console.log("Starting QR scanner");
    const viewport = {
      w: typeof window !== 'undefined' ? window.innerWidth : 320,
      h: typeof window !== 'undefined' ? window.innerHeight : 320,
    };
    // size the box to ~80% of the smaller viewport dimension with sane bounds
    const qrBoxSize = Math.max(180, Math.min(320, Math.floor(0.8 * Math.min(viewport.w, viewport.h))));

    const config = {
      fps: 10,
      qrbox: { width: qrBoxSize, height: qrBoxSize },
      // Prefer back camera when available
      videoConstraints: { facingMode: { ideal: 'environment' } },
      // Only attempt QR decoding, avoid mirrored frames
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      disableFlip: true,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    scannerRef.current = new Html5QrcodeScanner("qr-reader", config);
    scannerRef.current.render(
      (result) => {
        const address = parseQrAddress(result);
        if (!address) {
          console.warn("QR scan payload not recognized", result);
          return;
        }
        sendTo(address);
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    );
  };

  const requestPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      console.log("Camera permission granted");
      setPermissionState('granted');
      setScanMode(undefined);
      startScanner();
    } catch (e) {
      console.warn("Camera permission denied", e);
      setPermissionState('denied');
      setScanMode('Camera is blocked. Enable it in browser settings and retry.');
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
      scannerRef.current = null;
    }
  };

  return (
    <>
    { scanmode ? 
        <div className="flex flex-col items-center gap-4 p-6 mt-12">
          <p className="flex text-center items-center dark:text-white">{scanmode}</p>
          {permissionState === 'denied' && (
            <button
              type="button"
              onClick={requestPermission}
              className="px-4 py-2 rounded-full bg-black text-white text-sm"
            >
              Retry camera access
            </button>
          )}
          <p className="text-xs text-gray-500 text-center">
            Tip: Check site permissions for this page and allow camera, then retry.
          </p>
        </div>
      :
        <div className="flex items-center gap-4 rounded-full">
            <div className="qr-shell relative rounded-full overflow-hidden pt-8">
              <div id="qr-reader" />
            </div>
        </div>
    }
    </>
  );
}
