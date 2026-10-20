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
import { Page, PointsStep, Waiting, clearPoints, readPoints, useOnline } from '../border/SendLocation';
import { C, R } from '../shell/tokens';
import { Loading } from './Boot';
import { FieldFrame, btnDisabled, btnPrimary, btnSecondary, cardTitle, sheetText } from './RegFrame';

// Today's one union (the Polygon registry's entry, src/components/Forms/memberUnion.js). DESIGN GAP: from the node.
const UNIONS = [{ name: 'Mother Theresa Union', rep: 'Mrs. Rosalie Susairaj', polygon: '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070',
  location: [11.878671, 78.964561] }];
const STEPS = ['points', 'sheet', 'union', 'mode', 'notify', 'done'];

const regKey = (evm) => `nila.reg.${(evm || 'none').toLowerCase()}`;
const readReg = (evm) => { try { return JSON.parse(localStorage.getItem(regKey(evm))) || {}; } catch { return {}; } };
const writeReg = (evm, v) => { try { localStorage.setItem(regKey(evm), JSON.stringify(v)); } catch { /* kept in memory only */ } };
const setMode = (m) => { try { localStorage.setItem('nila.mode', m); } catch { /* kept for this session only */ } };


/** The confirm card over a 60% dark layer (boards SheetVerify-88ia #later, RegNotify-52am #skip): a warning line,
 *  Cancel and Accept; tapping the layer = Cancel. */
function Confirm({ text, onCancel, onAccept }) {
  return (
    <>
      <div aria-hidden="true" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" aria-describedby="confirm-body" style={{ position: 'fixed', left: 8, right: 8, bottom: 88, zIndex: 21,
        background: '#121212', borderRadius: 24, boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px',
        padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
          </svg>
          <div id="confirm-body" style={{ fontSize: 14, lineHeight: 1.5, color: '#F1F5F9' }}>{text}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={{ ...btnSecondary, flex: 1 }} onClick={onCancel}>Cancel</button>
          <button type="button" style={{ ...btnPrimary, flex: 1 }} onClick={onAccept}>Accept</button>
        </div>
      </div>
    </>
  );
}

const SizeIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 9h16" /><path d="M9 4v16" /></svg>;
const DaysIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>;

function Fact({ icon, k, v, line }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 0', boxSizing: 'border-box', fontSize: 14,
      lineHeight: 1.5, borderTop: line ? '1px solid #1F2733' : 'none' }}>
      <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9999, background: '#1F2733', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flexGrow: 1, color: '#94A3B8' }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
}

/** R8 (board SheetVerify-88ia): a plastic sheet in one field, seen on the next satellite overpass. */
function SheetStep({ onDone }) {
  const [later, setLater] = useState(false);
  return (
    <FieldFrame sheet>
      <div style={cardTitle}>Place a plastic sheet in one of your fields</div>
      <div style={sheetText}>Lay a plastic sheet flat on the ground inside one of your fields. Make sure it is plastic. Weigh the corners down with stones so it stays in place. On the next satellite overpass we will detect it.</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Fact icon={<SizeIcon />} k="Size" v="at least 4 m × 4 m" />
        <Fact icon={<DaysIcon />} k="Leave it in place" v="11 days" line />
      </div>
      <button type="button" style={btnPrimary} onClick={() => onDone('placed')}>I placed the sheet</button>
      <button type="button" style={btnSecondary} onClick={() => setLater(true)}>I can do this later</button>
      {later && <Confirm text="Until the plastic sheet is detected on your field, some services are unavailable."
        onCancel={() => setLater(false)} onAccept={() => onDone('later')} />}
    </FieldFrame>
  );
}

const UnionIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const SelfIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /><path d="m17 11 2 2 4-4" /></svg>;

/** A radio row (boards RegUnion-nj7b, RegAssist): icon, name and line, the radio mark on the right. */
function Choice({ checked, onClick, title, sub, icon }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '12px 16px', boxSizing: 'border-box', border: 0,
      borderRadius: 12, background: '#1F2733', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, color: '#F1F5F9', textAlign: 'left',
      cursor: 'pointer', boxShadow: checked ? 'inset 0 0 0 2px #D4CF5A' : 'none' }}>
      <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9999, background: '#121212', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 700 }}>{title}</span>{sub && <span style={{ color: '#94A3B8' }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 20, height: 20, flexShrink: 0, boxSizing: 'border-box', borderRadius: 9999,
        border: `2px solid ${checked ? '#D4CF5A' : '#94A3B8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <span style={{ width: 10, height: 10, borderRadius: 9999, background: '#D4CF5A' }} />}
      </span>
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
        {UNIONS.map((u, i) => <Choice key={u.name} icon={<UnionIcon />} checked={pick === i} onClick={() => setPick(i)} title={u.name} sub={u.rep} />)}
      </div>
      <button type="button" style={!union || busy ? btnDisabled : btnPrimary} disabled={!union || busy} onClick={saveUnion}>Save</button>
      <button type="button" style={btnSecondary}>Filter on my region</button>
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
        <Choice icon={<SelfIcon />} checked={mode === 'self'} onClick={() => setM('self')} title="I do it myself" sub="You send, spend and register yourself." />
        <Choice icon={<UnionIcon />} checked={mode === 'assist'} onClick={() => setM('assist')} title="My union leader helps me" sub={`${name || 'Your union leader'} does the steps. You look and press Confirm.`} />
      </div>
      <button type="button" style={btnPrimary} onClick={() => { setMode(mode); onDone(); }}>Save</button>
    </Page>
  );
}

/** R10 (board RegNotify-52am): updates (push notifications from her union); Skip asks to confirm. */
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
    <Page title="Your union would like to send you updates." info="You need to enable notifications so your union can send you information requests.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 24, paddingBottom: 24 }}>
        <button type="button" style={busy ? btnDisabled : btnPrimary} disabled={busy} onClick={enable}>Enable</button>
        <button type="button" style={btnSecondary} onClick={() => setSkip(true)}>Skip</button>
      </div>
      {skip && <Confirm text="Until you enable notifications, some services are unavailable." onCancel={() => setSkip(false)} onAccept={onDone} />}
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
      send.mutate({ points: q.points, farm: (q.farm || '').trim(), union: reg.union?.address }, { onSuccess: () => clearPoints(evm) });
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

  if (mine.isLoading) return <Loading />;
  if (step === 'points') return <PointsStep evm={evm} onDone={() => next()} />;
  if (step === 'sheet') return <SheetStep onDone={(sheet) => next({ sheet })} />;
  if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(union) => next({ union })} />;
  if (step === 'mode') return <ModeStep rep={reg.union?.rep} onDone={() => next()} />;
  if (step === 'notify') return <NotifyStep evm={evm} onDone={() => next()} />;
  return <DoneStep evm={evm} reg={reg} onTitle={onTitle} onRestart={() => { clearPoints(evm); save({ step: 'points' }); }} />;
}
