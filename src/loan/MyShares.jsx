// Her crop shares (A1 group "Crop shares", board MemberAssets-ley3) and taking one up: she signs
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
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig, useStellarTitles } from '../stellar/hooks';
import { readFoodTokens, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { useCropChain, useLandTitles, usePlanClient } from '../plan/hooks';
import { Primary, inr, muted } from '../plan/ui';
import ListRow from '../shell/ListRow';
import { Card, QrCircle } from './AssetParts';
import { ta } from '../machine/hooks';
import { LeaderLoan } from './LoanScreens';
import HelpQr from './HelpQr';
import { C, FONT } from '../shell/tokens';
import { ChevronIcon, RupeeIcon, ShareTile } from '../shell/icons';
import MapCard from '../shell/MapCard';

export const FLAG_DRAWN = 8;
const FLAG_CLOSED = 4;
// Assist mode (executive decision 26 Oct): every member starts in it; the identity check (K1) or the Settings toggle
// switches to self mode ('nila.mode' = 'self').
export const assisted = () => { try { return localStorage.getItem('nila.mode') !== 'self'; } catch { return true; } };

/** Her land as the crop plan finds it (CP1): a Polygon title, else her title on Stellar — the demo's titles and every
 *  new member's are on Stellar only, so a Polygon-only lookup found no plan and A1 showed no crop shares (21 Oct). */
export function useMyLand() {
  const s = useNilaSigner();
  const titles = useLandTitles(s?.evmAddress);
  const stellarTitles = useStellarTitles(s);
  const onPolygon = !!titles.data?.length;
  const stellarTitle = onPolygon ? undefined : stellarTitles.data?.[0];
  return { landId: onPolygon ? titles.data[0] : stellarTitle?.title_id, onPolygon, stellarTitle, evm: s?.evmAddress };
}

/** Her shares: the mint lists of her approved plans (the plan and its extensions, 25 Oct) + each token's state on
 *  Stellar. */
export function useMyShares() {
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const { landId } = useMyLand();
  const chain = useCropChain(landId);
  const plans = chain.data?.plans || [];
  return useQuery({
    queryKey: ['oracle', 'myShares', plans.map((x) => x.id).join(',')], enabled: !!api && !!cfg && plans.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const lists = await Promise.all(plans.map((p) => api.mintList(p.id).then((r) => r.mints.map((m) => ({ ...m, p })))));
      const mints = lists.flat();
      // Every share's state in one batched read (22 Oct), instead of a simulation each.
      const withId = mints.filter((m) => m.token_id);
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
        // "1" or, for areas merged in a season (same crop, 21 Oct), "1 + 2": shown as "Area {area}".
        const area = (m.zones || share.zones || [m.zone]).map((z) => zones.indexOf(z) + 1).join(' + ');
        return { ...m, share, ft, drawn, ready, late, early, opens, lapsed, final, area, plan: p };
      }));
    },
  });
}

/** When a crop share opens (25 Oct): a week before the sowing window that holds its planned sowing. On-chain the
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
  return <HelpQr onBack={onBack} note={`To use your ${name} crop share (Area ${x.area}), go to the union office. Your leader scans this, reads you the amounts and hands you the cash.`} />;
}

/** Taking up a Ready share: a member scans her leader's QR (ShareScan); a leader's own share opens L11 on it, where
 *  she sets the amounts and confirms herself (23 Oct, the same screen as for a member, no QR). */
export function TakeUp({ token, leader, onBack }) {
  const shares = useMyShares();
  const first = useRef();
  const x = shares.data?.find((y) => y.token_id === token);
  if (!x) return <Page title="Your crop share" onBack={onBack}><p style={muted}>…</p></Page>;
  // Drawn already when the page opens (a stale link or the back button): nothing to take up; her share's own page
  // instead. Only as first read: her own draw on this page keeps its success screen.
  if (first.current === undefined) first.current = !x.ready;
  if (first.current) { window.location.hash = `#/cropshare/${x.token_id}`; return null; }
  if (leader) return <LeaderLoan initial={`${x.plan.id}_${x.token_id}`} />;
  return <ShareScan x={x} onBack={onBack} />;
}

export const rowOf = (x) => (x.plan?.plan?.seasons || []).flatMap((se) => se.rows.map((r) => ({ ...r, slot: se.slot })))
  .filter((r) => (r.zones || [r.zone]).includes(x.zone) && (r.crop === x.crop || r.name === x.crop))
  // The same crop can stand on one area in two seasons: the share's sowing date picks the season.
  .sort((a, b) => (b.sow === x.share.from_date) - (a.sow === x.share.from_date))[0];
export const SEASON = { S1: 'Oct–Feb', S2: 'Mar–May', S3: 'Jun–Aug' };
export const amount = (kg) => (kg >= 1000 ? `~${Math.round(kg / 100) / 10} t` : `~${Math.round(kg)} kg`);

/** Her Ready crop shares as To do rows (A2, and a leader's "Your own"): each opens its take-up page. */
export function ReadyShareRows({ go, first = true }) {
  const ready = (useMyShares().data || []).filter((x) => x.ready);
  return ready.map((x, i) => (
    <ListRow key={x.token_id} first={first && i === 0} icon={RupeeIcon} tone="new" title="Use your crop share"
      sub={`${rowOf(x)?.name || x.crop.replace(/_/g, ' ')} · Area ${x.area} · at the union office`} onClick={() => go(`share/${x.token_id}`)} />
  ));
}

/** The A1 rows (board MemberAssets-ley3, "Crop shares"): her crop's coin, crop, "Area N · season", its state, the
 *  expected harvest and its value on the right, a chevron. Every row opens its crop share: A4 once a loan is drawn on
 *  it, A4a before (src/loan/CropShare.jsx). */
export function ShareRows({ onOpen }) {
  const shares = useMyShares();
  if (!shares.data?.length) return null;
  return (
    <>
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: C.muted, paddingTop: 6 }}>Crop shares</span>
      {shares.data.map((x) => {
        const r = rowOf(x) || {};
        const fodder = !x.share.loan_amount && (x.share.acres_work ?? x.share.hours);
        const tag = x.ready && assisted() ? 'Ready · ask your leader' : shareTag(x);
        return (
          <button key={x.token_id} type="button" onClick={() => onOpen(x.token_id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: 12, padding: '12px 16px', minHeight: 48,
            width: '100%', border: 0, color: C.text, textAlign: 'left', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
            <ShareTile colour={r.colour} />
            <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700 }}>{r.name || x.crop.replace(/_/g, ' ')}</span>
              <span style={{ color: C.muted }}>Area {x.area}{r.slot ? ` · ${SEASON[r.slot]}` : ''}{fodder ? ' · fodder' : ''}</span>
              <span style={{ color: x.ready ? C.accent : C.muted, fontWeight: 700 }}>{tag}</span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              {r.kg ? <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{amount(r.kg)}</span> : null}
              <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{fodder ? 'Fodder' : r.value ? `~${inr(r.value)}` : ''}</span>
            </span>
            <ChevronIcon />
          </button>
        );
      })}
    </>
  );
}
