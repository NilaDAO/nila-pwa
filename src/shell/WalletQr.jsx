// A1a (board MemberWalletQR): her Stellar wallet as a QR in a white circle, for the leader to scan (invest, cash),
// the short address with Copy, and the info note above the tab bar. While her investment withdrawal is ready (14 days
// passed; executive decision 24 Oct) the QR carries her signed collect (NILA:W, deskCode.js), so the leader's one scan
// pays it out; a leader's own withdrawal goes to her wallet (A3), so hers stays the plain address.
import MapCard from './MapCard';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { deskClaim } from '../loan/desk';
import { signDeskCode } from '../loan/deskCode';
import { C, FONT, R, TAB_BAR_HEIGHT } from './tokens';
import HelpQr from '../loan/HelpQr';
import { NoteBar } from '../loan/AssetParts';

const SHADOW = 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px';
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');

// As HelpQr's assisted(): the member's mode on this phone (every member starts in assist mode).
const assisted = () => { try { return localStorage.getItem('nila.mode') !== 'self'; } catch { return true; } };

/** A member in assist mode shows the help QR (executive decision 26 Oct); a member in self mode and a leader show the
 *  plain account number (revised 31 Oct, executive decision). */
export default function WalletQr({ onBack, leader }) {
  return leader || !assisted() ? <AccountQr onBack={onBack} leader={leader} /> : <HelpQr onBack={onBack} />;
}

function AccountQr({ onBack, leader }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const addr = s?.stellarAddress;
  const [img, setImg] = useState();
  const claim = useQuery({ queryKey: ['stellar', 'deskClaim', addr], enabled: !!cfg && !!addr && !leader, queryFn: () => deskClaim(cfg, addr) });
  const ready = claim.data?.shares > 0n;
  const signed = useQuery({ queryKey: ['stellar', 'deskCode', addr, ready], enabled: ready && !!s?.ready,
    queryFn: () => signDeskCode({ cfg, signer: s.senderAddress, signHash: s.signHash, kind: 'W' }), staleTime: 3_600_000 });
  const text = ready ? signed.data?.qr : addr;
  useEffect(() => { if (text) QRCode.toDataURL(text, { width: 400, margin: 0, errorCorrectionLevel: 'L' }).then(setImg); }, [text]);
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, minHeight: `calc(100dvh - ${TAB_BAR_HEIGHT + 16}px)`, display: 'flex', flexDirection: 'column' }}
      header={{ title: 'Your account number', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}>
      <section aria-label="Wallet QR code" style={{ background: C.ink, borderRadius: 24, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 140 }}>
        <div style={{ width: '100%', aspectRatio: '1', borderRadius: 9999, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {img && <img src={img} alt="Wallet address QR code" style={{ width: '62%', height: '62%', imageRendering: 'pixelated' }} />}
        </div>
        {ready && signed.data && (
          <p style={{ margin: 0, color: C.gold, textAlign: 'center', fontSize: 14, lineHeight: 1.5 }}>
            Your withdrawal is ready. Let your leader scan this only after you have received the cash.
          </p>
        )}
        <AddressCopy addr={addr} />
      </section>
      <NoteBar>Your wallet address. The union uses it to give you nIN and vouchers.</NoteBar>
    </MapCard>
  );
}

/** The short address with Copy (A1a), under the QR in its card; also on the help QR. */
export function AddressCopy({ addr }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  };
  return (
    <button type="button" onClick={copy} disabled={!addr} style={{ width: '100%', height: 44, border: 0, borderRadius: R.button, background: C.raised, color: C.text,
      fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span style={{ fontWeight: 400, color: C.muted }}>{short(addr)}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}

export const qrCard = { background: C.ink, borderRadius: 24, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 };
