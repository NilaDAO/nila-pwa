// A13 my machine (board MemberMachine), the owner's side of a voucher (executive decision, 17 Oct):
// - after the leader registered it (L13), she confirms it (machinery.confirm_machine);
// - she scans a member's voucher code (A8a, `nila:voucher:<token>:<code>`), enters the hours worked and
//   claims (machinery.claim): the prepaid part (diesel + the driver share) reaches her wallet in nIN at once,
//   the rest is pending until the member repays (fund_core.pay_voucher inside the claim);
// - what members repaid for her collects into her balance; "Collect" moves it to her wallet (collect_dues);
// - on hold / available (machinery.set_hold) with a reason.
// DESIGN GAPs: no per-job names (no member names on the node; jobs are kept on her phone from her claims,
// no indexer yet); photos are shown as the 8 positions, not the images; the hold switch sits here, not in
// Settings (A11 #machine); a "Collect" button the board does not have; the claim screen has no board.
import { useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { Camera } from '../loan/LoanScreens';
import { HOLD_REASONS, saveJob, typeName, useMyMachine, useOwnerDues, useRates } from './hooks';

const LABELS = ['Front left', 'Front', 'Front right', 'Left', null, 'Right', 'Back left', 'Back', 'Back right'];
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const Row = ({ k, sub, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
    <span><b>{k}</b>{sub && <div style={muted}>{sub}</div>}</span><span style={{ fontWeight: 700 }}>{v}</span>
  </div>
);

/** Parse a scanned voucher code. Throws a plain reason. */
export function parseVoucherCode(text) {
  const m = /^nila:voucher:([0-9a-f]{64}):([A-Z2-7]{26})$/.exec((text || '').trim());
  if (!m) throw new Error('This is not a Nila voucher code.');
  return { token: m[1], code: m[2] };
}

export default function MyMachine({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const me = s?.stellarAddress;
  const machine = useMyMachine(me);
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
  if (machine.isLoading) return <Sheet landName="Nila" title="Your machine" onBack={onBack}><p style={muted}>…</p></Sheet>;
  if (!m) return <Sheet landName="Nila" title="Your machine" onBack={onBack}><p style={muted}>No machine registered for you. Your union leader registers it at your farm.</p></Sheet>;
  if (claiming) return <Claim machine={m} rate={rate} onBack={() => setClaiming(false)} />;

  if (!m.confirmed) {
    return (
      <Sheet landName="Nila" title={typeName(m.machine_type)} onBack={onBack}>
        <p style={muted}>Your union leader registered this machine for you: {m.hours_per_week} h a week{rate ? ` · ${inr(rate.total)} an hour` : ''}.</p>
        <p style={muted}>You drive it, keep it working and pay the repairs, and put it on hold when it cannot work.</p>
        <Primary disabled={!tx.ready} onClick={() => call('Confirm your machine', 'confirm_machine', [sv.address(me), sv.u64(m.id)], [['Machine', typeName(m.machine_type)]])}>Confirm my machine</Primary>
      </Sheet>
    );
  }
  if (holding) {
    return (
      <Sheet landName="Nila" title="On hold" onBack={() => setHolding(false)}>
        {Object.entries(HOLD_REASONS).map(([k, v]) => (
          <Choice key={k} onClick={() => { setHolding(false); call('Put on hold', 'set_hold', [sv.address(me), sv.u64(m.id), sv.bool(true), sv.u32(Number(k))], [['Reason', v]]); }}>{v}</Choice>
        ))}
      </Sheet>
    );
  }
  const left = Math.max(0, m.hours_per_week - m.usedThisWeek);
  const d = dues.data;
  return (
    <Sheet landName="Nila" title={typeName(m.machine_type)} onBack={onBack}>
      <p style={{ ...muted, textAlign: 'center' }}>Your machine · you drive it</p>
      <Row k={m.on_hold ? 'On hold' : 'Available'} sub={m.on_hold ? HOLD_REASONS[m.hold_reason] : `${m.hours_per_week} h a week`}
        v={<button type="button" disabled={!tx.ready} onClick={() => (m.on_hold ? call('Available again', 'set_hold', [sv.address(me), sv.u64(m.id), sv.bool(false), sv.u32(0)]) : setHolding(true))}
          style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700 }}>{m.on_hold ? 'Switch on' : 'Put on hold'}</button>} />
      {!m.on_hold && <Primary disabled={!tx.ready || left === 0} onClick={() => setClaiming(true)}>Scan a voucher code</Primary>}
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Photos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {LABELS.map((l, i) => <div key={i} style={{ background: C.raised, borderRadius: 8, padding: 8, fontSize: 12, textAlign: 'center', color: l ? C.text : C.muted }}>{l || '·'}</div>)}
      </div>
      <p style={muted}>Take new photos every 3 months.</p>
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Paid to you</h2>
      {dues.isLoading && <p style={muted}>…</p>}
      {d && (
        <>
          <Row k="Received" sub="In nIN, at the job" v={inr(d.received)} />
          <Row k="Pending" sub="When the farmers repay" v={inr(d.pending)} />
          {d.ready > 0 && <Row k="Repaid to you" sub="Ready to move to your wallet" v={inr(d.ready)} />}
          {d.ready > 0 && <Primary disabled={!tx.ready} onClick={() => tx.run({ label: 'Collect', rows: [['Amount', inr(d.ready)]], contractName: 'fund_core', fn: 'collect_dues',
            args: [sv.address(me), sv.address(cfg.union)], invalidate: [['stellar', 'dues'], ['stellar', 'account']] })}>Collect {inr(d.ready)}</Primary>}
          {d.jobs.map((j) => <Row key={`${j.token}-${j.ts}`} k={`${j.hours} h`} sub={new Date(j.ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} v={`${inr(j.prepay)} paid`} />)}
        </>
      )}
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>This week</h2>
      <p>{m.on_hold ? 'On hold' : `${m.usedThisWeek} h of ${m.hours_per_week} h`}</p>
      <div style={{ height: 8, background: C.raised, borderRadius: R.round }}><div style={{ width: `${Math.min(100, (100 * m.usedThisWeek) / m.hours_per_week)}%`, height: 8, background: C.accent, borderRadius: R.round }} /></div>
      <p style={muted}>{m.on_hold ? 'Members cannot use it until you switch it back on.' : `Members can use it for ${left} more hours this week.`}</p>
    </Sheet>
  );
}

/** Scan her code → hours worked → machinery.claim. */
function Claim({ machine, rate, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [scan, setScan] = useState();
  const [error, setError] = useState();
  const [hours, setHours] = useState(1);
  const read = async (text) => {
    setError(undefined);
    try {
      const { token, code } = parseVoucherCode(text);
      const v = await readContract(cfg, 'machinery', 'voucher', [sv.address(cfg.union), sv.bytes32(token)]);
      if (!v || v.void || !v.code_hash) throw new Error('This code is not open any more.');
      if (hex(await sha(code)) !== Buffer.from(v.code_hash).toString('hex')) throw new Error('This code is not open any more.');
      if (Number(v.code_expires) <= Date.now() / 1000) throw new Error('This code has expired. Ask her to make a new one.');
      if (v.member === s.stellarAddress) throw new Error('You cannot claim your own voucher.');
      const max = Math.min(Number(v.code_max), Number(v.hours) - Number(v.used), machine.hours_per_week - machine.usedThisWeek);
      setScan({ token, code, max });
      setHours(Math.min(1, max));
    } catch (e) { setError(e.message); }
  };
  const claim = async () => {
    const out = await tx.run({
      label: `Claim ${hours} h`, rows: [['Hours worked', `${hours} h`], ['Machine', typeName(machine.machine_type)]],
      contractName: 'machinery', fn: 'claim',
      args: [sv.address(s.stellarAddress), sv.u64(machine.id), sv.address(cfg.union), sv.bytes32(scan.token), sv.bytes(new TextEncoder().encode(scan.code)), sv.u32(hours)],
      invalidate: [['stellar', 'machine'], ['stellar', 'dues'], ['stellar', 'account']],
    });
    // claim returns (prepay, pending) in nIN; a retry that found the sent call carries no result: 0 then.
    const [prepay, pending] = Array.isArray(out?.result) ? out.result.map((x) => Number(BigInt(x)) / 1e7) : [0, 0];
    if (out) saveJob({ owner: s.stellarAddress, token: scan.token, hours, prepay, pending, ts: Math.floor(Date.now() / 1000) });
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  if (scan) {
    return (
      <Sheet landName="Nila" title="Hours worked" onBack={() => setScan(undefined)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, margin: '12px 0' }}>
          <button type="button" aria-label="Less" style={b} onClick={() => setHours(Math.max(1, hours - 1))}>−</button>
          <span style={{ minWidth: 72, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{hours} h</span>
          <button type="button" aria-label="More" style={b} onClick={() => setHours(Math.min(scan.max, hours + 1))}>+</button>
        </div>
        <p style={muted}>Up to {scan.max} h on this code{rate ? ` · ${inr(rate.total)} an hour, part paid now in nIN, the rest when she repays` : ''}.</p>
        <Primary disabled={!tx.ready || scan.max < 1} onClick={claim}>Claim {hours} h</Primary>
      </Sheet>
    );
  }
  return (
    <Sheet landName="Nila" title="Scan her code" onBack={onBack}>
      <Camera onText={read} />
      <p style={{ ...muted, textAlign: 'center' }}>Scan the code on her phone after the work.</p>
      {error && <p style={{ color: C.coral, textAlign: 'center' }}>{error}</p>}
    </Sheet>
  );
}
