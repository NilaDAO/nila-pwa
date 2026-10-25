// A4 / A4a · her crop share (boards MemberCropShare, MemberCropShareInactive; notes a4-spec). A map board: the share's
// area filled in the crop's colour and labelled with the crop, the other areas plain; the sheet shows the crop, area,
// expected harvest and value, status and timing (the same numbers as her A1 row).
//  - A4a, not active yet (no loan drawn on it): what she collects (cash and machine hours, total) and when and where.
//    Only a 'from' date; the share is active once she collects ('Active when you collect').
//  - A4, active (a loan drawn on it): status and harvest, then field notes.
// Seed is paid as cash (LOAN_RULES P5), so A4a has no separate seed row: the cash includes it.
// While a loan on it is open, A4 shows the share's QR again for the leader's Repay scan (24 Oct, the same
// `nila:share:<plan>_<token>:<her G>` as on a Ready share): the scan picks this loan.
// Field notes are 'later' in the design (open-assets/2–4, Q27: no store and no member version of L7 yet): the list
// is empty and the Add a note buttons are shown disabled.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import { useNilaSigner } from '../wallet/signer';
import DeskCard from '../shell/DeskCard';
import { QrCircle } from './AssetParts';
import AreaMap from '../plan/AreaMap';
import { Loading } from '../register/Boot';
import { areasOf, useFieldRecord } from '../plan/record';
import { C } from '../shell/tokens';
import { BanknoteIcon, TractorIcon } from '../shell/icons';
import { amount, rowOf, useMyLand, useMyShares } from './MyShares';
import { tapRule } from '../plan/mapTap';
import { shareOn } from '../shell/MapStage';
import { currentSeason } from '../plan/ActivePlan';

const FLAG_OVERDUE = 1;
const FLAG_DEFAULTED = 2;
const FLAG_CLOSED = 4;
const U = 10_000_000;   // nIN, 7 decimals
const num = (v) => Number(BigInt(v ?? 0)) / U;

// "start of Mar", "mid Mar", "end of Mar" (the design shows timing as a part of a month).
function partOfMonth(d) {
  if (!d || Number.isNaN(d.getTime())) return '—';
  const m = d.toLocaleDateString('en-GB', { month: 'short' });
  const day = d.getDate();
  return day <= 10 ? `start of ${m}` : day <= 20 ? `mid ${m}` : `end of ${m}`;
}

function Row({ k, v, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ fontWeight: 700, color: strong ? C.text : C.muted, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

const line = { height: 1, background: C.raised, margin: '8px 0' };
const ico = (d) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const CameraIcon = () => ico(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></>);
const CheckIcon = () => ico(<path d="M20 6 9 17l-5-5" />);
const DropIcon = () => ico(<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />);

function statusOf(x) {
  if (!x.ft) return 'Not attested yet';
  const f = Number(x.ft.loan?.flags ?? 0);
  // Unused past its last draw date (25 Oct): the cycle is over; shown as a state, not an error.
  if (!x.drawn && (x.lapsed || x.late)) return 'Not used · lapsed';
  if (!x.drawn && x.early) return 'Not open yet';
  if (!x.drawn) return 'Active when you collect';
  if (f & FLAG_CLOSED) return 'Repaid';
  if (f & FLAG_DEFAULTED) return 'Defaulted';
  if (f & FLAG_OVERDUE) return 'Overdue';
  return 'Financed';
}

/** bar / onSwipe (map-central trial): the ‹ asset › bar on top of the card, and a swipe on the card that steps it. */
export default function CropShare({ token, onBack, onTakeUp, bar, onSwipe }) {
  const shares = useMyShares();
  const land = useMyLand();
  const field = useFieldRecord(land.landId, land.evm, land.stellarTitle ? land.stellarTitle.record_hash || '' : undefined);
  const record = field.data?.record;
  const x = shares.data?.find((y) => y.token_id === token);
  const s = useNilaSigner();
  // #/cropshare/<token>/qr (A1's repay card, step 2): open on the QR.
  const [repayQr, setRepayQr] = useState(() => /\/qr$/.test(window.location.hash));
  const [img, setImg] = useState();
  useEffect(() => {
    if (repayQr && x?.plan?.id && s?.stellarAddress) QRCode.toDataURL(`nila:share:${x.plan.id}_${x.token_id}:${s.stellarAddress}`, { width: 720, margin: 2 }).then(setImg);
  }, [repayQr, x?.plan?.id, x?.token_id, s?.stellarAddress]);
  // S1 until her shares and her field record are both in (21 Oct): the card never shows before its map.
  if ((!x && (shares.isLoading || !shares.data)) || (x && !record && !field.error)) return <Loading />;
  if (!x) {
    return (
      <Sheet title="Your crop share" onBack={onBack}>
        <p style={{ ...muted, textAlign: 'center' }}>This crop share is not in your plan.</p>
      </Sheet>
    );
  }
  const r = rowOf(x) || {};
  const name = r.name || x.crop.replace(/_/g, ' ');
  const fodder = !x.share.loan_amount && x.share.hours;
  const nAreas = areasOf(record).length;
  // The share's area in the crop's colour with the crop as its label; the other areas keep "Area n". A merged share
  // (same crop on several areas, 21 Oct) colours each of its areas.
  const own = x.zones || x.share.zones || [x.zone];
  const labels = Object.fromEntries(own.map((z) => [z, { text: name, colour: r.colour }]));
  // With the asset bar (map-central trial) the card starts at the middle of the screen: her area stays above it.
  // Map taps (24 Oct rule): her share's field again → back to the previous view; another field → that field's share (the same
  // season as this one, else this season's).
  const onTap = tapRule(own, {
    back: () => window.history.back(),   // the view it came from (Assets, or the crop plan's map)
    open: (z) => {
      const on = (y) => (y.zones || y.share?.zones || [y.zone]).includes(z);
      const seasons = x.plan?.plan?.seasons || [];
      const y = (shares.data || []).find((s) => on(s) && s.share?.from_date === x.share.from_date)
        || (seasons.length ? shareOn(shares.data, seasons, currentSeason(seasons), z) : undefined);
      if (y) window.location.hash = `#/cropshare/${y.token_id}`;
    },
  });
  const map = record ? <AreaMap record={record} labels={labels} selected={nAreas > 1 ? x.zone : null} onSelect={onTap}
    fitBottom={bar ? Math.round(window.innerHeight / 2) + 72 : undefined} /> : null;
  const head = (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{name}</span>
        <span style={{ ...muted, lineHeight: 1.5 }}>Crop share · Area {x.area}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{r.kg ? amount(r.kg) : '—'}</span>
        <span style={{ ...muted, lineHeight: 1.5 }}>{fodder ? 'Fodder · own use' : r.value ? `~${inr(r.value)}` : ''}</span>
      </span>
    </div>
  );

  if (!x.drawn) {
    // A4a: not active yet. Cash is the attested cash part (the plan's, before the attestation); machine hours at the plan's rate.
    const cash = x.ft ? num(x.ft.amount) : Number(x.share.loan_amount || 0);
    // Attested hours are voucher units (centi tractor hours, 23 Oct); before the attestation, the plan's machine hours.
    const hours = x.ft ? Number(x.ft.hours) / 100 : Number(x.share.hours || 0);
    const vouchers = Number(r.finance?.voucher_value || 0);
    // Its window (25 Oct): ready from six weeks before its last draw date, used by that date.
    const until = x.final ? new Date(x.final * 1000) : x.share.final_date ? new Date(x.share.final_date) : null;
    const opens = x.opens ? new Date(x.opens * 1000) : until ? new Date(until.getTime() - 42 * 86400_000) : null;
    const over = x.lapsed || x.late;
    const day = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
      <Sheet map={map} onBack={onBack} bar={bar} onSwipe={onSwipe}>
        {head}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row k="Status" v={statusOf(x)} />
          {!over && opens && <Row k={x.ready ? 'Ready since' : 'Ready from'} v={day(opens)} strong />}
          <Row k={over ? 'Last day was' : 'Use it by'} v={until ? day(until) : '—'} strong />
          <Row k="Where" v="Union office" strong />
        </div>
        <div style={line} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '12px 0 0' }}>What you collect</h2>
        <p style={{ ...muted, margin: '0 0 12px' }}>From your crop plan.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            <BanknoteIcon color={C.gold} /><span style={{ flexGrow: 1, color: C.muted }}>Cash</span><b>{inr(cash)}</b>
          </div>
          {hours > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <TractorIcon color={C.gold} /><span style={{ flexGrow: 1, color: C.muted }}>Machine hours · {x.ft ? `${hours.toFixed(1)} tractor h` : `${hours} h`}</span><b>{vouchers ? inr(vouchers) : '—'}</b>
            </div>
          )}
        </div>
        <div style={line} />
        <Row k="Total" v={inr(cash + vouchers)} strong />
        {/* Ready: her scan of the leader's QR (assisted: the leader taps it on her phone), or a leader's own take-up. */}
        {x.ready && <Primary onClick={() => onTakeUp(x.token_id)}>Get cash and vouchers</Primary>}
        {over && <p style={{ ...muted, textAlign: 'center' }}>Too late for this cycle. Its fields are freed for a new plan.</p>}
      </Sheet>
    );
  }

  // A4: active. The loan on it: the cash part handed out, what is left to repay, due 3 weeks after harvest.
  const l = x.ft.loan || {};
  const open = !(Number(l.flags ?? 0) & FLAG_CLOSED);
  if (repayQr) {
    return (
      <DeskCard title={`${name} · Area ${x.area}`} onBack={() => setRepayQr(false)}>
        <QrCircle img={img} alt="Your crop share QR" />
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>Bring the cash to the union office. Your leader scans this, counts the cash and records your repayment.</p>
      </DeskCard>
    );
  }
  const left = num(l.principal) - num(l.principal_paid);
  const harvest = r.harvest ? new Date(r.harvest) : null;
  const sugarcane = /sugarcane/.test(x.crop);
  const noteBtn = { flex: 1, height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 14,
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5, cursor: 'default' };
  return (
    <Sheet map={map} onBack={onBack} bar={bar} onSwipe={onSwipe}>
      {head}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row k="Status" v={statusOf(x)} />
        <Row k="Harvest" v={fodder ? 'Regular cuts' : partOfMonth(harvest)} strong />
        {num(l.principal) > 0 && <Row k="Loan" v={`${inr(num(l.principal))}${left > 0 ? ` · ${inr(left)} to repay` : ''}`} strong />}
      </div>
      {open && <Primary onClick={() => setRepayQr(true)}>Repay at the office</Primary>}
      <div style={line} />
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '12px 0 0' }}>Field notes</h2>
      <p style={{ ...muted, margin: '0 0 12px' }}>Your notes help your leader plan the harvest.</p>
      <p style={muted}>No notes yet.</p>
      <p style={{ ...muted, fontWeight: 700, margin: '16px 0 8px' }}>Add a note</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled style={noteBtn}><CameraIcon />Field photo</button>
        {sugarcane && <button type="button" disabled style={noteBtn}><DropIcon />Sugar reading</button>}
        <button type="button" disabled style={noteBtn}><CheckIcon />Harvest done</button>
      </div>
    </Sheet>
  );
}
