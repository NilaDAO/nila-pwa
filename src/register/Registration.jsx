// Registration for a new member (P11; nila-design notes reg-recover): after the login (R1–R4, the existing
// Cognito/demo login, not rebuilt here) a member with no land title goes
//   R5–R7 field points → R8 plastic sheet → R9 union → R13 who uses the app → R10 updates → R14 wait for the title.
// Her points are sent at the end, with the union she chose (O16 POST /border/points); offline they stay on the
// phone (R7) and go out from R14 once she is online. R14 ends when her land title is on Polygon (notes
// r14-title-check) → the crop plan (CP1).
// DESIGN GAPS (Docs/P11-Field-Borders.md): R8 has no detection behind it on the Stellar path (her choice is kept on
// the phone); R9 lists today's one union from /stellar/config, its name and leader from the app (no union names on
// the node yet), and 'Filter on my region' changes nothing with one union; recover (skip R5–R8 and R14, ask only
// what is missing) is not built here.
import { useEffect, useState } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { useIsLeader } from '../hooks/useLoadFunds.ts';
import { setDBitem } from '../utils/db';
import { useNilaSigner } from '../wallet/signer';
import { subscribeUser } from '../features/apis/pushManager';
import { useMyBorderJob, useSendFieldPoints } from '../border/hooks';
import { Page, PointsStep, Waiting, clearPoints, primary, readPoints, secondary, useOnline } from '../border/SendLocation';
import { C, R } from '../shell/tokens';

// Today's one union (the Polygon registry's entry, src/components/Forms/memberUnion.js). DESIGN GAP: from the node.
const UNIONS = [{ name: 'Mother Theresa Union', rep: 'Mrs. Rosalie Susairaj', polygon: '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070',
  location: [11.878671, 78.964561] }];
const STEPS = ['points', 'sheet', 'union', 'mode', 'notify', 'done'];

const regKey = (evm) => `nila.reg.${(evm || 'none').toLowerCase()}`;
const readReg = (evm) => { try { return JSON.parse(localStorage.getItem(regKey(evm))) || {}; } catch { return {}; } };
const writeReg = (evm, v) => { try { localStorage.setItem(regKey(evm), JSON.stringify(v)); } catch { /* kept in memory only */ } };
const setMode = (m) => { try { localStorage.setItem('nila.mode', m); } catch { /* kept for this session only */ } };


/** The confirm card over a 60% dark layer (notes: confirms are overlays; tapping the layer = Cancel). */
function Confirm({ title, text, onCancel, onAccept }) {
  return (
    <div role="dialog" aria-modal="true" onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ margin: '0 8px 88px', width: '100%', background: C.raised, borderRadius: R.card,
        padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16, color: C.text }}>
        {title && <b>{title}</b>}
        <p style={{ margin: 0, color: C.muted }}>{text}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={secondary} onClick={onCancel}>Cancel</button>
          <button type="button" style={primary} onClick={onAccept}>Accept</button>
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v }) {
  return (
    <div style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: C.muted }}>{k}</span><b>{v}</b>
    </div>
  );
}

/** R8: a plastic sheet in one field, seen on the next satellite overpass. */
function SheetStep({ onDone }) {
  const [later, setLater] = useState(false);
  return (
    <Page title="Place a plastic sheet in your field">
      <h2 style={{ fontSize: 16, margin: 0 }}>Place a plastic sheet in one of your fields</h2>
      <p style={{ margin: 0, color: C.muted }}>Lay a plastic sheet flat on the ground inside one of your fields. Make sure it is plastic. Weigh the corners down with stones so it stays in place. On the next satellite overpass we will detect it.</p>
      <Fact k="Size" v="at least 4 m × 4 m" />
      <Fact k="Leave it in place" v="11 days" />
      <button type="button" style={primary} onClick={() => onDone('placed')}>I placed the sheet</button>
      <button type="button" style={secondary} onClick={() => setLater(true)}>I can do this later</button>
      {later && <Confirm text="Until the plastic sheet is detected on your field, some services are unavailable."
        onCancel={() => setLater(false)} onAccept={() => onDone('later')} />}
    </Page>
  );
}

function Choice({ checked, onClick, title, sub }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick} style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%', padding: '14px 16px',
      background: C.raised, color: C.text, border: checked ? `2px solid ${C.accent}` : '2px solid transparent', borderRadius: 12,
    }}>
      <span aria-hidden style={{ width: 18, height: 18, borderRadius: R.round, marginTop: 2, flexShrink: 0,
        border: `2px solid ${checked ? C.accent : C.muted}`, background: checked ? C.accent : 'transparent' }} />
      <span><b style={{ display: 'block' }}>{title}</b>{sub && <span style={{ color: C.muted, fontSize: 14 }}>{sub}</span>}</span>
    </button>
  );
}

/** R9: select a union. */
function UnionStep({ union, evm, onDone }) {
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const { isLeader } = useIsLeader({ address: evm });
  // As today's union step (components/Forms/memberUnion.js): the union goes into Init with the leader check on
  // the Polygon RolesRegistry, so a leader opens the leader app.
  const saveUnion = async () => {
    setBusy(true);
    const u = UNIONS[pick];
    let leader;
    try { leader = Boolean(await isLeader(u.polygon, evm)); } catch { leader = undefined; }
    await setDBitem('union', { leader, transfer: true, address: u.polygon, rep: u.rep, name: u.name, chain: 137, location: u.location }, 'Init');
    setBusy(false);
    onDone({ ...u, address: union, leader: !!leader });
  };
  return (
    <Page title="Select a union" info="Select a reputable union in your area that offers financial services tailored to your needs as a farmer. Go to settings to switch unions.">
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {UNIONS.map((u, i) => <Choice key={u.name} checked={pick === i} onClick={() => setPick(i)} title={u.name} sub={u.rep} />)}
      </div>
      <button type="button" style={primary} disabled={!union || busy} onClick={saveUnion}>Save</button>
      <button type="button" style={secondary}>Filter on my region</button>
    </Page>
  );
}

/** R13: who uses the app (stored as nila.mode, self | assist). */
function ModeStep({ rep, onDone }) {
  const [mode, setM] = useState('self');
  const name = (rep || '').replace(/^(Mrs?|Ms)\.\s*/, '');
  return (
    <Page title="Who uses the app?" info="You can change this later in Settings.">
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Choice checked={mode === 'self'} onClick={() => setM('self')} title="I do it myself" sub="You send, spend and register yourself." />
        <Choice checked={mode === 'assist'} onClick={() => setM('assist')} title="My union leader helps me" sub={`${name || 'Your union leader'} does the steps. You look and press Confirm.`} />
      </div>
      <button type="button" style={primary} onClick={() => { setMode(mode); onDone(); }}>Save</button>
    </Page>
  );
}

/** R10: updates (push notifications from her union). */
function NotifyStep({ evm, onDone }) {
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try { await subscribeUser(evm); } catch { /* the step goes on; Settings can enable it later */ }
    setBusy(false);
    onDone();
  };
  return (
    <Page title="Your union would like to send you updates.">
      <button type="button" style={primary} disabled={busy} onClick={enable}>Enable</button>
      <button type="button" style={secondary} onClick={() => setSkip(true)}>Skip</button>
      {skip && <Confirm title="You need to enable notifications so your union can send you information requests."
        text="Until you enable notifications, some services are unavailable." onCancel={() => setSkip(false)} onAccept={onDone} />}
    </Page>
  );
}

/** R14: sends the points saved on the phone (now, or once online), then waits for the title. */
function DoneStep({ evm, reg, onTitle, onRestart }) {
  const online = useOnline();
  const mine = useMyBorderJob();
  const send = useSendFieldPoints();
  const q = readPoints(evm);
  const pending = q.finish && q.points.length > 0;
  useEffect(() => {
    if (online && pending && !send.isPending && !send.isSuccess && !send.isError && !mine.isLoading
      && !(mine.data && mine.data.status !== 'failed')) {
      send.mutate({ points: q.points, farm: q.farm.trim(), union: reg.union?.address }, { onSuccess: () => clearPoints(evm) });
    }
  }, [online, pending, send, mine.isLoading, mine.data, q, reg, evm]);
  useEffect(() => { if (mine.data?.status === 'minted') onTitle(); }, [mine.data, onTitle]);
  // A union leader does not wait on R14: once her points are with the node the app opens as the leader app.
  useEffect(() => { if (reg.union?.leader && !pending && mine.data) window.location.reload(); }, [reg.union, pending, mine.data]);
  const failed = mine.data?.status === 'failed' && !pending;
  return <Waiting job={failed ? mine.data : null} sending={pending && !online} error={send.error?.message}
    onRetry={failed ? onRestart : () => send.reset()} />;
}

export default function Registration({ onTitle }) {
  const s = useNilaSigner();
  const evm = s?.evmAddress;
  const { data: cfg } = useStellarConfig();
  const mine = useMyBorderJob();
  const [reg, setReg] = useState(() => readReg(evm));
  const save = (v) => { const next = { ...reg, ...v }; setReg(next); writeReg(evm, next); };
  // A job already with the union (open or minted) means registration is done on this or another phone.
  const open = mine.data && mine.data.status !== 'failed';
  const step = open ? 'done' : (STEPS.includes(reg.step) ? reg.step : 'points');
  const next = (extra = {}) => save({ ...extra, step: STEPS[STEPS.indexOf(step) + 1] });

  if (mine.isLoading) return <Page title="Send your field location"><p style={{ color: C.muted }}>…</p></Page>;
  if (step === 'points') return <PointsStep evm={evm} onDone={() => next()} />;
  if (step === 'sheet') return <SheetStep onDone={(sheet) => next({ sheet })} />;
  if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(union) => next({ union })} />;
  if (step === 'mode') return <ModeStep rep={reg.union?.rep} onDone={() => next()} />;
  if (step === 'notify') return <NotifyStep evm={evm} onDone={() => next()} />;
  return <DoneStep evm={evm} reg={reg} onTitle={onTitle} onRestart={() => { clearPoints(evm); save({ step: 'points' }); }} />;
}
