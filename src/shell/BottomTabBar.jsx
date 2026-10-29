// Comp16BottomTabBar (nila-design components/Comp16BottomTabBar.md): 72 high, ink, 24 top radius;
// items 56 high, radius 12, 14/700; active = raised fill, text label, gold icon; one tab or none active.
// DEVIATION (executive decision 21 Oct, map-central trial): on a scroll down — the page, a card's own scroll area, or a
// map card dragged down — the bar goes compact: icons only, lower, a floating pill with all corners rounded and a margin
// to the screen's edges; a scroll up (or the card back up) brings it back. ~200 ms. A map card's drag floor reads the
// bar's top, so the bar tells it when it changes ('nila-tabbar').
import { useEffect, useState } from 'react';
import { C, FONT, S, SHADOW, TAB_BAR_HEIGHT } from './tokens';
import { AssetsIcon, CashIcon, CropPlanIcon, HarvestsIcon, MembersIcon, ScanIcon } from './icons';

export const MEMBER_TABS = [['crop', 'Crop plan', CropPlanIcon], ['assets', 'Assets', AssetsIcon]];
export const ASSISTED_TABS = [['crop', 'Crop plan', CropPlanIcon], ['scan', 'Scan', ScanIcon], ['assets', 'Assets', AssetsIcon]];
export const LEADER_TABS = [
  ['crop', 'Crop plan', CropPlanIcon], ['assets', 'Assets', AssetsIcon], ['members', 'Members', MembersIcon],
  ['cash', 'Cash', CashIcon], ['harvests', 'Harvests', HarvestsIcon],
];

const EASE = '200ms cubic-bezier(0.2,0.8,0.2,1)';
const COMPACT = 56;

/** True after a scroll down or a map card lowered; false after a scroll up or the card raised. */
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const last = new WeakMap();
    const onScroll = (e) => {
      const el = e.target === document || e.target === window ? document.scrollingElement : e.target;
      if (!el || typeof el.scrollTop !== 'number') return;
      const st = el.scrollTop; const was = last.get(el) ?? 0;
      last.set(el, st);
      if (st === was) return;   // a sideways scroller (the message slides) says nothing about up or down
      if (st - was > 6 && st > 24) setCompact(true);
      else if (was - st > 6 || st <= 0) setCompact(false);
    };
    const onLow = (e) => setCompact(!!e.detail);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('nila-sheet-low', onLow);
    return () => { window.removeEventListener('scroll', onScroll, { capture: true }); window.removeEventListener('nila-sheet-low', onLow); };
  }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent('nila-tabbar', { detail: compact })); }, [compact]);
  return compact;
}

export default function BottomTabBar({ tabs, active, onSelect }) {
  const compact = useCompact();
  const gap = 12;   // to the screen's bottom edge
  return (
    // Compact, the pill has the cards' side gutter (S.gutter), so its edges line up with the cards above it.
    <nav aria-label="Main" data-compact={compact ? '1' : undefined} style={{
      position: 'fixed', left: compact ? S.gutter : 0, right: compact ? S.gutter : 0, zIndex: 10,
      bottom: compact ? `calc(${gap}px + env(safe-area-inset-bottom, 0px))` : 0,
      height: compact ? COMPACT : TAB_BAR_HEIGHT,
      background: C.ink, borderRadius: compact ? 24 : '24px 24px 0 0', padding: compact ? 6 : 8, gap: 4, display: 'flex',
      boxSizing: 'border-box', boxShadow: SHADOW, fontFamily: FONT, pointerEvents: 'auto',   // also over the map stage
      transition: `left ${EASE}, right ${EASE}, bottom ${EASE}, height ${EASE}, padding ${EASE}, border-radius ${EASE}`,
    }}>
      {tabs.map(([id, label, Icon]) => {
        const on = id === active;
        return (
          <button key={id} type="button" aria-label={label} aria-current={on ? 'page' : undefined} onClick={() => onSelect(id)}
            style={{
              flex: 1, height: compact ? COMPACT - 12 : 56, borderRadius: compact ? 18 : 12, border: 0, cursor: 'pointer', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: compact ? 0 : 4,
              transition: `height ${EASE}, border-radius ${EASE}`,
              background: on ? C.raised : 'transparent', color: on ? C.text : C.muted,
              fontSize: 14, fontWeight: 700, lineHeight: 1, fontFamily: FONT,
            }}>
            <Icon color={on ? C.gold : C.muted} />
            <span aria-hidden="true" style={{ overflow: 'hidden', maxHeight: compact ? 0 : 16, opacity: compact ? 0 : 1, transition: `max-height ${EASE}, opacity ${EASE}` }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
