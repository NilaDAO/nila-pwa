// G1 (board LeaderGrowers): the leader's Members tab, a map card. The header is A1L's (History, All tasks, Settings);
// the card: "N growers", Add a member (→ L14), search with a scan button (her wallet QR, A1a → her row), and one
// row per grower: her name and a summary (coral when a loan is overdue); a row, or her property on the map, opens G2
// (#/members/<id>). No crop shares here (22 Oct): they belong under batches (the Harvests tab, later).
// Data: src/leader/unionMembers.js.
import { useMemo, useState } from 'react';
import { usePlanClient } from '../plan/hooks';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import RoundButton, { SettingsButton } from '../shell/RoundButton';
import { HistoryIcon, ScanIcon, UserPlusIcon } from '../shell/icons';
import { LeaderTasksButton } from '../shell/A1';
import { Loading } from '../register/Boot';
import AreaMap from '../plan/AreaMap';
import CameraView from '../shell/CameraView';
import ListRow from '../shell/ListRow';
import { inr } from '../plan/ui';
import { addressFromQr, useUnionMembers } from './unionMembers';

const PAGE = 10;
const MORE = 20;
// A row's second line: what she owes (coral when overdue), else where her onboarding stands, else her land.
function summary(m) {
  const owed = m.loans.reduce((a, x) => a + (x.left || 0), 0);
  if (owed > 0) return `${inr(owed)} owed${m.loans.some((x) => x.overdue) ? ' · overdue' : ''}`;
  return m.note || (m.lands.length ? `Land ${m.lands.join(', ')}` : 'Member');
}
/** The union's properties as one "record" for AreaMap: one area per member (her property), labelled with her name. */
function useUnionMap(list, onPick) {
  return useMemo(() => {
    const zones = list.flatMap((m) => m.places.map((p) => ({ zone_id: m.key, geometry: p.geometry })))
      .filter((z, i, a) => a.findIndex((y) => y.zone_id === z.zone_id) === i);
    if (!zones.length) return null;
    const labels = Object.fromEntries(list.map((m) => [m.key, { text: m.label }]));
    // Fitted with room for the name chips on the sides and for the lowered card and tab bar below.
    return <AreaMap record={{ zones }} labels={labels} onSelect={(z) => z && onPick(z)} fitSide={90} fitBottom={170} />;
  }, [list, onPick]);
}

export default function Members({ go }) {
  const api = usePlanClient();
  const members = useUnionMembers(api);
  const [q, setQ] = useState('');
  const [n, setN] = useState(PAGE);
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState('');
  const all = members.data || [];
  // A member picked on the map, in the list or by her QR opens G2.
  const pick = useMemo(() => (key) => { const m = all.find((x) => x.key === key); if (m) go(`members/${m.route}`); }, [all, go]);
  const map = useUnionMap(all, pick);
  if (members.isLoading) return <Loading />;
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((m) => [m.label, m.name, m.phone, m.address, ...m.lands.map(String)].some((v) => String(v || '').toLowerCase().includes(needle))) : all;
  const left = list.length - n;
  const onQr = (text) => {
    setScan(false);
    const g = addressFromQr(text);
    const m = g && all.find((x) => x.address === g);
    if (m) pick(m.key); else setMsg('Not a member of your union.');
  };
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <RoundButton label="History" onClick={() => go('history')}><HistoryIcon color={C.text} /></RoundButton>
      <LeaderTasksButton onClick={() => go('tasks')} />
      <SettingsButton onClick={() => go('settings')} />
    </div>
  );
  const field = { height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontFamily: FONT, fontSize: 14 };
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text }} head={head} map={map}>
      <section aria-label="Growers" style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: '14px 22px 22px',
        display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{list.length} grower{list.length === 1 ? '' : 's'}</h2>
          <button type="button" onClick={() => go('tasks/member')} style={{ ...field, height: 36, borderRadius: R.round, fontWeight: 700,
            padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <UserPlusIcon color={C.text} />Add a member
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); setMsg(''); }} placeholder="Search a member"
            aria-label="Search a member" style={{ ...field, flexGrow: 1, minWidth: 0, padding: '0 14px', outline: 'none', boxSizing: 'border-box' }} />
          <button type="button" aria-label="Scan her wallet QR" onClick={() => { setScan(!scan); setMsg(''); }}
            style={{ ...field, width: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ScanIcon color={C.text} />
          </button>
        </div>
        {scan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CameraView mode="qr" onText={onQr} />
            <span style={{ color: C.muted }}>Scan the QR on her Assets screen (her account number).</span>
          </div>
        )}
        {msg && <span style={{ color: C.coral, fontWeight: 700 }}>{msg}</span>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.raised}` }}>
          {list.slice(0, n).map((m, i) => (
            <ListRow key={m.key} first={i === 0} title={m.label} sub={<span style={{ color: m.loans.some((x) => x.overdue) ? C.coral : C.muted }}>{summary(m)}</span>}
              onClick={() => pick(m.key)} />
          ))}
          {!list.length && <li style={{ color: C.muted, padding: '12px 0', borderTop: `1px solid ${C.raised}` }}>
            {needle ? 'No member found.' : 'No members yet.'}</li>}
        </ul>
        {left > 0 && (
          <button type="button" onClick={() => setN(n + MORE)} style={{ ...field, fontWeight: 700, cursor: 'pointer' }}>
            Show {Math.min(MORE, left)} more of {left}
          </button>
        )}
      </section>
    </MapCard>
  );
}
