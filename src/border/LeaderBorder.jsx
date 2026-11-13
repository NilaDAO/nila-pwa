// L2a / L2 / L3 / L4 — the leader checks the field borders Nila drew from her points (boards LeaderBorderFetch,
// LeaderBorderPlan, LeaderBorderCheck, LeaderBorderDone; spec notes/page-member.md "field-borders"). The job's
// state picks the board: drawing → L2a (#retry-fN when a field is drawn again), ready → L2, a field → L3, every
// field accepted or left out → L4 (mint). Data: the node's border job (O16). DESIGN GAP: no member names in the
// app (the farm name or a short address stands in).
import { cloneElement, useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { C, FONT, R } from '../shell/tokens';
import ErrorFull from '../shell/ErrorFull';
import { acres, shapeFor } from './api';
import BorderMap, { SOIL_COLOUR, ShapeThumb, soilInk } from './BorderMap';
import { useBorderClient, useBorderDecision, useBorderJob, useMintLandTitle } from './hooks';
import { PointsStep, clearPoints, readPoints } from './SendLocation';
import { Loading } from '../register/Boot';
import { TxScreens } from '../stellar/TxStatus';
import { Notice, Sheet } from '../plan/ui';
import { TrashIcon } from '../shell/icons';
import { ConfirmCard } from '../shell/SettingsParts';
import CameraView from '../shell/CameraView';
import { useNilaSigner } from '../wallet/signer';
import { ensureKeypadAccount, readAccountUnion, useStellarConfig } from '../stellar/hooks';
import { isDeployed } from '../stellar/soroban';
import { readSessionQr } from '../stellar/session';

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
// The farm name, else a keypad member's name (O17: she has no wallet yet), else her Polygon address as the union knows her.
export const memberName = (job) => job?.farm || job?.name || short(job?.polygon || job?.member);
const btn = (primary) => ({ flex: 1, height: 44, borderRadius: R.button, border: 0, fontWeight: 700, fontSize: 14, fontFamily: FONT,
  background: primary ? C.accent : C.raised, color: primary ? C.ink : C.text });
// 'inside' (1 Nov): the field's point lies in another field's accepted shape, so that field holds it; minted with it.
const DONE = ['accepted', 'left_out', 'inside'];
const insideText = (f) => `Inside field ${f.inside}`;
// The name given with the field's point (R6, R7; 12 Nov: it was dropped before the node and the title), else its number.
const fieldName = (f) => f?.name || `Field ${f?.n}`;

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

/** A field's soil (13 Nov): five chips with the local names, numbers 1–5 on the title (1 red, 2 black, 3 sandy,
 *  4 clay / tank silt, 5 gravelly). Required before the mint. */
const SOILS = [[1, 'Red', 'semmann'], [2, 'Black', 'karisal'], [3, 'Sandy', ''], [4, 'Clay / tank silt', 'vandal'], [5, 'Gravelly', '']];
function SoilPick({ value, onPick }) {
  // As the shape tiles above (13 Nov): one row of tiles of the same width, an accent border on the one picked, its
  // earth colour as a swatch where a shape tile has its picture.
  return (
    <div role="group" aria-label="Soil" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>Soil</span>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
        {SOILS.map(([n, label, local]) => (
          <button key={n} type="button" aria-pressed={value === n} aria-label={`${label}${local ? ` (${local})` : ''}`} onClick={() => onPick(n)}
            style={{ flex: '1 0 72px', minWidth: 0, border: `2px solid ${value === n ? C.accent : C.raised}`, borderRadius: 12, background: C.raised,
              padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch', color: C.text, fontFamily: FONT, cursor: 'pointer' }}>
            <span aria-hidden="true" style={{ height: 36, background: SOIL_COLOUR[n] }} />
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, padding: '4px 2px 0', textAlign: 'center' }}>{label === 'Clay / tank silt' ? 'Clay' : label}</span>
            <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.2, padding: '0 2px 4px', textAlign: 'center', minHeight: 13 }}>{local}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldRow({ f, sub, right, onClick }) {
  // A field with its soil chosen (13 Nov): the whole row in the soil's colour, its number on the dark circle.
  const soil = SOIL_COLOUR[f.soil];
  const ink = soil ? soilInk(soil) : C.text;
  const quiet = soil ? { color: ink, opacity: 0.8 } : { color: C.muted };
  return (
    <button type="button" onClick={onClick} disabled={!onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: soil || C.raised, border: 0, borderRadius: 12, padding: '12px 16px', color: ink, fontFamily: FONT, fontSize: 14 }}>
      <span style={{ width: 24, height: 24, borderRadius: R.round, background: C.ink, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>{f.n}</span>
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}><b>{fieldName(f)}</b>{sub && <span style={quiet}>{sub}</span>}</span>
      {right && <span style={quiet}>{right}</span>}
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
        <FieldRow key={f.n} f={f} right={f.state === 'drawing' ? (f.round > 0 ? 'Drawing again' : 'Drawing') : f.state === 'accepted' ? 'Accepted' : f.state === 'left_out' ? 'Left out' : f.state === 'inside' ? insideText(f) : 'Waiting'} />
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
          onClick={() => addPlot.mutate({ field: f.n, plot: plot.id }, { onSuccess: onClose })}>Add to {fieldName(f)}</button>
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
  return (
    <Frame name={memberName(job)} onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} onField={onField} plots={job.plots || []} plotOn={plotId} onPlot={setPlotId} />}>
      {plot ? <PlotChoice job={job} plot={plot} onClose={() => setPlotId()} /> : (<>
      <Head title={`${open.length} fields · proposed plan`} sub="Tap each field to check and accept it" />
      {/* 13 Nov: no "Accept this plan": each field is accepted on its own, with its shape and its soil (L3). */}
      {job.fields.map((f) => {
        const s = shapeFor(f, job.plan);
        const busy = f.state === 'drawing';
        return <FieldRow key={f.n} f={f} sub={f.state === 'left_out' ? 'Left out' : busy ? 'Drawing the shapes, please wait' : f.state === 'inside' ? insideText(f) : f.state === 'empty' ? 'No shape left: check it' : s ? acres(s.acres) : ''}
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
  const [soil, setSoil] = useState(0);   // 13 Nov: picked with the shape; a field accepted before keeps its own
  const plan = job.plan;
  const { accept, noneFit, retry, remove } = useBorderDecision(job.id);
  const [ask, setAsk] = useState(false);   // the delete confirm (1 Nov)
  const busy = accept.isPending || noneFit.isPending || retry.isPending || remove.isPending;
  const err = accept.error || noneFit.error || remove.error;
  // A tap only selects the shape (executive decision 4 Nov): no preview call to the node; Accept returns the new plan.
  const pick = (id) => setSel(id);
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
  const soilNow = soil || f.soil || 0;
  const moved = Object.keys(plan || {}).filter((k) => Number(k) !== n && plan[k] !== job.plan?.[k]);
  return (
    <Frame name={memberName(job)} onBack={onBack}
      map={<BorderMap fields={job.fields} plan={plan} active={n} shapeOverride={sel} onField={() => {}} soils={soilNow ? { [n]: soilNow } : {}} />}>
      {/* 13 Nov: the member's name is in the header already; no second line. */}
      <Head title={fieldName(f)} />
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
      {/* 13 Nov: a field is accepted with its shape and its soil (the leader is on the land); the soil goes on the title. */}
      {shapes.length > 0 && <SoilPick value={soilNow} onPick={setSoil} />}
      {/* DESIGN GAP: no board for a field whose every shape overlaps an accepted field (e.g. two points a few metres
          apart): say so, Accept stays off, None fit draws it again from a moved point. */}
      {shapes.length === 0 && (
        <p role="note" style={{ margin: 0, fontSize: 14, color: C.text }}>{f.state === 'inside'
          ? `This point lies inside field ${f.inside}, so it is part of that field and the land title can be minted. Is it a field of its own? Press None fit to draw it again from a point a few metres away.`
          : 'No shape left for this field. Press None fit to draw it again from a point a few metres away.'}</p>
      )}
      {holds > 0 && (
        <Notice kind="warn" title={`This shape covers field ${chosen.holds.join(', ')} too`}>
          Accepting it takes that land from {chosen.holds.length > 1 ? 'those fields' : 'that field'}. Pick a smaller shape if the member sees them as separate fields.
        </Notice>
      )}
      {moved.length > 0 && <p role="note" style={{ margin: 0, fontSize: 14, color: C.muted }}>{moved.map((k) => `Field ${k}`).join(', ')} {moved.length > 1 ? 'change' : 'changes'} too</p>}
      {err && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{err.message}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Delete the field and its point (executive decision 1 Nov), after a confirm. */}
        <button type="button" aria-label={`Delete field ${n}`} disabled={busy} onClick={() => setAsk(true)}
          style={{ ...btn(false), flex: 'none', width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <TrashIcon color={C.coral} size={20} />
        </button>
        <button type="button" disabled={busy} style={btn(false)} onClick={() => noneFit.mutate({ field: n }, { onSuccess: onDone })}>None fit</button>
        <button type="button" disabled={busy || !sel || !soilNow} style={{ ...btn(true), opacity: busy || !sel || !soilNow ? 0.4 : 1 }}
          onClick={() => accept.mutate({ field: n, shape: sel, soil: soilNow }, { onSuccess: onDone })}>{accept.isPending ? 'Accepting…' : 'Accept'}</button>
      </div>
      {ask && (
        <ConfirmCard title={`Delete field ${n}`} ok={remove.isPending ? 'Deleting…' : 'Delete'} okStyle={{ background: C.coral }} okDisabled={remove.isPending}
          warn="The field and its point are removed from this land. To add it again, use + Add a point."
          onCancel={() => setAsk(false)} onOk={() => remove.mutate({ field: n }, { onSuccess: () => { setAsk(false); onDone(); }, onError: () => setAsk(false) })} />
      )}
    </Frame>
  );
}

/** Before the mint (4 Nov): whether the member's account exists on-chain and names this union. A member holds no XLM,
 *  so her own phone no longer makes it; a member added before then (or whose L14 join failed) shows her help QR here
 *  and this leader's app makes and joins the account (kind 4 / 5 join; the leader's own XLM pays). The leader's own
 *  title, an address that is not a smart account, or a node without the account deployer: no step. */
function useMemberJoined(job) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const member = job.member;
  const check = !!cfg?.contracts?.account_deployer && /^C[A-Z2-7]{55}$/.test(member || '') && member !== s?.stellarAddress;
  const q = useQuery({
    queryKey: ['stellar', 'member-joined', member], enabled: check, staleTime: 15_000,
    queryFn: async () => (await isDeployed(cfg, member)) && !!(await readAccountUnion(cfg, member).catch(() => null)),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const [tries, setTries] = useState(0);
  const scan = async (t) => {
    let r;
    try { r = readSessionQr(t); } catch (e) { setError(e.message); setTries((x) => x + 1); return; }
    if (r.member !== member) { setError("This is another member's QR."); setTries((x) => x + 1); return; }
    if (!r.join) { setError('This QR cannot join the account. The member updates the Nila app and shows the QR again.'); setTries((x) => x + 1); return; }
    setError(undefined); setBusy(true);
    try {
      const out = await ensureKeypadAccount(cfg, s, { account: member, first_signer: r.join.signer, set_union: r.join });
      if (!out.union) throw new Error('no union');
      await q.refetch();
    } catch (e) {
      console.error('[L4] account not made or union not set', e);
      setError(e.message === 'no union' ? 'Could not join the account to the union. Try again.' : e.message);
      setTries((x) => x + 1);
    } finally { setBusy(false); }
  };
  // Not known yet (or no check): the mint is not held back.
  return { needed: check && q.data === false, busy, error, tries, scan };
}

/** L4: every field accepted (or left out): mint her land title. */
function Done({ job, onField, onBack, onAdd }) {
  const mint = useMintLandTitle(job.id);
  const joined = useMemberJoined(job);
  const [farm, setFarm] = useState('');   // the title's name: hers from R6, else the leader names it here
  // Whether the member rents the land (13 Nov; kept with the job, not on the public title). The fields' soils are
  // accepted with their shapes on L3.
  const [tenant, setTenant] = useState(false);
  const [plotId, setPlotId] = useState();
  const plot = (job.plots || []).find((p) => p.id === plotId);
  const ok = job.fields.filter((f) => f.state === 'accepted');
  // 13 Nov: the soils shown on the map go with the mint, so the title has them even if the node lost one.
  const soils = Object.fromEntries(ok.filter((f) => f.soil).map((f) => [String(f.n), f.soil]));
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
      onRetry={() => { mint.reset(); mint.mutate({ ...(job.farm ? {} : { farm: farm.trim() }), soils, tenant }); }} />;
  }
  return (
    <Frame name={memberName(job)} onBack={onBack}
      map={<BorderMap fields={job.fields} plan={job.plan} onField={st ? undefined : onField} plots={st ? [] : job.plots || []} plotOn={plotId} onPlot={st ? undefined : setPlotId} />}>
      {plot ? <PlotChoice job={job} plot={plot} onClose={() => setPlotId()} /> : (<>
      <Head title={`${ok.length} fields · all accepted`} sub={`Total ${total.toFixed(2)} acres`} />
      {job.fields.map((f) => (
        <div key={f.n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldRow f={f} sub={f.state === 'left_out' ? 'Left out' : f.state === 'inside' ? insideText(f) : acres(shapeFor(f, job.plan)?.acres)} right={f.state === 'accepted' ? 'Accepted' : undefined}
            onClick={st || f.state === 'left_out' ? undefined : () => onField(f.n)} />
        </div>
      ))}
      {!st && <AddRow onClick={onAdd} />}
      {st === 'minting' && <p role="status" style={{ margin: 0, fontSize: 14, color: C.muted }}>Minting the land title. The member gets a notification when it is ready.</p>}
      {st === 'minted' && <p role="status" style={{ margin: 0, fontSize: 14, color: C.accent, fontWeight: 700 }}>Land title minted.</p>}
      {(st === 'failed' || mint.error) && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{mint.error?.message || job.mint?.error || 'The mint failed.'}</p>}
      {!st && !job.farm && (
        // On the land title, so anyone can read it (12 Nov): the label says so, the placeholder steers away from a person's name.
        <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>Name this land (publicly visible)
          <input value={farm} onChange={(e) => setFarm(e.target.value)} maxLength={64} placeholder="e.g. Lake side farm, not a person's name"
            style={{ padding: 10, fontSize: 16, borderRadius: 8, border: `1px solid ${C.muted}`, background: C.raised, color: C.text }} />
        </label>
      )}
      {!st && (
        // 13 Nov: kept with the job (not on the public title).
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={tenant} onChange={(e) => setTenant(e.target.checked)} style={{ width: 20, height: 20, accentColor: C.accent }} />
          The member rents this land (tenant)
        </label>
      )}
      {!st && !job.polygon && (
        // Points taken before the member opened the SMS link (26 Oct): the title is minted to the phone's address, which
        // joins the job when the member opens the link. A step for the member: a waiting card, not a hint.
        <Notice kind="warn" title="Waiting for the member">
          The member opens the app link from the SMS on their phone. The land title is minted to that phone, so minting starts right after.
        </Notice>
      )}
      {!st && job.polygon && joined.needed && (
        // DESIGN GAP: no board for this step (4 Nov).
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Head title="Scan the member's help QR" sub="The member's account is not made yet. The member opens Your QR in the Nila app; your phone makes the account, then you mint." />
          {joined.busy ? <p role="status" style={{ margin: 0, fontSize: 14, color: C.muted }}>Making the member's account…</p>
            : <CameraView key={joined.tries} mode="qr" onText={joined.scan} />}
          {joined.error && <p role="alert" style={{ margin: 0, fontSize: 14, color: C.coral }}>{joined.error}</p>}
        </div>
      )}
      {!st && (job.polygon
        ? <button type="button" disabled={mint.isPending || joined.needed || !ok.length || (!job.farm && !farm.trim()) } style={{ ...btn(true), flex: 'none' }}
          onClick={() => { setStarted(true); setClosed(false); mint.mutate({ ...(job.farm ? {} : { farm: farm.trim() }), soils, tenant }); }}>Mint land title</button>
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
    mutationFn: () => api.addPoints(job.id, readPoints(key).points.map(({ lat, lng, acc, name }) => ({ lat, lng, acc, ...(name ? { name } : {}) }))),
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
