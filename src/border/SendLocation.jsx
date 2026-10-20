// R5–R7 and R14 — she sends a point for each field (boards SendLocation-v3np, SendLocation-af51-95is,
// SendLocationOffline, RegDone-fji8), as steps of registration (src/register/Registration.jsx; notes reg-recover:
// R5–R7 → R8 → R9 → R13 → R10 → R14). Points wait on the phone (R7, per account) until registration ends; then they
// are sent with her union (R9) and the node draws the shapes for a leader to check (L2a–L4). R14 waits for the mint.
// DESIGN GAP: the boards have no farm-name field; the title mint needs a name, so an optional one is asked here.
import { useEffect, useState } from 'react';
import { C, FONT, R } from '../shell/tokens';

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

export function Page({ title, onBack, children }) {
  return (
    <div style={{ padding: '16px 16px 88px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {onBack && <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0, alignSelf: 'flex-start' }}>← Back</button>}
      {title && <h1 style={{ fontSize: 16, margin: 0 }}>{title}</h1>}
      {children}
    </div>
  );
}

/** R14: her points are with the union; the title is minted after a leader checked the borders. */
export function Waiting({ job, sending, error, onRetry }) {
  return (
    <Page>
      <div style={{ fontWeight: 700, fontSize: 22, color: '#FFFFFF' }}>nila</div>
      <h1 style={{ fontSize: 16, margin: 0 }}>Your union will mint your land title</h1>
      <p style={{ margin: 0, color: C.muted }}>Please wait for your union to finish.</p>
      {sending && <p role="status" style={{ margin: 0, color: C.muted }}>Your points are sent when you are online.</p>}
      {job?.status === 'failed' && <p role="alert" style={{ margin: 0, color: C.coral }}>{job.mint?.error || 'Your fields could not be drawn.'} Send your field location again.</p>}
      {error && <p role="alert" style={{ margin: 0, color: C.coral }}>{error}</p>}
      {(error || job?.status === 'failed') && onRetry && <button type="button" style={secondary} onClick={onRetry}>Try again</button>}
    </Page>
  );
}

/** R5 / R6 / R7: one point per field, saved on the phone; "All my fields have a point" ends the step. */
export function PointsStep({ evm, onDone }) {
  const online = useOnline();
  const [q, setQ] = useState(() => readPoints(evm));
  const [gps, setGps] = useState(null);
  const save = (v) => { setQ(v); write(evm, v); };

  const locate = () => {
    if (!navigator.geolocation) { setGps({ error: 'This phone cannot find its location.' }); return; }
    setGps({ busy: true });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pt = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), ts: Math.floor(p.timestamp / 1000) };
        save({ ...q, points: [...q.points, pt].slice(0, MAX) });
        setGps({ acc: pt.acc });
      },
      (e) => setGps({ error: e.code === 1 ? 'Allow location for this app in your phone settings.' : 'Your location was not found. Try again outside.' }),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  };
  const finish = () => { save({ ...q, finish: true }); onDone(); };

  const n = q.points.length;
  const first = n === 0;
  return (
    <Page title={online ? 'Send your field location' : 'Send your field location: offline'}>
      <h2 style={{ fontSize: 16, margin: 0 }}>{first ? 'Walk to your first field' : 'Walk to the center of your next field'}</h2>
      {first && online && <p style={{ margin: 0, color: C.muted }}>Stand in the middle of your field. Send a point for each field where you have the right to cultivate.</p>}
      {!online && <p style={{ margin: 0, color: C.muted }}>You are offline. Your points stay on this phone and are sent when you are online.</p>}
      {n > 0 && (
        <div style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{online ? 'Points' : 'Saved, not sent yet'}</span><b>{n} {n === 1 ? 'point' : 'points'}</b>
        </div>
      )}
      {gps?.acc != null && <p role="status" style={{ margin: 0, color: C.muted }}>Point {n} saved · accuracy ±{gps.acc} m</p>}
      {gps?.error && <p role="alert" style={{ margin: 0, color: C.coral }}>{gps.error}</p>}
      {n < MAX && (
        <button type="button" style={first ? primary : secondary} disabled={gps?.busy} onClick={locate}>
          {gps?.busy ? 'Finding your location…' : !online ? 'Save this location' : first ? 'Send my location' : 'Send another location'}
        </button>
      )}
      {n > 0 && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: C.muted }}>
            Name of your farm (optional)
            <input value={q.farm} onChange={(e) => save({ ...q, farm: e.target.value.slice(0, 40) })}
              style={{ height: 40, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px' }} />
          </label>
          <button type="button" style={primary} onClick={finish}>All my fields have a point</button>
        </>
      )}
    </Page>
  );
}
