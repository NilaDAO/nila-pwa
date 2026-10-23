// A8 machinery voucher, A8a its code, A8b an expired code (boards MemberAssetTractor, MemberAssetTractorScrolled,
// MemberAssetTractorExpired). Decided 17 Oct (LOAN_RULES §5 "Machinery vouchers (P6)"): whole hours, any
// machine of her union. Since 23 Oct ("Voucher spend"): the QR is her signed authorization of machinery.claim for
// (union, token, up to N hours), one use (Soroban nonce), ~48 h (its expiry ledger); nothing goes on-chain until the
// owner scans it and claims. Kept on this phone to show again; made on the voucher with the fewest hours that cover it.
// DESIGN GAPs: whole hours instead of tractor-hour factors; one code at a time; "Remove" only forgets the code on
// this phone (a signed code cannot be withdrawn before it expires); assisted mode shows the board's text only;
// no "Receive" (vouchers are not sent); no typed fallback (executive decision 23 Oct).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { signInvocation, sv } from '../stellar/soroban';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { loadVoucherCode as load, saveVoucherCode as save, useRates, useVouchers } from './hooks';

const TERM = 34_560;                          // ledgers, ~48 h
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
  const [type, setType] = useState();
  const [picking, setPicking] = useState(false);
  const [hours, setHours] = useState(1);
  const [code, setCode] = useState(load);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState();
  const list = vouchers.data || [];
  const balance = list.reduce((a, v) => a + v.left, 0);
  const maxOne = Math.max(0, ...list.map((v) => v.left));
  // Her code: used once the voucher's used hours moved since she signed it; expired after its ~48 h.
  const cv = code && list.find((v) => v.token === code.token);
  const used = !!code && !!vouchers.data && (!cv || cv.used > code.used);
  const open = code && !used && code.until > Date.now() / 1000 ? code : null;
  const rate = rates.data?.find((r) => r.type === type) || rates.data?.[0];
  const totals = (rates.data || []).map((r) => r.total);
  const value = totals.length ? (Math.min(...totals) === Math.max(...totals) ? inr(balance * totals[0]) : `${inr(balance * Math.min(...totals))}–${inr(balance * Math.max(...totals))}`) : '';
  const h = Math.min(hours, maxOne);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  const make = async () => {
    const v = list.filter((x) => x.left >= h).sort((a, b) => a.left - b.left)[0];
    if (!v) return;
    setBusy(true); setLost(undefined);
    try {
      const { entry, until } = await signInvocation({ cfg, signer: s.stellarAddress, signHash: s.signHash, contractName: 'machinery', fn: 'claim',
        args: [sv.address(cfg.union), sv.bytes32(v.token), sv.u32(h)], ledgers: TERM });
      const c = { entry, token: v.token, hours: h, type: rate?.type, used: v.used, until };
      save(c);
      // Without the code on her phone she could not show it again: say so, but show it this once.
      if (load()?.entry !== entry) setLost('Your phone cannot keep the code (private mode or no space). Show it now.');
      setCode(c); setShow(true);
    } catch (e) { setLost(e.message); }
    setBusy(false);
  };
  const remove = () => { save(null); setCode(null); setShow(false); };

  if (show && code) return <Code c={code} left={cv?.left ?? 0} live={!!open} used={used} rate={rates.data?.find((r) => r.type === code.type)} onBack={() => setShow(false)} onRemove={remove} />;

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
          <b>Open code · {rates.data?.find((r) => r.type === open.type)?.name || 'Machine'} · {open.hours} h</b>
          <div style={muted}>{hoursLeft(open.until)} hours left · not used yet</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Primary onClick={() => setShow(true)}>Show</Primary>
            <button type="button" onClick={remove} style={{ ...b, width: '100%', fontSize: 14, marginTop: 8 }}>Remove</button>
          </div>
        </div>
      )}
      {lost && <p style={{ color: C.coral }}>{lost}</p>}
      {code && !open && !used && <Choice sub={`Was valid until ${when(code.until)}`} onClick={() => setShow(true)}>Expired code</Choice>}
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
          {open && <p style={muted}>Remove the open code first.</p>}
          <Primary disabled={!online || busy || !s?.ready || !cfg || !rate || h < 1 || !!open} onClick={make}>{!online ? 'Needs internet' : h < 1 ? 'Enter an amount' : `Make code for ${h} h`}</Primary>
          <p style={muted}>{online ? 'Pays for any machine work. Hours are used when the owner scans.' : 'You are offline. Making a code needs internet.'}</p>
        </>
      )}
      {!vouchers.isLoading && balance === 0 && !open && <p style={muted}>No machine hours yet. They come with a crop share.</p>}
    </Sheet>
  );
}

/** A8a (open) / A8b (expired or used). */
function Code({ c, left, live, used, rate, onBack, onRemove }) {
  const [img, setImg] = useState();
  useEffect(() => { if (live) QRCode.toDataURL(c.entry, { width: 400, margin: 1, errorCorrectionLevel: 'L' }).then(setImg); }, [live, c.entry]);
  const name = `${rate?.name || 'Machine'} · ${c.hours} h`;
  if (!live) {
    return (
      <Sheet landName="Machinery" title={name} onBack={onBack}>
        <Row k="Status" v={used ? 'Used' : 'Expired · no hours used'} />
        <Row k="Was valid until" v={when(c.until)} />
        <Row k="You still have" v={`${left} h`} />
        {!used && <p style={muted}>The machine owner did not scan this code in time. No hours were used.</p>}
        <Primary onClick={onRemove}>Make a new code</Primary>
      </Sheet>
    );
  }
  return (
    <Sheet landName="Machinery" title={name} onBack={onBack}>
      {/* The board's white circle; the square QR sits inside it whole (side ≤ diameter / √2): a clipped
          corner square cannot be read by a camera. */}
      {img && (
        <div style={{ width: 280, height: 280, margin: '0 auto', borderRadius: 9999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={img} alt="Your voucher code" style={{ width: 190, height: 190, display: 'block' }} />
        </div>
      )}
      <Row k="Paid from" v={`Machinery · up to ${c.hours} h`} />
      {rate && <Row k="Value" v={`up to ${inr(c.hours * rate.total)}`} />}
      <Row k="Valid until" v={`${when(c.until)} · ${hoursLeft(c.until)} h left`} />
      <Row k="Left after" v={`${left - c.hours} h or more`} />
      <p style={muted}>Show this to the machine owner. Hours are used when they scan it.</p>
      <button type="button" onClick={onRemove} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>Remove from this phone</button>
    </Sheet>
  );
}
