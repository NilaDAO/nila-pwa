// A8 machinery voucher, A8a its code, A8b an expired code (boards MemberAssetTractor, MemberAssetTractorScrolled,
// MemberAssetTractorExpired). Decided 17 Oct (LOAN_RULES §5 "Machinery vouchers (P6)"), any machine of her union;
// since 23 Oct in tractor hours (units on-chain: centi tractor hours; an hour of a machine uses its rate ÷ the
// tractor's). Since 23 Oct ("Voucher spend"): the QR is her signed authorization of machinery.claim for
// (union, token, up to N units), one use (Soroban nonce), ~48 h (its expiry ledger); nothing goes on-chain until the
// owner scans it and claims. Kept on this phone to show again; made on the voucher with the fewest hours that cover it.
// DESIGN GAPs: one code at a time; "Remove" only forgets the code on
// this phone (a signed code cannot be withdrawn before it expires); in assisted mode the leader drives her phone and she signs here (23 Oct);
// no "Receive" (vouchers are not sent); no typed fallback (executive decision 23 Oct).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { signInvocation, sv } from '../stellar/soroban';
import { Primary, inr, muted } from '../plan/ui';
import { C, FONT, R } from '../shell/tokens';
import { ScreenHeader } from '../shell/ListRow';
import { Card, CardTitle, KV } from '../loan/AssetParts';
import { TRACTOR, hoursFor, loadVoucherCode as load, saveVoucherCode as save, th, unitsOf, useMachines, useRates, useVouchers } from './hooks';

const TERM = 34_560;                          // ledgers, ~48 h
const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hoursLeft = (ts) => Math.max(0, Math.floor((ts - Date.now() / 1000) / 3600));

const icon = (d, color, size = 20) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const tractor = icon(<path d="M4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 17h6M4 14V7h7l2 5h6v4M8 7V4" />, C.ink, 32);
const chevron = icon(<path d="m6 9 6 6 6-6" />, C.muted);
const qr = icon(<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2zM18 14h2v2h-2z" />, C.text, 18);
const info = <span style={{ flexShrink: 0, display: 'flex' }}>{icon(<path d="M12 22a10 10 0 1 0 0-20a10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />, C.muted)}</span>;
/** A full page (no map card, 23 Oct): the header, then the screen's cards. */
function Page({ title, onBack, children }) {
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ScreenHeader title={title} onBack={onBack} />
      {children}
    </div>
  );
}

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
  const balance = list.reduce((a, v) => a + v.left, 0);              // units
  const maxUnits = Math.max(0, ...list.map((v) => v.left));
  // Her code: used once the voucher's used hours moved since she signed it; expired after its ~48 h.
  const cv = code && list.find((v) => v.token === code.token);
  const used = !!code && !!vouchers.data && (!cv || cv.used > code.used);
  const open = code && !used && code.until > Date.now() / 1000 ? code : null;
  // Only the machine types the union has registered and confirmed (23 Oct), at that type's rate an hour.
  const machines = useMachines();
  const kinds = new Set((machines.data || []).filter((m) => m.confirmed).map((m) => m.machine_type));
  const avail = (rates.data || []).filter((r) => kinds.has(r.type));
  const rate = avail.find((r) => r.type === type) || avail[0];
  // Her tractor hours at the tractor's rate; the hours of the picked machine they pay for, and the units they use.
  const tractorRate = rates.data?.find((r) => r.type === TRACTOR)?.total || 0;
  const value = tractorRate ? inr((balance / 100) * tractorRate) : '';
  const maxOne = rate ? hoursFor(maxUnits, rate.total, tractorRate) : 0;
  const h = Math.min(hours, maxOne);
  const units = rate ? unitsOf(h, rate.total, tractorRate) : 0;
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  const make = async () => {
    const v = list.filter((x) => x.left >= units).sort((a, b) => a.left - b.left)[0];
    if (!v) return;
    setBusy(true); setLost(undefined);
    try {
      const { entry, until } = await signInvocation({ cfg, signer: s.stellarAddress, signHash: s.signHash, contractName: 'machinery', fn: 'claim',
        args: [sv.address(cfg.union), sv.bytes32(v.token), sv.u32(units)], ledgers: TERM });
      // hours: the units she signed for; work: the hours of that machine they pay for.
      const c = { entry, token: v.token, hours: units, work: h, type: rate?.type, used: v.used, until };
      save(c);
      // Without the code on her phone she could not show it again: say so, but show it this once.
      if (load()?.entry !== entry) setLost('Your phone cannot keep the code (private mode or no space). Show it now.');
      setCode(c); setShow(true);
    } catch (e) { setLost(e.message); }
    setBusy(false);
  };
  const remove = () => { save(null); setCode(null); setShow(false); };

  if (show && code) return <Code c={code} left={cv?.left ?? 0} live={!!open} used={used} rate={rates.data?.find((r) => r.type === code.type)} onBack={() => setShow(false)} onRemove={remove} />;

  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
  const field = { height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14 };
  const second = { flex: 1, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' };
  const label = { fontSize: 14, fontWeight: 700, lineHeight: 1.5 };
  // Board A8 (MemberAssetTractor), full page (23 Oct): no "Receive" (vouchers are not sent).
  return (
    <Page title="Machinery" onBack={onBack}>
      <Card label="Machinery" style={{ gap: 12 }}>
        <span style={{ alignSelf: 'center', width: 72, height: 72, borderRadius: R.round, background: C.coral, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tractor}</span>
        <CardTitle right={<span style={{ fontSize: 16, fontWeight: 700 }}>{vouchers.isLoading ? '…' : `${th(balance)} h`}</span>}>Machinery</CardTitle>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: C.muted, marginTop: -8 }}>
          <span>Voucher · in tractor hours</span><span>{value}</span>
        </div>
        {vouchers.isError && <span style={{ color: C.coral, fontSize: 14 }}>Could not read your vouchers. Try again.</span>}
      </Card>
      {open && (
        <Card label="Open code" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{qr}</span>
            <span style={{ display: 'flex', flexDirection: 'column', fontSize: 14, lineHeight: 1.5 }}>
              <b>Open code · {rates.data?.find((r) => r.type === open.type)?.name || 'Machine'} · {open.work ?? th(open.hours)} h</b>
              <span style={{ color: C.muted }}>{hoursLeft(open.until)} hours left · not used yet</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={second} onClick={() => setShow(true)}>Show</button>
            <button type="button" style={second} onClick={remove}>Cancel code</button>
          </div>
        </Card>
      )}
      {lost && <span style={{ color: C.coral, fontSize: 14 }}>{lost}</span>}
      {code && !open && !used && (
        <Card label="Expired code" style={{ gap: 8 }}>
          <span style={label}>Expired code</span>
          <span style={{ color: C.muted, fontSize: 14 }}>Was valid until {when(code.until)}</span>
          <button type="button" style={second} onClick={() => setShow(true)}>Show</button>
        </Card>
      )}
      {balance > 0 && (
        <Card label="Spend" style={{ gap: 12 }}>
          <span style={label}>For</span>
          {rates.data && machines.data && !avail.length && <span style={{ color: C.muted, fontSize: 14 }}>No machines registered in the union yet.</span>}
          {/* The machine list opens inside the card under the row, as on L13. */}
          {rate && (
            <div style={{ background: C.raised, borderRadius: R.button, overflow: 'hidden' }}>
              <button type="button" aria-expanded={picking} onClick={() => setPicking(!picking)} style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ flexGrow: 1, fontWeight: 700 }}>{rate.name}</span>
                <span style={{ color: C.muted }}>up to {maxOne} h</span>
                <span style={{ display: 'flex', transform: picking ? 'rotate(180deg)' : 'none' }}>{chevron}</span>
              </button>
              {picking && avail.filter((r) => r.type !== rate.type).map((r) => (
                <button key={r.type} type="button" onClick={() => { setType(r.type); setPicking(false); }}
                  style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', cursor: 'pointer', textAlign: 'left', borderTop: `1px solid ${C.ink}`, borderRadius: 0 }}>
                  <span style={{ flexGrow: 1 }}>{r.name}</span><span style={{ color: C.muted }}>{inr(r.total)} an hour</span>
                </button>
              ))}
            </div>
          )}
          <span style={label}>Machine hours</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" aria-label="Less" style={b} onClick={() => setHours(Math.max(1, h - 1))}>−</button>
            <label style={{ ...field, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8 }}>
              <input aria-label="Machine hours" inputMode="numeric" value={h} onChange={(e) => setHours(Math.max(0, Math.min(maxOne, Number(e.target.value.replace(/\D/g, '')) || 0)))}
                style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: C.text, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, outline: 'none' }} />
              <span style={{ color: C.muted }}>h</span>
            </label>
            <button type="button" aria-label="More" style={b} onClick={() => setHours(Math.min(maxOne, h + 1))}>+</button>
            <button type="button" style={{ ...b, width: 'auto', padding: '0 14px', fontSize: 14 }} onClick={() => setHours(maxOne)}>Max</button>
          </div>
          {rate && <KV k="Uses" v={`${th(units)} tractor hours · ${inr(h * rate.total)}`} />}
          <KV k="Left after" v={`${th(balance - units)} tractor hours`} />
          {open && <span style={{ color: C.muted, fontSize: 14 }}>Cancel the open code first.</span>}
          <Primary disabled={!online || busy || !s?.ready || !cfg || !rate || h < 1 || !!open} onClick={make}>{!online ? 'Needs internet' : h < 1 ? 'Enter an amount' : `Make code for ${h} h`}</Primary>
        </Card>
      )}
      {!vouchers.isLoading && balance === 0 && !open && <Card label="No hours"><span style={{ color: C.muted, fontSize: 14 }}>No machine hours yet. They come with a crop share.</span></Card>}
      <Card label="How it works" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {info}
        <span style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{online ? 'Pays for any machine work. Hours are used when the owner scans.' : 'You are offline. Making a code needs internet.'}</span>
      </Card>
    </Page>
  );
}

/** A8a (open) / A8b (expired or used). */
function Code({ c, left, live, used, rate, onBack, onRemove }) {
  const [img, setImg] = useState();
  useEffect(() => { if (live) QRCode.toDataURL(c.entry, { width: 400, margin: 1, errorCorrectionLevel: 'L' }).then(setImg); }, [live, c.entry]);
  const name = `${rate?.name || 'Machine'} · ${c.work ?? th(c.hours)} h`;
  if (!live) {
    return (
      <Page title={name} onBack={onBack}><Card label={name} style={{ gap: 12 }}>
        <KV k="Status" v={used ? 'Used' : 'Expired · no hours used'} />
        <KV k="Was valid until" v={when(c.until)} />
        <KV k="You still have" v={`${th(left)} tractor hours`} />
        {!used && <p style={muted}>The machine owner did not scan this code in time. No hours were used.</p>}
        <Primary onClick={onRemove}>Make a new code</Primary>
      </Card></Page>
    );
  }
  return (
    <Page title={name} onBack={onBack}><Card label={name} style={{ gap: 12 }}>
      {/* The board's white circle; the square QR sits inside it whole (side ≤ diameter / √2): a clipped
          corner square cannot be read by a camera. */}
      {img && (
        <div style={{ width: 280, height: 280, margin: '0 auto', borderRadius: 9999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={img} alt="Your voucher code" style={{ width: 190, height: 190, display: 'block' }} />
        </div>
      )}
      <KV k="Paid from" v={`Machinery · up to ${th(c.hours)} tractor hours`} />
      {rate && c.work != null && <KV k="Value" v={`up to ${inr(c.work * rate.total)}`} />}
      <KV k="Valid until" v={`${when(c.until)} · ${hoursLeft(c.until)} h left`} />
      <KV k="Left after" v={`${th(left - c.hours)} tractor hours or more`} />
      <p style={muted}>Show this to the machine owner. Hours are used when they scan it.</p>
      <button type="button" onClick={onRemove} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>Remove from this phone</button>
    </Card></Page>
  );
}
