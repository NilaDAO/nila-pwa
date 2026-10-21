// The round 40 px header button (A1's History and Settings) and the Settings button built on it, shared by A1 and
// every map screen (executive decision 21 Oct: one component, A1's filled gear everywhere).
import { C, R } from './tokens';
import { SettingsIcon } from './icons';

export default function RoundButton({ label, onClick, children, background = C.raised, style }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{
      width: 40, height: 40, borderRadius: R.round, background, border: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text, ...style,
    }}>{children}</button>
  );
}

/** Settings: opens #/settings unless `onClick` is given. */
export function SettingsButton({ onClick, background, style }) {
  return (
    <RoundButton label="Settings" background={background} style={style}
      onClick={onClick || (() => { window.location.hash = '#/settings'; })}><SettingsIcon /></RoundButton>
  );
}
