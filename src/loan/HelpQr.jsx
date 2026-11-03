// Assist and keypad mode (A2, executive decision 26 Oct): the member's phone shows one help QR, made fresh, which lets
// a leader of the union act for the member for 5 minutes (stellar/session.js). The member's app itself signs no task.
// DESIGN GAP: no board for this screen.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { makeSessionQr } from '../stellar/session';
import MapCard from '../shell/MapCard';
import { C, FONT } from '../shell/tokens';
import { NoteBar, QrCircle } from './AssetParts';
import { AddressCopy, qrCard } from '../shell/WalletQr';

// As MyShares' assisted() (not imported: MyShares imports this file).
const assisted = () => { try { return localStorage.getItem('nila.mode') !== 'self'; } catch { return true; } };

/** `note`: what the leader will do (repay, invest, collect…); `onBack` when opened from a page (not the Scan tab). */
/** `withPolygon`: carry her Polygon address in any mode (the no-title card, 3 Nov), so a leader can add her (L14). */
export default function HelpQr({ note, onBack, withPolygon = false } = {}) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const [qr, setQr] = useState();
  const [img, setImg] = useState();
  const [error, setError] = useState();
  const [now, setNow] = useState(Date.now() / 1000);
  const make = async () => {
    setError(undefined);
    // An assist-mode smartphone adds its Polygon address (29 Oct): a leader can add the member from this QR (L14).
    try { setQr(await makeSessionQr(cfg, s.stellarAddress, s.signHash, 'Ed25519', withPolygon || assisted() ? s.evmAddress : undefined)); } catch (e) { setError(e.message); }
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
  // Laid out as the account QR (31 Oct): the QR in its card with the address and Copy, a warning card, the note at the
  // bottom.
  return (
    <MapCard header={{ title: 'Your QR', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}
      style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section aria-label="Help QR" style={qrCard}>
        {over || error ? <QrCircle img={img} onRefresh={make} /> : <QrCircle img={qr ? img : undefined} alt="Your QR" />}
        <AddressCopy addr={s?.stellarAddress} />
      </section>
      <section role="alert" aria-label="Only for your union leaders" style={{ ...qrCard, alignItems: 'stretch', gap: 8, boxShadow: `inset 0 0 0 1px ${C.coral}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: C.coral }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.coral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          Only for your union leaders
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}>Whoever scans this can act for you for 5 minutes. Let only a leader of your union scan it, at the union office. Never send a photo of it.</span>
      </section>
      {error && <p style={{ color: C.coral, textAlign: 'center', margin: 0 }}>{error}</p>}
      <div aria-hidden="true" style={{ height: 120 }} />
      <NoteBar>{over ? 'This QR has expired. Tap the circle for a new one.' : note || 'Show this to your union leader at the office. Your leader can then act for you for 5 minutes: invest, repay, use a crop share, start or collect a withdrawal.'}</NoteBar>
    </MapCard>
  );
}
