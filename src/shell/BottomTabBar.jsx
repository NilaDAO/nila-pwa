// Comp16BottomTabBar (nila-design components/Comp16BottomTabBar.md): 72 high, ink, 24 top radius;
// items 56 high, radius 12, 14/700; active = raised fill, text label, gold icon; one tab or none active.
import { C, FONT, SHADOW, TAB_BAR_HEIGHT } from './tokens';
import { AssetsIcon, CashIcon, CropPlanIcon, HarvestsIcon, MembersIcon, ScanIcon } from './icons';

export const MEMBER_TABS = [['crop', 'Crop plan', CropPlanIcon], ['assets', 'Assets', AssetsIcon]];
export const ASSISTED_TABS = [['crop', 'Crop plan', CropPlanIcon], ['scan', 'Scan', ScanIcon], ['assets', 'Assets', AssetsIcon]];
export const LEADER_TABS = [
  ['crop', 'Crop plan', CropPlanIcon], ['assets', 'Assets', AssetsIcon], ['members', 'Members', MembersIcon],
  ['cash', 'Cash', CashIcon], ['harvests', 'Harvests', HarvestsIcon],
];

export default function BottomTabBar({ tabs, active, onSelect }) {
  return (
    <nav aria-label="Main" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, height: TAB_BAR_HEIGHT, zIndex: 10,
      background: C.ink, borderRadius: '24px 24px 0 0', padding: 8, gap: 4, display: 'flex',
      boxSizing: 'border-box', boxShadow: SHADOW, fontFamily: FONT,
    }}>
      {tabs.map(([id, label, Icon]) => {
        const on = id === active;
        return (
          <button key={id} type="button" aria-current={on ? 'page' : undefined} onClick={() => onSelect(id)}
            style={{
              flex: 1, height: 56, borderRadius: 12, border: 0, cursor: 'pointer', display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: on ? C.raised : 'transparent', color: on ? C.text : C.muted,
              fontSize: 14, fontWeight: 700, lineHeight: 1, fontFamily: FONT,
            }}>
            <Icon color={on ? C.gold : C.muted} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
