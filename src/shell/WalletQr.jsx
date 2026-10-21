// A1a (board MemberWalletQR): her Stellar wallet as a QR in a white circle, for the leader to scan (invest, cash),
// the short address with Copy, and the info note above the tab bar.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, R, TAB_BAR_HEIGHT } from './tokens';
import { ScreenHeader } from './ListRow';

const SHADOW = 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px';
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');

export default function WalletQr({ onBack }) {
  const s = useNilaSigner();
  const addr = s?.stellarAddress;
  const [img, setImg] = useState();
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (addr) QRCode.toDataURL(addr, { width: 400, margin: 0 }).then(setImg); }, [addr]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  };
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, minHeight: `calc(100dvh - ${TAB_BAR_HEIGHT + 16}px)`, display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="" onBack={onBack} onSettings={() => { window.location.hash = '#/settings'; }} />
      <section aria-label="Wallet QR code" style={{ background: C.ink, borderRadius: 24, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 140 }}>
        <div style={{ width: '100%', aspectRatio: '1', borderRadius: 9999, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {img && <img src={img} alt="Wallet address QR code" style={{ width: '62%', height: '62%', imageRendering: 'pixelated' }} />}
        </div>
        <button type="button" onClick={copy} disabled={!addr} style={{ width: '100%', height: 44, border: 0, borderRadius: R.button, background: C.raised, color: C.text,
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <span style={{ fontWeight: 400, color: C.muted }}>{short(addr)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
      </section>
      <div role="note" style={{ position: 'fixed', left: 8, right: 8, bottom: TAB_BAR_HEIGHT - 24, zIndex: 5, background: C.ink, borderRadius: '24px 24px 0 0',
        padding: '14px 16px 38px', boxSizing: 'border-box', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>Your wallet address. The union uses it to give you nIN and vouchers.</div>
      </div>
    </div>
  );
}
