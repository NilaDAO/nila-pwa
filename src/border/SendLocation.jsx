// R5–R7 and R14 — she sends a point for each field (boards SendLocation-v3np, SendLocation-af51-95is,
// SendLocationOffline, RegDone-fji8), as steps of registration (src/register/Registration.jsx; notes reg-recover:
// R5–R7 → R8 → R9 → R13 → R10 → R14). Points wait on the phone (R7, per account) until registration ends; then they
// are sent with her union (R9) and the node draws the shapes for a leader to check (L2a–L4). R14 waits for the mint.
// The boards ask a field name per point (R6, R7), no farm name: the title's name is given by the leader at L4.
import { useEffect, useState } from 'react';
import { C, FONT, R } from '../shell/tokens';
import RegFrame, { Bouncing, FieldFrame, btnDisabled, btnPrimary, btnSecondary, cardTitle, fieldInput, sheetText } from '../register/RegFrame';

const MAX = 6;
const EMPTY = { points: [], farm: '', finish: false };
// Per account: on a shared phone (assisted mode) one member's points never go out under the next member's login.
const keyOf = (evm) => `nila.border.points.${(evm || 'none').toLowerCase()}`;
export const readPoints = (evm) => { try { return JSON.parse(localStorage.getItem(keyOf(evm))) || EMPTY; } catch { return EMPTY; } };
const write = (evm, v) => { try { localStorage.setItem(keyOf(evm), JSON.stringify(v)); } catch { /* the queue lives in memory only */ } };
export const clearPoints = (evm) => { try { localStorage.removeItem(keyOf(evm)); } catch { /* nothing kept */ } };

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

export const primary = { width: '100%', height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontSize: 14, fontFamily: FONT };
export const secondary = { ...primary, background: C.raised, color: C.text };

/** A registration step on the board frame (src/register/RegFrame.jsx): the card holds the title and the step. */
export function Page({ title, onBack, info, logo, children }) {
  return (
    <RegFrame onBack={onBack} info={info} logo={logo}>
      {title && <h1 style={cardTitle}>{title}</h1>}
      {children}
    </RegFrame>
  );
}

/** R14 (board RegDone-fji8): her points are with the union; the title is minted after a leader checked the borders.
 *  DESIGN GAP: the offline, failed and error lines have no board. */
export function Waiting({ job, sending, error, onRetry }) {
  return (
    <Page info="Please wait for your union to finish.">
      <div style={cardTitle}>Your union will mint your land title</div>
      <Bouncing />
      {sending && <p role="status" style={{ ...sheetText, margin: 0, textAlign: 'center' }}>Your points are sent when you are online.</p>}
      {job?.status === 'failed' && <p role="alert" style={{ margin: 0, color: C.coral, fontSize: 14 }}>{job.mint?.error || 'Your fields could not be drawn.'} Send your field location again.</p>}
      {error && <p role="alert" style={{ margin: 0, color: C.coral, fontSize: 14 }}>{error}</p>}
      {(error || job?.status === 'failed') && onRetry && <button type="button" style={btnSecondary} onClick={onRetry}>Try again</button>}
    </Page>
  );
}

const WifiOff = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h.01" /><path d="M8.5 16.43a5 5 0 0 1 7 0" /><path d="M5 12.86a10 10 0 0 1 5.17-2.69" /><path d="M19 12.86a10 10 0 0 0-2-1.52" />
    <path d="M2 8.82a15 15 0 0 1 4.18-2.64" /><path d="M22 8.82a15 15 0 0 0-11.29-3.76" /><path d="m2 2 20 20" />
  </svg>
);

/** R5 / R6 / R7 (boards SendLocation-v3np, SendLocation-af51-95is, SendLocationOffline): one point per field, saved
 *  on the phone; from the second field on she names the field before sending its point; offline the points wait
 *  ("Saved, not sent yet"). "All my fields have a point" ends the step.
 *  DESIGN GAP: a location error (permission off, not found) has no board; a short line in the sheet says what to do. */
export function PointsStep({ evm, onDone }) {
  const online = useOnline();
  const [q, setQ] = useState(() => readPoints(evm));
  const [name, setName] = useState('');
  const [gps, setGps] = useState(null);
  const save = (v) => { setQ(v); write(evm, v); };

  const locate = () => {
    if (!navigator.geolocation) { setGps({ error: 'This phone cannot find its location.' }); return; }
    setGps({ busy: true });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pt = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), ts: Math.floor(p.timestamp / 1000),
          name: name.trim() || undefined };
        save({ ...q, points: [...q.points, pt].slice(0, MAX) });
        setName(''); setGps(null);
      },
      (e) => setGps({ error: e.code === 1 ? 'Allow location for this app in your phone settings.' : 'Your location was not found. Try again outside.' }),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  };
  const finish = () => { save({ ...q, finish: true }); onDone(); };

  const n = q.points.length;
  const first = n === 0;
  return (
    <FieldFrame points={n}>
      <div style={cardTitle}>{first ? 'Walk to your first field' : 'Walk to the center of your next field'}</div>
      {first && <div style={sheetText}>Stand in the middle of your field. Send a point for each field where you have the right to cultivate.</div>}
      {!online && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', ...sheetText }}>
          <div style={{ width: 20, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><WifiOff /></div>
          <span>You are offline. Your points stay on this phone and are sent when you are online.</span>
        </div>
      )}
      {!online && n > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 12,
          background: '#1F2733', padding: '0 14px', fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ color: '#94A3B8' }}>Saved, not sent yet</span><span style={{ fontWeight: 700 }}>{n} {n === 1 ? 'point' : 'points'}</span>
        </div>
      )}
      {!first && n < MAX && (
        <input type="text" aria-label="Field name" placeholder="Field name" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} style={fieldInput} />
      )}
      {gps?.error && <div role="alert" style={{ ...sheetText, color: C.coral }}>{gps.error}</div>}
      {n < MAX && (
        <button type="button" style={gps?.busy ? btnDisabled : btnPrimary} disabled={gps?.busy} onClick={locate}>
          {!online ? 'Save this location' : first ? 'Send my location' : 'Send another location'}
        </button>
      )}
      {n > 0 && <button type="button" style={btnSecondary} onClick={finish}>All my fields have a point</button>}
    </FieldFrame>
  );
}
