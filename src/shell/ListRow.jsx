// The board's list (Tasks, LeaderBorders; Comp09 list item row): a card per category with a muted header, rows of a
// round icon tile, a bold title with one or two muted lines under it, and a chevron. The whole row is the button.
import { ChevronIcon } from './icons';
import RoundButton, { SettingsButton } from './RoundButton';
import { C, FONT, R, SHADOW } from './tokens';

export function ListSection({ label, title, action, children }) {
  return (
    <section aria-label={label || title} style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: '14px 22px',
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: FONT, color: C.text }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: C.muted }}>{title}</h2>
          {action}
        </div>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>{children}</ul>
    </section>
  );
}

/** icon: an icon component (icons.jsx); tone: 'urgent' (coral), 'new' (accent) or plain. first: no line above. */
export default function ListRow({ icon: Icon, tone, title, sub, sub2, onClick, first, trailing }) {
  const color = tone === 'urgent' ? C.coral : tone === 'new' ? C.accent : C.text;
  return (
    <li>
      <button type="button" onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, border: 0,
        borderTop: first ? 0 : `1px solid ${C.raised}`, background: 'transparent', padding: '12px 0', minHeight: 48, boxSizing: 'border-box',
        fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, color: C.text, textAlign: 'left', cursor: 'pointer' }}>
        {Icon && (
          <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: R.round, background: C.raised,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon color={color} /></span>
        )}
        <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700 }}>{title}</span>
          {sub && <span style={{ color: C.muted }}>{sub}</span>}
          {sub2 && <span style={{ color: C.muted }}>{sub2}</span>}
        </span>
        {trailing || <span style={{ flexShrink: 0, display: 'flex' }}><ChevronIcon color={C.muted} /></span>}
      </button>
    </li>
  );
}

/** The non-map screen header (boards Tasks, Settings): the round back button left, the title centred, Settings right. */
export function ScreenHeader({ title, onBack, onSettings }) {
  return (
    // Stays at the top while the screen scrolls (executive decision 21 Oct), with its own 12 px room above and below and
    // the gradient's top colour behind it, stretched to the screen's edges whatever the parent's padding.
    <div style={{ position: 'sticky', top: 0, zIndex: 3, padding: '12px 0', background: '#121212', boxShadow: '0 0 0 100vmax #121212', clipPath: 'inset(0 -100vmax)' }}>
    <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.text }}>
      {onBack && (
        <span style={{ position: 'absolute', left: 0, top: 0 }}>
          <RoundButton label="Back" onClick={onBack}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
          </RoundButton>
        </span>
      )}
      <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{title}</h1>
      <span style={{ position: 'absolute', right: 0, top: 0 }}><SettingsButton onClick={onSettings} /></span>
    </div>
    </div>
  );
}
