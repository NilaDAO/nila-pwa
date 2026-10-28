// L2a / L2 / L3 / L4 — the leader checks the field borders Nila drew from her points (boards LeaderBorderFetch,
// LeaderBorderPlan, LeaderBorderCheck, LeaderBorderDone; spec notes/page-member.md "field-borders"). The job's
// state picks the board: drawing → L2a (#retry-fN when a field is drawn again), ready → L2, a field → L3, every
// field accepted or left out → L4 (mint). Data: the node's border job (O16). DESIGN GAP: no member names in the
// app (the farm name or a short address stands in).
import { cloneElement, useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { C, FONT, R } from '../shell/tokens';
import ErrorFull from '../shell/ErrorFull';
import { acres, shapeFor } from './api';
import BorderMap, { ShapeThumb } from './BorderMap';
import { useBorderClient, useBorderDecision, useBorderJob, useMintLandTitle } from './hooks';
import { PointsStep, clearPoints, readPoints } from './SendLocation';
import { Loading } from '../register/Boot';
import { TxScreens } from '../stellar/TxStatus';
import { Notice, Sheet } from '../plan/ui';

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
// The farm name, else a keypad member's name (O17: she has no wallet yet), else her Polygon address as the union knows her.
export const memberName = (job) => job?.farm || job?.name || short(job?.polygon || job?.member);
const btn = (primary) => ({ flex: 1, height: 44, borderRadius: R.button, border: 0, fontWeight: 700, fontSize: 14, fontFamily: FONT,
  background: primary ? C.accent : C.raised, color: primary ? C.ink : C.text });
const DONE = ['accepted', 'left_out'];

// The map fills the screen behind the card; the card is the app's one map card (plan/ui.jsx Sheet, 28 Oct): header row
// inside the card, drag line, clear of the tab bar. It starts at 40 % of the screen.
const TOP = 0.4;

function Frame({ name, onBack, map, children }) {
  const top = Math.round(window.innerHeight * TOP);
  const shown = map ? cloneElement(map, { fitBottom: window.innerHeight - top }) : null;
  return (
    <Sheet map={shown} title={name} onBack={onBack} top={top + 24} noSettings>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </Sheet>
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

/** L2 "+ Add a point" (26 Oct): another field for this member, taken on the leader's phone (R5–R7). */
const AddRow = ({ onClick }) => (
  <button type="button" onClick={onClick} style={{ width: '100%', minHeight: 48, borderRadius: 12, border: `1.5px dashed ${C.muted}`, background: 'transparent',
    color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>+ Add a point</button>
);

/** L2a: shapes are being drawn (first run, or one field again after None fit). */
function Fetch({ job, onBack, onAdd }) {
  const again = job.fields.find((f) => f.state === 'drawing' && f.round > 0);
  return (
    <Frame name={memberName(job)} onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} drawing active={again?.n} />}>
      <Head title={again ? `Drawing field ${again.n} again` : 'Finding field borders'} sub="Drawing shapes, please wait" />
      {job.fields.map((f) => (
        <FieldRow key={f.n} f={f} right={f.state === 'drawing' ? (f.round > 0 ? 'Drawing again' : 'Drawing') : f.state === 'accepted' ? 'Accepted' : f.state === 'left_out' ? 'Left out' : 'Waiting'} />
      ))}
      <AddRow onClick={onAdd} />
    </Frame>
  );
}

/** A neighbour plot the runs found (28 Oct, DESIGN GAP: no board): add it to an accepted field, make it a field of
 *  its own, or leave it out. Shown in the card while a plot on the map is picked. */
function PlotChoice({ job, plot, onClose }) {
  const { addPlot, newField } = useBorderDecision(job.id);
  const busy = addPlot.isPending || newField.isPending;
  const err = addPlot.error || newField.error;
  const accepted = job.fields.filter((f) => f.state === 'accepted');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Head title={`Plot next to the fields · ${acres(plot.acres)}`} sub="Part of this land? Add it to a field or make it a field of its own." />
      {accepted.map((f) => (
        <button key={f.n} type="button" disabled={busy} style={{ ...btn(false), flex: 'none' }}
          onClick={() => addPlot.mutate({ field: f.n, plot: plot.id }, { onSuccess: onClose })}>Add to field {f.n}</button>
      ))}
      {!accepted.length && <p role="note" style={{ margin: 0, fontSize: 14, color: C.muted }}>Accept a field first to add this plot to it.</p>}
      <button type="button" disabled={busy} style={{ ...btn(true), flex: 'none' }}
        onClick={() => newField.mutate({ plot: plot.id }, { onSuccess: onClose })}>{newField.isPending ? 'Adding…' : 'Make it a new field'}</button>
      <button type="button" disabled={busy} style={{ ...btn(false), flex: 'none', background: 'transparent' }} onClick={onClose}>Leave it out</button>
      {err && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{err.message}</p>}
    </div>
  );
}

/** L2: the best combination for every field, proposed from the first shapes (28 Oct): accept it at once, or check
 *  field by field. While a field is still drawn the plan is shown with a note that more shapes are coming. */
function Plan({ job, onField, onBack, onAdd }) {
  const open = job.fields.filter((f) => f.state !== 'left_out');
  const [plotId, setPlotId] = useState();
  const plot = (job.plots || []).find((p) => p.id === plotId);
  const { acceptPlan } = useBorderDecision(job.id);
  const drawing = job.fields.filter((f) => f.state === 'drawing');
  const waiting = job.fields.filter((f) => f.state === 'ready' && job.plan?.[String(f.n)]);
  return (
    <Frame name={memberName(job)} onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} onField={onField} plots={job.plots || []} plotOn={plotId} onPlot={setPlotId} />}>
      {plot ? <PlotChoice job={job} plot={plot} onClose={() => setPlotId()} /> : (<>
      <Head title={`${open.length} fields · proposed plan`} sub="Accept the plan, or tap a field to check it" />
      {drawing.length > 0 && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: C.muted }}>
          {drawing.map((f) => `Field ${f.n}`).join(', ')} still being drawn. More shapes are coming; the plan may change.
        </p>
      )}
      {waiting.length > 0 && (
        <button type="button" disabled={acceptPlan.isPending} style={{ ...btn(true), flex: 'none' }}
          onClick={() => acceptPlan.mutate()}>{acceptPlan.isPending ? 'Accepting…' : `Accept this plan (${waiting.length} field${waiting.length === 1 ? '' : 's'})`}</button>
      )}
      {acceptPlan.error && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{acceptPlan.error.message}</p>}
      {(job.plots || []).length > 0 && (
        <p role="note" style={{ margin: 0, fontSize: 14, color: C.muted }}>Dotted outlines on the map: plots next to the fields. Tap one to add it.</p>
      )}
      {job.fields.map((f) => {
        const s = shapeFor(f, job.plan);
        const busy = f.state === 'drawing';
        return <FieldRow key={f.n} f={f} sub={f.state === 'left_out' ? 'Left out' : busy ? 'Drawing the shapes, please wait' : f.state === 'empty' ? 'No shape left: check it' : s ? acres(s.acres) : ''}
          right={busy ? (f.round > 0 ? 'Drawing again' : 'Drawing') : f.accepted ? 'Accepted' : undefined}
          onClick={f.state === 'left_out' || busy ? undefined : () => onField(f.n)} />;
      })}
      <AddRow onClick={onAdd} />
      <button type="button" disabled style={{ ...btn(true), flex: 'none', opacity: 0.5 }}>Mint land title</button>
      </>)}
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
  const { accept, noneFit, preview, retry } = useBorderDecision(job.id);
  const busy = accept.isPending || noneFit.isPending || retry.isPending;
  const err = accept.error || noneFit.error || preview.error;
  const pick = async (id) => {
    setSel(id);
    if (id === (job.plan?.[String(n)])) { setPlan(job.plan); return; }
    try { const r = await preview.mutateAsync({ field: n, shape: id }); setPlan(r.plan || r); } catch { /* shown below */ }
  };
  if (!f) return null;
  // The fencing itself failed (Earth Engine, the satellite tiles): an error screen as N6/N8 (executive decision 21 Oct;
  // no board for this case), her point stays, the leader tries again.
  if (shapes.length === 0 && f.error) {
    return (
      <ErrorFull title={`Field ${n}: the shapes could not be drawn`} text="The member's point stays where it was put. Try again in a moment."
        rows={[['Reason', /satellite|ndvi|earth engine|gee|tile/i.test(f.error) ? 'Satellite data did not load' : 'The drawing did not finish']]}
        primary={retry.isPending ? 'Trying again…' : 'Try again'} busy={retry.isPending} onPrimary={() => retry.mutate({ field: n }, { onSuccess: onDone })}
        secondary="Back to all fields" onSecondary={onBack} />
    );
  }
  const chosen = shapes.find((s) => s.id === sel);
  const holds = chosen?.holds?.length || 0;
  const moved = Object.keys(plan || {}).filter((k) => Number(k) !== n && plan[k] !== job.plan?.[k]);
  return (
    <Frame name={memberName(job)} onBack={onBack}
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
      {/* DESIGN GAP: no board for a field whose every shape overlaps an accepted field (e.g. two points a few metres
          apart): say so, Accept stays off, None fit draws it again from a moved point. */}
      {shapes.length === 0 && (
        <p role="note" style={{ margin: 0, fontSize: 14, color: C.text }}>No shape left for this field. Press None fit to draw it again from a point a few metres away.</p>
      )}
      {holds > 0 && (
        <Notice kind="warn" title={`This shape covers field ${chosen.holds.join(', ')} too`}>
          Accepting it takes that land from {chosen.holds.length > 1 ? 'those fields' : 'that field'}. Pick a smaller shape if the member sees them as separate fields.
        </Notice>
      )}
      {moved.length > 0 && <p role="note" style={{ margin: 0, fontSize: 14, color: C.muted }}>{moved.map((k) => `Field ${k}`).join(', ')} {moved.length > 1 ? 'change' : 'changes'} too</p>}
      {err && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{err.message}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={busy} style={btn(false)} onClick={() => noneFit.mutate({ field: n }, { onSuccess: onDone })}>None fit</button>
        <button type="button" disabled={busy || !sel} style={{ ...btn(true), opacity: busy || !sel ? 0.4 : 1 }}
          onClick={() => accept.mutate({ field: n, shape: sel }, { onSuccess: onDone })}>{accept.isPending ? 'Accepting…' : 'Accept'}</button>
      </div>
    </Frame>
  );
}

/** L4: every field accepted (or left out): mint her land title. */
function Done({ job, onField, onBack, onAdd }) {
  const mint = useMintLandTitle(job.id);
  const [farm, setFarm] = useState('');   // the title's name: hers from R6, else the leader names it here
  const [plotId, setPlotId] = useState();
  const plot = (job.plots || []).find((p) => p.id === plotId);
  const ok = job.fields.filter((f) => f.state === 'accepted');
  const total = ok.reduce((a, f) => a + (shapeFor(f, job.plan)?.acres || 0), 0);
  // A failed mint, or an error the beat recorded while it retries, shows even while the job is still 'minting'.
  const st = job.status === 'minted' || job.mint?.status === 'minted' ? 'minted'
    : job.mint?.status === 'failed' || job.mint?.error ? 'failed'
      : job.status === 'minting' || ['pending', 'processing'].includes(job.mint?.status) ? 'minting' : null;
  // N1 / N2 / N3 around the mint (26 Oct): pending while the node mints the title on Polygon, then confirmed (back to
  // Tasks after 5 s) or failed (try again). Closed while pending, the card below shows the state.
  const [closed, setClosed] = useState(false);
  const [started, setStarted] = useState(false);   // the result screens only for a mint asked for here
  const minting = mint.isPending || st === 'minting';
  if (!closed && (minting || (started && (st === 'minted' || st === 'failed' || mint.error)))) {
    const tx = {
      status: st === 'minted' ? 'success' : st === 'failed' || mint.error ? 'failed' : 'pending',
      label: 'Minting the land title',
      rows: [['Land', job.farm || farm || 'Land title'], ['Fields', `${ok.length} · ${total.toFixed(2)} acres`], ['For', memberName(job)]],
      when: new Date(),
      reason: mint.error?.message || job.mint?.error || 'The mint failed.',
    };
    return <TxScreens tx={tx} network="Polygon" onClose={() => { setClosed(true); if (st === 'minted') onBack(); }}
      onRetry={() => { mint.reset(); mint.mutate(job.farm ? {} : { farm: farm.trim() }); }} />;
  }
  return (
    <Frame name={memberName(job)} onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} onField={st ? undefined : onField} plots={st ? [] : job.plots || []} plotOn={plotId} onPlot={st ? undefined : setPlotId} />}>
      {plot ? <PlotChoice job={job} plot={plot} onClose={() => setPlotId()} /> : (<>
      <Head title={`${ok.length} fields · all accepted`} sub={`Total ${total.toFixed(2)} acres`} />
      {job.fields.map((f) => (
        <FieldRow key={f.n} f={f} sub={f.state === 'left_out' ? 'Left out' : acres(shapeFor(f, job.plan)?.acres)} right={f.state === 'accepted' ? 'Accepted' : undefined}
          onClick={st || f.state === 'left_out' ? undefined : () => onField(f.n)} />
      ))}
      {!st && <AddRow onClick={onAdd} />}
      {st === 'minting' && <p role="status" style={{ margin: 0, fontSize: 14, color: C.muted }}>Minting the land title. The member gets a notification when it is ready.</p>}
      {st === 'minted' && <p role="status" style={{ margin: 0, fontSize: 14, color: C.accent, fontWeight: 700 }}>Land title minted.</p>}
      {(st === 'failed' || mint.error) && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{mint.error?.message || job.mint?.error || 'The mint failed.'}</p>}
      {!st && !job.farm && (
        <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>Name of the land
          <input value={farm} onChange={(e) => setFarm(e.target.value)} maxLength={64}
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: `1px solid ${C.muted}`, background: C.raised, color: C.text }} />
        </label>
      )}
      {!st && !job.polygon && (
        // Points taken before the member opened the SMS link (26 Oct): the title is minted to the phone's address, which
        // joins the job when the member opens the link. A step for the member: a waiting card, not a hint.
        <Notice kind="warn" title="Waiting for the member">
          The member opens the app link from the SMS on their phone. The land title is minted to that phone, so minting starts right after.
        </Notice>
      )}
      {!st && (job.polygon
        ? <button type="button" disabled={mint.isPending || !ok.length || (!job.farm && !farm.trim())} style={{ ...btn(true), flex: 'none' }}
          onClick={() => { setStarted(true); setClosed(false); mint.mutate(job.farm ? {} : { farm: farm.trim() }); }}>Mint land title</button>
        : <button type="button" disabled style={{ ...btn(false), flex: 'none', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: R.round, border: `2px solid ${C.muted}`, borderTopColor: 'transparent', animation: 'nila-spin 1s linear infinite' }} />
          <style>{'@keyframes nila-spin{to{transform:rotate(360deg)}}'}</style>
          Waiting for the member to open the SMS
        </button>)}
      {st === 'minted' && <button type="button" style={{ ...btn(false), flex: 'none' }} onClick={onBack}>Back to tasks</button>}
      </>)}
    </Frame>
  );
}

/** tasks/border/<id>/add: more points for this member's open job, on the leader's phone (R5–R7, 26 Oct). */
function AddPoints({ job, onDone }) {
  const api = useBorderClient();
  const qc = useQueryClient();
  const key = `job-${job.id}`;
  const add = useMutation({
    mutationFn: () => api.addPoints(job.id, readPoints(key).points.map(({ lat, lng, acc }) => ({ lat, lng, acc }))),
    onSuccess: (j) => { clearPoints(key); qc.invalidateQueries({ queryKey: ['oracle', 'border'] }); qc.setQueryData(['oracle', 'border', 'job', job.id], j); onDone(); },
  });
  if (add.isPending) return <Loading />;
  if (add.error) return <ErrorFull title="The points were not added" text={add.error.message} primary="Try again" onPrimary={() => add.mutate()} secondary="Back to all fields" onSecondary={onDone} />;
  const pts = job.fields.map((f) => f.moved || f.point).filter(Boolean);
  const accepted = job.fields.filter((f) => f.accepted).map((f) => f.shapes?.find((s) => s.id === f.accepted)?.geometry || f.accepted_shape?.geometry).filter(Boolean);
  return <PointsStep evm={key} forName={memberName(job)} onDone={() => add.mutate()} onBack={onDone} startAt={pts.at(-1) || null} shapes={accepted} />;
}

/** tasks/border/<id>[/<field> | /add] */
export default function LeaderBorder({ id, field, go }) {
  const q = useBorderJob(id);
  const job = q.data;
  const toTasks = useCallback(() => go('tasks'), [go]);
  const toPlan = useCallback(() => go(`tasks/border/${id}`), [go, id]);
  const toField = useCallback((n) => go(`tasks/border/${id}/${n}`), [go, id]);
  const toAdd = useCallback(() => go(`tasks/border/${id}/add`), [go, id]);
  if (q.isLoading || !job) {
    return <div style={{ padding: 16, fontFamily: FONT, color: q.error ? C.coral : C.muted }}>{q.error ? q.error.message : '…'}</div>;
  }
  if (job.status === 'failed') {
    return <div style={{ padding: 16, fontFamily: FONT, color: C.coral }}>{job.mint?.error || 'The shapes could not be drawn.'} The member sends the field location again. <button type="button" onClick={toTasks} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700 }}>Back to tasks</button></div>;
  }
  if (field === 'add' && ['drawing', 'ready'].includes(job.status)) return <AddPoints job={job} onDone={toPlan} />;
  // One field drawn again (26 Oct): the others stay on L2 to check meanwhile; L2a only while no field has shapes yet.
  const drawingN = (n) => job.fields.some((f) => f.n === n && f.state === 'drawing');
  if (job.status === 'drawing' && !job.fields.some((f) => f.shapes?.length)) return <Fetch job={job} onBack={toTasks} onAdd={toAdd} />;
  if (field && field !== 'add' && !drawingN(Number(field)) && !['minting', 'minted'].includes(job.status)) return <Check key={`${field}:${job.updated}`} job={job} n={Number(field)} onDone={toPlan} onBack={toPlan} />;
  const allDone = job.status !== 'drawing' && job.fields.every((f) => DONE.includes(f.state)) && job.fields.some((f) => f.state === 'accepted');
  if (allDone || ['minting', 'minted'].includes(job.status)) return <Done job={job} onField={toField} onBack={toTasks} onAdd={toAdd} />;
  return <Plan job={job} onField={toField} onBack={toTasks} onAdd={toAdd} />;
}
