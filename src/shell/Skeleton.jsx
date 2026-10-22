// Placeholder rows while an in-app list loads (22 Oct): the screen shows at once with these instead of S1 (S1 is
// only the full-screen start). A row is two grey bars in the list row's size (book Comp09), softly pulsing.
import { C } from './tokens';

const bar = (w, h) => ({ width: w, height: h, borderRadius: 6, background: C.raised });

export function SkeletonRows({ rows = 5 }) {
  return (
    <ul aria-label="Loading" aria-busy="true" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      <style>{'@keyframes nila-skel{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0', borderTop: i ? `1px solid ${C.raised}` : 0,
          animation: 'nila-skel 1.4s ease-in-out infinite' }}>
          <span style={bar(`${55 - (i % 3) * 10}%`, 14)} />
          <span style={bar(`${35 + (i % 2) * 10}%`, 12)} />
        </li>
      ))}
    </ul>
  );
}

/** A small dot while a list shown from the phone's copy is refreshed. */
export function UpdatingDot() {
  return (
    <span role="status" aria-label="Updating" title="Updating"
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.muted, animation: 'nila-skel 1.4s ease-in-out infinite' }}>
      <style>{'@keyframes nila-skel{0%,100%{opacity:.55}50%{opacity:1}}'}</style>
    </span>
  );
}
