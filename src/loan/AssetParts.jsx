// The parts of the asset detail screens (boards MemberAssetNin A7, MemberAssetTractorScrolled-h3n0 A7b, StNinWithdraw A3):
// the screen frame on the gradient with the fixed header, the cards, the info rows, the amount stepper with its typed
// field and Max, the secondary button and the info note fixed above the tab bar.
import { createPortal } from 'react-dom';
import { useContext, useEffect, useState } from 'react';
import { SheetLowCtx } from '../shell/stageCtx';
import { C, FONT, R, SHADOW, TAB_BAR_HEIGHT } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { RefreshIcon } from '../shell/icons';

const settings = () => { window.location.hash = '#/settings'; };

/** An asset screen as a map card on the shared map (24 Oct, map-centred lane: Union investment, withdraw, cash-out),
 *  her property behind it; outside the map-central shell MapCard draws the header on the gradient as before. */
export function AssetScreen({ title = '', onBack, note, children }) {
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text }} header={{ title, onBack, onSettings: settings }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: note ? 120 : 16 }}>{children}</div>
      {note && <NoteBar>{note}</NoteBar>}
    </MapCard>
  );
}

export function Card({ label, children, style }) {
  return (
    <section aria-label={label} style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 16, ...style }}>{children}</section>
  );
}

export const CardTitle = ({ children, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{children}</span>{right}
  </div>
);

/** One info row: the name muted on the left, the value bold on the right. */
export function KV({ k, v, color = C.text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right', color }}>{v}</span>
    </div>
  );
}

export const Line = () => <div style={{ height: 1, background: C.raised }} />;

/** The Nila mark on a round tile: 56 px on accent (nIN), 72 px on gold (nIN invested). */
export function MarkCircle({ size = 56, bg = C.accent }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: R.round, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <img src="/images/reg-logo.png" alt="" style={{ width: size * 0.64, height: size * 0.64, filter: 'invert(1)' }} />
    </span>
  );
}

const sq = { width: 44, height: 44, flexShrink: 0, border: 0, borderRadius: R.button, background: C.raised, color: C.text, fontFamily: 'inherit',
  fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

/** − [amount unit] + Max. The typed amount is kept between min and max; without a max there is no Max button. */
export function Stepper({ value, set, step = 100, min = 0, max, unit, label }) {
  const clamp = (x) => Math.max(min, max == null ? x : Math.min(max, x));
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button type="button" aria-label="Less" style={sq} onClick={() => set(clamp(value - step))}>−</button>
      <label style={{ flex: 1, minWidth: 0, height: 44, borderRadius: R.button, background: C.raised, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', boxSizing: 'border-box', cursor: 'text' }}>
        <input type="text" inputMode="numeric" autoComplete="off" aria-label={label} placeholder="0" value={value.toLocaleString('en-IN')}
          onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ''); set(clamp(d ? parseInt(d, 10) : min)); }}
          style={{ flex: 1, minWidth: 0, width: '100%', border: 0, background: 'transparent', color: C.text, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, padding: 0, outline: 'none' }} />
        <span style={{ fontSize: 14, color: C.muted }}>{unit}</span>
      </label>
      <button type="button" aria-label="More" style={sq} onClick={() => set(clamp(value + step))}>+</button>
      {max != null && <button type="button" style={{ ...sq, width: 'auto', fontSize: 14, padding: '0 14px' }} onClick={() => set(clamp(max))}>Max</button>}
    </div>
  );
}

export function Secondary({ children, disabled, onClick, icon }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{ width: '100%', height: 44, flexShrink: 0, borderRadius: R.button, border: 0, background: C.raised,
      color: disabled ? C.muted : C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{icon}{children}</button>
  );
}

/** The info note fixed above the tab bar (boards A1a, A7, A3). */
export function NoteBar({ children }) {
  // Into the body (24 Oct): inside a map card (a moved, transformed sheet) a fixed note would follow the card instead
  // of sitting above the tab bar.
  // A lowered card takes its note down with it (24 Oct): it slides down and fades out, nothing of it under the tab bar.
  const low = useContext(SheetLowCtx);
  return createPortal(
    // Above the tab bar, not under it (24 Oct): it no longer tucks its lower edge behind the bar.
    <div role="note" style={{ position: 'fixed', left: 8, right: 8, bottom: TAB_BAR_HEIGHT + 8, zIndex: 5, background: C.ink, borderRadius: 24,
      padding: '14px 16px', boxSizing: 'border-box', boxShadow: SHADOW, display: 'flex', gap: 12, alignItems: 'flex-start',
      transform: low ? 'translateY(calc(100% + 24px))' : 'none', opacity: low ? 0 : 1, visibility: low ? 'hidden' : 'visible',
      transition: low ? 'transform 250ms ease, opacity 150ms ease, visibility 0s 250ms' : 'transform 250ms ease, opacity 150ms ease' }}>
      <div style={{ width: 32, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>{children}</div>
    </div>, document.body
  );
}

/** A QR in the white circle (A1a, A7b). */
export function QrCircle({ img, alt, onRefresh }) {
  // While the QR is being made (26 Oct): the same white circle, pulsing, with the app's skeleton timing — no jump.
  // An expired QR (the design's expired state, 29 Oct): the old QR faded in the white circle, a dark round badge in
  // the middle with the refresh icon (the design's clock); a tap makes a new QR.
  if (onRefresh) {
    return (
      <button type="button" onClick={onRefresh} aria-label="Make a new QR" style={{ position: 'relative', width: '100%', aspectRatio: '1',
        borderRadius: R.round, background: '#FFFFFF', border: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer' }}>
        {img && <img src={img} alt="" style={{ width: '62%', height: '62%', imageRendering: 'pixelated', opacity: 0.15 }} />}
        <span style={{ position: 'absolute', width: 64, height: 64, borderRadius: R.round, background: '#121212', display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}>
          <RefreshIcon size={28} color="#FFFFFF" />
        </span>
      </button>
    );
  }
  return (
    <div aria-busy={!img} style={{ width: '100%', aspectRatio: '1', borderRadius: R.round, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: img ? 'none' : 'nila-skel 1.4s ease-in-out infinite' }}>
      <style>{'@keyframes nila-skel{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
      {img ? <img src={img} alt={alt} style={{ width: '62%', height: '62%', imageRendering: 'pixelated' }} />
        : <span style={{ color: '#121212', fontSize: 14, fontWeight: 700 }}>Making your QR…</span>}
    </div>
  );
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

/** "Today, 10:00" or "21 Oct, 10:00". */
export function when(ts) {
  const d = new Date(ts * 1000);
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `Today, ${t}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${t}`;
}
