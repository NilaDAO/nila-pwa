// Shared crop-plan layout: the header band (map in P4c) and the bottom sheet of the CP boards.
import { C, FONT, R } from '../shell/tokens';

export function Sheet({ title, children, landName, onBack, map }) {
  return (
    <div style={{ fontFamily: FONT, color: C.text }}>
      <div style={{ background: '#25361f', height: map ? 'auto' : 180, position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: map ? 0 : 24 }}>
        {map && <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>{map}</div>}
        {map && <div style={{ height: 220 }} />}
        {onBack && (
          <button type="button" aria-label="Back" onClick={onBack} style={{ position: 'absolute', zIndex: 2, left: 8, top: 18, width: 40, height: 40, borderRadius: R.round, background: C.ink, border: 0, color: C.text, fontSize: 20 }}>←</button>
        )}
        <span style={{ background: C.ink, borderRadius: R.round, padding: '8px 16px', fontWeight: 700, position: map ? 'absolute' : 'static', top: 18, zIndex: 2 }}>{landName}</span>
      </div>
      <div style={{ background: C.ink, borderRadius: '24px 24px 0 0', marginTop: -24, padding: '10px 22px 24px', position: 'relative', minHeight: 400 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.35)', margin: '0 auto 16px' }} />
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
