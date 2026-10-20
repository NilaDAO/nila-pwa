// L2a / L2 / L3 / L4 — the leader checks the field borders Nila drew from her points (boards LeaderBorderFetch,
// LeaderBorderPlan, LeaderBorderCheck, LeaderBorderDone; spec notes/page-member.md "field-borders"). The job's
// state picks the board: drawing → L2a (#retry-fN when a field is drawn again), ready → L2, a field → L3, every
// field accepted or left out → L4 (mint). Data: the node's border job (O16). DESIGN GAP: no member names in the
// app (the farm name or a short address stands in).
import { useCallback, useState } from 'react';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import { acres, shapeFor } from './api';
import BorderMap, { ShapeThumb } from './BorderMap';
import { useBorderDecision, useBorderJob, useMintLandTitle } from './hooks';

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
export const memberName = (job) => job?.farm || short(job?.polygon || job?.member);   // her Polygon address, as the union knows her
const pill = { background: 'rgba(18,18,18,0.85)', borderRadius: R.round, boxShadow: SHADOW };
const btn = (primary) => ({ flex: 1, height: 44, borderRadius: R.button, border: 0, fontWeight: 700, fontSize: 14, fontFamily: FONT,
  background: primary ? C.accent : C.raised, color: primary ? C.ink : C.text });
const DONE = ['accepted', 'left_out'];

function Frame({ name, onBack, backLabel, map, children }) {
  return (
    <div style={{ fontFamily: FONT, color: C.text, position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        {map}
        <button type="button" aria-label={backLabel} onClick={onBack} style={{ ...pill, position: 'absolute', zIndex: 500, left: 8, top: 12, width: 40, height: 40, border: 0, color: C.text, fontSize: 20 }}>←</button>
        <h1 style={{ position: 'absolute', zIndex: 500, left: 56, right: 56, top: 12, margin: 0, display: 'flex', justifyContent: 'center' }}>
          <span style={{ ...pill, padding: '0 14px', height: 40, display: 'flex', alignItems: 'center', fontSize: 16, fontWeight: 700 }}>{name}</span>
        </h1>
      </div>
      <div style={{ background: C.ink, borderRadius: '24px 24px 0 0', marginTop: -24, position: 'relative', zIndex: 600, padding: '14px 22px 24px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: SHADOW }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.35)', alignSelf: 'center' }} />
        {children}
      </div>
    </div>
  );
}

function FieldRow({ f, sub, right, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: C.raised, border: 0, borderRadius: 12, padding: '12px 16px', color: C.text, fontFamily: FONT, fontSize: 14 }}>
      <span style={{ width: 24, height: 24, borderRadius: R.round, background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{f.n}</span>
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}><b>Field {f.n}</b>{sub && <span style={{ color: C.muted }}>{sub}</span>}</span>
      {right && <span style={{ color: C.muted }}>{right}</span>}
    </button>
  );
}

const Head = ({ title, sub }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
    {sub && <span style={{ fontSize: 14, color: C.muted }}>{sub}</span>}
  </div>
);

/** L2a: shapes are being drawn (first run, or one field again after None fit). */
function Fetch({ job, onBack }) {
  const again = job.fields.find((f) => f.state === 'drawing' && f.round > 0);
  return (
    <Frame name={memberName(job)} backLabel="Back to tasks" onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} drawing active={again?.n} />}>
      <Head title={again ? `Drawing field ${again.n} again` : 'Finding field borders'} sub="Drawing shapes, please wait" />
      {job.fields.map((f) => (
        <FieldRow key={f.n} f={f} right={f.state === 'drawing' ? (f.round > 0 ? 'Drawing again' : 'Drawing') : f.state === 'accepted' ? 'Accepted' : f.state === 'left_out' ? 'Left out' : 'Waiting'} />
      ))}
    </Frame>
  );
}

/** L2: the best match for every field, all still to check. */
function Plan({ job, onField, onBack }) {
  const open = job.fields.filter((f) => f.state !== 'left_out');
  return (
    <Frame name={memberName(job)} backLabel="Back to tasks" onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} onField={onField} />}>
      <Head title={`${open.length} fields · best match`} sub="Tap a field to check it" />
      {job.fields.map((f) => {
        const s = shapeFor(f, job.plan);
        return <FieldRow key={f.n} f={f} sub={f.state === 'left_out' ? 'Left out' : s ? acres(s.acres) : ''} right={f.accepted ? 'Accepted' : undefined}
          onClick={f.state === 'left_out' ? undefined : () => onField(f.n)} />;
      })}
      <button type="button" disabled style={{ ...btn(true), flex: 'none', opacity: 0.5 }}>Mint land title</button>
    </Frame>
  );
}

/** L3: pick a shape for one field; Accept locks it, None fit draws it again. */
function Check({ job, n, onDone, onBack }) {
  const f = job.fields.find((x) => x.n === n);
  const shapes = [...(f?.shapes || [])].sort((a, b) => a.score - b.score);
  const start = f?.accepted || job.plan?.[String(n)] || shapes[0]?.id;
  const [sel, setSel] = useState(start);
  const [plan, setPlan] = useState(job.plan);
  const { accept, noneFit, preview } = useBorderDecision(job.id);
  const busy = accept.isPending || noneFit.isPending;
  const err = accept.error || noneFit.error || preview.error;
  const pick = async (id) => {
    setSel(id);
    if (id === (job.plan?.[String(n)])) { setPlan(job.plan); return; }
    try { const r = await preview.mutateAsync({ field: n, shape: id }); setPlan(r.plan || r); } catch { /* shown below */ }
  };
  if (!f) return null;
  const chosen = shapes.find((s) => s.id === sel);
  const holds = chosen?.holds?.length || 0;
  const moved = Object.keys(plan || {}).filter((k) => Number(k) !== n && plan[k] !== job.plan?.[k]);
  return (
    <Frame name={memberName(job)} backLabel="Back to all fields" onBack={onBack}
      map={<BorderMap fields={job.fields} plan={plan} active={n} shapeOverride={sel} onField={() => {}} />}>
      <Head title={`Field ${n}`} sub={memberName(job)} />
      <div role="group" aria-label={`Shapes for field ${n}`} style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
        {shapes.map((s, i) => (
          <button key={s.id} type="button" aria-label={`Shape ${i + 1}, ${acres(s.acres)}`} aria-pressed={s.id === sel} onClick={() => pick(s.id)} style={{
            flex: '1 0 72px', minWidth: 0, border: `2px solid ${s.id === sel ? C.accent : C.raised}`, borderRadius: 12, background: C.raised,
            padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', color: C.text, fontFamily: FONT }}>
            <ShapeThumb geometry={s.geometry} />
            <span style={{ fontSize: 14, fontWeight: 700, padding: '4px 0 2px' }}>{i === 0 ? 'Best' : `${Number(s.acres).toFixed(2)} ac`}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <span style={{ color: C.muted }}>Area</span><b>{chosen ? acres(chosen.acres) : '—'}</b>
      </div>
      {holds > 0 && <p role="note" style={{ margin: 0, fontSize: 14, color: C.muted }}>{holds + 1} points in this field</p>}
      {moved.length > 0 && <p role="note" style={{ margin: 0, fontSize: 14, color: C.muted }}>{moved.map((k) => `Field ${k}`).join(', ')} {moved.length > 1 ? 'change' : 'changes'} too</p>}
      {err && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{err.message}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={busy} style={btn(false)} onClick={() => noneFit.mutate({ field: n }, { onSuccess: onDone })}>None fit</button>
        <button type="button" disabled={busy || !sel} style={btn(true)} onClick={() => accept.mutate({ field: n, shape: sel }, { onSuccess: onDone })}>Accept</button>
      </div>
    </Frame>
  );
}

/** L4: every field accepted (or left out): mint her land title. */
function Done({ job, onField, onBack }) {
  const mint = useMintLandTitle(job.id);
  const [farm, setFarm] = useState('');   // the title's name: hers from R6, else the leader names it here
  const ok = job.fields.filter((f) => f.state === 'accepted');
  const total = ok.reduce((a, f) => a + (shapeFor(f, job.plan)?.acres || 0), 0);
  // A failed mint, or an error the beat recorded while it retries, shows even while the job is still 'minting'.
  const st = job.status === 'minted' || job.mint?.status === 'minted' ? 'minted'
    : job.mint?.status === 'failed' || job.mint?.error ? 'failed'
      : job.status === 'minting' || ['pending', 'processing'].includes(job.mint?.status) ? 'minting' : null;
  return (
    <Frame name={memberName(job)} backLabel="Back to tasks" onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} onField={st ? undefined : onField} />}>
      <Head title={`${ok.length} fields · all accepted`} sub={`Total ${total.toFixed(2)} acres`} />
      {job.fields.map((f) => (
        <FieldRow key={f.n} f={f} sub={f.state === 'left_out' ? 'Left out' : acres(shapeFor(f, job.plan)?.acres)} right={f.state === 'accepted' ? 'Accepted' : undefined}
          onClick={st || f.state === 'left_out' ? undefined : () => onField(f.n)} />
      ))}
      {st === 'minting' && <p role="status" style={{ margin: 0, fontSize: 14, color: C.muted }}>Minting the land title. She gets a notification when it is ready.</p>}
      {st === 'minted' && <p role="status" style={{ margin: 0, fontSize: 14, color: C.accent, fontWeight: 700 }}>Land title minted.</p>}
      {(st === 'failed' || mint.error) && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{mint.error?.message || job.mint?.error || 'The mint failed.'}</p>}
      {!st && !job.farm && (
        <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>Name of the land
          <input value={farm} onChange={(e) => setFarm(e.target.value)} maxLength={64}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: `1px solid ${C.muted}`, background: C.raised, color: C.text }} />
        </label>
      )}
      {!st && <button type="button" disabled={mint.isPending || !ok.length || (!job.farm && !farm.trim())} style={{ ...btn(true), flex: 'none' }}
        onClick={() => mint.mutate(job.farm ? {} : { farm: farm.trim() })}>Mint land title</button>}
      {st === 'minted' && <button type="button" style={{ ...btn(false), flex: 'none' }} onClick={onBack}>Back to tasks</button>}
    </Frame>
  );
}

/** tasks/border/<id>[/<field>] */
export default function LeaderBorder({ id, field, go }) {
  const q = useBorderJob(id);
  const job = q.data;
  const toTasks = useCallback(() => go('tasks'), [go]);
  const toPlan = useCallback(() => go(`tasks/border/${id}`), [go, id]);
  const toField = useCallback((n) => go(`tasks/border/${id}/${n}`), [go, id]);
  if (q.isLoading || !job) {
    return <div style={{ padding: 16, fontFamily: FONT, color: q.error ? C.coral : C.muted }}>{q.error ? q.error.message : '…'}</div>;
  }
  if (job.status === 'failed') {
    return <div style={{ padding: 16, fontFamily: FONT, color: C.coral }}>{job.mint?.error || 'The shapes could not be drawn.'} She sends her field location again. <button type="button" onClick={toTasks} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700 }}>Back to tasks</button></div>;
  }
  if (job.status === 'drawing') return <Fetch job={job} onBack={toTasks} />;
  if (field && !['minting', 'minted'].includes(job.status)) return <Check key={`${field}:${job.updated}`} job={job} n={Number(field)} onDone={toPlan} onBack={toPlan} />;
  const allDone = job.fields.every((f) => DONE.includes(f.state)) && job.fields.some((f) => f.state === 'accepted');
  if (allDone || ['minting', 'minted'].includes(job.status)) return <Done job={job} onField={toField} onBack={toTasks} />;
  return <Plan job={job} onField={toField} onBack={toTasks} />;
}
