// C6 photo count (board LeaderPhotoCount, #invest / repay): the leader photographs the notes; the node
// counts them (POST /inr/scan-bulk — the same API and model as today's app); each photo adds to the
// count; a row can be removed. The receipt hash for cash_scan_mint is sha256 of the stored photo keys.
import { useEffect, useRef, useState } from 'react';
import { C, FONT, R } from '../shell/tokens';
import { Primary, inr, muted } from '../plan/ui';

const API = process.env.REACT_APP_API_BASE_URL;

export default function PhotoCount({ name, target, verb, onDone, onBack }) {
  const video = useRef();
  const stream = useRef();
  const [groups, setGroups] = useState([]);       // one per photo: { items, total, s3Key }
  const [state, setState] = useState('idle');     // idle | counting | error | denied
  useEffect(() => {
    let live = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => { if (!live) { s.getTracks().forEach((t) => t.stop()); return; } stream.current = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } })
      .catch(() => setState('denied'));
    return () => { live = false; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const shoot = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    setState('counting');
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    const fd = new FormData();
    fd.append('image', blob, `count_${Date.now()}.jpg`);
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 60_000);
      const r = await fetch(`${API}/inr/scan-bulk`, { method: 'POST', body: fd, signal: ctl.signal });
      clearTimeout(t);
      const d = await r.json();
      if (!r.ok || d.source === 'error' || !d.items?.length) throw new Error('no cash');
      setGroups((g) => [...g, { items: d.items, total: d.total_inr, s3Key: d.s3_key }]);
      setState('idle');
    } catch { setState('error'); }
  };
  // Rows: ₹500 × n merged across photos.
  const rows = {};
  groups.forEach((g, gi) => g.items.forEach((it) => {
    const k = `${it.denomination}`;
    rows[k] = rows[k] || { denomination: it.denomination, count: 0, from: [] };
    rows[k].count += it.count; rows[k].from.push(gi);
  }));
  const list = Object.values(rows).sort((a, b) => b.denomination - a.denomination);
  const total = list.reduce((a, r) => a + r.denomination * r.count, 0);
  const remove = (d) => setGroups((g) => g.map((x) => ({ ...x, items: x.items.filter((it) => it.denomination !== d) })).filter((x) => x.items.length));
  const left = target ? target - total : 0;
  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: '16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button type="button" aria-label="Back" onClick={onBack} style={{ width: 40, height: 40, borderRadius: R.round, border: 0, background: C.raised, color: C.text, fontSize: 18 }}>←</button>
        <b>{name}</b><span style={{ width: 40 }} />
      </div>
      <div style={{ background: C.ink, borderRadius: R.card, padding: '18px 22px' }}>
        <div style={muted}>Total scanned</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 32, fontWeight: 700 }} data-testid="total-scanned">{inr(total)}</span>
          <span style={muted}>{target ? (verb === 'Invest' ? 'she brought' : `of ${inr(target)}`) : ''}</span>
        </div>
        {target > 0 && <div style={{ height: 6, borderRadius: 3, background: C.raised, margin: '10px 0' }}><div style={{ width: `${Math.min(100, (total / target) * 100)}%`, height: 6, borderRadius: 3, background: C.accent }} /></div>}
        {list.map((r) => (
          <div key={r.denomination} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.raised, borderRadius: 12, padding: '10px 14px', marginTop: 8 }}>
            <b>₹{r.denomination} × {r.count}</b>
            <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}><b>{inr(r.denomination * r.count)}</b>
              <button type="button" aria-label={`Remove ₹${r.denomination}`} onClick={() => remove(r.denomination)} style={{ background: 'none', border: 0, color: C.muted, fontSize: 18 }}>×</button></span>
          </div>
        ))}
      </div>
      <div style={{ background: C.ink, borderRadius: R.card, padding: '18px 22px', marginTop: 16 }}>
        <b>Take a photo</b>
        <p style={muted}>Lay the notes inside the frame, face up, not overlapping.</p>
        <div style={{ width: 280, height: 280, borderRadius: R.round, overflow: 'hidden', margin: '12px auto', border: `8px solid ${C.raised}`, background: '#000' }}>
          <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <button type="button" aria-label="Take a photo" disabled={state === 'counting' || state === 'denied'} onClick={shoot}
            style={{ width: 64, height: 64, borderRadius: R.round, border: `4px solid ${C.text}`, background: state === 'counting' ? C.muted : C.text }} />
        </div>
        {state === 'counting' && <p style={{ ...muted, textAlign: 'center' }}>Counting…</p>}
        {state === 'error' && <p style={{ ...muted, color: C.coral, textAlign: 'center' }}>No cash detected — try again</p>}
        {state === 'denied' && <p style={{ ...muted, color: C.coral, textAlign: 'center' }}>Allow the camera to count the cash.</p>}
        {target > 0 && total > 0 && (
          <p style={muted}>{left <= 0 ? '✓ Full amount counted.' : `ⓘ ${inr(left)} still to count.${verb === 'Repay' ? ' She can also repay part now.' : ''}`}</p>
        )}
        <Primary disabled={!total} onClick={() => onDone({ total, s3Keys: groups.map((g) => g.s3Key).filter(Boolean) })}>{verb} {inr(total)}</Primary>
      </div>
    </div>
  );
}
