// The drag line on every map card (executive decision 21 Oct: all map screens behave as R5): drag down lowers the
// card — never off the screen, and never below the bottom tab bar where there is one; its top strip stays — drag up or a tap on the line brings it back; releasing snaps
// to the nearer end. `onLowered(bool)` lets a screen slide other parts (R5's info footer) with it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const EASE = 'cubic-bezier(0.2,0.8,0.2,1)';
const KEEP = 72;   // px of the card that stay on screen when lowered

// The bottom bar is the map's navigation while the card is down (24 Oct): a tab tapped with the card lowered opens
// the next screen lowered too, so only the map's filter and focus change.
let lastLow = false;
let tabLow = false;
export const keepLowOnTab = () => { tabLow = lastLow; };

/** resetKey: when it changes the card comes back up (CP10: a picked area). startLow: the card opens lowered (A1 coming
 *  back to the state it was left in, map-central trial). */
export default function useSheetDrag(onLowered, resetKey, startLow) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [off, setOff] = useState(0);
  const [moving, setMoving] = useState(false);
  const offRef = useRef(0);
  offRef.current = off;
  const maxOff = () => {
    const el = ref.current;
    if (!el) return 0;
    const top = el.getBoundingClientRect().top - offRef.current;      // the card's top when not lowered
    // With a bottom tab bar (the app's map screens) the card stops above it; without one (R5–R8), above the screen's
    // bottom edge (executive decision 21 Oct).
    const nav = document.querySelector('nav[aria-label="Main"]');
    const floor = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    // A card with a header strip (map-central, [data-sheet-head]) keeps all of it above the bar, plus a small gap.
    const head = el.querySelector('[data-sheet-head]');
    const keep = head ? Math.ceil(head.getBoundingClientRect().bottom - el.getBoundingClientRect().top) + 8 : KEEP;
    return Math.max(0, Math.round(floor - keep - top));
  };
  // The tab bar goes compact while the card is down (map-central trial, 'nila-sheet-low').
  const tell = (v) => window.dispatchEvent(new CustomEvent('nila-sheet-low', { detail: v }));
  const loweredAt = useRef(0);
  const setLow = (v) => {
    // Lowering starts from the top of the page, so the card's floor is measured where it will rest.
    if (v && window.scrollY > 0) window.scrollTo(0, 0);
    if (v) loweredAt.current = Date.now();
    lastLow = v;
    setOff(v ? maxOff() : 0); onLowered?.(v); tell(v);
  };
  // Any scroll while the card is down brings it back up with its content (map-central trial, 22 Oct): a lowered card
  // never rides up the screen with its body hidden.
  useEffect(() => {
    const on = () => {
      if (drag.current || offRef.current <= 0 || Date.now() - loweredAt.current < 500) return;
      setOff(0); onLowered?.(false); tell(false);
    };
    window.addEventListener('scroll', on, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', on, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The bar's height changes (compact or not): a lowered card is glued to its new top once the bar has moved.
  useEffect(() => {
    let t;
    const on = () => { clearTimeout(t); t = setTimeout(() => { if (!drag.current && offRef.current > 0) setOff(maxOff()); }, 220); };
    window.addEventListener('nila-tabbar', on);
    return () => { clearTimeout(t); window.removeEventListener('nila-tabbar', on); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The card's height changes with its content (CP10: overview ↔ area card): a lowered card is clamped again, so its
  // top strip and drag line always stay above the tab bar (21 Oct).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (drag.current || offRef.current <= 0) return;
      const max = maxOff();
      if (offRef.current > max) setOff(max);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A new resetKey brings the card back up; not on mount (a card opening lowered stays down).
  const firstKey = useRef(true);
  useEffect(() => { if (firstKey.current) { firstKey.current = false; return; } setOff(0); onLowered?.(false); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tell(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening lowered (A1 coming back, or a tab tapped with the card down, 24 Oct): placed down before the first paint,
  // with no movement; the content still loads inside, hidden.
  const [startedLow] = useState(() => { const v = !!(startLow || tabLow); tabLow = false; return v; });
  const [instant, setInstant] = useState(startedLow);   // no transition while it is placed down
  useLayoutEffect(() => {
    if (!startedLow) { lastLow = false; return; }
    lastLow = true;
    loweredAt.current = Date.now();   // the scroll reset of the tab change does not raise it
    setOff(maxOff()); onLowered?.(true); tell(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const style = { transform: `translateY(${off}px)`, transition: moving || instant ? 'none' : `transform 300ms ${EASE}` };
  const handle = (
    <div role="button" tabIndex={0} aria-label="Drag to move the card up or down"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLow(off < 24); }}
      style={{ alignSelf: 'center', display: 'flex', justifyContent: 'center', padding: '8px 60px', margin: '-4px auto -6px', cursor: 'grab', touchAction: 'none' }}>
      <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
    </div>
  );
  // low: the card is (being) lowered; a sheet fades its body then, so only the top strip shows (map-central trial).
  return { ref, style, handle, low: off > 24 && !moving, startedLow };
}
