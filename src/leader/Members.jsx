// G1 (board LeaderGrowers): the leader's Members tab, a map card. The header is A1L's (History, All tasks, Settings);
// the card: "N growers", Add a member (→ L14), search with a scan button (her wallet QR, A1a → her row), and one
// accordion row per grower: her name, a summary of her crop shares (coral when one is overdue), and opened her crop
// shares with their state (Ready / Financed / Overdue, Planned before the share's start). The map behind shows every
// property of the union with its name; tapping one opens that member's row, opening a row fits the map to her property.
// Data: src/leader/unionMembers.js.
// DESIGN GAPs: G2 (member status) is not built, so a crop share row opens nothing yet; "Sold" needs sales (later).
import { useMemo, useState } from 'react';
import { usePlanClient } from '../plan/hooks';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import RoundButton, { SettingsButton } from '../shell/RoundButton';
import { HistoryIcon, ScanIcon, UserPlusIcon } from '../shell/icons';
import { LeaderTasksButton } from '../shell/A1';
import { Loading } from '../register/Boot';
import AreaMap from '../plan/AreaMap';
import { Camera } from '../loan/LoanScreens';
import { inr } from '../plan/ui';
import { amount } from '../loan/MyShares';
import { addressFromQr, useUnionMembers } from './unionMembers';

const PAGE = 10;
const MORE = 20;
const PILL = {
  ready: ['Ready', 'rgba(212,207,90,0.18)', C.accent],
  fin: ['Financed', C.ink, C.muted],
  due: ['Overdue', 'rgba(230,146,131,0.18)', C.coral],
  plan: ['Planned', C.ink, C.muted],
};
const kind = (x) => (x.overdue ? 'due' : x.drawn ? 'fin' : x.ready ? 'ready' : 'plan');
const when = (d) => {
  if (!d) return '';
  const t = new Date(d); const day = t.getDate();
  const part = day <= 10 ? 'start of' : day <= 20 ? 'mid' : 'end of';
  const y = t.getFullYear() !== new Date().getFullYear() ? ` ${t.getFullYear()}` : '';
  return `${part} ${t.toLocaleDateString('en-GB', { month: 'short' })}${y}`;
};
function summary(m) {
  if (!m.shares.length) return m.note || 'No crop share yet';
  const parts = [`${m.shares.length} crop share${m.shares.length === 1 ? '' : 's'}`];
  if (m.shares.some((x) => x.overdue)) parts.push('overdue');
  const ready = m.shares.filter((x) => kind(x) === 'ready').length;
  if (ready) parts.push(`${ready} ready`);
  return parts.join(' · ');
}
const Chevron = ({ open }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, transform: `rotate(${open ? 180 : 0}deg)` }}><path d="m6 9 6 6 6-6" /></svg>
);

function Share({ x }) {
  const [label, bg, fg] = PILL[kind(x)];
  const sub = [when(x.harvest), x.kg ? amount(x.kg) : '', x.left > 0 ? `${inr(x.left)} to repay` : ''].filter(Boolean).join(' · ')
    || (x.area ? `Area ${x.area}` : '');
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: R.button, padding: '10px 14px', minHeight: 56 }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, borderRadius: R.round, background: x.colour || C.muted }} />
      <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 700 }}>{x.crop}</span>
        <span style={{ color: C.muted }}>{sub}</span>
      </span>
      <span style={{ flexShrink: 0, height: 24, borderRadius: R.round, padding: '0 8px', display: 'flex', alignItems: 'center',
        fontSize: 12, fontWeight: 700, background: bg, color: fg }}>{label}</span>
    </li>
  );
}

/** The union's properties as one "record" for AreaMap: one area per member (her property), labelled with her name. */
function useUnionMap(list, open, onPick) {
  return useMemo(() => {
    const zones = list.flatMap((m) => m.places.map((p) => ({ zone_id: m.key, geometry: p.geometry })))
      .filter((z, i, a) => a.findIndex((y) => y.zone_id === z.zone_id) === i);
    if (!zones.length) return null;
    const labels = Object.fromEntries(list.map((m) => [m.key, { text: m.label }]));
    return <AreaMap record={{ zones }} labels={labels} selected={open || null} onSelect={(z) => onPick(z || '')} />;
  }, [list, open, onPick]);
}

export default function Members({ go }) {
  const api = usePlanClient();
  const members = useUnionMembers(api);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [n, setN] = useState(PAGE);
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState('');
  const all = members.data || [];
  // A member picked on the map or by her QR: her row opens and comes into view.
  const pick = useMemo(() => (key) => {
    setOpen(key); setMsg('');
    if (!key) return;
    const i = all.findIndex((m) => m.key === key);
    if (i >= n) setN(i + 1);
    setTimeout(() => document.getElementById(`member-${key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }, [all, n]);
  const map = useUnionMap(all, open, pick);
  if (members.isLoading) return <Loading />;
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((m) => [m.label, m.name, m.phone, m.address, ...m.lands.map(String)].some((v) => String(v || '').toLowerCase().includes(needle))) : all;
  const left = list.length - n;
  const onQr = (text) => {
    setScan(false);
    const g = addressFromQr(text);
    const m = g && all.find((x) => x.address === g);
    if (m) { setQ(''); pick(m.key); } else setMsg('Not a member of your union.');
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
            <Camera onText={onQr} />
            <span style={{ color: C.muted }}>Scan the QR on her Assets screen (her account number).</span>
          </div>
        )}
        {msg && <span style={{ color: C.coral, fontWeight: 700 }}>{msg}</span>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {list.slice(0, n).map((m) => {
            const isOpen = open === m.key;
            const due = m.shares.some((x) => x.overdue);
            return (
              <li key={m.key} id={`member-${m.key}`} style={{ borderTop: `1px solid ${C.raised}` }}>
                <button type="button" aria-expanded={isOpen} onClick={() => pick(isOpen ? '' : m.key)} style={{ width: '100%',
                  display: 'flex', alignItems: 'center', gap: 12, border: 0, background: 'transparent', padding: '12px 0', fontFamily: FONT,
                  fontSize: 14, lineHeight: 1.5, color: C.text, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700 }}>{m.label}</span>
                    <span style={{ color: due ? C.coral : C.muted }}>{summary(m)}</span>
                  </span>
                  <Chevron open={isOpen} />
                </button>
                {isOpen && m.shares.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {m.shares.map((x) => <Share key={x.token} x={x} />)}
                  </ul>
                )}
              </li>
            );
          })}
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
