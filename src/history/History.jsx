// A12 — history (board History): her transactions, grouped by day (Today, Yesterday, date), newest first, from
// Stellar and from Polygon (the old app). DESIGN GAPs: no contact names ("From Mother Theresa Union" only where the
// call names the union); vouchers in hours and seed kg are not separate rows (the contract calls are); the Polygon
// part needs the Etherscan key the live build has.
import MapCard from '../shell/MapCard';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, R } from '../shell/tokens';
import { useHistory } from './hooks';

const day = (ts) => {
  const d = new Date(ts * 1000); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
const time = (ts) => new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

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
    <MapCard style={{ padding: 16, fontFamily: FONT, color: C.text }} header={{ title: 'History', onBack }}>
      {h.isLoading && <p style={{ color: C.muted }}>…</p>}
      {h.isError && <p style={{ color: C.coral }}>Your history could not be read. Try again.</p>}
      {h.isSuccess && !groups.length && <p style={{ color: C.muted }}>Nothing yet. Your payments and crop shares appear here.</p>}
      {groups.map(([g, rows]) => (
        <section key={g} style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, color: C.muted, margin: '12px 0 6px' }}>{g}</h2>
          <div style={{ background: C.ink, borderRadius: R.card, padding: '6px 16px' }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.raised}`, fontSize: 14 }}>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <b>{r.title}</b>
                  <span style={{ color: C.muted }}>{[r.sub, time(r.at), r.chain === 'polygon' ? 'Polygon' : null].filter(Boolean).join(' · ')}</span>
                </span>
                <b style={{ whiteSpace: 'nowrap', color: r.amount?.startsWith('+') ? C.accent : C.text }}>{r.amount}</b>
              </div>
            ))}
          </div>
        </section>
      ))}
      {h.data?.note && <p style={{ color: C.muted, fontSize: 13 }}>{h.data.note}</p>}
    </MapCard>
  );
}
