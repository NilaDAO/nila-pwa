// Her crop agreements (A1 group "Crop agreements", board MemberAssets-ley3) and taking one up: she signs
// fund_core.draw_loan herself; the leader hands over the cash at the office.
// A member takes a Ready share up at the office (23 Oct): her page is the camera; she scans the leader's L9 QR
// (the A1 request, 26 Oct), checks it against this share and confirms (N10); in assist mode the phone then shows a
// signed answer QR for the leader instead of drawing itself. First the page shows her share QR
// (`nila:share:<plan>_<token>:<her G>`): the leader's Members scan opens L11 with this share picked; a tap on it puts
// the camera in its place (so does the button under it). A leader taking up her own share sets
// it herself (her own L11/N10 in one). Both full pages, no map card.
// DESIGN GAP: neither page has a board of its own.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig, useStellarTitles } from '../stellar/hooks';
import { readFoodTokens, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { useCropChain, useLandTitles, usePlanClient } from '../plan/hooks';
import { Primary, inr, muted } from '../plan/ui';
import ListRow from '../shell/ListRow';
import { Card, QrCircle, Stepper } from './AssetParts';
import { ta } from '../machine/hooks';
import { LeaderLoan } from './LoanScreens';
import HelpQr from './HelpQr';
import { DeskQr } from './CashOut';
import { signDeskCode } from './deskCode';
import { capsFor, useUnionChecks } from './unionChecks';
import { C, FONT } from '../shell/tokens';
import { ChevronIcon, RupeeIcon, ShareTile } from '../shell/icons';
import MapCard from '../shell/MapCard';

const NIN = 10_000_000n;
export const FLAG_DRAWN = 8;
const FLAG_CLOSED = 4;
// Assist mode (executive decision 26 Oct): every member starts in it; the identity check (K1) or the Settings toggle
// switches to self mode ('nila.mode' = 'self').
export const assisted = () => { try { return localStorage.getItem('nila.mode') !== 'self'; } catch { return true; } };

/** Her land as the crop plan finds it (CP1): a Polygon title, else her title on Stellar — the demo's titles and every
 *  new member's are on Stellar only, so a Polygon-only lookup found no plan and A1 showed no crop agreements (21 Oct). */
export function useMyLand() {
  const s = useNilaSigner();
  const titles = useLandTitles(s?.evmAddress);
  const stellarTitles = useStellarTitles(s);
  const onPolygon = !!titles.data?.length;
  const stellarTitle = onPolygon ? undefined : stellarTitles.data?.[0];
  return { landId: onPolygon ? titles.data[0] : stellarTitle?.title_id, onPolygon, stellarTitle, evm: s?.evmAddress };
}

// FoodToken status (FoodTokenUpgradeable): 0 none, 1 active, 2 verified, 3 harvest confirmed, 4 burned (lapsed or
// cancelled). A share exists while its token does.
const FT_ABI = ['function getLandTitleTokens(uint32) view returns (uint256[])', 'function tokenStatus(uint256) view returns (uint8)'];
const FT_LIVE = new Set([1, 2, 3]);

/** The land's FoodTokens on Polygon (3 Nov): the chain says which crop agreements exist, not the node. Token ids as
 *  decimal strings; burned ones left out. */
export async function polygonShareIds(provider, landId) {
  const c = new ethers.Contract(process.env.REACT_APP_FOODTOKEN_ADDRESS, FT_ABI, provider);
  const ids = (await c.getLandTitleTokens(landId)).map((x) => x.toString());
  const st = await Promise.all(ids.map((id) => c.tokenStatus(id).then(Number)));
  return ids.filter((_, i) => FT_LIVE.has(st[i]));
}

/** Her shares (3 Nov): the FoodTokens her land title holds on Polygon, each with its state on Stellar. The approved
 *  plans' mint lists (the plan and its extensions, 25 Oct) only name them (crop, areas, season, the plan's amounts).
 *  Was: the node's mint lists decided what was listed, so a share the chain did not hold (a mint that failed, a
 *  burned one) still showed. A FoodToken of her land that no approved plan names is an old Polygon one: not moved to
 *  Stellar (LOAN_RULES "Existing food tokens"), so not listed. */
export function useMyShares() {
  const api = usePlanClient();
  const { provider } = useProvider();
  const { data: cfg } = useStellarConfig();
  const { landId } = useMyLand();
  const chain = useCropChain(landId);
  const plans = chain.data?.plans || [];
  return useQuery({
    queryKey: ['oracle', 'myShares', landId, plans.map((x) => x.id).join(',')],
    enabled: !!api && !!cfg && !!provider && !!landId && plans.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const [onChain, lists] = await Promise.all([
        polygonShareIds(provider, landId),
        Promise.all(plans.map((p) => api.mintList(p.id).then((r) => r.mints.map((m) => ({ ...m, p }))))),
      ]);
      const held = new Set(onChain.map((id) => BigInt(id).toString()));
      const seen = new Set();
      const withId = lists.flat().filter((m) => {
        if (!m.token_id) return false;
        const id = BigInt(m.token_id).toString();
        if (!held.has(id) || seen.has(id)) return false;     // not on Polygon (not minted, or burned), or named twice
        seen.add(id);
        return true;
      });
      // Every share's state in one batched read (22 Oct), instead of a simulation each.
      const fts = withId.length ? await readFoodTokens(cfg, cfg.union, withId.map((m) => tokenHex(m.token_id))).catch(() => ({})) : {};
      return Promise.all(withId.map(async (m) => {
        const ft = fts[tokenHex(m.token_id)] || null;
        const p = m.p;
        const zones = Object.keys(p.plan.proposal).sort();
        const share = (p.plan.shares || []).find((x) => x.key === m.share) || {};
        const drawn = !!ft && (Number(ft.loan?.flags ?? 0) & FLAG_DRAWN);
        // Its window (25 Oct): from its opening (fund_core from_date: a week before its sowing window, from the crop
        // calendar) up to its last draw date (the attested one, else the plan's).
        // A share attested before the last-date rule (25 Oct) has none on-chain: it never lapses, whatever its plan says.
        const final = ft ? Number(ft.final_date || 0) : (share.final_date ? Date.parse(`${share.final_date}T23:59:59Z`) / 1000 : 0);
        const opens = opensOf(ft, share);
        const now = Date.now() / 1000;
        const lapsed = !!ft?.lapsed;
        const late = !!ft && !drawn && !lapsed && final > 0 && now > final;
        const early = !!ft && !drawn && !lapsed && !late && now < opens;
        const ready = !!ft && !drawn && !lapsed && !late && !early;
        // Her areas by their field names (13 Nov; was "Area 3 + 4", which says nothing to her): "Nexttowell", or for
        // areas merged in a season "veryhighyield · 3 + 4"; "Area n" only for a record without names.
        const area = areaNames((m.zones || share.zones || [m.zone]).map((z) => p.plan.area_names?.[z] || `Area ${zones.indexOf(z) + 1}`));
        return { ...m, share, ft, drawn, ready, late, early, opens, lapsed, final, area, plan: p };
      }));
    },
  });
}

/** Area names joined, the field said once when they share it: ["veryhighyield · 3", "veryhighyield · 4"] →
 *  "veryhighyield · 3 + 4". */
export function areaNames(names) {
  const parts = names.map((n) => { const i = n.lastIndexOf(' · '); return i > 0 ? [n.slice(0, i), n.slice(i + 3)] : [n, null]; });
  if (parts.length > 1 && parts.every(([f, k]) => k && f === parts[0][0])) return `${parts[0][0]} · ${parts.map(([, k]) => k).join(' + ')}`;
  return names.join(' + ');
}

/** When a crop agreement opens (25 Oct): a week before the sowing window that holds its planned sowing. On-chain the
 *  crop calendar sets it at the attestation (fund_core from_date); before that, the plan's open_date. */
export function opensOf(ft, share) {
  if (ft) return Number(ft.from_date || 0);
  return share?.open_date ? Date.parse(`${share.open_date}T00:00:00Z`) / 1000 : 0;
}

export function shareTag(x) {
  if (!x.ft) return 'Not attested yet';
  // Unused past its last draw date (25 Oct): not an error, the cycle is over.
  if (x.lapsed || x.late) return 'Not used · lapsed';
  // A loan paid off closes on-chain (fund_core FLAG_CLOSED): the share then reads Repaid, not Financed (25 Oct).
  if (x.drawn) return Number(x.ft.loan?.flags ?? 0) & FLAG_CLOSED ? 'Repaid' : 'Financed';
  if (x.early) return `From ${new Date(x.opens * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  return 'Ready';   // in its window (25 Oct)
}

/** A map card on her own property (map-centred lane, 23 Oct): the header, then the body in one card. */
function Page({ title, onBack, children }) {
  return (
    <MapCard header={{ title, onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label={title} style={{ gap: 12 }}>{children}</Card>
    </MapCard>
  );
}

/** A member's Ready share (26 Oct): used at the union office with the help QR, the one office QR in every mode; the
 *  leader sets the amounts and uses it for the member in the session (L11). */
function ShareScan({ x, onBack }) {
  const name = rowOf(x)?.name || x.crop.replace(/_/g, ' ');
  if (!assisted()) return <ShareSign x={x} name={name} onBack={onBack} />;
  return <HelpQr onBack={onBack} note={`To use your ${name} crop agreement (${x.area}), go to the union office. Your leader scans this, reads you the amounts and hands you the cash.`} />;
}

/** Self mode (G9, executive decision 4 Nov): taking up a share is debt, so she sets the cash and machine work and
 *  signs fund_core.draw_loan on her own phone as a QR (NILA:L, deskCode.js); the leader's Scan a member QR reads it,
 *  hands over the cash and submits. At most what the union can lend and her share allows (capsFor). */
function ShareSign({ x, name, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const checks = useUnionChecks(s?.stellarAddress);
  const caps = capsFor(checks.data, x.ft);
  const [cash, setCash] = useState();
  const [acres, setAcres] = useState();
  const [qr, setQr] = useState();
  const [error, setError] = useState();
  const c = Math.min(cash ?? caps.cash, caps.cash);
  const maxAcres = Math.floor(caps.hours / 100);
  const a = Math.min(acres ?? maxAcres, maxAcres);
  const sign = async () => {
    setError(undefined);
    try {
      setQr(await signDeskCode({ cfg, account: s.stellarAddress, signer: s.senderAddress, signHash: s.signHash, kind: 'L',
        token: tokenHex(x.token_id), cash: BigInt(c) * NIN, hours: a * 100 }));
    } catch (e) { setError(e.message); }
  };
  if (qr) {
    return <DeskQr title={`${name} · ${x.area}`} qr={qr.qr} until={qr.until} onBack={() => setQr(undefined)}
      rows={[['You get', `${inr(c)} in cash`], ...(a ? [['Machine vouchers', `${a} tractor acres`]] : [])]} />;
  }
  return (
    <Page title={`${name} · ${x.area}`} onBack={onBack}>
      {checks.isLoading ? <p style={muted}>…</p> : (
        <>
          <p style={muted}>Cash</p>
          <Stepper value={c} set={setCash} min={0} max={caps.cash} unit="₹" label="Cash" />
          <p style={muted}>Machine work</p>
          <Stepper value={a} set={setAcres} step={1} min={0} max={maxAcres} unit="tractor acres" label="Tractor acres" />
          <p style={muted}>Your leader scans the next QR, hands you the cash and records your crop agreement. You repay it with interest after the harvest.</p>
          <Primary disabled={!s?.ready || !cfg || (c < 1 && a < 1)} onClick={sign}>Make my QR</Primary>
          {error && <p style={{ ...muted, color: C.coral }}>{error}</p>}
        </>
      )}
    </Page>
  );
}

/** Taking up a Ready share: a member scans her leader's QR (ShareScan); a leader's own share opens L11 on it, where
 *  she sets the amounts and confirms herself (23 Oct, the same screen as for a member, no QR). */
export function TakeUp({ token, leader, onBack }) {
  const shares = useMyShares();
  const first = useRef();
  const x = shares.data?.find((y) => y.token_id === token);
  if (!x) return <Page title="Your crop agreement" onBack={onBack}><p style={muted}>…</p></Page>;
  // Drawn already when the page opens (a stale link or the back button): nothing to take up; her share's own page
  // instead. Only as first read: her own draw on this page keeps its success screen.
  if (first.current === undefined) first.current = !x.ready;
  if (first.current) { window.location.hash = `#/cropshare/${x.token_id}`; return null; }
  if (leader) return <LeaderLoan initial={`${x.plan.id}_${x.token_id}`} />;
  return <ShareScan x={x} onBack={onBack} />;
}

// A green manure (4 Nov) is a crop agreement with no season row: its soil cover stands in for one (name, finance, sowing).
const coverRows = (p) => (p?.soil_cover || []).filter((c) => c.finance).map((c) => ({ zone: c.zone, zones: [c.zone], crop: c.cover,
  name: c.name.replace(/^(Mulch, then )?green manure: /i, '').replace(/^./, (a) => a.toUpperCase()), colour: c.colour, sow: c.sow,
  kg: 0, value: 0, finance: c.finance, green_manure: true }));
const rowOne = (x) => (x.plan?.plan?.seasons || []).flatMap((se) => se.rows.map((r) => ({ ...r, slot: se.slot })))
  .concat(coverRows(x.plan?.plan))
  .filter((r) => (r.zones || [r.zone]).includes(x.zone) && (r.crop === x.crop || r.name === x.crop))
  // The same crop can stand on one area in two seasons: the share's sowing date picks the season.
  .sort((a, b) => (b.sow === x.share.from_date) - (a.sow === x.share.from_date))[0];
/** Her agreement's plan row. A green manure merged over several areas (13 Nov, one agreement like a merged crop): its
 *  areas' covers added up, since the plan keeps one cover per area. */
export const rowOf = (x) => {
  const r = rowOne(x);
  const zones = x.share?.zones || [];
  if (!r?.green_manure || zones.length < 2) return r;
  const same = coverRows(x.plan?.plan).filter((c) => zones.includes(c.zone) && c.crop === r.crop && c.sow === r.sow);
  const add = (k) => same.reduce((t, c) => t + (c.finance?.[k] || 0), 0);
  return { ...r, zones, finance: { ...r.finance, cash: add('cash'), voucher_value: add('voucher_value'), interest: add('interest'), repay: add('repay') } };
};
export const SEASON = { S1: 'Oct–Feb', S2: 'Mar–May', S3: 'Jun–Aug' };
export const amount = (kg) => (kg >= 1000 ? `~${Math.round(kg / 100) / 10} t` : `~${Math.round(kg)} kg`);

/** Her Ready crop agreements as To do rows (A2, and a leader's "Your own"): each opens its take-up page. */
export function ReadyShareRows({ go, first = true }) {
  const ready = (useMyShares().data || []).filter((x) => x.ready);
  return ready.map((x, i) => (
    <ListRow key={x.token_id} first={first && i === 0} icon={RupeeIcon} tone="new" title="Use your crop agreement"
      sub={`${rowOf(x)?.name || x.crop.replace(/_/g, ' ')} · ${x.area} · at the union office`} onClick={() => go(`share/${x.token_id}`)} />
  ));
}

/** The A1 rows (board MemberAssets-ley3, "Crop agreements"): her crop's coin, crop, "Area N · season", its state, the
 *  amount to pay back and the expected harvest on the right (13 Nov; was harvest and value), a chevron. Every row opens its crop agreement: A4 once a loan is drawn on
 *  it, A4a before (src/loan/CropShare.jsx). */
export function ShareRows({ onOpen }) {
  const shares = useMyShares();
  if (!shares.data?.length) return null;
  return (
    <>
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: C.muted, paddingTop: 6 }}>Crop agreements</span>
      {shares.data.map((x) => {
        const r = rowOf(x) || {};
        const fodder = !x.share.loan_amount && (x.share.acres_work ?? x.share.hours);
        const tag = x.ready && assisted() ? 'Ready · ask your leader' : shareTag(x);
        return (
          <button key={x.token_id} type="button" onClick={() => onOpen(x.token_id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: 12, padding: '12px 16px', minHeight: 48,
            width: '100%', border: 0, color: C.text, textAlign: 'left', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
            <ShareTile colour={r.colour} soil={!!(r.green_manure || x.share?.green_manure)} />
            <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700 }}>{r.name || x.crop.replace(/_/g, ' ')}</span>
              <span style={{ color: C.muted }}>{x.area}{r.slot ? ` · ${SEASON[r.slot]}` : ''}{fodder ? ' · fodder' : ''}</span>
              <span style={{ color: x.ready ? C.accent : C.muted, fontWeight: 700 }}>{tag}</span>
            </span>
            {/* 13 Nov: what is to be paid back on this agreement (cash, vouchers and interest), the harvest under it. */}
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              {r.finance?.repay ? <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{inr(r.finance.repay)}</span> : null}
              <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{fodder ? 'Fodder' : r.kg ? amount(r.kg) : ''}</span>
            </span>
            <ChevronIcon />
          </button>
        );
      })}
    </>
  );
}
