// L1 — the leader's Tasks tab (board LeaderBorders) and L5 — "Who is it for?" (board LeaderPickMember). P10c.
// "To do": the union's tasks the contracts and the node give today (plans to approve, crop share requests, cash to
// settle, LPs who arrived, paybacks coming and overdue), with a search. "Start a task": the board's groups, each
// row opening the flow that exists. DESIGN GAPs: no member names (land and short address); not built yet and left
// out of the list: Add a member (L14, keypad), Make a crop plan with a member, Change her crop plan, Get cash and
// vouchers for her, Withdraw her investment, Use machine hours / seeds for her, Register trees, Add field note,
// Add a water source, Farm improvements; "Your own" tasks; crop not seen, price updates. P11: field border checks
// (L1 "Check field borders" → L2a–L4) from the node's border jobs (O16).
import { useState } from 'react';
import { usePlanClient } from '../plan/hooks';
import { useUnionOffers } from '../anchor/hooks';
import { useBorderJobs } from '../border/hooks';
import { memberName } from '../border/LeaderBorder';
import { C, FONT, R } from '../shell/tokens';
import { useKnownMembers, useLeaderTodo, useUnionCash } from './hooks';

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const card = { background: C.ink, borderRadius: R.card, padding: '18px 22px', marginBottom: 12, fontFamily: FONT, color: C.text };

function TaskRow({ title, sub, value, urgent, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: C.raised, border: 0, borderRadius: 12, padding: '12px 16px', marginBottom: 8, color: C.text, fontFamily: FONT, fontSize: 14 }}>
      {urgent && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.round, background: C.coral, flexShrink: 0 }} />}
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}><b>{title}</b>{sub && <span style={{ color: C.muted }}>{sub}</span>}</span>
      {value && <b>{value}</b>}
    </button>
  );
}

/** L5: the members the app knows, or scan her wallet. */
export function PickMember({ title, onPick, onBack, onScan }) {
  const api = usePlanClient();
  const members = useKnownMembers(api);
  return (
    <div style={{ padding: 16, fontFamily: FONT, color: C.text }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0 }}>← Back</button>
      <h1 style={{ fontSize: 16 }}>{title}</h1>
      <h2 style={{ fontSize: 14, color: C.muted }}>Who is it for?</h2>
      {members.isLoading && <p style={{ color: C.muted }}>…</p>}
      {(members.data || []).map((m) => (
        <TaskRow key={m.address} title={m.lands.length ? `Land ${m.lands.join(', ')}` : 'Member'} sub={short(m.address)} onClick={() => onPick(m.address)} />
      ))}
      {members.isSuccess && !members.data.length && <p style={{ color: C.muted }}>No members with a crop plan or a crop share yet.</p>}
      {onScan && <TaskRow title="Scan her wallet QR" sub="A member not in the list" onClick={onScan} />}
    </div>
  );
}

const START = [
  ['Crop plan and crop share', [['Share request', 'For a crop plan the member accepted', 'cash/loan']]],
  ['Cash', [['Invest', 'Cash in: she invests in the union', 'cash/invest'], ['Repay', 'Cash in: the member repays her crop share', 'cash/repay'],
    ['Pay out a cash-out', 'Scan her code, pay cash, burn her nIN', 'cash/payout'], ['Scan an LP code', 'An LP brings or collects cash', 'cash/lpscan']]],
  ['Vouchers', [['Register a machine', 'Her own machine, photos and price', 'cash/machine']]],
];

export default function LeaderTasks({ go }) {
  const api = usePlanClient();
  const cash = useUnionCash().data;
  const todo = useLeaderTodo(api, cash);
  const offers = useUnionOffers().data || [];
  const borders = useBorderJobs().data || [];
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
    items.unshift({ key: `border-${j.id}`, title: 'Check field borders', who: `${memberName(j)} · ${j.fields} fields`, to: `tasks/border/${j.id}`, urgent: j.status === 'ready' });
  }
  const shown = items.filter((t) => !q || `${t.title} ${t.who}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ padding: '16px 8px 0', fontFamily: FONT, color: C.text }}>
      <h1 style={{ fontSize: 16, textAlign: 'center' }}>Tasks</h1>
      <section style={card} aria-label="To do">
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>To do</h2>
        <input aria-label="Search tasks" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', height: 40, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box', marginBottom: 10 }} />
        {todo.isLoading && <p style={{ color: C.muted }}>…</p>}
        {shown.map((t) => <TaskRow key={t.key} title={t.title} sub={t.who} value={t.amount ? inr(t.amount) : undefined} urgent={t.urgent} onClick={() => go(t.to)} />)}
        {todo.isSuccess && !shown.length && <p style={{ color: C.muted }}>{q ? 'No tasks match.' : 'Nothing to do now.'}</p>}
      </section>
      <section style={card} aria-label="Start a task">
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Start a task</h2>
        {START.map(([group, rows]) => (
          <div key={group}>
            <h3 style={{ fontSize: 14, color: C.muted, margin: '10px 0 6px' }}>{group}</h3>
            {rows.map(([title, sub, to]) => <TaskRow key={title} title={title} sub={sub} onClick={() => go(to)} />)}
          </div>
        ))}
      </section>
    </div>
  );
}
