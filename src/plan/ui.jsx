// Shared crop-plan layout: the header band (map in P4c) and the bottom sheet of the CP boards.
import { cloneElement, isValidElement, useEffect } from 'react';
import { C, FONT, R } from '../shell/tokens';
import useSheetDrag from '../shell/useSheetDrag';
import { SettingsButton } from '../shell/RoundButton';

export function Sheet({ title, children, landName, onBack, map, bar }) {
  const drag = useSheetDrag();   // the drag line as on R5 (all map screens, 21 Oct)
  // The card's own bottom padding clears the tab bar, so the shell's padding under it would only show map below the
  // card when scrolled to the end: off while a map sheet is open, so the card stays glued to the bottom.
  useEffect(() => {
    const shell = map && document.querySelector('[data-testid="shell"]');
    if (!shell) return undefined;
    const was = shell.style.paddingBottom;
    shell.style.paddingBottom = '0px';
    return () => { shell.style.paddingBottom = was; };
  }, [map]);
  return (
    <div style={{ fontFamily: FONT, color: C.text, position: 'relative', minHeight: '100dvh', background: '#25361f', display: 'flex', flexDirection: 'column' }}>
      {/* The map fills the whole screen behind the card (21 Oct), so dragging the card down shows more map. */}
      {map && <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>{isValidElement(map) ? cloneElement(map, { height: '100%' }) : map}</div>}
      {/* The band above the card takes the free height, so the card sits glued to the bottom (executive decision 21 Oct):
          a short card never floats mid-screen, and scrolling never lifts it further than its own height. */}
      <div style={{ height: map ? 'auto' : 180, flex: map ? '1 0 auto' : '0 0 auto', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: map ? 0 : 24, pointerEvents: map ? 'none' : 'auto' }}>
        {map && <div style={{ height: 220 }} />}
        {onBack && (
          <button type="button" aria-label="Back" onClick={onBack} style={{ pointerEvents: 'auto', position: 'absolute', zIndex: 2, left: 8, top: 18, width: 40, height: 40, borderRadius: R.round, background: C.ink, border: 0, color: C.text, fontSize: 20 }}>←</button>
        )}
        <span style={{ background: C.ink, borderRadius: R.round, padding: '8px 16px', fontWeight: 700, position: map ? 'absolute' : 'static', top: 18, zIndex: 2 }}>{landName}</span>
        {/* Settings on every CP screen (executive decision 21 Oct; board CropPlanPending-n9mn-kewp): the round gear top right. */}
        <SettingsButton background={C.ink} style={{ pointerEvents: 'auto', position: 'absolute', zIndex: 2, right: 8, top: 18 }} />
      </div>
      <div ref={drag.ref} className="cp-sheet" style={{ background: C.ink, borderRadius: '24px 24px 0 0', marginTop: -24, padding: '10px 22px 104px', position: 'relative', zIndex: 1, flexShrink: 0, ...drag.style }}>
        {/* Room around every CP title (executive decision 21 Oct), the sheet's title and the questions' alike. */}
        <style>{'.cp-sheet h1{margin:12px 0 24px!important;line-height:1.3}html,body{overscroll-behavior-y:none}'}</style>
        {/* CP10's season / area bar sits on top of the card and moves with it (board CropPlanQ3-xdlz). */}
        {bar && <div style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(100% + 12px)' }}>{bar}</div>}
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
