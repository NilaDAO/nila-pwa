// A13 my machine (board MemberMachine), the owner's side of a voucher (executive decision, 17 Oct):
// - after the leader registered it (L13), she confirms it (machinery.confirm_machine);
// - she scans a member's voucher code (A8a: the member's signed authorization of machinery.claim for up to N units,
//   centi tractor acres, 27 Oct), confirms the acres worked (the crop share's area, from its token id; lower for a part
//   done) and claims (machinery.claim, with that authorization): the whole amount (the price an acre on the share's crop
//   × the acres) reaches her wallet in nIN at once, from the voucher's senior reserve (26 Oct: the
//   member's debt is separate, nothing waits for a repayment);
// - a balance left from before 26 Oct can still be collected (collect_dues);
// - on hold / available (machinery.set_hold) with a reason.
// DESIGN GAPs: no per-job names (no member names on the node; jobs are kept on her phone from her claims,
// no indexer yet); photos are shown as the 8 positions, not the images; the hold switch sits here, not in
// Settings (A11 #machine); a "Collect" button the board does not have; the claim screen has no board.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, server, sv } from '../stellar/soroban';
import { matchToken, matchTokenP256, readVoucherCode, voucherEntry } from './voucherCode';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, inr, muted } from '../plan/ui';
import { C, FONT, R } from '../shell/tokens';
import { Card, CardTitle, KV } from '../loan/AssetParts';
import CameraView from '../shell/CameraView';
import { HOLD_REASONS, PARTS, TRACTOR, acresFor, acresText, centi, rateForCrop, saveJob, shareOfToken, ta, typeName, unitsOf, useMyMachine, useOwnerDues, useRates } from './hooks';
import { sessionQrPhone } from '../stellar/session';
import MapCard from '../shell/MapCard';

const svgT = (size, color) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 17h6M4 14V7h7l2 5h6v4M8 7V4" /></svg>;
const tractor = svgT(32, C.ink);
const tractorSmall = svgT(20, C.ink);
/** A map card on her own property (map-centred lane, 23 Oct): the header, then the body in one card (or as given
 *  with `bare`). */
function Page({ title, onBack, bare, children }) {
  return (
    <MapCard header={{ title, onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {bare ? children : <Card label={title} style={{ gap: 12 }}>{children}</Card>}
    </MapCard>
  );
}
const Paid = ({ k, sub, v, color = C.text }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
    <span style={{ display: 'flex', flexDirection: 'column' }}><b>{k}</b><span style={{ color: C.muted }}>{sub}</span></span>
    <b style={{ color, whiteSpace: 'nowrap' }}>{v}</b>
  </div>
);
const WALK = ['Front', 'Front right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Front left'];   // machines/photos.py LABELS
const LABELS = ['Front left', 'Front', 'Front right', 'Left', null, 'Right', 'Back left', 'Back', 'Back right'];

/** A scanned voucher code (compact, 23 Oct): her address, units, expiry and signature; the share is found among her
 *  vouchers by the signature, and the full authorization entry is rebuilt. Throws a plain reason. */
export async function parseVoucherCode(cfg, text) {
  const c = readVoucherCode(text, cfg);
  const latest = (await server(cfg).getLatestLedger()).sequence;
  if (c.exp <= latest) throw new Error('This code has expired. Ask the member to make a new one.');
  const ids = await readContract(cfg, 'fund_core', 'loans_of', [sv.address(cfg.union), sv.address(c.member)]).catch(() => []);
  const hexes = (ids || []).map((id) => Buffer.from(id).toString('hex'));
  const token = c.p256 ? await matchTokenP256(cfg, c, hexes) : matchToken(cfg, c, hexes);
  if (!token) throw new Error('No voucher of this member matches this code.');
  return { entry: voucherEntry(cfg, c, token), member: c.member, token, signed: c.units };
}

export default function MyMachine({ onBack, pick: first }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const me = s?.stellarAddress;
  const [pick, setPick] = useState(first);
  const machine = useMyMachine(me, { pick, poll: true });
  const dues = useOwnerDues(me);
  const rates = useRates();
  const tx = useSorobanTx();
  const [claiming, setClaiming] = useState(false);
  const [holding, setHolding] = useState(false);
  const m = machine.data;
  const rate = rates.data?.find((r) => r.type === m?.machine_type);
  const call = (label, fn, args, rows = []) => tx.run({ label, rows, contractName: 'machinery', fn, args,
    invalidate: [['stellar', 'machines'], ['stellar', 'machine'], ['stellar', 'dues'], ['stellar', 'account']] });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  if (machine.isLoading) return <Page title="Your machine" onBack={onBack}><p style={muted}>…</p></Page>;
  if (!m) return <Page title="Your machine" onBack={onBack}><p style={muted}>No machine registered for you. Your union leader registers it at your farm.</p></Page>;
  if (claiming) return <Claim machine={m} rate={rate} tractor={rates.data?.find((r) => r.type === TRACTOR)?.total || 0} onBack={() => setClaiming(false)} />;

  if (!m.confirmed) {
    // A full page as L13 (23 Oct): what was registered for her, her duties, one button.
    const check = <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
    return (
      <MapCard header={{ title: 'Confirm your machine', onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card label="Your machine" style={{ gap: 12 }}>
          <CardTitle>{typeName(m.machine_type)}</CardTitle>
          <span style={muted}>Your union leader registered it for you. Members can hire it with their machine vouchers once you confirm.</span>
          <KV k="Acres a week" v={`${m.acres_per_week} ac`} />
          {rate && <KV k="You get an acre" v={inr(rate.total)} />}
        </Card>
        <Card label="Your duties" style={{ gap: 12 }}>
          <CardTitle>Your duties</CardTitle>
          {['Drive the machine.', 'Keep it working and pay the repairs.', 'Put it on hold when it cannot work.'].map((t) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5 }}>{check}{t}</span>
          ))}
          <Primary disabled={!tx.ready} onClick={() => call('Confirm your machine', 'confirm_machine', [sv.address(me), sv.u64(m.id)], [['Machine', typeName(m.machine_type)]])}>Confirm my machine</Primary>
        </Card>
      </MapCard>
    );
  }
  if (holding) {
    return (
      <Page title="On hold" onBack={() => setHolding(false)}>
        {Object.entries(HOLD_REASONS).map(([k, v]) => (
          <Choice key={k} onClick={() => { setHolding(false); call('Put on hold', 'set_hold', [sv.address(me), sv.u64(m.id), sv.bool(true), sv.u32(Number(k))], [['Reason', v]]); }}>{v}</Choice>
        ))}
      </Page>
    );
  }
  const left = Math.max(0, m.acres_per_week - m.usedThisWeek);
  const d = dues.data;
  // The registered photos, public by their on-chain hash (node GET /machines/photos, 23 Oct); n in walk order.
  const ph = m.photos_hash ? Buffer.from(m.photos_hash).toString('hex') : '';
  const photo = (l) => (ph && cfg ? `${process.env.REACT_APP_API_BASE_URL}/machines/photos/${cfg.union}/${ph}/${WALK.indexOf(l) + 1}` : '');
  // A13 as the board (MemberMachine): a full page of cards, not a map card (23 Oct); no weekly acres shown.
  const sec = { height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
  return (
    <Page title="" onBack={onBack} bare>
      <Card label="Your machine" style={{ gap: 16 }}>
        <span style={{ alignSelf: 'center', width: 72, height: 72, borderRadius: R.round, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tractor}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{typeName(m.machine_type)}</span>
            <span style={muted}>Your machine · you drive it</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: m.on_hold ? C.coral : C.accent }}>{m.on_hold ? 'On hold' : 'Available'}</span>
            <span style={muted}>{m.on_hold ? HOLD_REASONS[m.hold_reason] : `${m.acres_per_week} acres a week`}</span>
          </span>
        </div>
        {!m.on_hold && <Primary disabled={!tx.ready || left === 0} onClick={() => setClaiming(true)}>Scan a voucher code</Primary>}
        <button type="button" disabled={!tx.ready} style={sec}
          onClick={() => (m.on_hold ? call('Available again', 'set_hold', [sv.address(me), sv.u64(m.id), sv.bool(false), sv.u32(0)]) : setHolding(true))}>{m.on_hold ? 'Available again' : 'Put on hold'}</button>
      </Card>
      <Card label="Photos" style={{ gap: 12 }}>
        <CardTitle>Photos</CardTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {LABELS.map((l, i) => (l
            ? <div key={i} style={{ aspectRatio: '1.1', background: photo(l) ? `linear-gradient(transparent 55%, rgba(18,18,18,.7)), center / cover url(${photo(l)})` : C.raised, borderRadius: R.button, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14, fontSize: 12, fontWeight: 700, color: photo(l) ? C.text : C.muted }}>{l}</div>
            : <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 40, height: 40, borderRadius: R.round, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tractorSmall}</span></div>))}
        </div>
        <span style={muted}>Take new photos every 3 months.</span>
      </Card>
      <Card label="Paid to you" style={{ gap: 12 }}>
        <CardTitle>Paid to you</CardTitle>
        {dues.isLoading && <span style={muted}>…</span>}
        {d && (
          <>
            <Paid k="Received" sub="In nIN, in full at each job" v={inr(d.received)} color={C.accent} />
            {d.ready > 0 && <Paid k="Left from before" sub="Ready to move to your wallet" v={inr(d.ready)} />}
            {d.ready > 0 && <Primary disabled={!tx.ready} onClick={() => tx.run({ label: 'Collect', rows: [['Amount', inr(d.ready)]], contractName: 'fund_core', fn: 'collect_dues',
              args: [sv.address(me), sv.address(cfg.union)], invalidate: [['stellar', 'dues'], ['stellar', 'account']] })}>Collect {inr(d.ready)}</Primary>}
            {d.jobs.map((j) => (
              <div key={`${j.token}-${j.ts}`} style={{ borderTop: `1px solid ${C.raised}`, paddingTop: 12 }}>
                <Paid k={j.acres != null ? acresText(j.acres) : `${j.hours} h`} sub={new Date(j.ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} v={`${inr(j.prepay)} paid`} />
              </div>
            ))}
          </>
        )}
      </Card>
      {m.all.length > 1 && (
        <Card label="Your other machines" style={{ gap: 12 }}>
          <CardTitle>Your other machines</CardTitle>
          {m.all.filter((x) => x.id !== m.id).map((x) => <Choice key={x.id} sub={!x.confirmed ? 'Confirm it' : x.on_hold ? 'On hold' : 'Available'} onClick={() => setPick(x.id)}>{typeName(x.machine_type)}</Choice>)}
        </Card>
      )}
    </Page>
  );
}

/** The cost list for the acres worked (27 Oct): each part of the price an acre × acres, all paid now at the job. */
function Costs({ parts, acres }) {
  const rows = PARTS.filter(([k]) => parts[k] > 0).map(([k, name]) => [name, parts[k] * acres]);
  const total = rows.reduce((a, r) => a + r[1], 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.5 }}>
      {rows.map(([name, all]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flexGrow: 1, color: C.muted }}>{name}</span>
          <b>{inr(all)}</b>
        </div>
      ))}
      <div style={{ height: 1, background: C.raised }} />
      <KV k="Paid to you now" v={inr(total)} />
    </div>
  );
}

/** Scan her code → the acres worked (the crop share's area, from its token id; the owner may lower it for a part
 *  done) → machinery.claim (27 Oct: acres, not hours; the price for the share's crop when the union set one). */
function Claim({ machine, rate, tractor, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [scan, setScan] = useState();
  const [error, setError] = useState();
  const [acres, setAcres] = useState(1);
  const [tries, setTries] = useState(0);     // the camera reads once: a new one after a wrong code
  const read = async (text) => {
    setError(undefined);
    try {
      // The member's own QR (the one for the office) is not a voucher (27 Oct): say how to make the right one.
      const phone = sessionQrPhone(text);
      if (phone === 'keypad') throw new Error('This is the member\'s office QR, not a machine-work QR. On the keypad phone: open Machine work, pick the job, press Show QR, and scan that.');
      if (phone === 'phone') throw new Error('This is the member\'s office QR, not a machine-work QR. On their phone: Assets → Machine vouchers, pick the job, Make code, and scan that.');
      const c = await parseVoucherCode(cfg, text);
      const v = await readContract(cfg, 'machinery', 'voucher', [sv.address(cfg.union), sv.bytes32(c.token)]);
      if (!v || v.void || v.member !== c.member) throw new Error('This voucher is not open any more.');
      if (v.member === s.stellarAddress) throw new Error('You cannot claim your own voucher.');
      // Her code and her voucher are in units (tractor acres); an acre of this machine on her crop uses its price ÷ the
      // tractor's. Never more than her share's area (the contract checks it too) or this machine's week.
      const units = Math.min(c.signed, Number(v.units) - Number(v.used));
      const { family, centiAcres } = shareOfToken(c.token);
      const price = (await rateForCrop(cfg, machine.machine_type, family)) || rate;
      const area = centiAcres > 0 ? centiAcres / 100 : Infinity;
      const max = Math.floor(Math.min(price && tractor ? acresFor(units, price.total, tractor) : 0, area, machine.acres_per_week - machine.usedThisWeek) * 100) / 100;
      setScan({ ...c, max, area, price });
      setAcres(max);   // the share's area, as a rule; the owner can lower it for a part done (27 Oct)
    } catch (e) { setError(e.message); setTries((t) => t + 1); }
  };
  const claim = async () => {
    const out = await tx.run({
      label: `Claim ${acresText(acres)}`, rows: [['Acres worked', acresText(acres)], ['Machine', typeName(machine.machine_type)],
        ...(scan.price && tractor ? [['Uses', `${ta(unitsOf(acres, scan.price.total, tractor))} tractor acres`]] : [])],
      contractName: 'machinery', fn: 'claim',
      args: [sv.address(s.stellarAddress), sv.u64(machine.id), sv.address(cfg.union), sv.bytes32(scan.token), sv.u32(scan.signed), sv.u32(centi(acres))],
      auth: [scan.entry], invalidate: [['stellar', 'machine'], ['stellar', 'dues'], ['stellar', 'account']],
    });
    // claim returns (prepay, pending) in nIN; a retry that found the sent call carries no result: 0 then.
    const [prepay, pending] = Array.isArray(out?.result) ? out.result.map((x) => Number(BigInt(x)) / 1e7) : [0, 0];
    if (out) saveJob({ owner: s.stellarAddress, token: scan.token, acres, prepay, pending, ts: Math.floor(Date.now() / 1000) });
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  if (scan) {
    return (
      <Page title="Acres worked" onBack={() => setScan(undefined)}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>{Number.isFinite(scan.area) ? `The crop share is ${acresText(scan.area)}. Lower it only if you did part of it.` : 'Up to what the code allows.'}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12px 0' }}>
          {/* Tenth-of-an-acre steps, down to a hundredth at the ends. */}
          <button type="button" aria-label="Less" style={b} onClick={() => setAcres(Math.max(Math.min(0.01, scan.max), Math.round((acres - 0.1) * 100) / 100))}>−</button>
          <span style={{ minWidth: 96, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{acresText(acres)}</span>
          <button type="button" aria-label="More" style={b} onClick={() => setAcres(Math.min(scan.max, Math.round((acres + 0.1) * 100) / 100))}>+</button>
        </div>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>Up to {acresText(scan.max)} on this code</p>
        {scan.price && <Costs parts={scan.price.parts} acres={acres} />}
        <Primary disabled={!tx.ready || scan.max <= 0 || acres <= 0} onClick={claim}>Claim {acresText(acres)}</Primary>
      </Page>
    );
  }
  return (
    <Page title="Scan the voucher code" onBack={onBack}>
      <CameraView key={tries} mode="qr" onText={read} />
      <p style={{ ...muted, textAlign: 'center' }}>Scan the code on the member's phone after the work.</p>
      {error && <p style={{ color: C.coral, textAlign: 'center' }}>{error}</p>}
    </Page>
  );
}
