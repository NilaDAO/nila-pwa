// L12 (nila-design boards/LeaderPlanApprove, #back): a leader approves or denies a member's accepted plan
// (executive decision, 16 Oct). A non-map screen on the shell's gradient (21 Oct): her plan's summary in cards, then
// Approve, or Deny with a reason and a note in the bottom dialog. Each waiting plan is its own task (L1 → #/approvals/<id>).
// DESIGN GAPs: member names are not on the node, so the header shows the farm name of a Polygon title, else
// "Land <id>"; "sign the mint on this phone" is gone: she mints on her phone (N1).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FONT } from '../shell/tokens';
import { ScreenHeader } from '../shell/ListRow';
import { useApprovePlan, usePendingApprovals, usePlanClient, useTitleName } from './hooks';
import { useQuery } from '@tanstack/react-query';
import { useMintCropShares } from './mint';
import { TxScreens } from '../stellar/TxStatus';
import { inr, muted } from './ui';
import { Loading } from '../register/Boot';

const SEASON = { S1: 'Season 1', S2: 'Season 2', S3: 'Season 3' };
// The machine hours of a season by kind ("Tractor 6 h · Weeder 2 h"), or "None".
function voucherKinds(rows) {
  const h = {};
  rows.forEach((r) => Object.entries(r.finance.machines || {}).forEach(([m, v]) => { h[m] = (h[m] || 0) + (v.acres ?? v.hours ?? 0); }));
  const parts = Object.entries(h).filter(([, n]) => n > 0).map(([m, n]) => `${m[0].toUpperCase()}${m.slice(1).replace(/_/g, ' ')} ${Math.round(n * 100) / 100} ac`);
  return parts.length ? parts.join(' · ') : 'None';
}

const REASONS = ['Crops do not fit the land', 'Amounts too high', 'Wrong areas', 'Other'];
const STELLAR_ONLY = 900000;   // demo Stellar-only titles (900043, 900050 …) have no Polygon tokenURI
const card = { flexShrink: 0, background: C.ink, borderRadius: 24, boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px',
  padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 };
const btn = { height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', cursor: 'pointer', width: '100%' };
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const month = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'long' });

function Row({ k, v, top }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: top ? 'flex-start' : 'center', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ color: C.muted, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right', color: C.text }}>{v}</span>
    </div>
  );
}
const Rows = ({ children }) => <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>;

/** The board's #back dialog: reason chips (one required), an optional note, Deny / Cancel. */
function DenyDialog({ onClose, onDeny, busy }) {
  const [why, setWhy] = useState(null);
  const [note, setNote] = useState('');
  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" aria-labelledby="deny-title" style={{ position: 'fixed', left: 8, right: 8, bottom: 88, zIndex: 21, background: C.ink,
        borderRadius: 24, boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '14px 22px 22px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT, color: C.text }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span id="deny-title" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Deny the plan</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 40, height: 40, margin: '-2px -8px -2px 0', border: 0, borderRadius: 9999, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: C.muted }}>The member sees your reason and makes a new crop plan.</span>
        <div role="radiogroup" aria-label="Reason" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={why === r} onClick={() => setWhy(r)} style={{ height: 44, border: 0, borderRadius: 12, padding: '0 16px',
              display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, background: C.raised, cursor: 'pointer',
              ...(why === r ? { color: C.text, boxShadow: `inset 0 0 0 2px ${C.accent}` } : { color: C.muted }) }}>{r}</button>
          ))}
        </div>
        <input type="text" aria-label="Note for the member" placeholder="Note for the member (optional)" value={note} onChange={(e) => setNote(e.target.value)}
          style={{ height: 44, width: '100%', border: 0, borderRadius: 12, background: C.raised, padding: '0 14px', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 16, color: C.text, outline: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" disabled={!why || busy} onClick={() => onDeny(why, note)}
            style={{ ...btn, background: C.raised, color: why ? C.text : C.muted, cursor: why ? 'pointer' : 'default' }}>Deny</button>
          <button type="button" onClick={onClose} style={{ ...btn, background: C.raised, color: C.text }}>Cancel</button>
        </div>
      </div>
    </>, document.body);
}

function L12({ plan, onDone, approvedAlready = false }) {
  const approve = useApprovePlan();
  const [deny, setDeny] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const farm = useTitleName(plan.land_id, plan.land_id < STELLAR_ONLY, null);
  const p = plan.plan;
  const seasons = p.seasons || [];
  const sum = (rows, f) => rows.reduce((a, r) => a + (f(r.finance) || 0), 0);
  const all = seasons.flatMap((s) => s.rows);
  const mint = useMintCropShares();
  const [approved, setApproved] = useState(approvedAlready);
  // An approved plan reopened (from its task): which of her crop shares are made already.
  const checkMade = mint.check;
  useEffect(() => { if (approvedAlready) checkMade(plan.id); }, [approvedAlready, plan.id, checkMade]);
  const decide = async (decision, reason, note) => {
    setBusy(true); setError(undefined);
    try {
      await approve.mutateAsync({ planId: plan.id, decision, reason, note: note || undefined });
      if (decision !== 'approve') { onDone(); return; }
      // The union mints her crop shares now (executive decision 21 Oct): this leader's key, her wallet.
      setApproved(true);
      await mint.run(plan.id);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  // After Approve the crop shares are made as an N1 → N2/N3 sequence, then back to Assets (executive decision 23 Oct;
  // DESIGN GAP: no N board of its own for this).
  const when = useRef(new Date());
  const seq = { busy: 'pending', done: 'success', failed: 'failed', partial: 'failed' }[mint.status];
  if (approved && seq) {
    if (seq !== 'success') when.current = new Date();
    const toAssets = () => { window.location.hash = '#/assets'; };
    const tx = { status: seq, label: 'Making the crop shares', when: when.current,
      rows: [['Crop shares', mint.total ? `${mint.done || 0} of ${mint.total}` : '…'], ['Land', farm || `Land ${plan.land_id}`]],
      reason: (mint.refused || []).map((r) => `${r.crop || 'Crop share'}: ${r.error}`).join(' · ') || mint.error || 'Not made' };
    return <TxScreens tx={tx} network="Polygon" onClose={toAssets} onRetry={() => mint.run(plan.id)} />;
  }
  const acceptedAt = Math.max(0, ...Object.values(plan.accepted || {}).map((a) => a.ts || 0));
  const lastDue = all.map((r) => r.finance.due).filter(Boolean).sort().pop();
  const acres = seasons[0] ? seasons[0].rows.reduce((a, r) => a + r.acres, 0) : 0;
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      {/* The header stays at the top while the cards scroll (board: header fixed, column scrolls under it). */}
      <ScreenHeader title={farm || `Land ${plan.land_id}`} onBack={onDone} onSettings={() => { window.location.hash = '#/settings'; }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
        <section aria-label="The plan" style={card}>
          <Rows>
            <Row k="Accepted" v={acceptedAt ? new Date(acceptedAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
            {seasons.length > 0 && lastDue && <Row k="Plan year" v={`${monthYear(seasons[0].start)} to ${monthYear(lastDue)}`} />}
            <Row k="Land" v={`${Object.keys(p.proposal || {}).length} areas · ${acres.toFixed(2)} acres`} />
          </Rows>
        </section>
        {seasons.map((s) => {
          const due = s.rows.map((r) => r.finance.due).filter(Boolean).sort().pop();
          return (
            <section key={s.slot} aria-label={SEASON[s.slot]} style={card}>
              {/* Simplified (executive decision 21 Oct): "Season N · crops" as the title, the kinds of vouchers (or none), repay. */}
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>{SEASON[s.slot]} · {[...new Set(s.rows.map((r) => r.name))].join(', ') || '—'}</span>
              <Rows>
                <Row top k="Vouchers" v={voucherKinds(s.rows)} />
                <Row k="Repay" v={`${inr(sum(s.rows, (f) => f.repay))}${due ? ` · end of ${month(due)}` : ''}`} />
              </Rows>
            </section>
          );
        })}
        <section aria-label="Total" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Total</span>
            <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: C.muted }}>{seasons.length} seasons</span>
          </div>
          <Rows>
            <Row k="Crop shares" v={String((p.shares || []).length)} />
            <Row k="Cash" v={inr(sum(all, (f) => f.cash))} />
            <Row k="Vouchers" v={inr(sum(all, (f) => f.voucher_value))} />
            <Row k="Repay, with interest" v={inr(sum(all, (f) => f.repay))} />
          </Rows>
          <div style={{ height: 1, background: C.raised }} />
          {error && <p style={{ ...muted, color: C.coral, margin: 0 }}>{error}</p>}
          {approved ? (
            // DESIGN GAP: no board for the union making her crop shares after Approve; a status line and the result.
            <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {mint.status === 'busy' ? `Making the crop shares${mint.total ? ` · ${mint.done} of ${mint.total}` : '…'}`
                  : mint.status === 'done' ? 'The crop shares are made and sent to the member\'s wallet'
                    : mint.status === 'partial' ? `${mint.done} of ${mint.total} crop shares made`
                      : mint.status === 'failed' ? 'The crop shares were not made'
                        : mint.status === 'waiting' ? `Approved · ${mint.done || 0} of ${mint.total || 0} crop shares made` : 'Approved'}
              </span>
              {mint.refused?.map((r) => <span key={r.share || r.token_id} style={{ ...muted, margin: 0 }}>{r.crop || 'Crop share'}: {r.error}</span>)}
              {mint.status === 'failed' && mint.error && !mint.refused?.length && <span style={{ ...muted, margin: 0 }}>{mint.error}</span>}
              {(mint.status === 'idle' || mint.status === 'waiting') && (
                <button type="button" onClick={() => mint.run(plan.id)} style={{ ...btn, background: C.accent, color: C.ink }}>Make the crop shares</button>
              )}
              {(mint.status === 'failed' || mint.status === 'partial') && (
                <button type="button" onClick={() => mint.run(plan.id)} style={{ ...btn, background: C.accent, color: C.ink }}>Try again</button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button type="button" disabled={busy} onClick={() => decide('approve')} style={{ ...btn, background: C.accent, color: C.ink, opacity: busy ? 0.5 : 1 }}>Approve</button>
              <button type="button" disabled={busy} onClick={() => setDeny(true)} style={{ ...btn, background: C.raised, color: C.text }}>Deny</button>
            </div>
          )}
        </section>
      </div>
      {deny && <DenyDialog busy={busy} onClose={() => setDeny(false)} onDeny={(why, note) => { setDeny(false); decide('deny', why, note); }} />}
    </div>
  );
}

/** #/approvals/<plan id> (one task per waiting plan): that plan's L12; a plan no longer waiting goes back to the tasks. */
export default function LeaderPlans({ planId, onBack }) {
  const list = usePendingApprovals();
  const plans = list.data?.plans || [];
  const found = plans.find((p) => p.id === planId) || (!planId && plans.length === 1 ? plans[0] : null);
  // Once approved the plan leaves the waiting list: L12 stays open on it while her crop shares are made.
  const kept = useRef(null);
  if (found) kept.current = found;
  const sel = found || (kept.current && (!planId || kept.current.id === planId) ? kept.current : null);
  // An approved plan (no longer waiting): L12 in its approved state, to make the member's crop shares if they are
  // not all made. Read by its id (25 Oct): the approved-plans list holds the newest 200 only.
  const api = usePlanClient();
  const approvedQ = useQuery({ queryKey: ['plan', 'byId', planId], enabled: !!api && !sel && !!planId, queryFn: () => api.plan(planId) });
  if (sel) return <L12 plan={sel} onDone={onBack} />;
  const done = approvedQ.data?.approval?.decision === 'approve' ? approvedQ.data : null;
  if (done) return <L12 plan={done} onDone={onBack} approvedAlready />;
  if (list.isLoading || approvedQ.isLoading) return <Loading />;
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      <ScreenHeader title="Crop plan" onBack={onBack} onSettings={() => { window.location.hash = '#/settings'; }} />
      <section style={card}>
        <p style={{ ...muted, margin: 0 }}>{list.error ? list.error.message : 'This plan is no longer waiting for your approval.'}</p>
      </section>
    </div>
  );
}
