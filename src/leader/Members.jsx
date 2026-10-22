// G1 (board LeaderGrowers): the leader's Members tab — "N growers", Add a member (→ L14), search, and one accordion row
// per grower: her name, a summary of her crop shares (coral when one is overdue), and opened her crop shares with their
// state (Ready / Financed / Overdue, Planned before the share's start). Data: src/leader/unionMembers.js.
// DESIGN GAPs: the scan button next to search (A1b #leader, g1-scan) and G2 (member status) are not built, so a crop
// share row does not open anything yet; "Sold" needs sales (later).
import { useState } from 'react';
import { usePlanClient } from '../plan/hooks';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { UserPlusIcon } from '../shell/icons';
import { Loading } from '../register/Boot';
import { inr } from '../plan/ui';
import { amount } from '../loan/MyShares';
import { useUnionMembers } from './unionMembers';

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
function summary(shares) {
  if (!shares.length) return 'No crop share yet';
  const parts = [`${shares.length} crop share${shares.length === 1 ? '' : 's'}`];
  if (shares.some((x) => x.overdue)) parts.push('overdue');
  const ready = shares.filter((x) => kind(x) === 'ready').length;
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

export default function Members({ go }) {
  const api = usePlanClient();
  const members = useUnionMembers(api);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [n, setN] = useState(PAGE);
  if (members.isLoading) return <Loading />;
  const all = members.data || [];
  const needle = q.trim().toLowerCase();
  const list = needle ? all.filter((m) => [m.label, m.name, m.address, ...m.lands.map(String)].some((v) => String(v || '').toLowerCase().includes(needle))) : all;
  const left = list.length - n;
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text }} header={{ title: 'Members', onSettings: () => go('settings') }}>
      <section aria-label="Growers" style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: '14px 22px 22px',
        display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{list.length} grower{list.length === 1 ? '' : 's'}</h2>
          <button type="button" onClick={() => go('tasks/member')} style={{ height: 36, borderRadius: R.round, border: 0, background: C.raised,
            color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <UserPlusIcon color={C.text} />Add a member
          </button>
        </div>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} placeholder="Search a member"
          aria-label="Search a member" style={{ height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text,
            fontFamily: FONT, fontSize: 14, padding: '0 14px', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {list.slice(0, n).map((m) => {
            const isOpen = open === m.address;
            const due = m.shares.some((x) => x.overdue);
            return (
              <li key={m.address} style={{ borderTop: `1px solid ${C.raised}` }}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : m.address)} style={{ width: '100%',
                  display: 'flex', alignItems: 'center', gap: 12, border: 0, background: 'transparent', padding: '12px 0', fontFamily: FONT,
                  fontSize: 14, lineHeight: 1.5, color: C.text, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700 }}>{m.label}</span>
                    <span style={{ color: due ? C.coral : C.muted }}>{summary(m.shares)}</span>
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
            {needle ? 'No member found.' : 'No members with a border job, a crop plan or a loan yet.'}</li>}
        </ul>
        {left > 0 && (
          <button type="button" onClick={() => setN(n + MORE)} style={{ height: 44, borderRadius: R.button, border: 0, background: C.raised,
            color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Show {Math.min(MORE, left)} more of {left}
          </button>
        )}
      </section>
    </MapCard>
  );
}
