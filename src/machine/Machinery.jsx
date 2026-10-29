// A8 machinery voucher, A8a its code, A8b an expired code (boards MemberAssetTractor, MemberAssetTractorScrolled,
// MemberAssetTractorExpired). Decided 17 Oct (LOAN_RULES §5 "Machinery vouchers (P6)"), any machine of her union;
// since 27 Oct in tractor ACRES (units on-chain: centi tractor acres; an acre of a machine uses its price an acre on
// the share's crop ÷ the tractor's). She picks the job, nothing typed (executive decision 27 Oct): the crop share and
// the machine; the acres are the share's area (from its token id), or what is left of the voucher. The QR is her
// signed authorization of machinery.claim for (union, token, up to N units), one use (Soroban nonce), ~48 h (its
// expiry ledger); nothing goes on-chain until the owner scans it and claims (and may lower the acres for a part done).
// DESIGN GAPs: one code at a time; "Remove" only forgets the code on
// this phone (a signed code cannot be withdrawn before it expires); in assisted mode the leader drives her phone and she signs here (23 Oct);
// no "Receive" (vouchers are not sent); no typed fallback (executive decision 23 Oct).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import BigQr from '../shell/BigQr';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { signVoucherCode } from './voucherCode';
import { Primary, inr, muted } from '../plan/ui';
import { C, FONT, R } from '../shell/tokens';
import { Card, CardTitle, KV, NoteBar } from '../loan/AssetParts';
import { TRACTOR, acresFor, acresText, loadVoucherCode as load, rateForCrop, saveVoucherCode as save, shareOfToken, ta, unitsOf, useMachines, useRates, useVouchers } from './hooks';
import { tokenHex } from '../stellar/soroban';
import { useMyShares } from '../loan/MyShares';
import MapCard from '../shell/MapCard';
import { useQuery } from '@tanstack/react-query';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { assisted } from '../loan/MyShares';

const TERM = 34_560;                          // ledgers, ~48 h
const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hoursLeft = (ts) => Math.max(0, Math.floor((ts - Date.now() / 1000) / 3600));

const icon = (d, color, size = 20) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const tractor = icon(<path d="M4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 17h6M4 14V7h7l2 5h6v4M8 7V4" />, C.ink, 32);
const chevron = icon(<path d="m6 9 6 6 6-6" />, C.muted);
const qr = icon(<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2zM18 14h2v2h-2z" />, C.text, 18);
const info = <span style={{ flexShrink: 0, display: 'flex' }}>{icon(<path d="M12 22a10 10 0 1 0 0-20a10 10 0 0 0 0 20zM12 16v-4M12 8h.01" />, C.muted)}</span>;
/** A map card on her own property (map-centred lane, 23 Oct): the header, then the screen's cards. */
function Page({ title, onBack, note, children }) {
  return (
    <MapCard header={{ title, onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: note ? 120 : 16 }}>
      {children}
      {note && <NoteBar>{note}</NoteBar>}
    </MapCard>
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
  const [pick, setPick] = useState();          // the crop share (voucher token) the job is for
  const [code, setCode] = useState(load);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState();
  const list = vouchers.data || [];
  const balance = list.reduce((a, v) => a + v.left, 0);              // units
  // Her code: used once the voucher's used units moved since she signed it; expired after its ~48 h.
  const cv = code && list.find((v) => v.token === code.token);
  const used = !!code && !!vouchers.data && (!cv || cv.used > code.used);
  const open = code && !used && code.until > Date.now() / 1000 ? code : null;
  // Only the machine types the union has registered and confirmed (23 Oct), at that type's price an acre.
  const machines = useMachines();
  const kinds = new Set((machines.data || []).filter((m) => m.confirmed).map((m) => m.machine_type));
  const avail = (rates.data || []).filter((r) => kinds.has(r.type));
  const rate = avail.find((r) => r.type === type) || avail[0];
  // The job (27 Oct): her crop share (a voucher with units left) and its area; the price for its crop if the union
  // set one; the acres are the area, or what the voucher still pays for.
  const shares = useMyShares().data || [];
  const nameOf = (token) => {
    const x = shares.find((y) => tokenHex(y.token_id).replace(/^0x/, '').toLowerCase().padStart(64, '0') === token);
    return x ? `${(x.crop || '').replace(/_/g, ' ')} · Area ${x.area}` : 'Crop share';
  };
  const withLeft = list.filter((v) => v.left > 0);
  const v = withLeft.find((x) => x.token === pick) || withLeft[0];
  const share = v ? shareOfToken(v.token) : null;
  const price = useQuery({
    queryKey: ['stellar', 'cropRate', cfg?.union, rate?.type, share?.family], enabled: !!cfg && !!rate && !!share, staleTime: 300_000,
    queryFn: () => rateForCrop(cfg, rate.type, share.family),
  });
  const each = price.data?.total || rate?.total || 0;
  const tractorRate = rates.data?.find((r) => r.type === TRACTOR)?.total || 0;
  const value = tractorRate ? inr((balance / 100) * tractorRate) : '';
  const area = share && share.centiAcres > 0 ? share.centiAcres / 100 : 0;
  const pays = v && each ? acresFor(v.left, each, tractorRate) : 0;
  const acres = area > 0 ? Math.min(area, pays) : pays;
  const units = each ? unitsOf(acres, each, tractorRate) : 0;
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  const make = async () => {
    if (!v || v.left < units) return;
    setBusy(true); setLost(undefined);
    try {
      // The compact code (23 Oct): her address, the units, the expiry ledger and her signature only.
      const { qr: entry, until } = await signVoucherCode({ cfg, signer: s.senderAddress, signHash: s.signHash, token: v.token, units, ledgers: TERM });
      // units: what she signed for; acres: the job's acres on that machine.
      const c = { entry, token: v.token, units, acres, type: rate?.type, used: v.used, until };
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
    <Page title="Machinery" onBack={onBack} note={online ? 'Pays for machine work on your crop share. It is used when the owner scans.' : 'You are offline. Making a code needs internet.'}>
      <Card label="Machinery" style={{ gap: 12 }}>
        <span style={{ alignSelf: 'center', width: 72, height: 72, borderRadius: R.round, background: C.coral, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tractor}</span>
        <CardTitle right={<span style={{ fontSize: 16, fontWeight: 700 }}>{vouchers.isLoading ? '…' : `${ta(balance)} ac`}</span>}>Machinery</CardTitle>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: C.muted, marginTop: -8 }}>
          <span>Voucher · in tractor acres</span><span>{value}</span>
        </div>
        {vouchers.isError && <span style={{ color: C.coral, fontSize: 14 }}>Could not read your vouchers. Try again.</span>}
      </Card>
      {open && (
        <Card label="Open code" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{qr}</span>
            <span style={{ display: 'flex', flexDirection: 'column', fontSize: 14, lineHeight: 1.5 }}>
              <b>Open code · {rates.data?.find((r) => r.type === open.type)?.name || 'Machine'} · {open.acres != null ? acresText(open.acres) : `${open.work ?? ta(open.hours)} h`}</b>
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
          {withLeft.length > 1 && (
            <>
              <span style={label}>Crop share</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {withLeft.map((x) => (
                  <button key={x.token} type="button" onClick={() => setPick(x.token)} style={{ ...field, padding: '0 14px', cursor: 'pointer', fontWeight: 700,
                    background: x.token === v?.token ? C.accent : C.raised, color: x.token === v?.token ? C.ink : C.text, textTransform: 'capitalize' }}>{nameOf(x.token)}</button>
                ))}
              </div>
            </>
          )}
          <span style={label}>Machine</span>
          {rates.data && machines.data && !avail.length && <span style={{ color: C.muted, fontSize: 14 }}>No machines registered in the union yet.</span>}
          {/* The machine list opens inside the card under the row, as on L13. */}
          {rate && (
            <div style={{ background: C.raised, borderRadius: R.button, overflow: 'hidden' }}>
              <button type="button" aria-expanded={picking} onClick={() => setPicking(!picking)} style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ flexGrow: 1, fontWeight: 700 }}>{rate.name}</span>
                <span style={{ color: C.muted }}>{inr(each)} an acre</span>
                <span style={{ display: 'flex', transform: picking ? 'rotate(180deg)' : 'none' }}>{chevron}</span>
              </button>
              {picking && avail.filter((r) => r.type !== rate.type).map((r) => (
                <button key={r.type} type="button" onClick={() => { setType(r.type); setPicking(false); }}
                  style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', cursor: 'pointer', textAlign: 'left', borderTop: `1px solid ${C.ink}`, borderRadius: 0 }}>
                  <span style={{ flexGrow: 1 }}>{r.name}</span><span style={{ color: C.muted }}>{inr(r.total)} an acre</span>
                </button>
              ))}
            </div>
          )}
          {v && <KV k="Job" v={`${nameOf(v.token)} · ${acresText(acres)}`} />}
          {area > 0 && acres < area && <span style={{ color: C.muted, fontSize: 14 }}>Your voucher pays for {acresText(acres)} of the {acresText(area)} with this machine.</span>}
          {rate && <KV k="Uses" v={`${ta(units)} tractor acres · ${inr(acres * each)}`} />}
          <KV k="Left after" v={`${ta(balance - units)} tractor acres`} />
          {open && <span style={{ color: C.muted, fontSize: 14 }}>Cancel the open code first.</span>}
          <Primary disabled={!online || busy || !s?.ready || !cfg || !rate || acres <= 0 || !!open} onClick={make}>{!online ? 'Needs internet' : acres <= 0 ? 'Nothing left on this voucher' : `Make code for ${rate?.name || 'the job'}`}</Primary>
        </Card>
      )}
      {balance > 0 && !assisted() && <HandBack list={list} tractorRate={tractorRate} />}
      {!vouchers.isLoading && balance === 0 && !open && <Card label="No machine work"><span style={{ color: C.muted, fontSize: 14 }}>No machine vouchers yet. They come with a crop share.</span></Card>}
    </Page>
  );
}

/** Hand back acres (executive decision 26 Oct): unused tractor acres of a voucher whose value she still owes come off
 *  her debt at their whole value; 5% of it is owed to the union treasury (fund_core.return_voucher). Self mode only:
 *  in assist mode her leader does it in a session. DESIGN GAP: no board. */
function HandBack({ list, tractorRate }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [hours, setHours] = useState(1);   // tractor acres
  // Per voucher: what of its value she still owes (voucher_book), so how many of its tractor acres she may hand back.
  const books = useQuery({
    queryKey: ['stellar', 'voucherBooks', list.map((v) => v.token).join(',')], enabled: !!cfg && list.length > 0, staleTime: 30_000,
    queryFn: () => Promise.all(list.map(async (v) => {
      const b = await readContract(cfg, 'fund_core', 'voucher_book', [sv.address(cfg.union), sv.bytes32(v.token)]).catch(() => null);
      const owedUnits = b && Number(b.per_hour) > 0 ? Math.floor(((Number(b.value) - Number(b.repaid)) * 100) / Number(b.per_hour)) : 0;
      return { ...v, can: Math.max(0, Math.min(v.left, owedUnits)) };
    })),
  });
  const best = (books.data || []).filter((v) => v.can > 0).sort((a, b) => b.can - a.can)[0];
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  if (!best) return null;
  const max = Math.floor(best.can / 10) / 10;           // tractor acres, a tenth
  const h = Math.min(hours, max);
  const units = Math.round(h * 100);
  const off = (units / 100) * tractorRate;
  const step = (d) => setHours(Math.max(0, Math.min(max, Math.round((h + d) * 10) / 10)));
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700, cursor: 'pointer' };
  return (
    <Card label="Hand back machine work" style={{ gap: 12 }}>
      <CardTitle>Hand back machine work</CardTitle>
      <span style={{ color: C.muted, fontSize: 14 }}>Machine work you will not use comes off what you owe. 5% of its value goes to your union.</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" aria-label="Less" style={b} onClick={() => step(-0.5)}>−</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{h} tractor ac</span>
        <button type="button" aria-label="More" style={b} onClick={() => step(0.5)}>+</button>
      </div>
      <KV k="Off what you owe" v={inr(off * 0.95)} />
      <KV k="To your union (5%)" v={inr(off * 0.05)} />
      <Primary disabled={units <= 0 || !tx.ready} onClick={() => tx.run({
        label: `Hand back ${h} tractor acres`, rows: [['Machine work', `${h} tractor acres`], ['Off what you owe', inr(off * 0.95)]],
        contractName: 'fund_core', fn: 'return_voucher',
        args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.bytes32(best.token), sv.u32(units)],
        invalidate: [['stellar', 'vouchers'], ['stellar', 'voucherBooks'], ['oracle', 'myShares']],
      })}>{`Hand back ${h} tractor acres`}</Primary>
    </Card>
  );
}

/** A8a (open) / A8b (expired or used). */
function Code({ c, left, live, used, rate, onBack, onRemove }) {
  const [img, setImg] = useState();
  useEffect(() => { if (live) QRCode.toDataURL(c.entry, { width: 720, margin: 2, errorCorrectionLevel: 'M' }).then(setImg); }, [live, c.entry]);
  const name = `${rate?.name || 'Machine'} · ${c.acres != null ? acresText(c.acres) : `${c.work ?? ta(c.hours)} h`}`;
  if (!live) {
    return (
      <Page title={name} onBack={onBack}><Card label={name} style={{ gap: 12 }}>
        <KV k="Status" v={used ? 'Used' : 'Expired · nothing used'} />
        <KV k="Was valid until" v={when(c.until)} />
        <KV k="You still have" v={`${ta(left)} tractor acres`} />
        {!used && <p style={muted}>The machine owner did not scan this code in time. Nothing was used.</p>}
        <Primary onClick={onRemove}>Make a new code</Primary>
      </Card></Page>
    );
  }
  return (
    <Page title={name} onBack={onBack}><Card label={name} style={{ gap: 12 }}>
      {/* As big as the screen allows (shared BigQr, as her crop share QR): the QR spans the screen's width in the
          white circle, clipped at the screen's sides. */}
      <BigQr img={img} alt="Your voucher code" caption="Show this to the machine owner" below={300} />
      <KV k="Valid until" v={`${when(c.until)} · ${hoursLeft(c.until)} h left`} />
      <button type="button" onClick={onRemove} style={{ width: '100%', height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text,
        fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' }}>Remove from this phone</button>
    </Card></Page>
  );
}
