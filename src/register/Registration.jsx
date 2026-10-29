// Registration for a new member (P11; nila-design notes reg-recover): after R1–R4 (src/register/Start.jsx) a member
// with no land title goes
//   R5–R7 field points → R8 plastic sheet → R9 union → R13 who uses the app → R10 updates → R14 wait for the title.
// Her points are sent at the end, with the union she chose (O16 POST /border/points); offline they stay on the
// phone (R7) and go out from R14 once she is online. R14 ends when her land title is on Polygon (notes
// r14-title-check) → the crop plan (CP1).
// DESIGN GAPS (Docs/P11-Field-Borders.md): R8 has no detection behind it on the Stellar path (her choice is kept on
// the phone); R9 lists today's one union from /stellar/config, its name and leader from the app (no union names on
// the node yet), and 'Filter on my region' changes nothing with one union. Recover (only the missing R9 / R13 / R10)
// is src/register/RecoverSteps.jsx.
import { useEffect, useState } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { checkLeader } from '../shell/leader';
import { setDBitem } from '../utils/db';
import { useNilaSigner } from '../wallet/signer';
import { subscribeUser } from '../features/apis/pushManager';
import { useMyBorderJob, useSendFieldPoints } from '../border/hooks';
import { Page, PointsStep, Waiting, clearPoints, readPoints, useOnline } from '../border/SendLocation';
import { Loading } from './Boot';
import { clearDemoNew } from './AfterCode';

export const pointsSentKey = (evm) => `nila.reg.sent.${(evm || '').toLowerCase()}`;
const markPointsSent = (evm) => { try { localStorage.setItem(pointsSentKey(evm), '1'); } catch { /* not kept */ } };
export const pointsSent = (evm) => { try { return localStorage.getItem(pointsSentKey(evm)) === '1'; } catch { return false; } };
import { MapFrame, MapStage, anim, btnDisabled, btnPrimary, btnSecondary, cardTitle, sheetText } from './RegFrame';

// Today's one union (the Polygon registry's entry, src/components/Forms/memberUnion.js). DESIGN GAP: from the node.
const UNIONS = [{ name: 'Mother Theresa Union', rep: 'Mrs. Rosalie Susairaj', polygon: '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070',
  location: [11.878671, 78.964561] }];
// No R13 any more (26 Oct): every member starts in assist mode; the identity check or Settings switches to self.
// After the code (28 Oct, executive decision): R9 union and R10 updates, then straight to the Crop plan; the field
// points (R5–R8 → R14) start from its "Mint a new land title" (#/crop/register), never before the app.
const START_STEPS = ['union', 'notify'];
const FIELD_STEPS = ['points', 'sheet', 'done'];
const onboardedKey = (evm) => `nila.reg.onboarded.${(evm || '').toLowerCase()}`;
export const onboarded = (evm) => { try { return localStorage.getItem(onboardedKey(evm)) === '1'; } catch { return false; } };
const markOnboarded = (evm) => { try { localStorage.setItem(onboardedKey(evm), '1'); } catch { /* not kept */ } };

// Her union per wallet, on the phone (notes reg-recover: a recover skips R9 when it is there). The leader flag is
// checked again on the chain at every recover, never taken from here.
const unionKey = (evm) => `nila.union.${(evm || 'none').toLowerCase()}`;
export const readUnion = (evm) => { try { return JSON.parse(localStorage.getItem(unionKey(evm))) || null; } catch { return null; } };
const writeUnion = (evm, u) => { try { localStorage.setItem(unionKey(evm), JSON.stringify(u)); } catch { /* asked again at the next recover */ } };

/** The union record in Init, with the leader check on the Polygon RolesRegistry (as memberUnion.js). */
export async function saveUnionRecord(isLeader, u, evm) {
  let leader;
  try { const r = await isLeader(u.polygon, evm); leader = r === undefined ? undefined : Boolean(r); } catch { leader = undefined; }
  await setDBitem('union', { leader, transfer: true, address: u.polygon, rep: u.rep, name: u.name, chain: 137, location: u.location }, 'Init');
  writeUnion(evm, { name: u.name, polygon: u.polygon });
  return leader;
}
/** The union a title holder belongs to while there is one union (24 Oct, R9 skipped on recovery). */
export const UNIONS_ONE = () => UNIONS[0];
export const unionByPolygon = (polygon) => UNIONS.find((u) => u.polygon.toLowerCase() === String(polygon || '').toLowerCase());

const regKey = (evm) => `nila.reg.${(evm || 'none').toLowerCase()}`;
const readReg = (evm) => { try { return JSON.parse(localStorage.getItem(regKey(evm))) || {}; } catch { return {}; } };
const writeReg = (evm, v) => { try { localStorage.setItem(regKey(evm), JSON.stringify(v)); } catch { /* kept in memory only */ } };
const setMode = (m) => { try { localStorage.setItem('nila.mode', m); } catch { /* kept for this session only */ } };


/** The confirm card over a 60% dark layer (boards SheetVerify-88ia #later, RegNotify-52am #skip): a warning line,
 *  Cancel and Accept; tapping the layer = Cancel. */
function Confirm({ text, onCancel, onAccept }) {
  return (
    <>
      <div aria-hidden="true" className="nila-motion" onClick={onCancel} style={{ animation: anim.scrim, position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" aria-describedby="confirm-body" className="nila-motion" style={{ animation: anim.confirm, position: 'fixed', left: 8, right: 8, bottom: 88, zIndex: 21,
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
function SheetStep({ evm, onDone }) {
  const [later, setLater] = useState(false);
  return (
    <MapFrame map={readPoints(evm).points}>
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
    </MapFrame>
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
export function UnionStep({ union, evm, onDone }) {
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  // As today's union step (components/Forms/memberUnion.js): the union goes into Init with the leader check on
  // the Polygon RolesRegistry, so a leader opens the leader app.
  const saveUnion = async () => {
    setBusy(true);
    const u = UNIONS[pick];
    const leader = await saveUnionRecord(checkLeader, u, evm);   // shell/leader.js retries until the chain answers
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
export function ModeStep({ rep, onDone }) {
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
export function NotifyStep({ evm, onDone }) {
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try { await subscribeUser(evm); } catch { /* the step goes on; Settings can enable it later */ }
    setBusy(false);
    onDone();
  };
  return (
    <Page drop title="Your union would like to send you updates." info="You need to enable notifications so your union can send you information requests.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 24, paddingBottom: 24 }}>
        <button type="button" style={busy ? btnDisabled : btnPrimary} disabled={busy} onClick={enable}>Enable</button>
        <button type="button" style={btnSecondary} onClick={() => setSkip(true)}>Skip</button>
      </div>
      {skip && <Confirm text="Until you enable notifications, some services are unavailable." onCancel={() => setSkip(false)} onAccept={onDone} />}
    </Page>
  );
}

/** R14: sends the points saved on the phone (now, or once online), then waits for the title. */
function DoneStep({ evm, reg, onTitle, onRestart, cfgUnion }) {
  const online = useOnline();
  const mine = useMyBorderJob();
  const send = useSendFieldPoints();
  const q = readPoints(evm);
  const pending = q.finish && q.points.length > 0;
  useEffect(() => {
    if (online && pending && !send.isPending && !send.isSuccess && !send.isError && !mine.isLoading
      && !(mine.data && mine.data.status !== 'failed')) {
      send.mutate({ points: q.points, farm: (q.farm || '').trim(), union: reg.union?.address || cfgUnion }, { onSuccess: () => clearPoints(evm) });
    }
  }, [online, pending, send, mine.isLoading, mine.data, q, reg, evm, cfgUnion]);
  // Once her points are with the node, back to the Crop plan (28 Oct): its card says the union mints the title (a
  // leader checks and mints there), so nobody waits on R14.
  useEffect(() => {
    if (!pending && mine.data && mine.data.status !== 'failed') { markPointsSent(evm); clearDemoNew(evm); onTitle(); }
  }, [pending, mine.data, evm, onTitle]);
  const failed = mine.data?.status === 'failed' && !pending;
  return <Waiting job={failed ? mine.data : null} sending={pending && !online} error={send.error?.message}
    onRetry={failed ? onRestart : () => send.reset()} />;
}

export default function Registration({ onTitle, onStarted, fields = false }) {
  const s = useNilaSigner();
  const evm = s?.evmAddress;
  const { data: cfg } = useStellarConfig();
  const mine = useMyBorderJob();
  const [reg, setReg] = useState(() => readReg(evm));
  const save = (v) => { const next = { ...reg, ...v }; setReg(next); writeReg(evm, next); };
  const steps = fields ? FIELD_STEPS : START_STEPS;
  // Fields: a job already with the union (open or minted) means its points are in.
  const open = fields && mine.data && mine.data.status !== 'failed';
  const step = open ? 'done' : (steps.includes(reg.step) ? reg.step : steps[0]);
  const next = (extra = {}) => save({ ...extra, step: steps[steps.indexOf(step) + 1] });
  // The start ends after R10 (28 Oct: no reload): the shell opens the Crop plan; the leader app comes from the
  // chain's roles (StellarGate), so the union record R9 wrote need not be read again.
  const started = () => { markOnboarded(evm); clearDemoNew(evm); save({ step: FIELD_STEPS[0] }); onStarted?.(); };

  if (mine.isLoading) return <Loading />;
  if (!fields) {
    if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(union) => next({ union })} />;
    return <NotifyStep evm={evm} onDone={started} />;
  }
  // R5–R8: one map screen; the stage stays mounted, only the card changes (no remount of the map).
  if (step === 'points' || step === 'sheet') {
    return (
      <MapStage>
        {step === 'points' ? <PointsStep evm={evm} onDone={() => next()} /> : <SheetStep evm={evm} onDone={(sheet) => next({ sheet })} />}
      </MapStage>
    );
  }
  return <DoneStep evm={evm} reg={reg} cfgUnion={cfg?.union} onTitle={onTitle} onRestart={() => { clearPoints(evm); save({ step: 'points' }); }} />;
}
