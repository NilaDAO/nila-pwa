// L12 (nila-design boards/LeaderPlanApprove, #back): a leader approves or denies a member's accepted
// plan (executive decision, 16 Oct). The leader's Crop plan tab lists the plans waiting for approval.
// DESIGN GAPs: the list (LeaderPickMember is not built); member names are not on the node, so the
// list shows the land title; "sign the mint on this phone" is gone: she mints on her phone (N1).
import { useState } from 'react';
import { C } from '../shell/tokens';
import { useApprovePlan, usePendingApprovals } from './hooks';
import { Choice, Primary, Sheet, inr, muted } from './ui';

const SEASON = { S1: 'Season 1', S2: 'Season 2', S3: 'Season 3' };
const REASONS = ['Crops do not fit her land', 'Amounts too high', 'Wrong areas', 'Other'];
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'long' });

function L12({ plan, onDone }) {
  const approve = useApprovePlan();
  const [deny, setDeny] = useState(false);
  const [reason, setReason] = useState();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const p = plan.plan;
  const sum = (rows, f) => rows.reduce((a, r) => a + f(r.finance), 0);
  const all = (p.seasons || []).flatMap((s) => s.rows);
  const decide = async (decision) => {
    setBusy(true); setError(undefined);
    try {
      await approve.mutateAsync({ planId: plan.id, decision, reason: decision === 'deny' ? reason : undefined, note: note || undefined });
      onDone();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const acceptedAt = Math.max(...Object.values(plan.accepted || {}).map((a) => a.ts), 0);
  return (
    <Sheet landName={`Land ${plan.land_id}`} onBack={onDone}>
      <p style={{ fontWeight: 700, margin: 0 }}>Accepted</p>
      <p style={muted}>{acceptedAt ? new Date(acceptedAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
      {p.seasons?.length > 0 && <p style={muted}>Plan year {new Date(p.seasons[0].start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} to {new Date(all.map((r) => r.finance.due).sort().pop()).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p>}
      <p style={muted}>Land: {Object.keys(p.proposal).length} areas · {all.length ? (p.seasons[0].rows.reduce((a, r) => a + r.acres, 0)).toFixed(2) : 0} acres</p>
      {(p.seasons || []).map((s) => (
        <div key={s.slot} style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
          <b>{SEASON[s.slot]}</b>
          <div style={muted}>Crops: {[...new Set(s.rows.map((r) => r.name))].join(', ')}</div>
          <div style={muted}>Cash {inr(sum(s.rows, (f) => f.cash))} · Vouchers {inr(sum(s.rows, (f) => f.voucher_value))}</div>
          <div style={muted}>Repay {inr(sum(s.rows, (f) => f.repay))} · end of {monthYear(s.rows.map((r) => r.finance.due).sort().pop())}</div>
          {sum(s.rows, (f) => f.cash_above_cap || 0) > 0 && <div style={{ color: C.coral }}>Not financed (above the ₹10,000 cash cap): {inr(sum(s.rows, (f) => f.cash_above_cap || 0))}</div>}
        </div>
      ))}
      <div style={{ fontWeight: 700 }}>3 seasons: Crop shares {(p.shares || []).length} · Cash {inr(sum(all, (f) => f.cash))} · Vouchers {inr(sum(all, (f) => f.voucher_value))} · Repay, with interest {inr(sum(all, (f) => f.repay))}</div>
      {error && <p style={{ color: C.coral }}>{error}</p>}
      {!deny ? (
        <>
          <Primary disabled={busy} onClick={() => decide('approve')}>Approve</Primary>
          <button type="button" onClick={() => setDeny(true)} style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, marginTop: 8 }}>Deny</button>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Deny her plan</h2>
          <p style={muted}>She sees your reason and makes a new crop plan.</p>
          {REASONS.map((r) => <Choice key={r} on={reason === r} onClick={() => setReason(r)}>{r}</Choice>)}
          <input aria-label="Note for her (optional)" placeholder="Note for her (optional)" value={note} onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 16px', boxSizing: 'border-box' }} />
          <Primary disabled={busy || !reason} onClick={() => decide('deny')}>Deny</Primary>
          <button type="button" onClick={() => setDeny(false)} style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, marginTop: 8 }}>Cancel</button>
        </>
      )}
    </Sheet>
  );
}

export default function LeaderPlans() {
  const [open, setOpen] = useState();
  const list = usePendingApprovals();
  const plans = list.data?.plans || [];
  const sel = plans.find((p) => p.id === open);
  if (sel) return <L12 plan={sel} onDone={() => setOpen(undefined)} />;
  return (
    <Sheet landName="Crop plans" title="Waiting for your approval">
      {list.isLoading && <p style={muted}>…</p>}
      {list.error && <p style={{ color: C.coral }}>{list.error.message}</p>}
      {!list.isLoading && !plans.length && <p style={muted}>No plans are waiting.</p>}
      {plans.map((p) => <Choice key={p.id} sub={`${(p.plan.shares || []).length} crop shares`} onClick={() => setOpen(p.id)}>Land {p.land_id}</Choice>)}
    </Sheet>
  );
}
