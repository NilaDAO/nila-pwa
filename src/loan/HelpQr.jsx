// Assist and keypad mode (A2, executive decision 26 Oct): the member's phone shows one help QR, made fresh, which lets
// a leader of the union act for the member for 5 minutes (stellar/session.js). The member's app itself signs no task.
// DESIGN GAP: no board for this screen.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { makeSessionQr } from '../stellar/session';
import { muted, Primary } from '../plan/ui';
import MapCard from '../shell/MapCard';
import { C, FONT } from '../shell/tokens';
import { QrCircle } from './AssetParts';

/** `note`: what the leader will do (repay, invest, collect…); `onBack` when opened from a page (not the Scan tab). */
export default function HelpQr({ note, onBack } = {}) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const [qr, setQr] = useState();
  const [img, setImg] = useState();
  const [error, setError] = useState();
  const [now, setNow] = useState(Date.now() / 1000);
  const make = async () => {
    setError(undefined);
    try { setQr(await makeSessionQr(cfg, s.stellarAddress, s.signHash)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (cfg && s?.ready && !qr) make(); }, [cfg, s?.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (qr) QRCode.toDataURL(qr.qr, { width: 400, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [qr]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 5000); return () => clearInterval(t); }, []);
  // The screen stays on while the QR shows.
  useEffect(() => {
    if (!navigator.wakeLock) return undefined;
    let lock;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, []);
  const over = qr && now > qr.until;
  // The map-view standard (26 Oct): a full-height map card with its drag line, the title and settings in its header.
  return (
    <MapCard header={{ title: 'Your QR', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}
      style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!over && !error && <QrCircle img={qr ? img : undefined} alt="Your QR" />}
      <p style={{ ...muted, textAlign: 'center', margin: 0 }}>
        {over ? 'This QR has expired.' : note || 'Show this to your union leader at the office. Your leader can then act for you for 5 minutes: invest, repay, use a crop share, start or collect a withdrawal.'}
      </p>
      {error && <p style={{ color: C.coral, textAlign: 'center', margin: 0 }}>{error}</p>}
      {(over || error) && <Primary onClick={make}>Make a new QR</Primary>}
    </MapCard>
  );
}
