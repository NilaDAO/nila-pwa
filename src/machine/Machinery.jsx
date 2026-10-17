// A8 machinery voucher, A8a its code, A8b an expired code (boards MemberAssetTractor, MemberAssetTractorScrolled,
// MemberAssetTractorExpired). Decided 17 Oct (LOAN_RULES §5 "Machinery vouchers (P6)"): whole hours, any
// machine of her union; the code is a 128-bit secret she shows as QR `nila:voucher:<token>:<code>`; only its
// sha256 goes on-chain (machinery.open_code, max hours, 48 h); the owner's claim uses the hours.
// One code per voucher (per loan): a code is made on the voucher with the fewest hours that still cover it.
// DESIGN GAPs: whole hours instead of tractor-hour factors; "Cancel the open code first" instead of a new
// code replacing it; assisted mode shows the board's text only (the leader-made code, L9 #tractor, is not
// built); no "Receive" (vouchers are not sent).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { grouped, newCode } from '../loan/CashOut';
import { useRates, useVouchers } from './hooks';

const KEY = 'nila.voucher.codes';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private */ } };
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const assisted = () => { try { return localStorage.getItem('nila.mode') === 'assist'; } catch { return false; } };
const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hoursLeft = (ts) => Math.max(0, Math.floor((ts - Date.now() / 1000) / 3600));
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
    <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
  </div>
);

/** A8 → A8a / A8b. */
export default function Machinery({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const vouchers = useVouchers(s?.stellarAddress);
  const rates = useRates();
  const tx = useSorobanTx();
  const [type, setType] = useState();
  const [picking, setPicking] = useState(false);
  const [hours, setHours] = useState(1);
  const [show, setShow] = useState();        // token whose code is on screen
  const codes = load();
  const list = vouchers.data || [];
  const balance = list.reduce((a, v) => a + v.left, 0);
  const maxOne = Math.max(0, ...list.filter((v) => !v.code?.open).map((v) => v.left));
  const open = list.find((v) => v.code?.open && codes[v.code.hash]);
  const expired = list.find((v) => v.code && !v.code.open && codes[v.code.hash]);
  const rate = rates.data?.find((r) => r.type === type) || rates.data?.[0];
  const totals = (rates.data || []).map((r) => r.total);
  const value = totals.length ? (Math.min(...totals) === Math.max(...totals) ? inr(balance * totals[0]) : `${inr(balance * Math.min(...totals))}–${inr(balance * Math.max(...totals))}`) : '';
  const h = Math.min(hours, maxOne);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  const make = async () => {
    const v = list.filter((x) => !x.code?.open && x.left >= h).sort((a, b) => a.left - b.left)[0];
    if (!v) return;
    const code = newCode();
    const hash = hex(await sha(code));
    save({ ...load(), [hash]: { code, token: v.token, hours: h, type: rate?.type, used: v.used } });   // before the call
    const out = await tx.run({
      label: `Code for ${h} h`, rows: [['Machine hours', `${h} h`], ['Valid', '48 hours']],
      contractName: 'machinery', fn: 'open_code',
      args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.bytes32(v.token), sv.u32(h), sv.bytes32(hash)],
      invalidate: [['stellar', 'vouchers']],
    });
    if (out) setShow(v.token);
  };
  const cancel = (v) => tx.run({
    label: 'Cancel code', rows: [['Machine hours', `${v.code.max} h`]], contractName: 'machinery', fn: 'cancel_code',
    args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.bytes32(v.token)], invalidate: [['stellar', 'vouchers']],
  });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;

  const shown = list.find((v) => v.token === show && v.code && codes[v.code.hash]);
  if (shown) return <Code v={shown} saved={codes[shown.code.hash]} rate={rates.data?.find((r) => r.type === codes[shown.code.hash].type)} onBack={() => setShow(undefined)} onCancel={() => cancel(shown)} onNew={() => setShow(undefined)} />;

  if (picking) {
    return (
      <Sheet landName="Machinery" title="For" onBack={() => setPicking(false)}>
        {(rates.data || []).map((r) => (
          <Choice key={r.type} on={rate?.type === r.type} sub={`${inr(r.total)} an hour · up to ${maxOne} h`} onClick={() => { setType(r.type); setPicking(false); }}>{r.name}</Choice>
        ))}
      </Sheet>
    );
  }
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <Sheet landName="Machinery" title="Voucher · in machine hours" onBack={onBack}>
      <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{vouchers.isLoading ? '…' : `${balance} h`}</div>
        {value && <div style={muted}>{value}</div>}
      </div>
      {vouchers.isError && <p style={{ color: C.coral }}>Could not read your vouchers. Try again.</p>}
      {open && (
        <div style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
          <b>Open code · {rates.data?.find((r) => r.type === codes[open.code.hash].type)?.name || 'Machine'} · {open.code.max} h</b>
          <div style={muted}>{hoursLeft(open.code.expires)} hours left · not used yet</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Primary onClick={() => setShow(open.token)}>Show</Primary>
            <button type="button" onClick={() => cancel(open)} disabled={!tx.ready} style={{ ...b, width: '100%', fontSize: 14, marginTop: 8 }}>Cancel code</button>
          </div>
        </div>
      )}
      {!open && expired && <Choice sub={`Was valid until ${when(expired.code.expires)}`} onClick={() => setShow(expired.token)}>Expired code</Choice>}
      {assisted() ? (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Spend machine hours</h2>
          <p style={muted}>Ask your union leader to spend your machine hours and scan the code she generates.</p>
        </>
      ) : balance > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Spend</h2>
          <Choice sub={rate ? `${inr(rate.total)} an hour · up to ${maxOne} h` : 'No machine rates set by the union yet'} onClick={() => rates.data?.length && setPicking(true)}>{rate ? `For · ${rate.name}` : 'For'}</Choice>
          <p style={{ fontWeight: 700, margin: '12px 0 4px' }}>Machine hours</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <button type="button" aria-label="Less" style={b} onClick={() => setHours(Math.max(1, h - 1))}>−</button>
            <span style={{ minWidth: 72, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{h} h</span>
            <button type="button" aria-label="More" style={b} onClick={() => setHours(Math.min(maxOne, h + 1))}>+</button>
            <button type="button" style={{ ...b, width: 'auto', padding: '0 14px', fontSize: 14 }} onClick={() => setHours(maxOne)}>Max</button>
          </div>
          {rate && <Row k="Uses" v={`${h} h · ${inr(h * rate.total)}`} />}
          <Row k="Left after" v={`${balance - h} h`} />
          {open && <p style={muted}>Cancel the open code first.</p>}
          <Primary disabled={!online || !tx.ready || !rate || h < 1 || !!open} onClick={make}>{!online ? 'Needs internet' : h < 1 ? 'Enter an amount' : `Make code for ${h} h`}</Primary>
          <p style={muted}>{online ? 'Pays for any machine work. Hours are used when the owner scans.' : 'You are offline. Making a code needs internet.'}</p>
        </>
      )}
      {!vouchers.isLoading && balance === 0 && !open && <p style={muted}>No machine hours yet. They come with a crop share.</p>}
    </Sheet>
  );
}

/** A8a (open) / A8b (expired). */
function Code({ v, saved, rate, onBack, onCancel, onNew }) {
  const [img, setImg] = useState();
  const live = v.code.open;
  useEffect(() => { if (live) QRCode.toDataURL(`nila:voucher:${v.token}:${saved.code}`, { width: 260, margin: 1 }).then(setImg); }, [live, v.token, saved.code]);
  const name = `${rate?.name || 'Machine'} · ${v.code.max} h`;
  if (!live) {
    return (
      <Sheet landName="Machinery" title={name} onBack={onBack}>
        <Row k="Status" v={v.used > saved.used ? 'Used' : 'Expired · no hours used'} />
        <Row k="Was valid until" v={when(v.code.expires)} />
        <Row k="You still have" v={`${v.left} h`} />
        <p style={muted}>The machine owner did not scan this code in time. No hours were used.</p>
        <Primary onClick={onNew}>Make a new code</Primary>
      </Sheet>
    );
  }
  return (
    <Sheet landName="Machinery" title={name} onBack={onBack}>
      {img && <img src={img} alt="Your voucher code" style={{ display: 'block', margin: '0 auto', width: 260, height: 260, background: '#fff', borderRadius: 9999, padding: 24, boxSizing: 'border-box' }} />}
      <p style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 13 }}>{grouped(saved.code)}</p>
      <Row k="Paid from" v={`Machinery · ${v.code.max} h`} />
      {rate && <Row k="Value" v={inr(v.code.max * rate.total)} />}
      <Row k="Valid until" v={`${when(v.code.expires)} · ${hoursLeft(v.code.expires)} h left`} />
      <Row k="Left after" v={`${v.left - v.code.max} h`} />
      <p style={muted}>Show this to the machine owner. Hours are used when they scan it.</p>
      <button type="button" onClick={onCancel} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>Cancel code</button>
    </Sheet>
  );
}
