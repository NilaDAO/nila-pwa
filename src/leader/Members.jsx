// G1 (board LeaderGrowers): the leader's Members tab, a map card. The header is A1L's (History, All tasks, Settings);
// the card: "N members" (land title holders, 24 Oct) and "Joining · K" (onboarding), Add a member (→ L14), search with a scan button (her wallet QR, A1a → her row), and one
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
import { SkeletonRows, UpdatingDot } from '../shell/Skeleton';
import CameraView from '../shell/CameraView';
import ListRow from '../shell/ListRow';
import { inr } from '../plan/ui';
import { addressFromQr, useUnionMembers } from './unionMembers';
import { scannedNewMember } from './AddMember';
import { memberOfQr } from '../stellar/session';
import { useLeaderMap } from './unionMap';

const PAGE = 10;
const MORE = 20;
// A row's second line: what she owes (coral when overdue), else where her onboarding stands, else her land.
function summary(m) {
  const owed = m.loans.reduce((a, x) => a + (x.left || 0), 0);
  if (owed > 0) return `${inr(owed)} owed${m.loans.some((x) => x.overdue) ? ' · overdue' : ''}`;
  return m.note || (m.lands.length ? `Land ${m.lands.join(', ')}` : 'Member');
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
  // The union map, Members filter (map-centred lane, 23 Oct): a tap opens G2, or her own Crop plan for the leader.
  const { map } = useLeaderMap('members');
  // No S1 here (22 Oct): the card shows at once; grey rows until the first list, the phone's copy meanwhile.
  const waiting = !members.data;
  // A pasted help QR or address finds the member by account (26 Oct).
  const needle = (addressFromQr(q.trim()) || q.trim()).toLowerCase();
  // A member holds a land title (24 Oct); people still onboarding (keypad link, fields sent, title on its way) are
  // listed under "Joining"; anyone else (no title and no onboarding, e.g. a test borrower) is not listed.
  const match = (m) => !needle || [m.label, m.name, m.phone, m.address, ...m.lands.map(String)].some((v) => String(v || '').toLowerCase().includes(needle));
  const joiningOf = (m) => !m.lands.length && (!!m.note || !!m.job || String(m.key).startsWith('keypad:'));
  const membersAll = all.filter((m) => m.lands.length);
  const list = membersAll.filter(match);
  const joining = all.filter(joiningOf).filter(match);
  const left = list.length - n;
  const onQr = (text) => {
    setScan(false);
    // Her crop share QR (her Ready share, 23 Oct): straight to L11 with that share picked.
    const share = /^nila:share:(\w+):/.exec(String(text || '').trim());
    if (share) { go(`loan/${share[1]}`); return; }
    const g = addressFromQr(text);
    const m = g && all.find((x) => x.address === g);
    if (m) { pick(m.key); return; }
    // Someone not in the list yet (29 Oct): an assist-mode smartphone's QR carries the Polygon address, so the
    // leader goes on to Add a member with it (name, phone, then the field points).
    const n = memberOfQr(text);
    if (n) { scannedNewMember(n); go('tasks/member/qr'); return; }
    setMsg('Not a member of your union.');
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
      <section aria-label="Members" style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: '14px 22px 22px',
        display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {waiting ? 'Members' : `${membersAll.length} member${membersAll.length === 1 ? '' : 's'}`}
            {members.isFetching && !waiting && <UpdatingDot />}
          </h2>
          <button type="button" onClick={() => go('tasks/member')} style={{ ...field, height: 36, borderRadius: R.round, fontWeight: 700,
            padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <UserPlusIcon color={C.text} />Add a member
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); setMsg(''); }} placeholder="Search a member"
            aria-label="Search a member" style={{ ...field, flexGrow: 1, minWidth: 0, padding: '0 14px', outline: 'none', boxSizing: 'border-box' }} />
          <button type="button" aria-label="Scan a wallet QR" onClick={() => { setScan(!scan); setMsg(''); }}
            style={{ ...field, width: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ScanIcon color={C.text} />
          </button>
        </div>
        {scan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CameraView mode="qr" onText={onQr} />
            <span style={{ color: C.muted }}>Scan the member's QR or account number.</span>
          </div>
        )}
        {msg && <span style={{ color: C.coral, fontWeight: 700 }}>{msg}</span>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.raised}` }}>
          {list.slice(0, n).map((m, i) => (
            <ListRow key={m.key} first={i === 0} title={m.label} sub={<span style={{ color: m.loans.some((x) => x.overdue) ? C.coral : C.muted }}>{summary(m)}</span>}
              onClick={() => pick(m.key)} />
          ))}
          {waiting && <li><SkeletonRows rows={5} /></li>}
          {!waiting && !list.length && <li style={{ color: C.muted, padding: '12px 0', borderTop: `1px solid ${C.raised}` }}>
            {needle ? 'No member found.' : 'No members yet.'}</li>}
        </ul>
        {left > 0 && (
          <button type="button" onClick={() => setN(n + MORE)} style={{ ...field, fontWeight: 700, cursor: 'pointer' }}>
            Show {Math.min(MORE, left)} more of {left}
          </button>
        )}
        {joining.length > 0 && (
          <>
            <span style={{ color: C.muted, fontWeight: 700, paddingTop: 4 }}>Joining · {joining.length}</span>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.raised}` }}>
              {joining.map((m, i) => (
                <ListRow key={m.key} first={i === 0} title={m.label} sub={<span style={{ color: C.muted }}>{m.note || 'App link sent'}</span>}
                  onClick={() => pick(m.key)} />
              ))}
            </ul>
          </>
        )}
      </section>
    </MapCard>
  );
}
