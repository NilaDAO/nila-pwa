// The one camera viewer (22 Oct), drawn after C6 (board LeaderPhotoCount): an optional bold title and grey hint, a
// round viewer in a raised ring with the accent corner frame, and in photo mode the white shutter under it.
//  - mode 'qr': decodes any QR in view and calls onText(text) once (html5-qrcode, as before).
//  - mode 'photo': the shutter calls onPhoto(blob) with a JPEG of the frame; busy greys it out.
// Every scanner in the app uses this; no screen opens the camera itself.
import { useEffect, useRef, useState } from 'react';
import { C, R } from './tokens';
import { muted } from '../plan/ui';

let seq = 0;

const corner = (pos) => {
  const t = pos[0] === 't'; const l = pos[1] === 'l';
  return {
    position: 'absolute', width: 36, height: 36, [t ? 'top' : 'bottom']: '30%', [l ? 'left' : 'right']: '30%',
    borderColor: C.accent, borderStyle: 'solid', borderWidth: 0,
    [t ? 'borderTopWidth' : 'borderBottomWidth']: 4, [l ? 'borderLeftWidth' : 'borderRightWidth']: 4,
    [`border${t ? 'Top' : 'Bottom'}${l ? 'Left' : 'Right'}Radius`]: 8, pointerEvents: 'none',
  };
};

export default function CameraView({ mode = 'qr', onText, onPhoto, busy = false, title, hint }) {
  const box = useRef();
  const video = useRef();
  const [id] = useState(() => `nila-cam-${++seq}`);
  const [denied, setDenied] = useState(false);

  // QR: html5-qrcode draws its own <video> into the round box; stopping before it runs throws, so guard it.
  useEffect(() => {
    if (mode !== 'qr') return undefined;
    let scanner; let live = true; let running = false;
    const stop = () => { if (!running) return; running = false; try { scanner.stop().catch(() => {}); } catch { /* not running */ } };
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!live || !box.current) return;
      scanner = new Html5Qrcode(id, { verbose: false });
      scanner.start({ facingMode: 'environment' }, { fps: 10, aspectRatio: 1 }, (t) => { onText?.(t); stop(); }, () => {})
        .then(() => { running = true; if (!live) stop(); })
        .catch(() => { if (live) setDenied(true); });
    });
    return () => { live = false; stop(); };
  }, [mode, id, onText]);

  // Photo: our own stream into a <video>; the shutter grabs a frame.
  useEffect(() => {
    if (mode !== 'photo') return undefined;
    let live = true; let stream;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => { if (!live) { s.getTracks().forEach((t) => t.stop()); return; } stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } })
      .catch(() => { if (live) setDenied(true); });
    return () => { live = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [mode]);

  const shoot = async () => {
    const v = video.current;
    if (!v?.videoWidth || busy) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    onPhoto?.(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {title && <b style={{ fontSize: 16, lineHeight: 1.5 }}>{title}</b>}
      {hint && <span style={muted}>{hint}</span>}
      <div style={{ position: 'relative', width: 'min(280px, 100%)', aspectRatio: '1 / 1', margin: '12px auto', borderRadius: R.round,
        overflow: 'hidden', boxShadow: `0 0 0 8px ${C.raised}`, background: 'radial-gradient(circle, #2a2a2a 0%, #0b0b0b 75%)' }}>
        <style>{`#${id} video{width:100%!important;height:100%!important;object-fit:cover}#${id}{width:100%;height:100%}#${id} img,#${id} > div:not(:first-child){display:none!important}`}</style>
        {mode === 'qr'
          ? <div id={id} ref={box} aria-label="Camera view" style={{ width: '100%', height: '100%' }} />
          : <video ref={video} playsInline muted aria-label="Camera view" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        {['tl', 'tr', 'bl', 'br'].map((p) => <span key={p} aria-hidden="true" style={corner(p)} />)}
      </div>
      {mode === 'photo' && (
        <div style={{ textAlign: 'center' }}>
          <button type="button" aria-label="Take a photo" disabled={busy || denied} onClick={shoot}
            style={{ width: 64, height: 64, borderRadius: R.round, border: `4px solid ${C.text}`, boxShadow: `inset 0 0 0 4px ${C.ink}`,
              background: busy ? C.muted : C.text, cursor: busy ? 'default' : 'pointer' }} />
        </div>
      )}
      {denied && <span style={{ ...muted, color: C.coral, textAlign: 'center' }}>Allow the camera to use it here.</span>}
    </div>
  );
}
