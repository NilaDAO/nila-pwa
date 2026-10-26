// L9, the crop share request QR (A1, 26 Oct; taskCode.js): a member in self mode scans it on their Ready crop share
// and draws from their own phone. Assist and keypad members use a leader session instead (no QR from the leader).
// DESIGN GAP: no board for the expiry line.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import BigQr from '../shell/BigQr';
import { muted } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { Card, KV } from './AssetParts';

const clock = (t) => new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function TaskRequest({ task, title, rows, map, onBack }) {
  const [img, setImg] = useState();
  useEffect(() => { QRCode.toDataURL(task.qr, { width: 720, margin: 2, errorCorrectionLevel: 'M' }).then(setImg); }, [task.qr]);
  const over = Date.now() / 1000 > task.until;
  return (
    <MapCard map={map || <span />} header={{ title, onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label={title} style={{ gap: 12 }}>
        <BigQr img={img} alt={`${title} QR`} caption="Let the member scan this with their phone" below={340} />
        {rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}
        <KV k="Valid until" v={clock(task.until)} />
        {over && <span style={{ color: C.coral }}>This request has expired: go back and show a new one.</span>}
        <span style={{ ...muted, textAlign: 'center' }}>A member in assist mode shows their help QR instead: scan it on their page in Members.</span>
      </Card>
    </MapCard>
  );
}
