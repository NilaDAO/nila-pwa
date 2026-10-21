// Shared crop-plan layout: the header band (map in P4c) and the bottom sheet of the CP boards.
import { cloneElement, isValidElement } from 'react';
import { C, FONT, R } from '../shell/tokens';
import useSheetDrag from '../shell/useSheetDrag';

export function Sheet({ title, children, landName, onBack, map }) {
  const drag = useSheetDrag();   // the drag line as on R5 (all map screens, 21 Oct)
  return (
    <div style={{ fontFamily: FONT, color: C.text, position: 'relative', minHeight: '100dvh', background: '#25361f' }}>
      {/* The map fills the whole screen behind the card (21 Oct), so dragging the card down shows more map. */}
      {map && <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>{isValidElement(map) ? cloneElement(map, { height: '100%' }) : map}</div>}
      <div style={{ height: map ? 'auto' : 180, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: map ? 0 : 24, pointerEvents: map ? 'none' : 'auto' }}>
        {map && <div style={{ height: 220 }} />}
        {onBack && (
          <button type="button" aria-label="Back" onClick={onBack} style={{ pointerEvents: 'auto', position: 'absolute', zIndex: 2, left: 8, top: 18, width: 40, height: 40, borderRadius: R.round, background: C.ink, border: 0, color: C.text, fontSize: 20 }}>←</button>
        )}
        <span style={{ background: C.ink, borderRadius: R.round, padding: '8px 16px', fontWeight: 700, position: map ? 'absolute' : 'static', top: 18, zIndex: 2 }}>{landName}</span>
        {/* Settings on every CP screen (executive decision 21 Oct; board CropPlanPending-n9mn-kewp): the round gear top right. */}
        <button type="button" aria-label="Settings" onClick={() => { window.location.hash = '#/settings'; }} style={{ pointerEvents: 'auto',
          position: 'absolute', zIndex: 2, right: 8, top: 18, width: 40, height: 40, borderRadius: R.round, background: C.ink, border: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      <div ref={drag.ref} className="cp-sheet" style={{ background: C.ink, borderRadius: '24px 24px 0 0', marginTop: -24, padding: '10px 22px 104px', position: 'relative', zIndex: 1, minHeight: 400, ...drag.style }}>
        {/* Room around every CP title (executive decision 21 Oct), the sheet's title and the questions' alike. */}
        <style>{'.cp-sheet h1{margin:12px 0 24px!important;line-height:1.3}'}</style>
        <div style={{ marginBottom: 16 }}>{drag.handle}</div>
        {title && <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', margin: '0 0 16px' }}>{title}</h1>}
        {children}
      </div>
    </div>
  );
}

export function Primary({ children, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{
      width: '100%', height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink,
      fontWeight: 700, fontSize: 14, fontFamily: FONT, marginTop: 16, opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

export function Choice({ children, sub, on, onClick, dot, check }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: C.raised,
      border: on && !check ? `2px solid ${C.accent}` : '2px solid transparent', borderRadius: 12, padding: '12px 16px',
      color: C.text, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, marginBottom: 8,
    }}>
      {dot && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: R.round, background: dot, flexShrink: 0 }} />}
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 700 }}>{children}</span>
        {sub && <span style={{ color: C.muted }}>{sub}</span>}
      </span>
      {check && (
        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${on ? C.accent : C.muted}`, background: on ? C.accent : 'transparent', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{on ? '✓' : ''}</span>
      )}
    </button>
  );
}

export function Steps({ items }) {
  return items.map(([title, body], i) => (
    <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <span style={{ width: 24, height: 24, borderRadius: R.round, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
      <span><span style={{ fontWeight: 700, display: 'block' }}>{title}</span><span style={{ color: C.muted }}>{body}</span></span>
    </div>
  ));
}

export const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const muted = { color: C.muted, fontSize: 14 };
