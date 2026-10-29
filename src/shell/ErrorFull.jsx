// A full-screen error, as the error boards draw it (N8 ErrorLoad, N6 TreeResultRejected): the dark ground, a coral
// round icon, a title, a line, an optional reason card, a primary and an optional secondary button.
const ground = { minHeight: '100dvh', boxSizing: 'border-box', background: 'linear-gradient(180deg, #121212 0%, #1E2738 100%)',
  fontFamily: "'Inter', system-ui, sans-serif", color: '#F1F5F9', position: 'relative', overflow: 'hidden' };
const btn = { height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', cursor: 'pointer', alignSelf: 'stretch' };

export default function ErrorFull({ title, text, rows = [], primary, onPrimary, secondary, onSecondary, busy = false }) {
  return (
    <div style={ground}>
      <div style={{ position: 'absolute', left: 24, right: 24, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        <span role="img" aria-label="Error" style={{ width: 72, height: 72, borderRadius: 9999, background: '#E69283', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#121212" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </span>
        <span role="heading" aria-level="1" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginTop: 8 }}>{title}</span>
        {text && <span style={{ fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>{text}</span>}
        {rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'stretch', background: '#121212', borderRadius: 24, padding: '18px 22px', marginTop: 12 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
                <span style={{ color: '#94A3B8' }}>{k}</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {primary && <button type="button" disabled={busy} onClick={onPrimary} style={{ ...btn, color: '#121212', background: '#D4CF5A', marginTop: 8, opacity: busy ? 0.5 : 1 }}>{primary}</button>}
        {secondary && <button type="button" onClick={onSecondary} style={{ ...btn, color: '#F1F5F9', background: '#1F2733' }}>{secondary}</button>}
      </div>
    </div>
  );
}
