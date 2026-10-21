// The drag line on every map card (executive decision 21 Oct: all map screens behave as R5): drag down lowers the
// card — never off the screen, and never below the bottom tab bar where there is one; its top strip stays — drag up or a tap on the line brings it back; releasing snaps
// to the nearer end. `onLowered(bool)` lets a screen slide other parts (R5's info footer) with it.
import { useRef, useState } from 'react';

const EASE = 'cubic-bezier(0.2,0.8,0.2,1)';
const KEEP = 72;   // px of the card that stay on screen when lowered

export default function useSheetDrag(onLowered) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [off, setOff] = useState(0);
  const [moving, setMoving] = useState(false);
  const maxOff = () => {
    const el = ref.current;
    if (!el) return 0;
    const top = el.getBoundingClientRect().top - off;      // the card's top when not lowered
    // With a bottom tab bar (the app's map screens) the card stops above it; without one (R5–R8), above the screen's
    // bottom edge (executive decision 21 Oct).
    const nav = document.querySelector('nav[aria-label="Main"]');
    const floor = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    return Math.max(0, Math.round(floor - KEEP - top));
  };
  const setLow = (v) => { setOff(v ? maxOff() : 0); onLowered?.(v); };
  const down = (e) => { drag.current = { y: e.clientY, off, max: maxOff(), moved: false }; setMoving(true); e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    const v = Math.min(d.max, Math.max(0, d.off + dy));
    setOff(v);
    onLowered?.(v > 24);
  };
  const up = () => {
    const d = drag.current; drag.current = null; setMoving(false);
    if (!d) return;
    if (!d.moved) { setLow(off < 24); return; }                // a tap toggles
    setLow(off > d.max / 2);
  };
  const style = { transform: `translateY(${off}px)`, transition: moving ? 'none' : `transform 300ms ${EASE}` };
  const handle = (
    <div role="button" tabIndex={0} aria-label="Drag to move the card up or down"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLow(off < 24); }}
      style={{ alignSelf: 'center', display: 'flex', justifyContent: 'center', padding: '8px 60px', margin: '-4px auto -6px', cursor: 'grab', touchAction: 'none' }}>
      <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
    </div>
  );
  return { ref, style, handle };
}
