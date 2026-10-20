// L13 register a machine (board LeaderMachineRegister), executive decision 17 Oct: the leader, at the
// owner's farm, picks the owner (her wallet), the machine type (the union's rate table, machinery.rate),
// takes 8 photos at 45° and the hours a week; the node stores the photos and returns their hash (O13,
// POST /machines/photos); the leader signs machinery.register_machine (fee paid by the node); the owner then
// confirms it on her phone (A13). The owner must hold a land title in the union (the contract checks it).
// DESIGN GAPs: the owner is picked by her wallet QR / address (no member names on the node, L5 #machine);
// "Show QR to <owner>" becomes "Ask her to confirm in Your machine" (her app finds the machine itself);
// the price rows show the union's rate parts as set on-chain (read-only).
import { useMemo, useRef, useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { Camera } from '../loan/LoanScreens';
import { PARTS, useRates } from './hooks';

// Walk order (machines/photos.py LABELS): Front first, then round. Grid: 3×3 with the machine in the middle.
const WALK = ['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left'];
const GRID = ['Front left', 'Front', 'Front right', 'Left', null, 'Right', 'Back left', 'Back', 'Back right'];
const isG = (a) => /^G[A-Z2-7]{55}$/.test(a || '');
const MAX_SIDE = 1280;

/** A photo shrunk to at most 1280 px, as JPEG bytes (base64 for the upload). */
async function shrink(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { content_type: 'image/jpeg', data_b64: btoa(bin), url: URL.createObjectURL(blob) };
}

export default function RegisterMachine({ onBack, initialOwner = '' }) {
  const s = useNilaSigner();
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const rates = useRates();
  const tx = useSorobanTx();
  const [owner, setOwner] = useState(initialOwner);
  const [scanning, setScanning] = useState(false);
  const [type, setType] = useState();
  const [picking, setPicking] = useState(false);
  const [photos, setPhotos] = useState({});
  const [hours, setHours] = useState(40);
  const [error, setError] = useState();
  const [busy, setBusy] = useState(false);
  const input = useRef();
  const target = useRef();
  const rate = useMemo(() => rates.data?.find((r) => r.type === type) || rates.data?.[0], [rates.data, type]);
  const taken = WALK.filter((l) => photos[l]).length;
  const own = owner.trim().match(/G[A-Z2-7]{55}/)?.[0];

  const take = (label) => { target.current = label; input.current.click(); };
  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { const p = await shrink(f); setPhotos((x) => ({ ...x, [target.current]: p })); } catch { setError('That photo could not be read. Take it again.'); }
  };
  const register = async () => {
    setError(undefined); setBusy(true);
    try {
      const { photos_hash: ph } = await api.machinePhotos(WALK.map((l) => ({ content_type: photos[l].content_type, data_b64: photos[l].data_b64 })));
      setBusy(false);
      await tx.run({
        label: 'Register a machine', rows: [['Machine', rate.name], ['Hours a week', `${hours} h`], ['Owner', `${own.slice(0, 4)}…${own.slice(-4)}`]],
        contractName: 'machinery', fn: 'register_machine',
        args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.address(own), sv.u32(rate.type), sv.u32(hours), sv.bytes32(ph)],
        invalidate: [['stellar', 'machines']],
      });
    } catch (e) { setBusy(false); setError(e.message); }
  };
  if (tx.status === 'success') {
    return (
      <Sheet landName="Register a machine" title="Registered" onBack={() => { tx.reset(); onBack(); }}>
        <p style={muted}>Ask her to open Your machine in her app and confirm it. Members can use it once she confirms.</p>
        <Primary onClick={() => { tx.reset(); onBack(); }}>Done</Primary>
      </Sheet>
    );
  }
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  if (scanning) return <Sheet landName="Register a machine" title="Scan her wallet QR" onBack={() => setScanning(false)}><Camera onText={(t) => { setOwner(t); setScanning(false); }} /></Sheet>;
  if (picking) {
    return (
      <Sheet landName="Register a machine" title="Machine" onBack={() => setPicking(false)}>
        {(rates.data || []).map((r) => <Choice key={r.type} on={rate?.type === r.type} sub={`${inr(r.total)} an hour`} onClick={() => { setType(r.type); setPicking(false); }}>{r.name}</Choice>)}
      </Sheet>
    );
  }
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <Sheet landName="Register a machine" title="Owner and machine" onBack={onBack}>
      <input ref={input} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <p style={muted}>Her wallet (scan her wallet QR, or paste it)</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Her wallet" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="G…"
          style={{ flexGrow: 1, height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box' }} />
        <button type="button" onClick={() => setScanning(true)} style={{ ...b, width: 'auto', padding: '0 12px', fontSize: 14 }}>Scan</button>
      </div>
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Machine</h2>
      {rates.isLoading && <p style={muted}>…</p>}
      {rates.data && !rates.data.length && <p style={{ color: C.coral }}>The union has set no machine rates yet (union account, set_rate).</p>}
      {rate && <Choice sub={`${inr(rate.total)} an hour`} onClick={() => setPicking(true)}>{rate.name}</Choice>}
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Photos · {taken} of 8</h2>
      <p style={muted}>Walk around the machine: one photo every 45°.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {GRID.map((l, i) => (l ? (
          <button key={l} type="button" aria-label={`${l}, ${photos[l] ? 'photo taken' : 'take photo'}`} onClick={() => take(l)}
            style={{ aspectRatio: '1', borderRadius: 8, border: 0, background: photos[l] ? `center / cover url(${photos[l].url})` : C.raised, color: C.text, fontSize: 12 }}>{photos[l] ? '' : l}</button>
        ) : <div key={i} style={{ aspectRatio: '1', borderRadius: 8, background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>🚜</div>))}
      </div>
      {rate && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Price an hour · {inr(rate.total)}</h2>
          <p style={muted}>The current voucher rate</p>
          {PARTS.map(([k, label]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '2px 0' }}><span style={{ color: C.muted }}>{label}</span><span>{inr(rate.parts[k])}</span></div>
          ))}
        </>
      )}
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Hours a week</h2>
      <p style={muted}>Available for jobs</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <button type="button" aria-label="Less hours" style={b} onClick={() => setHours(Math.max(1, hours - 1))}>−</button>
        <span style={{ minWidth: 72, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{hours} h</span>
        <button type="button" aria-label="More hours" style={b} onClick={() => setHours(Math.min(70, hours + 1))}>+</button>
      </div>
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Owner's duties</h2>
      <p style={muted}>Drives the machine. Keeps it working and pays the repairs. Puts it on hold when it cannot work.</p>
      {error && <p style={{ color: C.coral }}>{error}</p>}
      <Primary disabled={!isG(own) || !rate || taken < 8 || busy || !tx.ready || !api} onClick={register}>{taken < 8 ? 'Take all 8 photos' : busy ? 'Sending the photos…' : 'Register the machine'}</Primary>
    </Sheet>
  );
}
