// The registration frame (boards RegWallet-ss0b, RegPhone-a6bc, RegCode-nflo, SendLocation-*, SheetVerify-88ia,
// RegUnion-nj7b, RegAssist, RegNotify-52am, RegDone-fji8): the olive field ground, the 'nila' wordmark and the logo,
// one dark card at the bottom, and the info note under it. Markup and values copied from the boards.
import { C, FONT } from '../shell/tokens';
import FieldScene from './FieldScene';
import FieldMap, { useFieldMapLoaded } from './FieldMap';

const LOGO = `${process.env.PUBLIC_URL || ''}/images/reg-logo.png`;

// Motion from the boards (Reg*, SendLocation*, SheetVerify-88ia): the card drops in (R1, R10), the info note slides
// up 120 ms later, the field sheet rises, confirms rise over a fading layer. Off with reduced motion.
const EASE = 'cubic-bezier(0.2,0.8,0.2,1)';
export const MOTION_CSS = `@keyframes card-drop{from{transform:translateY(-60px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes card-swap{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes card-rise{from{transform:translateY(100vh)}to{transform:translateY(0)}}
@keyframes confirm-rise{from{transform:translateY(600px)}to{transform:translateY(0)}}
@keyframes scrim-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.nila-motion{animation:none!important}}`;
export const anim = {
  drop: `card-drop 450ms ${EASE} both`, swap: `card-swap 450ms ${EASE} 120ms both`, rise: `card-rise 450ms ${EASE} both`,
  confirm: `confirm-rise 450ms ${EASE} both`, scrim: 'scrim-in 250ms ease both',
};

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
export default function RegFrame({ onBack, backLabel = 'Back', info, logo = true, drop = false, zoom = false, children }) {
  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', background: '#8a9a2e', display: 'flex', flexDirection: 'column',
      fontFamily: FONT, color: C.text, position: 'relative', overflow: 'hidden' }}>
      <style>{MOTION_CSS}</style>
      <FieldScene mode={zoom ? 'zoom' : 'close'} />
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
      <div className="nila-motion" style={{ animation: drop ? anim.drop : undefined, position: 'relative', margin: '0 8px', background: '#121212', borderRadius: 24,
        boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '18px 22px',
        display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
      <div style={{ height: 28 }} />
      {info ? (
        <div className="nila-motion" style={{ animation: anim.swap, position: 'relative', margin: '16px 8px 0 8px', background: '#121212', padding: '14px 16px', display: 'flex',
          gap: 12, alignItems: 'flex-start', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><InfoIcon /></div>
          <div style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, paddingBottom: 16 }}>{info}</div>
        </div>
      ) : <div style={{ height: 16 }} />}
    </div>
  );
}

// ── R5–R8 (boards SendLocation-*, SheetVerify-88ia) ──
// The field scene, close, under a 45 % black layer; her saved points as gold dots (the last one with a halo), or the
// plastic sheet and its marker; one bottom sheet with a drag line, 72 px above the bottom (notes reg-recover).
const DOTS = [[150, 365], [260, 290], [110, 250], [290, 420], [200, 200], [70, 400]];

function FieldGround({ points = 0, sheet = false }) {
  return (
    <FieldScene dim>
      {sheet ? (
        <>
          <rect x="128" y="218" width="44" height="44" rx="2" fill="#F1F5F9" transform="rotate(-8 150 240)" />
          <circle cx="186" cy="214" r="9" fill="#D4A634" stroke="#121212" strokeWidth="3" />
        </>
      ) : DOTS.slice(0, points).map(([x, y], i) => (i === points - 1 ? (
        <g key={i}><circle cx={x} cy={y} r="22" fill="rgba(212,166,52,0.25)" /><circle cx={x} cy={y} r="9" fill="#D4A634" stroke="#121212" strokeWidth="3" /></g>
      ) : <circle key={i} cx={x} cy={y} r="9" fill="#121212" stroke="#D4A634" strokeWidth="3" />))}
    </FieldScene>
  );
}

export const sheetText = { fontSize: 14, color: '#94A3B8', lineHeight: 1.5 };
export const fieldInput = { display: 'block', width: '100%', height: 44, borderRadius: 12, background: '#1F2733', padding: '0 14px',
  fontSize: 16, color: '#F1F5F9', border: 0, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', flexShrink: 0 };

/** R5–R7: the satellite map (FieldMap) once Google Maps is loaded; until then, offline or without a key, the scene. */
function MapOrScene({ map, points, me, pan, onCenter, start }) {
  const { ok } = useFieldMapLoaded();
  if (!ok) return <FieldGround points={points} />;
  return (
    <>
      <FieldMap points={map} me={me} pan={pan} onCenter={onCenter} start={start} />
      {pan && <PanPin />}
    </>
  );
}

/** Choose on the map: the pin at the map's centre marks where her point goes. */
function PanPin() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 2 }}>
      <svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(212,166,52,0.25)" />
        <circle cx="22" cy="22" r="9" fill="#D4A634" stroke="#121212" strokeWidth="3" /></svg>
    </div>
  );
}

/** R5 (board SendLocation-v3np, notes reg-r5, artifact v1755): the satellite map, a dark top gradient with the
 *  header in the place of the wordmark (no logo), one card dropping in, the info note at the bottom; `overlay` is
 *  the Share your location confirm. Background: the Google satellite map (executive decision 20 Oct: the same map as
 *  today's field registration; the note names Esri imagery), the field scene when Maps cannot load. */
export function MapFrame({ header, map = [], me, start, info, overlay, pan, onCenter, children }) {
  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', background: '#4a6632', display: 'flex', flexDirection: 'column',
      fontFamily: FONT, color: C.text, position: 'relative', overflow: 'hidden' }}>
      <style>{MOTION_CSS}</style>
      <MapOrScene map={map} points={map.length} me={me} start={start} pan={pan} onCenter={onCenter} />
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 160, pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)' }} />
      {/* The standard header chip (boards A6 TreeMap and the other map screens): a dark pill in the middle of the header. */}
      <h1 style={{ position: 'absolute', left: 56, right: 56, top: 52, height: 40, margin: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 3, pointerEvents: 'none' }}>
        <span style={{ padding: '0 14px', height: 40, borderRadius: 9999, background: 'rgba(18,18,18,0.85)',
          boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', display: 'flex', alignItems: 'center',
          fontSize: 16, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', color: '#F1F5F9' }}>{header}</span>
      </h1>
      <div style={{ height: 92 }} />
      <div style={{ flexGrow: 1, minHeight: 24 }} />
      <div className="nila-motion" style={{ animation: anim.drop, position: 'relative', margin: '0 8px', background: '#121212', borderRadius: 24,
        boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '18px 22px',
        display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
      <div style={{ height: 28 }} />
      {info && (
        <div className="nila-motion" style={{ animation: anim.swap, position: 'relative', margin: '16px 8px 0 8px', background: '#121212',
          padding: '14px 16px 30px', display: 'flex', gap: 12, alignItems: 'flex-start', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><InfoIcon /></div>
          <div style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5, alignSelf: 'center' }}>{info}</div>
        </div>
      )}
      {overlay}
    </div>
  );
}

export function FieldFrame({ points, sheet, map, pan, onCenter, children }) {
  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', background: '#8a9a2e', display: 'flex', flexDirection: 'column',
      fontFamily: FONT, color: C.text, position: 'relative', overflow: 'hidden' }}>
      <style>{MOTION_CSS}</style>
      {map ? <MapOrScene map={map} points={points} pan={pan} onCenter={onCenter} /> : <FieldGround points={points} sheet={sheet} />}
      <div className="nila-motion" style={{ animation: anim.rise, position: 'relative', marginTop: 'auto', marginBottom: 72, background: '#121212', borderRadius: 24,
        boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '18px 22px',
        display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div aria-hidden="true" style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.35)', alignSelf: 'center' }} />
        {children}
      </div>
    </div>
  );
}

// The bouncing logo (boards RegDone-fji8, RegCode-nflo sending): keyframes from the boards, off with reduced motion.
const KEYFRAMES = `@keyframes nila-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
@keyframes nila-shadow{0%,100%{transform:scaleX(1);opacity:1}50%{transform:scaleX(0.6);opacity:0.5}}
@media (prefers-reduced-motion: reduce){.nila-bounce,.nila-shadow{animation:none!important}}`;

export function Bouncing({ pad = 64, size = 48 }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: pad, paddingBottom: pad }}>
      <style>{KEYFRAMES}</style>
      <img className="nila-bounce" src={LOGO} alt="" style={{ width: size, height: size, animation: 'nila-bounce 1s ease-in-out infinite' }} />
      <div className="nila-shadow" style={{ width: size === 56 ? 36 : 32, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', animation: 'nila-shadow 1s ease-in-out infinite' }} />
    </div>
  );
}
