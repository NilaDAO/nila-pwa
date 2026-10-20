// The registration frame (boards RegWallet-ss0b, RegPhone-a6bc, RegCode-nflo, SendLocation-*, SheetVerify-88ia,
// RegUnion-nj7b, RegAssist, RegNotify-52am, RegDone-fji8): the olive field ground, the 'nila' wordmark and the logo,
// one dark card at the bottom, and the info note under it. Markup and values copied from the boards.
import { C, FONT } from '../shell/tokens';

const LOGO = `${process.env.PUBLIC_URL || ''}/images/reg-logo.png`;

function Ground() {
  return (
    <svg aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="390" height="844" fill="#7a8a2a" />
      <path d="M0 0 L390 0 L390 844 L0 844 Z" fill="#8a9a2e" />
      <path d="M0 120 Q100 90 200 130 T390 110 L390 300 L0 320 Z" fill="#a0b035" opacity="0.6" />
      <path d="M0 420 Q120 380 260 440 T390 420 L390 640 L0 660 Z" fill="#6d7d24" opacity="0.7" />
      <path d="M-20 700 Q150 660 300 720 T420 700 L420 844 L-20 844 Z" fill="#5c6c1f" opacity="0.8" />
      <path d="M60 0 L90 844" stroke="#4f5f1a" strokeWidth="10" opacity="0.5" />
      <path d="M300 0 L330 844" stroke="#4f5f1a" strokeWidth="8" opacity="0.4" />
    </svg>
  );
}

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
  </svg>
);

export const cardTitle = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', padding: '8px 0', margin: 0 };
export const btnPrimary = { height: 44, borderRadius: 12, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', padding: '0 24px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, color: '#121212', background: '#D4CF5A', width: '100%', cursor: 'pointer' };
export const btnSecondary = { ...btnPrimary, color: '#F1F5F9', background: '#1F2733' };
export const btnDisabled = { ...btnPrimary, color: '#94A3B8', background: '#1F2733', cursor: 'not-allowed' };
export const btnQuiet = { minHeight: 44, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 14,
  lineHeight: 1.5, color: '#94A3B8', width: '100%', cursor: 'pointer' };

/** onBack: the round back button (R3, R4); info: the note under the card; logo=false for long cards (R5 list). */
export default function RegFrame({ onBack, backLabel = 'Back', info, logo = true, children }) {
  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', background: '#8a9a2e', display: 'flex', flexDirection: 'column',
      fontFamily: FONT, color: C.text, position: 'relative', overflow: 'hidden' }}>
      <Ground />
      {onBack && (
        <button type="button" onClick={onBack} aria-label={backLabel} style={{ position: 'absolute', left: 8, top: 52, zIndex: 5,
          width: 40, height: 40, borderRadius: 9999, background: '#1F2733', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
        </button>
      )}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 44, gap: 60 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: '#FFFFFF' }}>nila</div>
        {logo && <img src={LOGO} alt="Nila" style={{ width: 120, height: 120 }} />}
      </div>
      <div style={{ flexGrow: 1, minHeight: 24 }} />
      <div style={{ position: 'relative', margin: '0 8px', background: '#121212', borderRadius: 24,
        boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '18px 22px',
        display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
      <div style={{ height: 28 }} />
      {info ? (
        <div style={{ position: 'relative', margin: '16px 8px 0 8px', background: '#121212', padding: '14px 16px', display: 'flex',
          gap: 12, alignItems: 'flex-start', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><InfoIcon /></div>
          <div style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, paddingBottom: 16 }}>{info}</div>
        </div>
      ) : <div style={{ height: 16 }} />}
    </div>
  );
}
