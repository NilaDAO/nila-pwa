// The start for a new member (P11; nila-design notes reg-recover): after R1–R4 (src/register/Start.jsx) R9 union
// and R10 updates, then the Crop plan. A member never maps her fields (4 Nov, G15): the leader maps every title.
// R9 (decision 008, 3 Nov) lists the anchor's union directory (src/union/directory.js), nearest first; the node's own
// union alone when there is none. Recover (only the missing R9 / R13 / R10)
// is src/register/RecoverSteps.jsx.
import { useMemo, useState } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { checkLeader } from '../shell/leader';
import { setDBitem } from '../utils/db';
import { useNilaSigner } from '../wallet/signer';
import { subscribeUser } from '../features/apis/pushManager';
import { Page } from '../border/SendLocation';
import { clearDemoNew } from './AfterCode';
import { anim, btnDisabled, btnPrimary, btnSecondary } from './RegFrame';
import { unionChoices, useRoughLocation, useUnions } from '../union/directory';

// Today's one union (the Polygon registry's entry, src/components/Forms/memberUnion.js). DESIGN GAP: from the node.
const UNIONS = [{ name: 'Mother Theresa Union', rep: 'Mrs. Rosalie Susairaj', polygon: '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070',
  location: [11.878671, 78.964561] }];
// No R13 any more (26 Oct): every member starts in assist mode; the identity check or Settings switches to self.
// After the code (28 Oct, executive decision): R9 union and R10 updates, then straight to the Crop plan.
const START_STEPS = ['union', 'notify'];
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
  if (u.polygon) {
    try { const r = await isLeader(u.polygon, evm); leader = r === undefined ? undefined : Boolean(r); } catch { leader = undefined; }
  }
  // A union from the anchor's directory without a Polygon address (decision 008): `address` holds its Stellar address,
  // which the Polygon reads skip (they need 0x…); `stellar` is the union her account names (set_union).
  await setDBitem('union', { leader, transfer: true, address: u.polygon || u.stellar, stellar: u.stellar, rep: u.rep, name: u.name,
    chain: 137, location: u.location }, 'Init');
  writeUnion(evm, { name: u.name, polygon: u.polygon, stellar: u.stellar });
  return leader;
}
/** The union a title holder belongs to while there is one union (24 Oct, R9 skipped on recovery). */
export const UNIONS_ONE = () => UNIONS[0];
export const unionByPolygon = (polygon) => UNIONS.find((u) => u.polygon.toLowerCase() === String(polygon || '').toLowerCase());

const regKey = (evm) => `nila.reg.${(evm || 'none').toLowerCase()}`;
const readReg = (evm) => { try { return JSON.parse(localStorage.getItem(regKey(evm))) || {}; } catch { return {}; } };
const writeReg = (evm, v) => { try { localStorage.setItem(regKey(evm), JSON.stringify(v)); } catch { /* kept in memory only */ } };


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

const UnionIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;

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

/** R9: select a union (decision 008, 3 Nov): the anchor's union directory, nearest first; without one, the node's own
 *  union alone. A union whose details changed since the trust admitted it is shown with a note and can be picked. */
export function UnionStep({ union, evm, onDone }) {
  const { data: cfg } = useStellarConfig();
  const position = useRoughLocation();
  const dir = useUnions(cfg?.anchor_url, position);
  const choices = useMemo(() => unionChoices({ dir: dir.data, cfgUnion: union, known: UNIONS[0], position }), [dir.data, union, position]);
  const [picked, setPicked] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const s = useNilaSigner();
  const pick = choices.find((u) => u.stellar === picked) || (choices.length === 1 ? choices[0] : null);
  const q = query.trim().toLowerCase();
  const shown = q ? choices.filter((u) => u.name.toLowerCase().includes(q)) : choices;
  // As today's union step (components/Forms/memberUnion.js): the union goes into Init (the leader check on the Polygon
  // RolesRegistry only for a union that has a Polygon address), so a leader opens the leader app.
  const saveUnion = async () => {
    if (!pick) return;
    setBusy(true);
    const leader = await saveUnionRecord(checkLeader, pick, evm);   // shell/leader.js retries until the chain answers
    // Member-owned accounts (3 Nov): her account names the union she chose (set_union, her own signature). Not
    // waited for: if her account is not made yet, the signer names it once it is (wallet/PrivyRoot, from the record).
    s?.stellarSetup?.joinUnion?.(pick.stellar).catch((e) => console.error('[R9] union not set on the account', e));
    setBusy(false);
    onDone({ ...pick, address: pick.stellar, leader: !!leader });
  };
  const waiting = !choices.length && (dir.isLoading || !cfg);
  return (
    <Page title="Select a union" info="Select a reputable union in your area that offers financial services tailored to your needs as a farmer. Go to settings to switch unions.">
      {choices.length > SEARCH_FROM && (
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search unions by name"
          style={{ height: 44, borderRadius: 12, border: 0, background: '#1F2733', color: '#F1F5F9', fontFamily: 'inherit', fontSize: 14,
            padding: '0 16px', boxSizing: 'border-box', width: '100%' }} />
      )}
      <div role="radiogroup" aria-label="Unions" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '45vh', overflowY: 'auto' }}>
        {shown.map((u) => <Choice key={u.stellar} icon={<UnionIcon />} checked={pick?.stellar === u.stellar} onClick={() => setPicked(u.stellar)}
          title={u.name} sub={unionLine(u)} />)}
        {waiting && <p role="status" style={{ margin: 0, color: '#94A3B8', fontSize: 14, textAlign: 'center' }}>Looking for unions…</p>}
        {!waiting && q && !shown.length && <p style={{ margin: 0, color: '#94A3B8', fontSize: 14, textAlign: 'center' }}>No union with that name.</p>}
      </div>
      <button type="button" style={!pick || busy ? btnDisabled : btnPrimary} disabled={!pick || busy} onClick={saveUnion}>Save</button>
    </Page>
  );
}

const SEARCH_FROM = 6;
const km = (d) => (d < 10 ? `${d.toFixed(1)} km away` : `${Math.round(d)} km away`);
/** The line under a union's name: its distance, and a note when its details changed since the trust admitted it. */
function unionLine(u) {
  const parts = [];
  if (Number.isFinite(u.distance_km)) parts.push(km(u.distance_km));
  if (!u.matches) parts.push('Details changed since the trust confirmed them');
  return parts.join(' · ') || null;
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

export default function Registration({ onStarted }) {
  const s = useNilaSigner();
  const evm = s?.evmAddress;
  const { data: cfg } = useStellarConfig();
  const [reg, setReg] = useState(() => readReg(evm));
  const save = (v) => { const next = { ...reg, ...v }; setReg(next); writeReg(evm, next); };
  const step = START_STEPS.includes(reg.step) ? reg.step : START_STEPS[0];
  const next = (extra = {}) => save({ ...extra, step: START_STEPS[START_STEPS.indexOf(step) + 1] });
  // The start ends after R10 (28 Oct: no reload): the shell opens the Crop plan; the leader app comes from the
  // chain's roles (StellarGate), so the union record R9 wrote need not be read again.
  const started = () => { markOnboarded(evm); clearDemoNew(evm); onStarted?.(); };

  if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(union) => next({ union })} />;
  return <NotifyStep evm={evm} onDone={started} />;
}
