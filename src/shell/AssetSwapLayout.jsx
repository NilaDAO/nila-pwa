// One layout for a leader's money asset with a switch (22 Oct): A9 USDC (Send | Swap) and A7 nIN (Cash out | Swap).
// A full-height map card: the asset card (icon, name and value line, amount and its rupee value), then ONE card with
// the shared Segmented switch at its top and the chosen form, then the info note.
import MapCard from './MapCard';
import Segmented from './Segmented';
import { KV } from '../loan/AssetParts';
import { Notice } from '../plan/ui';
import { C, FONT, R, SHADOW, TAB_BAR_HEIGHT } from './tokens';

export const assetCard = { background: C.ink, borderRadius: 24, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box' };
export const money = (n, d = 2) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const label = { fontSize: 14, fontWeight: 700 };

/** The "To" box of a swap: where the money goes and the rate. */
export const SwapTarget = ({ title, rate }) => (
  <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderRadius: R.button, background: C.raised }}>
    <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
    <span style={{ fontSize: 14, color: C.muted }}>{rate}</span>
  </div>
);

/** Form rows: "To" (optional), "Amount" with its stepper, the key / value lines, then the button. */
export function AssetForm({ to, amount, rows = [], button }) {
  return (
    <>
      {to && <><span style={label}>To</span>{to}</>}
      <span style={label}>Amount</span>
      {amount}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.filter(Boolean).map(([k, v, color]) => <KV key={k} k={k} v={v} color={color} />)}
      </div>
      {button}
    </>
  );
}

export default function AssetSwapLayout({ onBack, icon, name, sub, amount, value, head, options, tab, onTab, switchLabel, children, after, note }) {
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, minHeight: `calc(100dvh - ${TAB_BAR_HEIGHT + 16}px)`, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: '', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}>
      <section aria-label={name} style={assetCard}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 24px' }}>{icon}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{name}</span>
            <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{sub}</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{amount}</span>
            {value && <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{value}</span>}
          </span>
        </div>
        {head}
      </section>
      {children && (
        <section aria-label={switchLabel} style={{ ...assetCard, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {options && <Segmented label={switchLabel} options={options} value={tab} onChange={onTab} />}
          {children}
        </section>
      )}
      {after}
      {note && (
        <section style={{ ...assetCard, paddingTop: 10, paddingBottom: 10 }}>
          <Notice kind="info">{note}</Notice>
        </section>
      )}
    </MapCard>
  );
}
