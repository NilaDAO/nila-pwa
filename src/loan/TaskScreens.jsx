// The two sides of a task the member signs (A1, 26 Oct; taskCode.js). Leader: TaskRequest shows the request QR and then
// the camera for the member's answer, and hands the signed entry back. Member: TaskAnswer shows what the request asks
// and, once confirmed, the answer QR. DESIGN GAP: no board for these screens.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import CameraView from '../shell/CameraView';
import BigQr from '../shell/BigQr';
import { Primary, muted } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { Card, KV, QrCircle, Secondary } from './AssetParts';
import { readAnswer } from './taskCode';

const clock = (t) => new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const page = { padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 };

/** Leader: the request QR (`task` from makeTask), then the member's answer. `onSigned(entry)` submits the call. */
export function TaskRequest({ cfg, task, title, rows, map, onBack, onSigned }) {
  const [img, setImg] = useState();
  const [camera, setCamera] = useState(false);
  const [tries, setTries] = useState(0);
  const [error, setError] = useState();
  useEffect(() => { QRCode.toDataURL(task.qr, { width: 720, margin: 2, errorCorrectionLevel: 'M' }).then(setImg); }, [task.qr]);
  const read = (text) => {
    setError(undefined);
    let entry;
    try { entry = readAnswer(cfg, task, text); } catch (e) { setError(e.message); setTries((t) => t + 1); return; }
    onSigned(entry);
  };
  const over = Date.now() / 1000 > task.until;
  return (
    <MapCard map={map || <span />} header={{ title, onBack }} style={page}>
      <Card label={title} style={{ gap: 12 }}>
        {camera
          ? <CameraView key={tries} mode="qr" onText={read} />
          : <BigQr img={img} alt={`${title} QR`} caption="Let the member scan this with their phone" below={380} />}
        {rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}
        <KV k="Valid until" v={clock(task.until)} />
        {over && <span style={{ color: C.coral }}>This request has expired: go back and show a new one.</span>}
        {error && <span style={{ color: C.coral }}>{error}</span>}
        {camera
          ? <Secondary onClick={() => setCamera(false)}>Show the request again</Secondary>
          : <Primary disabled={over} onClick={() => setCamera(true)}>Scan the member's answer</Primary>}
        {!camera && <span style={{ ...muted, textAlign: 'center' }}>A member on their own phone may also confirm there; then nothing needs scanning.</span>}
      </Card>
    </MapCard>
  );
}

/** Member: what the request asks (`rows`), Confirm, then the answer QR. `sign()` returns the answer QR text. */
export function TaskAnswer({ title, rows, note, sign, onBack }) {
  const [qr, setQr] = useState();
  const [img, setImg] = useState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  useEffect(() => { if (qr) QRCode.toDataURL(qr, { width: 400, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [qr]);
  // The screen stays on while the answer shows (Screen Wake Lock).
  useEffect(() => {
    if (!qr || !navigator.wakeLock) return undefined;
    let lock;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [qr]);
  const confirm = async () => {
    setBusy(true); setError(undefined);
    try { setQr(await sign()); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <MapCard header={{ title, onBack }} style={page}>
      <Card label={title} style={{ gap: 12 }}>
        {qr && <QrCircle img={img} alt="Your answer QR" />}
        {qr && <p style={{ ...muted, textAlign: 'center', color: C.gold, margin: 0 }}>Let your leader scan this.</p>}
        {rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}
        {!qr && note && <span style={muted}>{note}</span>}
        {error && <span style={{ color: C.coral }}>{error}</span>}
        {qr ? <Secondary onClick={onBack}>Done</Secondary> : <Primary disabled={busy} onClick={confirm}>{busy ? 'Signing…' : 'Confirm'}</Primary>}
        {!qr && <Secondary onClick={onBack}>Cancel</Secondary>}
      </Card>
    </MapCard>
  );
}
