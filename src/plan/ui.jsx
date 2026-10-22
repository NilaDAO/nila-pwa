// Shared crop-plan layout: the header band (map in P4c) and the bottom sheet of the CP boards.
import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef } from 'react';
import { useStage } from '../shell/stageCtx';
import { C, FONT, GRADIENT, R } from '../shell/tokens';
import useSheetDrag from '../shell/useSheetDrag';
import { SettingsButton } from '../shell/RoundButton';

/** head: header buttons in place of Back / name / Settings. top: the card's top (px) when it opens. onSwipe(±1): a
 *  sideways swipe on the card (A4/A5's ‹ asset › bar). */
/** full (map-central): the card takes the whole screen height, rising from where A1's card stands. */
export function Sheet({ title, children, landName, onBack, map, bar, resetKey, scroll, head: ownHead, top, onSwipe, full, startLow, onLowered }) {
  const drag = useSheetDrag(onLowered, resetKey, startLow);   // the drag line as on R5 (all map screens, 21 Oct)
  // DEVIATION (executive decision 21 Oct, map-central trial): in the map-central shell the one map behind the tabs
  // (shell/MapStage) draws this sheet's map, so it is never mounted again between screens.
  const stage = useStage();
  const staged = !!stage && isValidElement(map);
  useEffect(() => { if (staged && map.props.record) stage.set(map.props); });
  const shown = staged ? null : map;
  const x0 = useRef(null);
  const swipe = onSwipe ? {
    onTouchStart: (e) => { const t = e.touches[0]; x0.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e) => {
      const a = x0.current; x0.current = null; const t = e.changedTouches[0];
      if (!a || !t) return;
      const dx = t.clientX - a.x; const dy = t.clientY - a.y;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 40) onSwipe(dx < 0 ? 1 : -1);
    },
  } : {};
  // The card's own bottom padding clears the tab bar, so the shell's padding under it would only show map below the
  // card when scrolled to the end: off while a map sheet is open, so the card stays glued to the bottom.
  // Staged (map-central): the shell lets the map behind it show and take taps while this sheet is open; only the card,
  // the header buttons and the tab bar take them.
  const hasMap = !!map;
  useEffect(() => {
    const shell = hasMap && document.querySelector('[data-testid="shell"]');
    if (!shell) return undefined;
    const was = [shell.style.paddingBottom, shell.style.background, shell.style.pointerEvents];
    shell.style.paddingBottom = '0px';
    if (staged) { shell.style.background = 'transparent'; shell.style.pointerEvents = 'none'; }
    return () => { [shell.style.paddingBottom, shell.style.background, shell.style.pointerEvents] = was; };
  }, [hasMap, staged]);
  // Map-central (staged): the header is a row inside the card under the drag line, sticky while the card scrolls
  // (executive decision 21 Oct): Back, the land's name or the title, Settings; `head` replaces the row's content.
  const btnIn = { width: 40, height: 40, borderRadius: R.round, background: C.raised, border: 0, color: C.text, fontSize: 20, flexShrink: 0 };
  const inTitle = staged && !ownHead && (landName || title);
  // The card is drawn on the non-map screens' gradient (executive decision 21 Oct); the sticky header paints the same
  // gradient, sized to the card and shifted by where the header sits in it, so it never shows as a flat band.
  const cardBg = staged ? GRADIENT : C.ink;
  const headRef = useRef(null);
  useLayoutEffect(() => {
    if (!staged) return undefined;
    const paint = () => {
      const c = drag.ref.current; const h = headRef.current;
      if (!c || !h) return;
      h.style.backgroundSize = `100% ${c.offsetHeight}px`;
      h.style.backgroundPosition = `0 ${-(h.getBoundingClientRect().top - c.getBoundingClientRect().top)}px`;
    };
    paint();
    window.addEventListener('scroll', paint, { capture: true, passive: true });
    window.addEventListener('resize', paint);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
    if (ro && drag.ref.current) ro.observe(drag.ref.current);
    return () => {
      window.removeEventListener('scroll', paint, { capture: true }); window.removeEventListener('resize', paint); ro?.disconnect();
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const headRow = staged && (
    <div ref={headRef} data-sheet-head style={{ position: 'sticky', top: 0, zIndex: 3, background: GRADIENT, backgroundRepeat: 'no-repeat', margin: '0 -22px 8px', padding: '4px 22px 12px' }}>
      {ownHead || (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {onBack ? <button type="button" aria-label="Back" onClick={onBack} style={btnIn}>←</button> : <span style={{ width: 40 }} />}
          <span style={{ flexGrow: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{inTitle || ''}</span>
          <SettingsButton />
        </div>
      )}
    </div>
  );
  const head = ownHead || (
    <>
      {onBack && (
        <button type="button" aria-label="Back" onClick={onBack} style={{ pointerEvents: 'auto', position: 'absolute', zIndex: 2, left: 8, top: 18, width: 40, height: 40, borderRadius: R.round, background: C.ink, border: 0, color: C.text, fontSize: 20 }}>←</button>
      )}
      {landName && <span style={{ background: C.ink, borderRadius: R.round, padding: '8px 16px', fontWeight: 700, position: 'absolute', top: 18, zIndex: 2, pointerEvents: 'auto' }}>{landName}</span>}
      {/* Settings on every CP screen (executive decision 21 Oct; board CropPlanPending-n9mn-kewp): the round gear top right. */}
      <SettingsButton background={C.ink} style={{ pointerEvents: 'auto', position: 'absolute', zIndex: 2, right: 8, top: 18 }} />
    </>
  );
  if (scroll && map) {
    // The card scrolls inside its own area below the fixed header (board CropPlanTerms, data-sheet-scroll): the map
    // and the header buttons stay put, the card's content moves; the card always reaches the bottom of the screen.
    return (
      <div style={{ fontFamily: FONT, color: C.text, position: 'fixed', inset: 0, zIndex: 0, background: staged ? 'transparent' : '#25361f', pointerEvents: staged ? 'none' : undefined }}>
        {shown && <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>{isValidElement(shown) ? cloneElement(shown, { height: '100%' }) : shown}</div>}
        {!staged && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 76, zIndex: 5, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>{head}</div>}
        <div data-sheet-scroll style={{ position: 'absolute', left: 0, right: 0, top: 76, bottom: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none', zIndex: 4, pointerEvents: 'none' }}>
          <div aria-hidden="true" style={{ height: Math.max(120, Math.round(window.innerHeight / 3) - 76) }} />
          <section ref={drag.ref} className="cp-sheet" {...swipe} style={{ pointerEvents: 'auto', background: cardBg, borderRadius: '24px 24px 0 0', padding: '10px 22px 104px', boxSizing: 'border-box', minHeight: '100%', boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', ...drag.style }}>
            <style>{'.cp-sheet h1{margin:12px 0 24px!important;line-height:1.3}.cp-sheet [data-sheet-head] h1{margin:0!important}[data-sheet-scroll]::-webkit-scrollbar{display:none}'}</style>
            <div style={{ marginBottom: staged ? 4 : 16 }}>{drag.handle}</div>
            {headRow}
            <div style={staged ? { opacity: drag.low ? 0 : 1, visibility: drag.low ? 'hidden' : 'visible', transition: drag.low ? 'none' : 'opacity 200ms' } : undefined}>
              {title && !(inTitle && !landName) && <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', margin: '0 0 16px' }}>{title}</h1>}
              {children}
            </div>
          </section>
        </div>
      </div>
    );
  }
  return (
    <div style={{ fontFamily: FONT, color: C.text, position: 'relative', minHeight: '100dvh', background: stage ? 'transparent' : '#25361f', display: 'flex', flexDirection: 'column', pointerEvents: staged ? 'none' : undefined,
      // The card's rise (full) leaves its start offset as scrollable overflow in Chrome: clipped, so the page ends where
      // the card does (clip keeps the sticky header working, unlike hidden).
      overflow: staged ? 'clip' : undefined }}>
      {/* The map fills the whole screen behind the card (21 Oct), so dragging the card down shows more map. */}
      {shown && <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>{isValidElement(shown) ? cloneElement(shown, { height: '100%' }) : shown}</div>}
      {/* The band above the card takes the free height, so the card sits glued to the bottom (executive decision 21 Oct):
          a short card never floats mid-screen, and scrolling never lifts it further than its own height. */}
      <div style={{ height: map ? 'auto' : 180, flex: map ? '1 0 auto' : '0 0 auto', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: map ? 0 : 24, pointerEvents: map ? 'none' : 'auto' }}>
        {/* CP10 (a bar on the card): the card's top starts at the middle of the screen (board CropPlanQ3-xdlz). */}
        {map && <div style={{ height: full ? 24 : bar ? Math.round(window.innerHeight / 2) + 24 : top ?? 220 }} />}
      </div>
      {/* The header buttons stay fixed at the top, above map and card; they never scroll away (21 Oct) — with or without a map. */}
      {!staged && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 76, zIndex: 5, pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>{head}</div>}
      <div ref={drag.ref} className="cp-sheet" {...swipe} style={{ background: cardBg, borderRadius: '24px 24px 0 0', marginTop: -24, padding: '10px 22px 104px', position: 'relative', zIndex: 1, flexShrink: 0, pointerEvents: 'auto', minHeight: full ? '100dvh' : undefined, boxSizing: 'border-box', ...drag.style, ...(full && staged ? { animation: 'nila-rise 320ms cubic-bezier(0.2,0.8,0.2,1)' } : {}) }}>
        {full && staged && <style>{`@keyframes nila-rise{from{transform:translateY(${Math.round(window.innerHeight * 0.34) - 24}px)}to{transform:translateY(0)}}`}</style>}
        {/* Room around every CP title (executive decision 21 Oct), the sheet's title and the questions' alike. */}
        <style>{'.cp-sheet h1{margin:12px 0 24px!important;line-height:1.3}.cp-sheet [data-sheet-head] h1{margin:0!important}html,body{overscroll-behavior-y:none}'}</style>
        {/* CP10's season / area bar sits on top of the card and moves with it (board CropPlanQ3-xdlz). */}
        {bar && <div style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(100% + 12px)' }}>{bar}</div>}
        <div style={{ marginBottom: staged ? 4 : 16 }}>{drag.handle}</div>
        {headRow}
        {/* Lowered (map-central): the body fades out, so under the tab bar only the card's gradient shows. */}
        <div style={staged ? { opacity: drag.low ? 0 : 1, visibility: drag.low ? 'hidden' : 'visible', transition: drag.low ? 'none' : 'opacity 200ms' } : undefined}>
          {title && !(inTitle && !landName) && <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', margin: '0 0 16px' }}>{title}</h1>}
          {children}
        </div>
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

/** CP11's notice row (board CropPlanTerms): an amber icon — warning triangle or info circle — a bold line and muted text. */
export function Notice({ kind = 'warn', title, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.5, margin: '12px 0' }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        {kind === 'warn'
          ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>
          : <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>}
      </svg>
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {title && <span style={{ fontWeight: 700 }}>{title}</span>}
        <span style={{ color: C.muted }}>{children}</span>
      </span>
    </div>
  );
}
