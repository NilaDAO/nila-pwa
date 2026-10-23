// Her crop shares (A1 group "Crop shares", board MemberAssets-ley3) and taking one up: she signs
// fund_core.draw_loan herself; the leader hands over the cash at the office.
// A member takes a Ready share up at the office (23 Oct): her page is the camera; she scans the leader's L9 QR
// (L11's signed request), checks it against this share and confirms (N10). First the page shows her share QR
// (`nila:share:<plan>_<token>:<her G>`): the leader's Members scan opens L11 with this share picked; a tap on it puts
// the camera in its place (so does the button under it). A leader taking up her own share sets
// it herself (her own L11/N10 in one). Both full pages, no map card.
// DESIGN GAP: neither page has a board of its own.
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig, useStellarTitles } from '../stellar/hooks';
import { readFoodTokens, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { useCropPlan, useLandTitles, usePlanClient } from '../plan/hooks';
import { Primary, inr, muted } from '../plan/ui';
import ListRow, { ScreenHeader } from '../shell/ListRow';
import { Card } from './AssetParts';
import CameraView from '../shell/CameraView';
import ConfirmShare from './ConfirmShare';
import { th } from '../machine/hooks';
import { LeaderLoan } from './LoanScreens';
import BigQr from '../shell/BigQr';
import { NIN, readRequest } from './request';
import { C, FONT } from '../shell/tokens';
import { ChevronIcon, RupeeIcon, ShareTile } from '../shell/icons';

export const FLAG_DRAWN = 8;
export const assisted = () => { try { return localStorage.getItem('nila.mode') === 'assist'; } catch { return false; } };

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

/** Her shares: her approved plan's mint list + each token's state on Stellar. */
export function useMyShares() {
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const { landId } = useMyLand();
  const plan = useCropPlan(landId);
  const p = plan.data;
  return useQuery({
    queryKey: ['oracle', 'myShares', p?.id], enabled: !!api && !!cfg && p?.approval?.decision === 'approve',
    staleTime: 30_000,
    queryFn: async () => {
      const { mints } = await api.mintList(p.id);
      const zones = Object.keys(p.plan.proposal).sort();
      // Every share's state in one batched read (22 Oct), instead of a simulation each.
      const withId = mints.filter((m) => m.token_id);
      const fts = withId.length ? await readFoodTokens(cfg, cfg.union, withId.map((m) => tokenHex(m.token_id))).catch(() => ({})) : {};
      return Promise.all(withId.map(async (m) => {
        const ft = fts[tokenHex(m.token_id)] || null;
        const share = (p.plan.shares || []).find((x) => x.key === m.share) || {};
        const drawn = !!ft && (Number(ft.loan?.flags ?? 0) & FLAG_DRAWN);
        const ready = !!ft && !drawn && Number(ft.from_date) * 1000 <= Date.now();
        // "1" or, for areas merged in a season (same crop, 21 Oct), "1 + 2": shown as "Area {area}".
        const area = (m.zones || share.zones || [m.zone]).map((z) => zones.indexOf(z) + 1).join(' + ');
        return { ...m, share, ft, drawn, ready, area, plan: p };
      }));
    },
  });
}

export function shareTag(x) {
  if (!x.ft) return 'Not attested yet';
  if (x.drawn) return 'Financed';
  if (x.ready) return 'Ready';
  return `From ${new Date(Number(x.ft.from_date) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function Page({ title, onBack, children }) {
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ScreenHeader title={title} onBack={onBack} />
      <Card label={title} style={{ gap: 12 }}>{children}</Card>
    </div>
  );
}

/** A member's Ready share: the camera for her leader's QR (L9), then N10 from the signed values. */
function ShareScan({ x, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [req, setReq] = useState();
  const [error, setError] = useState();
  const [tries, setTries] = useState(0);
  const [camera, setCamera] = useState(false);
  const [img, setImg] = useState();
  useEffect(() => {
    if (s?.stellarAddress) QRCode.toDataURL(`nila:share:${x.plan.id}_${x.token_id}:${s.stellarAddress}`, { width: 720, margin: 2 }).then(setImg);
  }, [s, x]);
  // The screen stays on while her QR shows (Screen Wake Lock); a web app cannot raise the brightness.
  useEffect(() => {
    if (camera || !navigator.wakeLock) return undefined;
    let lock;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [camera]);
  const read = useMemo(() => async (text) => {
    setError(undefined);
    try {
      // The QR holds the amounts only; the share is this one, the member is she (23 Oct).
      setReq({ ...readRequest(text), union: cfg.union, member: s?.stellarAddress, token: tokenHex(x.token_id) });
    } catch (e) { setError(e.message); setTries((t) => t + 1); }
  }, [cfg, s, x.token_id]);
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  const name = rowOf(x)?.name || x.crop.replace(/_/g, ' ');
  if (req) {
    const cash = Number(BigInt(req.cash) / NIN);
    const confirm = () => tx.run({
      label: `Crop share ${name}`, rows: [['Cash', inr(cash)], ...(req.hours ? [['Machine vouchers', `${th(req.hours)} tractor hours`]] : []), ['For', `${name} · Area ${x.area}`]],
      contractName: 'fund_core', fn: 'draw_loan',
      args: [sv.address(req.union), sv.address(req.member), sv.bytes32(req.token), sv.i128(req.cash), sv.u32(req.hours)],
      invalidate: [['oracle', 'myShares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
    });
    return <ConfirmShare cash={cash} hours={req.hours} name={name} area={x.area} ready={tx.ready} onConfirm={confirm} onCancel={() => setReq(undefined)} />;
  }
  return (
    <Page title={`${name} · Area ${x.area}`} onBack={onBack}>
      {camera ? <CameraView key={tries} mode="qr" onText={read} /> : (
        <BigQr img={img} alt="Your crop share QR" caption="Let your leader scan this" onClick={() => setCamera(true)} />
      )}
      {camera && <p style={{ ...muted, textAlign: 'center' }}>Scan the QR on your leader's phone.</p>}
      {!camera && <Primary onClick={() => setCamera(true)}>Scan your union's QR</Primary>}
      {error && <p style={{ color: C.coral, textAlign: 'center' }}>{error}</p>}
    </Page>
  );
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
    <ListRow key={x.token_id} first={first && i === 0} icon={RupeeIcon} tone="new" title="Get your crop share"
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
        const fodder = !x.share.loan_amount && x.share.hours;
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
