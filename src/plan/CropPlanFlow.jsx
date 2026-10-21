// The crop plan (P4a): CP3 intro → CP4–CP7 intake → CP8 making → CP9 why → CP10 plan → CP11 terms →
// CP12 waiting for the leader (nila-design boards CropPlanIntro … CropPlanPending-590i). Copy from the
// boards; DESIGN GAPs: no map yet (P4c), no suggested crops on CP4 (no source), CP9 shows the
// engine's one explanation text (16 Oct), CP6/CP5 answers mapped to numbers/keys in hooks.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bouncing } from '../register/RegFrame';
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { C } from '../shell/tokens';
import { COWS, LAND_ROLE, qkPlan, useAcceptPlan, useCropCatalogue, useCropPlan, useLandTitles, usePlanJob, useRevisePlan, useSubmitIntake } from './hooks';
import { Choice, Primary, Sheet, Steps, inr, muted } from './ui';
import { useMintCropShares } from './mint';
import { areasOf, summarize, useFieldRecord } from './record';
import { useTitleName } from './hooks';
import { useStellarTitles } from '../stellar/hooks';
import AreaMap from './AreaMap';
import CropsStep from './CropsStep';
import ActivePlan from './ActivePlan';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASON = { S1: 'Oct–Feb', S2: 'Mar–May', S3: 'Jun–Aug' };
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const fmtKg = (kg) => (kg >= 1000 ? `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(kg).toLocaleString('en-IN')} kg`);

function Making({ jobId, onDone, onError }) {
  const job = usePlanJob(jobId);
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (job.data?.status === 'done') onDone(job.data.plan_id);
    if (job.data?.status === 'error') onError(job.data.error);
  }, [job.data, onDone, onError]);
  // Board CropPlanMaking (CP8): the bouncing Nila logo (the same bounce as R14), then the counter and "Time passed".
  return (
    <div style={{ textAlign: 'center' }}>
      <Bouncing top={42} bottom={8} label="Making your crop plan" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span aria-label="Time passed" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
        <span style={muted}>Time passed</span>
      </div>
    </div>
  );
}

function PlanView({ plan, onAccept, onChange, readOnly, areaNo = (z) => z }) {
  const p = plan.plan;
  const [tab, setTab] = useState('Year');
  const [checked, setChecked] = useState(() => new Set(Object.keys(plan.accepted || {})));
  const zones = Object.keys(p.proposal);
  const seasons = p.seasons || [];
  const total = seasons.reduce((a, s) => {
    const sum = s.rows.reduce((b, r) => ({ cash: b.cash + r.finance.cash + r.finance.voucher_value, interest: b.interest + r.finance.interest }), { cash: 0, interest: 0 });
    return { cash: a.cash + sum.cash, interest: a.interest + sum.interest };
  }, { cash: 0, interest: 0 });
  const lastDue = seasons.flatMap((s) => s.rows.map((r) => r.finance.due)).sort().pop();
  const shown = tab === 'Year' ? seasons : seasons.filter((s) => SEASON[s.slot] === tab);
  const rate = (p.trees?.effective_rate_bp ?? 1250) / 100;
  return (
    <>
      {zones.map((z) => (
        <Choice key={z} check on={checked.has(z)} onClick={() => setChecked((c) => { const n = new Set(c); n.has(z) ? n.delete(z) : n.add(z); return n; })}
          sub={seasons.map((s) => s.rows.filter((r) => r.zone === z).map((r) => `${SEASON[s.slot]}: ${r.name} ${fmtKg(r.kg)}${r.risks?.length ? ` · ${r.risks.join(', ')}` : ''}`).join('')).filter(Boolean).join(' · ')}>
          Area {areaNo(z)}
        </Choice>
      ))}
      <p style={{ ...muted, textAlign: 'center' }}>{checked.size} of {zones.length} accepted</p>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.muted, margin: '16px 0 8px' }}>Finance</h2>
      <div style={{ display: 'flex', gap: 4, background: C.raised, borderRadius: 12, padding: 4 }}>
        {['Year', 'Oct–Feb', 'Mar–May', 'Jun–Aug'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ flex: 1, height: 36, borderRadius: 10, border: 0, fontWeight: 700, background: tab === t ? C.ink : 'transparent', color: tab === t ? C.text : C.muted }}>{t}</button>
        ))}
      </div>
      <table style={{ width: '100%', fontSize: 14, marginTop: 8, borderCollapse: 'collapse' }}>
        <thead><tr style={{ color: C.muted }}><td>Type</td><td>Available from</td><td style={{ textAlign: 'right' }}>Total</td><td style={{ textAlign: 'right' }}>{rate}%</td></tr></thead>
        <tbody>
          {shown.map((s) => {
            const cash = s.rows.reduce((a, r) => a + r.finance.cash + r.finance.voucher_value, 0);
            const interest = s.rows.reduce((a, r) => a + r.finance.interest, 0);
            const due = s.rows.map((r) => r.finance.due).sort().pop();
            const from = s.rows.map((r) => r.sow).sort()[0];
            return (
              <tr key={s.slot} style={{ borderTop: `1px solid ${C.raised}` }}>
                <td style={{ padding: '8px 0' }}><b>{SEASON[s.slot]}</b><br /><span style={muted}>Repay by end of {monthYear(due)}</span></td>
                <td>{from ? new Date(from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{inr(cash)}</td><td style={{ textAlign: 'right' }}>{inr(interest)}</td>
              </tr>
            );
          })}
          {p.trees?.discount > 0 && (
            <tr style={{ borderTop: `1px solid ${C.raised}` }}>
              <td style={{ padding: '8px 0' }} colSpan={4}><b>Tree discount</b><br /><span style={muted}>{p.trees.discount} points off the rate ({rate}%) · trees registered</span></td>
            </tr>
          )}
          <tr style={{ borderTop: `1px solid ${C.raised}`, fontWeight: 700 }}>
            <td style={{ padding: '8px 0' }} colSpan={2}>Total, due in {seasons.length} parts</td>
            <td style={{ textAlign: 'right' }}>{inr(total.cash)}</td><td style={{ textAlign: 'right' }}>{inr(total.interest)}</td>
          </tr>
        </tbody>
      </table>
      {lastDue && <p style={muted}>You repay {inr(total.cash + total.interest)} in {seasons.length} parts, the last by end of {monthYear(lastDue)}.</p>}
      {seasons.some((s) => s.rows.some((r) => r.finance.cash_above_cap > 0)) && (
        <p style={{ ...muted, color: C.coral }}>Part of the input cost is above the ₹10,000 cash cap and is not financed: {inr(seasons.reduce((a, s) => a + s.rows.reduce((b, r) => b + (r.finance.cash_above_cap || 0), 0), 0))}.</p>
      )}
      {p.left_out?.length > 0 && <p style={muted}>Areas too small to plan: {p.left_out.length}.</p>}
      {p.member_request?.not_followed?.length > 0 && <p style={muted}>Not followed: {p.member_request.not_followed.map((n) => n.why || n.reason || JSON.stringify(n)).join('; ')}</p>}
      {!readOnly && <Primary disabled={checked.size < zones.length} onClick={onAccept}>Accept the plan</Primary>}
      {!readOnly && onChange && (
        <button type="button" onClick={onChange} style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, marginTop: 8 }}>Change my plan</button>
      )}
    </>
  );
}

/** CP1 (board CropPlanPending): her field record is on its way. Shown while titles and the record load. */
function Pending({ map, name, error }) {
  return (
    <Sheet map={map} landName={name} title="Getting your field record">
      <p style={{ ...muted, textAlign: 'center' }}>This can take up to an hour.</p>
      {error && <p style={muted}>Your field record could not be loaded. It is tried again in a moment.</p>}
    </Sheet>
  );
}

export default function CropPlanFlow() {
  const s = useNilaSigner();
  const qc = useQueryClient();
  const titles = useLandTitles(s?.evmAddress);
  // A title on Stellar only (the demo writes new titles there, 21 Oct): used when she has none on Polygon.
  const stellarTitles = useStellarTitles(s);
  const onPolygon = (titles.data || []).length > 0;
  const stellarTitle = !onPolygon ? stellarTitles.data?.[0] : undefined;
  const landId = onPolygon ? titles.data[0] : stellarTitle?.title_id;
  const current = useCropPlan(landId);
  const catalogue = useCropCatalogue();
  const field = useFieldRecord(landId, s?.evmAddress, stellarTitle ? stellarTitle.record_hash || '' : undefined);
  const record = field.data?.record;
  const submit = useSubmitIntake(landId);
  const accept = useAcceptPlan(landId);
  const mint = useMintCropShares();
  const revise = useRevisePlan();
  const [changeNote, setChangeNote] = useState('');
  // An approved plan whose crop shares are already on her wallet opens on "made", not on "Make".
  const approvedId = current.data?.approval?.decision === 'approve' ? current.data.id : undefined;
  const checkMinted = mint.check;
  const checkedFor = useRef();
  useEffect(() => {   // once per approved plan (each check signs a request)
    if (approvedId && checkedFor.current !== approvedId) { checkedFor.current = approvedId; checkMinted(approvedId); }
  }, [approvedId, checkMinted]);
  const [step, setStep] = useState(null);
  const [crops, setCrops] = useState(new Set());
  const [role, setRole] = useState();
  const [cows, setCows] = useState();
  const [months, setMonths] = useState([]);
  const [jobId, setJobId] = useState();
  const [error, setError] = useState();
  const [read, setRead] = useState(false);
  const plan = current.data;
  // Her land's name comes from the land title's metadata (not the record), "Land <id>" only when it has none.
  const titleName = useTitleName(landId, onPolygon, stellarTitle);
  const name = titleName || (landId != null ? `Land ${landId}` : 'Nila');
  const zoneOrder = useMemo(() => areasOf(record).map((z) => z.zone_id), [record]);
  const areaNo = useCallback((zone) => (zoneOrder.indexOf(zone) + 1) || zone, [zoneOrder]);
  // The map shows what grows on each area in the first season of the plan, or just "Area n".
  const labels = useMemo(() => {
    const s0 = plan?.plan?.seasons?.[0];
    if (!s0) return {};
    return Object.fromEntries(s0.rows.map((r) => [r.zone, { text: r.name, sub: fmtKg(r.kg), colour: r.colour }]));
  }, [plan]);
  const map = record ? <AreaMap record={record} labels={labels} /> : null;
  const names = useMemo(() => Object.fromEntries((catalogue.data?.crops || []).map((c) => [c.key, c])), [catalogue.data]);

  // While her titles load (the Stellar list also waits for her signer), CP1's pending sheet — never "No land title"
  // before both chains have answered.
  const titlesKnown = !titles.isLoading && (onPolygon || stellarTitles.isFetched);
  if (!titlesKnown || current.isLoading) return <Pending map={map} name={name} />;
  if (titles.data && !titles.data.length && !stellarTitle) {
    return <Sheet map={map} landName={name} title="No land title yet"><p style={muted}>Your crop plan starts when your land title is ready.</p></Sheet>;
  }
  const at = step ?? (plan?.status === 'draft' ? 'plan' : plan?.status === 'accepted' ? 'waiting' : 'record');
  const back = (to) => () => setStep(to);

  if (at === 'record') {
    // CP1 / CP2 (boards CropPlanPending, CropPlanPending-n9mn-kewp). DESIGN GAPs: no "Main issues" (the
    // oracle detects none yet, design Q20), no "Add your trees and water sources" row (A5 not built).
    if (field.isLoading || !record) return <Pending map={map} name={name} error={field.error} />;
    const sum = summarize(record);
    return (
      <Sheet map={map} landName={name} title="Your field record">
        {sum.from && <p style={{ ...muted, textAlign: 'center', margin: 0 }}>{sum.from} to {sum.to}</p>}
        <p style={{ ...muted, textAlign: 'center' }}>{sum.cultivations} cultivations on {sum.areas} areas</p>
        <Primary onClick={() => setStep('intro')}>Make my crop plan</Primary>
      </Sheet>
    );
  }
  if (at === 'intro') {
    return (
      <Sheet map={map} landName={name} title="What is a crop plan?">
        <Steps items={[
          ['Income all year', 'Different crops are ready at different times, so money comes in through the year, not once.'],
          ['Money in the hard months', 'You tell us which months are hard. The plan brings sales and cash to those months.'],
          ['Better soil, bigger harvests', 'Changing crops and keeping the soil covered makes it richer. Harvests grow year after year.'],
        ]} />
        <p style={{ ...muted, textAlign: 'center' }}>First, 4 short questions.</p>
        <Primary onClick={() => setStep('crops')}>Start</Primary>
      </Sheet>
    );
  }
  if (at === 'crops') {
    return <CropsStep map={map} name={name} onBack={back('intro')} record={record} catalogue={catalogue.data?.crops || []}
      crops={crops} setCrops={setCrops} onContinue={() => setStep('role')} />;
  }
  if (at === 'role') {
    return (
      <Sheet map={map} landName={name} onBack={back('crops')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>2 / 4</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>What is this land for your family?</h1>
        {Object.keys(LAND_ROLE).map((k) => <Choice key={k} on={role === k} onClick={() => { setRole(k); setStep('cows'); }}>{k}</Choice>)}
      </Sheet>
    );
  }
  if (at === 'cows') {
    return (
      <Sheet map={map} landName={name} onBack={back('role')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>3 / 4</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>How many cows does this land feed?</h1>
        {Object.keys(COWS).map((k) => <Choice key={k} on={cows === k} onClick={() => { setCows(k); setStep('months'); }}>{k}</Choice>)}
      </Sheet>
    );
  }
  if (at === 'months') {
    const go = async () => {
      setError(undefined);
      try {
        const r = await submit.mutateAsync({ intake: { crops: [...crops], cows: COWS[cows], hard_months: months, land_role: LAND_ROLE[role] } });
        setJobId(r.job_id); setStep('making');
      } catch (e) { setError(e.message); }
    };
    return (
      <Sheet map={map} landName={name} onBack={back('cows')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>4 / 4</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>In which months does your family need money most?</h1>
        <p style={{ ...muted, textAlign: 'center' }}>Choose up to 3 months.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {MONTHS.map((m, i) => {
            const on = months.includes(i + 1);
            return (
              <button key={m} type="button" aria-pressed={on} disabled={!on && months.length >= 3}
                onClick={() => setMonths((x) => (on ? x.filter((v) => v !== i + 1) : [...x, i + 1]))}
                style={{ height: 44, borderRadius: 12, border: 0, fontWeight: 700, background: on ? C.accent : C.raised, color: on ? C.ink : C.text, opacity: !on && months.length >= 3 ? 0.5 : 1 }}>{m}</button>
            );
          })}
        </div>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={submit.isPending} onClick={go}>Continue</Primary>
      </Sheet>
    );
  }
  if (at === 'making') {
    return (
      <Sheet map={map} landName={name} title="Making your crop plan">
        <Making jobId={jobId} onDone={() => { qc.invalidateQueries({ queryKey: qkPlan.plan(landId) }); setStep('why'); }}
          onError={(e) => { setError(e); setStep('months'); }} />
      </Sheet>
    );
  }
  if (at === 'why') {
    const text = plan?.plan?.explain?.text || plan?.plan?.proposal_why;
    return (
      <Sheet map={map} landName={name} title="Why this plan">
        {text ? <p style={{ lineHeight: 1.5 }}>{text}</p> : <p style={muted}>…</p>}
        <Primary onClick={() => setStep('plan')}>See my plan</Primary>
      </Sheet>
    );
  }
  if (at === 'plan' && plan) {
    const season = plan.plan.seasons?.[0];
    return (
      <Sheet map={map} landName={name}>
        {season && <p style={{ textAlign: 'center', fontWeight: 700, margin: '0 0 8px' }}>Season 1 · {monthYear(season.start)}</p>}
        <p style={{ textAlign: 'center', fontWeight: 700 }}>Check each area and accept it.</p>
        <PlanView plan={plan} areaNo={areaNo} onAccept={() => setStep('terms')} onChange={() => setStep('change')} readOnly={plan.status !== 'draft'} />
      </Sheet>
    );
  }
  if (at === 'change' && plan) {
    // DESIGN GAP: the board changes crops on the map (P4c); here she says what to change (/revise, her
    // suggestion is followed unless a hard fact refuses it, LOAN_RULES §5).
    const go = async () => {
      setError(undefined);
      try { const r = await revise.mutateAsync({ planId: plan.id, note: changeNote }); setJobId(r.job_id); setStep('making'); } catch (e) { setError(e.message); }
    };
    return (
      <Sheet map={map} landName={name} title="Change my plan" onBack={back('plan')}>
        <p style={muted}>Tell us what to change and why. Your plan follows you unless a fact rules it out, and it says why.</p>
        <textarea aria-label="What to change" value={changeNote} maxLength={1000} onChange={(e) => setChangeNote(e.target.value)}
          style={{ width: '100%', minHeight: 100, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: 12, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14 }} />
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={!changeNote.trim() || revise.isPending} onClick={go}>Make my new plan</Primary>
      </Sheet>
    );
  }
  if (at === 'terms' && plan) {
    const cf = plan.plan.cashflow || [];
    const go = async () => {
      setError(undefined);
      try { await accept.mutateAsync(plan); setStep('waiting'); } catch (e) { setError(e.message); }
    };
    return (
      <Sheet map={map} landName={name} title="Before you accept your crop plan" onBack={back('plan')}>
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>Money left each month</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, margin: '8px 0' }} aria-label="Money left each month">
          {cf.map((m) => {
            const max = Math.max(1, ...cf.map((x) => Math.abs(x.with_plan)));
            return <span key={m.month} title={`${m.month}: ${inr(m.with_plan)}`} style={{ flex: 1, height: `${(Math.abs(m.with_plan) / max) * 100}%`, background: m.with_plan < 0 ? C.coral : C.accent, borderRadius: 2 }} />;
          })}
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>Estimates, not guarantees</h2>
        <p style={muted}>Yield, sales and cash flow are estimated from your field record and can contain errors. Vouchers and cash depend on available funds: Nila and your union cannot guarantee them.</p>
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>Amounts can be changed</h2>
        <p style={muted}>You can change your cash and voucher amounts together with your union leaders.</p>
        <Choice check on={read} onClick={() => setRead((r) => !r)}>I have read these conditions</Choice>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={!read || accept.isPending} onClick={go}>I accept</Primary>
      </Sheet>
    );
  }
  // CP12: the leader approves next (P4b mints after the approval).
  const ap = plan?.approval;
  if (ap?.decision === 'deny') {
    return (
      <Sheet map={map} landName={name} title="Your leader denied your plan">
        <p style={muted}>{[ap.reason, ap.note].filter(Boolean).join('. ')}</p>
        <Primary onClick={() => setStep('intro')}>Make a new plan</Primary>
      </Sheet>
    );
  }
  if (ap?.decision === 'approve') {
    // CP12 busy / failed; done → her crop shares (CP13 comes in P4c).
    if (mint.status === 'busy') {
      return (
        <Sheet map={map} landName={name} title="Creating your crop shares">
          <p style={{ ...muted, textAlign: 'center' }}>{mint.total ? `${mint.done} of ${mint.total}` : '…'}</p>
        </Sheet>
      );
    }
    if (mint.status === 'failed') {
      return (
        <Sheet map={map} landName={name} title="Your crop shares were not made">
          <p style={muted}>Nothing is lost: your accepted plan is saved. Check your internet and try again.</p>
          {mint.error && <p style={{ ...muted, color: C.coral }}>{mint.error}</p>}
          <Primary onClick={() => mint.run(plan.id)}>Try again</Primary>
          <p style={muted}>Still not working? Ask your union leader.</p>
        </Sheet>
      );
    }
    if (mint.status === 'done') {
      return (
        <Sheet map={map} landName={name}>
          <ActivePlan plan={plan} areaNo={areaNo} onUpdate={() => setStep('change')} />
        </Sheet>
      );
    }
    if (mint.status === 'done' || mint.status === 'partial') {
      return (
        <Sheet map={map} landName={name} title="Your crop shares are made">
          <p style={muted}>{mint.done} of {mint.total} crop shares made.</p>
          {mint.refused?.map((r) => <p key={r.share || r.token_id} style={muted}>{r.crop || 'Crop share'}: {r.error}</p>)}
          {mint.status === 'partial' && <Primary onClick={() => mint.run(plan.id)}>Try again</Primary>}
          <Primary onClick={() => setStep('plan')}>See my plan</Primary>
        </Sheet>
      );
    }
    return (
      <Sheet map={map} landName={name} title="Your plan is approved">
        <p style={muted}>Make your crop shares now. Nila pays the network fee.</p>
        <Primary onClick={() => mint.run(plan.id)}>Make my crop shares</Primary>
      </Sheet>
    );
  }
  return (
    <Sheet map={map} landName={name} title="Waiting for your union leader">
      <p style={muted}>Your leader checks your plan. You get a message when they are ready.</p>
      <Primary onClick={() => setStep('plan')}>See my plan</Primary>
    </Sheet>
  );
}
