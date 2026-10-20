// R5–R7 and R14 — she sends a point for each field (boards SendLocation-v3np, SendLocation-af51-95is,
// SendLocationOffline, RegDone-fji8), as steps of registration (src/register/Registration.jsx; notes reg-recover:
// R5–R7 → R8 → R9 → R13 → R10 → R14). Points wait on the phone (R7, per account) until registration ends; then they
// are sent with her union (R9) and the node draws the shapes for a leader to check (L2a–L4). R14 waits for the mint.
// The boards ask a field name per point (R6, R7), no farm name: the title's name is given by the leader at L4.
import { useEffect, useState } from 'react';
import { C, FONT, R } from '../shell/tokens';
import RegFrame, { Bouncing, MapFrame, btnDisabled, btnPrimary, btnSecondary, cardTitle, fieldInput, sheetText } from '../register/RegFrame';

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
export function Page({ title, onBack, info, logo, drop, children }) {
  return (
    <RegFrame onBack={onBack} info={info} logo={logo} drop={drop}>
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

/** R5 / R6 / R7 (boards SendLocation-v3np, SendLocation-af51-95is, SendLocationOffline; executive decisions 20 Oct).
 *  Before the first point: "Share my location" asks the phone; "Choose on the map" lets her move the map instead
 *  (today's off-site mode, the pin is her point). Then for every field: "Save this location" puts the point on the
 *  map (R6's marker: black inside, amber border); the buttons wait until she names it; the name shows on the map as a
 *  chip (A4: tap = selected, accent) and in the list under the name input. "All my fields have a point" ends it. */
export function PointsStep({ evm, onDone }) {
  const online = useOnline();
  const [q, setQ] = useState(() => readPoints(evm));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loc, setLoc] = useState('ask');                 // ask | on | off (her location shared?)
  const [blocked, setBlocked] = useState(false);
  const [me, setMe] = useState(null);
  const [centre, setCentre] = useState(null);
  const [selected, setSelected] = useState(null);
  const save = (v) => { setQ(v); write(evm, v); };
  const pan = !!q.pan;
  const n = q.points.length;
  const unnamed = n > 0 && !q.points[n - 1].name;       // the last saved point still waits for its name

  const fix = (ok, fail) => navigator.geolocation?.getCurrentPosition(
    (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), ts: Math.floor(p.timestamp / 1000) }),
    (e) => fail?.(e), { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 });
  const share = () => {
    if (pan) save({ ...q, pan: false });
    fix((m) => { setMe(m); setBlocked(false); setLoc('on'); }, (e) => { setBlocked(e.code === 1); setLoc('off'); });
  };
  const choose = () => { save({ ...q, pan: true }); if (!me) fix(setMe); };
  useEffect(() => {
    let live = true;
    navigator.permissions?.query({ name: 'geolocation' }).then((r) => { if (live && r.state === 'granted') share(); }).catch(() => {});
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (pt) => { save({ ...q, points: [...q.points, pt].slice(0, MAX) }); setName(''); };
  const saveHere = () => {
    setError(null);
    if (pan) { if (centre) add({ lat: centre.lat, lng: centre.lng, acc: 0, manual: true, ts: Math.floor(Date.now() / 1000) }); return; }
    setBusy(true);
    fix((m) => { setMe(m); add(m); setBusy(false); },
      (e) => { setBusy(false); setError(e.code === 1 ? 'Allow location for this app in your phone settings.' : 'Your location was not found. Try again outside.'); });
  };
  const storeName = () => {
    const v = name.trim();
    if (!v || !unnamed) return;
    const pts = q.points.slice(); pts[n - 1] = { ...pts[n - 1], name: v.slice(0, 40) };
    save({ ...q, points: pts }); setName('');
  };
  const finish = () => { save({ ...q, finish: true }); onDone(); };

  const ready = pan ? !!centre : loc === 'on';           // she can save a point now
  const wait = unnamed || busy;
  return (
    <MapFrame map={q.points} me={pan ? null : me} start={me} pan={pan} onCenter={setCentre}
      selected={selected} onSelect={setSelected}>
      <div style={cardTitle}>{n === 0 ? 'Walk to your first field' : 'Walk to the center of your next field'}</div>
      {!online && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', ...sheetText }}>
          <div style={{ width: 20, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><WifiOff /></div>
          <span>You are offline. Your points stay on this phone and are sent when you are online.</span>
        </div>
      )}
      {!pan && loc === 'off' && n === 0 && (
        <div style={{ ...sheetText, textAlign: 'center' }}>{blocked
          ? 'Allow location for this app in your phone settings.'
          : 'Your location is off. Nila needs it to place a point in your field.'}</div>
      )}
      {n > 0 && (
        <input type="text" aria-label="Field name" placeholder="Field name" value={name} maxLength={40} disabled={!unnamed}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') storeName(); }} onBlur={storeName}
          style={{ ...fieldInput, opacity: unnamed ? 1 : 0.5 }} />
      )}
      {q.points.some((p) => p.name) && (
        <div role="list" aria-label="Your fields" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {q.points.map((p, i) => (p.name ? (
            <button key={i} type="button" role="listitem" onClick={() => setSelected(selected === i ? null : i)}
              style={{ padding: '0 10px', height: 32, borderRadius: 9999, border: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                background: selected === i ? '#D4CF5A' : '#1F2733', color: selected === i ? '#121212' : '#F1F5F9', cursor: 'pointer' }}>{p.name}</button>
          ) : null))}
        </div>
      )}
      {error && <div role="alert" style={{ ...sheetText, color: C.coral, textAlign: 'center' }}>{error}</div>}
      {n < MAX && (ready
        ? <button type="button" style={wait ? btnDisabled : btnPrimary} disabled={wait} onClick={saveHere}>Save this location</button>
        : <button type="button" style={btnPrimary} onClick={share}>Share my location</button>)}
      {n === 0 && (pan
        ? <button type="button" style={btnSecondary} onClick={share}>Share my location</button>
        : <button type="button" style={btnSecondary} onClick={choose}>Choose on the map</button>)}
      {n > 0 && <button type="button" style={wait ? btnDisabled : btnSecondary} disabled={wait} onClick={finish}>All my fields have a point</button>}
    </MapFrame>
  );
}
