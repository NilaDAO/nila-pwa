// A12 — history (board History): her transactions, grouped by day (Today, Yesterday, date), newest first, from
// Stellar and from Polygon (the old app). DESIGN GAPs: no contact names ("From Mother Theresa Union" only where the
// call names the union); vouchers in hours and seed kg are not separate rows (the contract calls are); the Polygon
// part needs the Etherscan key the live build has.
// Board layout (22 Oct): one card per day (its date inside the card), each row a round arrow (out ← / in →), the title
// and a muted line, the amount on the right in white. Today and Yesterday show the time only; older days the row's
// detail (second pass, 22 Oct). No Polygon line under the cards (the board has none; A12 lists Stellar transactions).
import MapCard from '../shell/MapCard';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import { useHistory } from './hooks';

const day = (ts) => {
  const d = new Date(ts * 1000); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
const time = (ts) => new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const arrow = (out) => (
  <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: R.round, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {out ? <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></> : <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>}
    </svg>
  </span>
);
const card = { background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: '14px 22px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 };

export default function History({ onBack }) {
  const s = useNilaSigner();
  const h = useHistory(s?.stellarAddress, s?.evmAddress);
  const groups = [];
  for (const r of h.data?.rows || []) {
    const g = day(r.at);
    if (!groups.length || groups[groups.length - 1][0] !== g) groups.push([g, []]);
    groups[groups.length - 1][1].push(r);
  }
  return (
    <MapCard style={{ padding: 8, fontFamily: FONT, color: C.text }}
      header={{ title: 'History', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}>
      {h.isLoading && <p style={{ color: C.muted, padding: '0 14px' }}>…</p>}
      {h.isError && <p style={{ color: C.coral, padding: '0 14px' }}>Your history could not be read. Try again.</p>}
      {h.isSuccess && !groups.length && <p style={{ color: C.muted, padding: '0 14px' }}>Nothing yet. Your payments and crop shares appear here.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map(([g, rows]) => {
          const recent = g === 'Today' || g === 'Yesterday';
          return (
            <section key={g} aria-label={g} style={card}>
              <h2 style={{ margin: 0, paddingTop: 8, fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: C.muted }}>{g}</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                {rows.map((r, i) => (
                  <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', minHeight: 48, boxSizing: 'border-box',
                    fontSize: 14, lineHeight: 1.5, borderTop: i ? `1px solid ${C.raised}` : 0 }}>
                    {arrow(r.amount?.startsWith('−'))}
                    <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700 }}>{r.title}</span>
                      <span style={{ color: C.muted }}>{recent ? time(r.at) : r.sub || time(r.at)}</span>
                    </span>
                    {r.amount && <span style={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, textAlign: 'right' }}>{r.amount}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </MapCard>
  );
}
