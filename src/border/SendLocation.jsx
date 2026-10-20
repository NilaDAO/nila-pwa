// R5–R7 and R14 — she sends a point for each field (boards SendLocation-v3np, SendLocation-af51-95is,
// SendLocationOffline, RegDone-fji8). Points wait on the phone (R7) until "All my fields have a point" is sent
// online; the node then draws the shapes and a leader checks them (L2a–L4). R14 waits for the mint.
// DESIGN GAP: the boards have no farm-name field; the title mint needs a name, so an optional one is asked here.
import { useEffect, useState } from 'react';
import { C, FONT, R } from '../shell/tokens';
import { useMyBorderJob, useSendFieldPoints } from './hooks';

const KEY = 'nila.border.points';
const MAX = 6;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { points: [], farm: '', finish: false }; } catch { return { points: [], farm: '', finish: false }; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* the queue lives in memory only */ } };
const clear = () => { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } };

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

const primary = { width: '100%', height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontSize: 14, fontFamily: FONT };
const secondary = { ...primary, background: C.raised, color: C.text };

function Page({ title, onBack, children }) {
  return (
    <div style={{ padding: 16, fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {onBack && <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0, alignSelf: 'flex-start' }}>← Back</button>}
      <h1 style={{ fontSize: 16, margin: 0 }}>{title}</h1>
      {children}
    </div>
  );
}

/** R14: her points are with the union; the title is minted after a leader checked the borders. */
function Waiting({ job, onBack }) {
  if (job.status === 'minted') {
    return (
      <Page title="Your land title is ready" onBack={onBack}>
        <p style={{ margin: 0, color: C.muted }}>Your union minted your land title.</p>
      </Page>
    );
  }
  return (
    <Page title="Your union will mint your land title" onBack={onBack}>
      <p style={{ margin: 0, color: C.muted }}>Please wait for your union to finish.</p>
    </Page>
  );
}

export default function SendLocation({ onBack }) {
  const mine = useMyBorderJob();
  const send = useSendFieldPoints();
  const online = useOnline();
  const [q, setQ] = useState(read);
  const [gps, setGps] = useState(null);
  const save = (v) => { setQ(v); write(v); };

  // R7: "All my fields have a point" pressed offline — send once she is online again.
  useEffect(() => {
    if (online && q.finish && q.points.length && !send.isPending && !send.isSuccess && !send.isError) {
      send.mutate({ points: q.points, farm: q.farm.trim() }, { onSuccess: () => { clear(); setQ(read()); } });
    }
  }, [online, q, send]);

  if (mine.data && !send.isError) return <Waiting job={mine.data} onBack={onBack} />;
  if (mine.isLoading) return <Page title="Send your field location" onBack={onBack}><p style={{ color: C.muted }}>…</p></Page>;

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
  // The effect above sends it (now when online, else once she is online again).
  const finish = () => save({ ...q, finish: true });

  const n = q.points.length;
  const first = n === 0;
  return (
    <Page title={online ? 'Send your field location' : 'Send your field location: offline'} onBack={onBack}>
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
      {q.finish && !online && <p role="status" style={{ margin: 0, color: C.muted }}>Your points are sent when you are online.</p>}
      {send.error && <p role="alert" style={{ margin: 0, color: C.coral }}>{send.error.message}</p>}
      {n < MAX && !q.finish && (
        <button type="button" style={first ? primary : secondary} disabled={gps?.busy} onClick={locate}>
          {gps?.busy ? 'Finding your location…' : !online ? 'Save this location' : first ? 'Send my location' : 'Send another location'}
        </button>
      )}
      {n > 0 && !q.finish && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: C.muted }}>
            Name of your farm (optional)
            <input value={q.farm} onChange={(e) => save({ ...q, farm: e.target.value.slice(0, 40) })}
              style={{ height: 40, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px' }} />
          </label>
          <button type="button" style={primary} disabled={send.isPending} onClick={finish}>All my fields have a point</button>
        </>
      )}
      {q.finish && send.isError && <button type="button" style={secondary} onClick={() => { send.reset(); finish(); }}>Try again</button>}
    </Page>
  );
}
