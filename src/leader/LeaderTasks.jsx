// L1 — the leader's Tasks tab (board LeaderBorders) and L5 — "Who is it for?" (board LeaderPickMember). P10c.
// "To do": the union's tasks the contracts and the node give today (plans to approve, crop share requests, cash to
// settle, LPs who arrived, paybacks coming and overdue), with a search. "Start a task": the board's groups, each
// row opening the flow that exists. DESIGN GAPs: no member names (land and short address); not built yet and left
// out of the list: Make a crop plan with a member, Change her crop plan, Get cash and
// vouchers for her, Withdraw her investment, Use machine hours / seeds for her, Register trees, Add field note,
// Add a water source, Farm improvements; "Your own" tasks; crop not seen, price updates. P11: field border checks
// (L1 "Check field borders" → L2a–L4) from the node's border jobs (O16). P8: Add a member (L14, O17).
import { useState } from 'react';
import { usePlanClient } from '../plan/hooks';
import { useLpStatus } from '../anchor/hooks';
import { useUnionOffers } from '../anchor/hooks';
import { useBorderJobs } from '../border/hooks';
import { useKeypadMembers } from '../keypad/hooks';
import { memberName } from '../border/LeaderBorder';
import { C, FONT } from '../shell/tokens';
import ListRow, { ListSection, ScreenHeader } from '../shell/ListRow';
import MapCard from '../shell/MapCard';
import { BanknoteIcon, CalendarIcon, CropIcon, PayOutIcon, PinIcon, RepayIcon, RupeeIcon, TractorIcon, UserPlusIcon } from '../shell/icons';
import { useKnownMembers, useLeaderTodo, useUnionCash } from './hooks';
import { ReadyShareRows, useMyShares } from '../loan/MyShares';

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');

/** L5: the members the app knows, or scan her wallet. */
export function PickMember({ title, onPick, onBack, onScan }) {
  const api = usePlanClient();
  const members = useKnownMembers(api);
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ScreenHeader title={title} onBack={onBack} />
      <ListSection title="Who is it for?">
        {members.isLoading && <li style={{ color: C.muted, padding: '12px 0' }}>…</li>}
        {(members.data || []).map((m, i) => (
          <ListRow key={m.address} first={i === 0} icon={PinIcon} title={m.lands.length ? `Land ${m.lands.join(', ')}` : 'Member'} sub={short(m.address)} onClick={() => onPick(m.address)} />
        ))}
        {members.isSuccess && !members.data.length && <li style={{ color: C.muted, padding: '12px 0' }}>No members with a crop plan or a crop share yet.</li>}
        {onScan && <ListRow first={!members.data?.length} icon={PayOutIcon} title="Scan a wallet QR" sub="A member not in the list" onClick={onScan} />}
      </ListSection>
    </div>
  );
}

// The board's groups (LeaderBorders "Start a task"), only the rows whose flow exists; icons as on the board.
// "Scan an LP code" has no board row (LP scan, P9): it keeps the cash icon.
const START = [
  ['Members', [['Add a member', 'send the app link', 'tasks/member', UserPlusIcon],
    ['Make a crop plan', 'Scan the member\'s QR, then plan together', 'cash/scanplan', CropIcon]]],
  // One scan for her (executive decision 24 Oct): the QR says which kind, the chain picks invest, withdraw, use or
  // repay. Her G2 in Members stays a second way in.
  ['Cash', [['Scan a member QR', 'Invest, use a crop share, repay or pay out', 'cash/scan', PayOutIcon],
    ['Scan an LP code', 'An LP brings or collects cash', 'cash/lpscan', BanknoteIcon]]],
  ['Vouchers', [['Register a machine', 'The owner\'s machine, photos and price', 'cash/machine', TractorIcon]]],
];

// To do icons by task kind (board LeaderBorders): accent for a new item to act on, coral for an overdue one.
const KIND = { approve: [CropIcon, 'new'], share: [RupeeIcon, 'new'], collect: [RepayIcon], payback: [CalendarIcon],
  settle: [BanknoteIcon], lp: [BanknoteIcon], border: [PinIcon] };

export default function LeaderTasks({ go }) {
  const api = usePlanClient();
  const cash = useUnionCash().data;
  const todo = useLeaderTodo(api, cash);
  const offers = useUnionOffers().data || [];
  const borders = useBorderJobs().data || [];
  const keypads = useKeypadMembers().data || [];
  const lp = useLpStatus().data;
  const ownReady = (useMyShares().data || []).some((x) => x.ready);
  const [q, setQ] = useState('');
  const now = Date.now() / 1000;
  const items = [...(todo.data || [])];
  if (cash && cash.atHand > 0) {
    const first = cash.escrows.find((e) => e.remaining > 0);
    const h = first ? Math.max(0, Math.ceil((first.expires - now) / 3600)) : null;
    items.unshift({ key: 'settle', title: `Settle cash ${inr(cash.atHand)}`, who: h != null ? `${h} h left` : '', to: 'cash/settle', urgent: h != null && h < 24 });
  }
  for (const o of offers.filter((x) => x.state === 1 && x.expires > now)) {
    items.unshift({ key: `lp-${o.id}`, title: o.kind === 0 ? 'LP brings cash' : 'LP collects cash', amount: o.inr, who: `LP ${short(o.lp)} · Here`, to: 'cash/lpscan' });
  }
  for (const j of borders.filter((x) => x.status !== 'minted')) {
    items.unshift({ key: `border-${j.id}`, title: 'Check field borders', who: `${memberName(j)} · ${j.fields} fields`, to: `tasks/border/${j.id}`, ready: j.status === 'ready' });
  }
  // A keypad member with no fields yet (26 Oct): the leader takes the field points on the leader's phone (R5–R7),
  // with or without the member's phone set up.
  for (const m of keypads.filter((x) => x.phone_type === 'keypad' && !x.job)) {
    items.unshift({ key: `border-pts-${m.id}`, title: 'Take field points', who: m.name, to: `tasks/member/${m.id}/points`, ready: true });
  }
  const shown = items.filter((t) => !q || `${t.title} ${t.who}`.toLowerCase().includes(q.toLowerCase()));
  const row = (t, i) => {
    const [icon, tone] = KIND[t.key.split('-')[0]] || [];
    return <ListRow key={t.key} first={i === 0} icon={icon} tone={t.urgent ? 'urgent' : t.ready ? 'new' : tone}
      title={t.amount ? `${t.title} ${inr(t.amount)}` : t.title} sub={t.who} onClick={() => go(t.to)} />;
  };
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: 'Tasks', onBack: () => go('assets'), onSettings: () => go('settings') }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, borderRadius: 12, background: C.raised, padding: '0 14px', boxSizing: 'border-box', marginTop: -12 }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" aria-label="Search a task" placeholder="Search a task" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: C.text, fontFamily: 'inherit', fontSize: 16, outline: 'none' }} />
      </label>
      <ListSection title="To do">
        {todo.isLoading && <li style={{ color: C.muted, padding: '12px 0' }}>…</li>}
        {shown.map(row)}
        {todo.isSuccess && !shown.length && <li style={{ color: C.muted, padding: '12px 0' }}>{q ? 'No tasks match.' : 'Nothing to do now.'}</li>}
      </ListSection>
      {/* L1 'Your own' (notes leader-missing): her member tasks — a leader is also a member. Today the member app's own
          task is the LP's cash offers; her crop plan and shares are on the Crop plan and Assets tabs. */}
      <ListSection title="Your own">
        <ReadyShareRows go={go} />
        {lp?.lp && lp?.trustline && <ListRow first={!ownReady} icon={BanknoteIcon} title="Cash offers" sub="As an LP" onClick={() => go('offers')} />}
        {!ownReady && !(lp?.lp && lp?.trustline) && <li style={{ color: C.muted, padding: '12px 0' }}>Nothing of your own to do.</li>}
      </ListSection>
      <h2 style={{ margin: '8px 0 -8px 14px', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Start a task</h2>
      {START.map(([group, rows]) => (
        <ListSection key={group} title={group}>
          {rows.map(([title, sub, to, icon], i) => <ListRow key={title} first={i === 0} icon={icon} title={title} sub={sub} onClick={() => go(to)} />)}
        </ListSection>
      ))}
    </MapCard>
  );
}
