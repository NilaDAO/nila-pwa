// L13 register a machine (board LeaderMachineRegister), executive decision 17 Oct: the leader, at the
// owner's farm, picks the owner (her wallet), the machine type (the union's rate table, machinery.rate),
// takes 8 photos at 45° and the hours a week; the node stores the photos and returns their hash (O13,
// POST /machines/photos); the leader signs machinery.register_machine (fee paid by the node); the owner then
// confirms it on her phone (A13). The owner must hold a land title in the union (the contract checks it).
// DESIGN GAPs: the owner is her wallet QR, scanned as the last step (no member names on the node; 22 Oct);
// "Show QR to <owner>" becomes "Ask her to confirm in Your machine" (her app finds the machine itself);
// the price rows show the union's rate parts as set on-chain (read-only).
import { useMemo, useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Primary, inr, muted } from '../plan/ui';
import { C, FONT, R } from '../shell/tokens';
import { ScreenHeader } from '../shell/ListRow';
import { Card, CardTitle } from '../loan/AssetParts';
import CameraView from '../shell/CameraView';
import { PARTS, useRates } from './hooks';

// Walk order (machines/photos.py LABELS): Front first, then round. Grid: 3×3 with the machine in the middle.
const WALK = ['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left'];
const GRID = ['Front left', 'Front', 'Front right', 'Left', null, 'Right', 'Back left', 'Back', 'Back right'];
const isG = (a) => /^G[A-Z2-7]{55}$/.test(a || '');
const MAX_SIDE = 1280;
const svg = (d, color, size = 20) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const CheckMark = ({ color = C.accent }) => svg(<path d="M20 6 9 17l-5-5" />, color);
const CameraMark = () => svg(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></>, C.muted);
const TractorMark = () => svg(<path d="M4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 17h6M4 14V7h7l2 5h6v4M8 7V4" />, C.ink, 28);

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
  const [scanning, setScanning] = useState(false);
  const [type, setType] = useState();
  const [picking, setPicking] = useState(false);
  const [photos, setPhotos] = useState({});
  const [hours, setHours] = useState(40);
  const [error, setError] = useState();
  const [busy, setBusy] = useState(false);
  const [shooting, setShooting] = useState();
  const rate = useMemo(() => rates.data?.find((r) => r.type === type) || rates.data?.[0], [rates.data, type]);
  const taken = WALK.filter((l) => photos[l]).length;

  // A tap on a cell shows the camera over the grid, the shutter under it (as C6); the shot fills the cell (22 Oct).
  const onPhoto = async (blob) => {
    const label = shooting; setShooting(undefined);
    try { const p = await shrink(blob); setPhotos((x) => ({ ...x, [label]: p })); } catch { setError('That photo could not be read. Take it again.'); }
  };
  // The owner is the last step (executive decision 22 Oct): her wallet QR is scanned at the end and registers at once.
  const register = async (own) => {
    setError(undefined); setBusy(true);
    try {
      if (!isG(own)) throw new Error('That QR is not a member wallet. Scan her wallet QR.');
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
  // A full page on the gradient, not a map card (executive decision 22 Oct): header, then the board's cards.
  const page = (title, back, body) => (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ScreenHeader title={title} onBack={back} />
      {body}
    </div>
  );
  if (tx.status === 'success') {
    return page('Registered', () => { tx.reset(); onBack(); }, (
      <Card label="Registered">
        <span style={muted}>Ask her to open Your machine in her app and confirm it. Members can use it once she confirms.</span>
        <Primary onClick={() => { tx.reset(); onBack(); }}>Done</Primary>
      </Card>
    ));
  }
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  if (scanning) {
    return page('Register a machine', () => setScanning(false), (
      <Card label="Scan the owner's wallet QR">
        <CameraView mode="qr" title="Scan the owner's wallet QR" onText={(t) => { setScanning(false); register(t.match(/G[A-Z2-7]{55}/)?.[0]); }} />
      </Card>
    ));
  }
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700, cursor: 'pointer' };
  const field = { height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14 };
  const sub = { fontSize: 14, lineHeight: 1.5, color: C.muted };
  return page('Register a machine', onBack, (
    <>
      <Card label="Machine">
        <CardTitle>Machine</CardTitle>
        {rates.isLoading && <span style={sub}>…</span>}
        {rates.data && !rates.data.length && <span style={{ ...sub, color: C.coral }}>The union has set no machine rates yet (union account, set_rate).</span>}
        {/* The machine list opens inside the card under the row (22 Oct), no screen of its own. */}
        {rate && (
          <div style={{ background: C.raised, borderRadius: R.button, overflow: 'hidden' }}>
            <button type="button" aria-expanded={picking} onClick={() => setPicking(!picking)} style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ flexGrow: 1, fontWeight: 700 }}>{rate.name}</span>
              <span style={{ color: C.muted }}>{inr(rate.total)} an hour</span>
              <span style={{ display: 'flex', transform: picking ? 'rotate(180deg)' : 'none' }}>{svg(<path d="m6 9 6 6 6-6" />, C.muted)}</span>
            </button>
            {picking && (rates.data || []).filter((r) => r.type !== rate.type).map((r) => (
              <button key={r.type} type="button" onClick={() => { setType(r.type); setPicking(false); }}
                style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', cursor: 'pointer', textAlign: 'left', borderTop: `1px solid ${C.ink}`, borderRadius: 0 }}>
                <span style={{ flexGrow: 1 }}>{r.name}</span><span style={{ color: C.muted }}>{inr(r.total)} an hour</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card label="Photos" style={{ gap: 12 }}>
        <CardTitle right={<span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{taken} of 8</span>}>Photos</CardTitle>
        <span style={sub}>Walk around the machine: one photo every 45°.</span>
        {shooting ? (
          <>
            <CameraView mode="photo" title={shooting} onPhoto={onPhoto} />
            <button type="button" onClick={() => setShooting(undefined)} style={{ border: 0, background: 'none', color: C.muted, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {GRID.map((l, i) => (l ? (
              <button key={l} type="button" aria-label={`${l}, ${photos[l] ? 'photo taken' : 'take photo'}`} onClick={() => setShooting(l)}
                style={{ aspectRatio: '1.1', borderRadius: R.button, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  ...(photos[l]
                    ? { border: 0, background: `linear-gradient(rgba(18,18,18,.45), rgba(18,18,18,.45)), center / cover url(${photos[l].url})`, color: C.accent }
                    : { border: `1px dashed ${C.muted}66`, background: 'transparent', color: C.muted }) }}>
                {photos[l] ? <CheckMark /> : <CameraMark />}{l}
              </button>
            ) : (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 56, height: 56, borderRadius: R.round, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TractorMark /></span>
              </div>
            )))}
          </div>
        )}
      </Card>
      {rate && (
        <Card label="Price an hour" style={{ gap: 12 }}>
          <CardTitle right={<span style={{ fontSize: 16, fontWeight: 700 }}>{inr(rate.total)}</span>}>Price an hour</CardTitle>
          <span style={sub}>The current voucher rate</span>
          {PARTS.map(([k, label]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, lineHeight: 1.5, fontWeight: 700 }}><span>{label}</span><span>{inr(rate.parts[k])}</span></div>
          ))}
        </Card>
      )}
      <Card label="Hours a week" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Hours a week</span>
          <span style={sub}>Available for jobs</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Less hours" style={b} onClick={() => setHours(Math.max(1, hours - 1))}>−</button>
          <span style={{ ...field, width: 92, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', fontSize: 16, fontWeight: 700 }}>{hours}<span style={{ color: C.muted, fontWeight: 400, fontSize: 14 }}>h</span></span>
          <button type="button" aria-label="More hours" style={b} onClick={() => setHours(Math.min(70, hours + 1))}>+</button>
        </span>
      </Card>
      <Card label="Owner's duties" style={{ gap: 12 }}>
        <CardTitle>Owner's duties</CardTitle>
        {['Drives the machine.', 'Keeps it working and pays the repairs.', 'Puts it on hold when it cannot work.'].map((t) => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5 }}><CheckMark color={C.gold} />{t}</span>
        ))}
        {error && <span style={{ ...sub, color: C.coral }}>{error}</span>}
        <Primary disabled={!rate || taken < 8 || busy || !tx.ready || !api} onClick={() => (initialOwner ? register(initialOwner) : setScanning(true))}>{taken < 8 ? 'Take all 8 photos' : busy ? 'Sending the photos…' : initialOwner ? 'Register the machine' : "Scan the owner's wallet QR"}</Primary>
      </Card>
    </>
  ));
}
