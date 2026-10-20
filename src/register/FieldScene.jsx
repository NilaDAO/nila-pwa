// The field scene behind registration and the move (R1–R14, M1–M4): nila-design/assets/field-bg (README there),
// design artifact v1752. R1 zooms from the wide view to the close view once per app start; every other frame, and
// R1 when she comes back, shows the close view. R5–R8 add a 45 % black layer; their markers are children, above it,
// in the same viewBox units so they never scale with the zoom. Reduced motion: the CSS jumps to the close view.
import { FIELD_SCENE } from './fieldSceneSvg';

const ZOOM_CSS = `.nl-fz{transform-box:view-box;transform-origin:200px 396px}
.nl-fz-close{transform:scale(5.5)}
.nl-fz-play{animation:nlFieldZoom 3.2s cubic-bezier(.6,0,.25,1) .4s both}
@keyframes nlFieldZoom{from{transform:scale(1)}to{transform:scale(5.5)}}
@media (prefers-reduced-motion: reduce){.nl-fz-play{animation:none;transform:scale(5.5)}}`;

let played = false;   // the zoom plays once per app start (README rule 2): memory only, never storage

export default function FieldScene({ mode = 'close', dim = false, children }) {
  const zoom = mode === 'zoom' && !played;
  if (zoom) played = true;
  return (
    <svg aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <style>{ZOOM_CSS}</style>
      <g className={`nl-fz ${zoom ? 'nl-fz-play' : 'nl-fz-close'}`} dangerouslySetInnerHTML={{ __html: FIELD_SCENE }} />
      {dim && <rect width="390" height="844" fill="rgba(0,0,0,0.45)" />}
      {children}
    </svg>
  );
}
