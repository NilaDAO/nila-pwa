// A1a (board MemberWalletQR): her Stellar wallet as a QR, for the leader to scan (invest, cash).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT } from './tokens';

export default function WalletQr({ onBack }) {
  const s = useNilaSigner();
  const [img, setImg] = useState();
  useEffect(() => { if (s?.stellarAddress) QRCode.toDataURL(s.stellarAddress, { width: 280, margin: 1 }).then(setImg); }, [s]);
  return (
    <div style={{ padding: 16, fontFamily: FONT, color: C.text, textAlign: 'center' }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0, float: 'left' }}>← Back</button>
      <h1 style={{ fontSize: 16, fontWeight: 700 }}>Your wallet</h1>
      {img && <img src={img} alt="Your wallet QR" style={{ width: 280, height: 280, background: '#fff', borderRadius: 12 }} />}
      <p style={{ color: C.muted, overflowWrap: 'anywhere' }}>{s?.stellarAddress}</p>
    </div>
  );
}
