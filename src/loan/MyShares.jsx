// Her crop shares (A1 group "Crop shares", board MemberAssets-ley3) and taking one up: she signs
// fund_core.draw_loan herself; the leader hands over the cash at the office.
// A member takes a Ready share up at the office (23 Oct): her page is the camera; she scans the leader's L9 QR
// (L11's signed request), checks it against this share and confirms (N10). First the page shows her share QR
// (`nila:share:<plan>_<token>:<her G>`): the leader's Members scan opens L11 with this share picked; a tap on it puts
// the camera in its place (so does the button under it). A leader taking up her own share sets
// it herself (her own L11/N10 in one). Both full pages, no map card.
// DESIGN GAP: neither page has a board of its own.
import { useEffect, useMemo, useState } from 'react';
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
import { NIN, checkRequest } from './request';
import { C, FONT, R } from '../shell/tokens';
import { capsFor, checkRows, useUnionChecks } from './unionChecks';
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

function Stepper({ label, value, set, step, max, fmt }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" aria-label={`Less ${label}`} style={b} onClick={() => set(Math.max(0, value - step))}>−</button>
        <span style={{ minWidth: 72, textAlign: 'center', fontWeight: 700 }}>{fmt(value)}</span>
        <button type="button" aria-label={`More ${label}`} style={b} onClick={() => set(Math.min(max, value + step))}>+</button>
      </span>
    </div>
  );
}

function Page({ title, onBack, children }) {
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ScreenHeader title={title} onBack={onBack} />
      <Card label={title} style={{ gap: 12 }}>{children}</Card>
    </div>
  );
}
const second = { width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, marginTop: 8 };

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
      const r = await checkRequest(text.trim(), { cfg, me: s?.stellarAddress });
      if (r.token !== tokenHex(x.token_id)) throw new Error('This code is for another crop share.');
      setReq(r);
    } catch (e) { setError(e.message); setTries((t) => t + 1); }
  }, [cfg, s, x.token_id]);
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  const name = rowOf(x)?.name || x.crop.replace(/_/g, ' ');
  if (req) {
    const cash = Number(BigInt(req.cash) / NIN);
    const confirm = () => tx.run({
      label: `Crop share ${name}`, rows: [['You get', inr(cash)], ['For', `${name} · Area ${x.area}`]],
      contractName: 'fund_core', fn: 'draw_loan',
      args: [sv.address(req.union), sv.address(req.member), sv.bytes32(req.token), sv.i128(req.cash), sv.u32(req.hours)],
      invalidate: [['oracle', 'myShares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
    });
    return (
      <Page title="Confirm your crop share" onBack={() => setReq(undefined)}>
        <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>You get {inr(cash)}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Made of {inr(cash)} cash{req.hours ? ` + ${req.hours} machine hours` : ''}</p>
        <p style={{ textAlign: 'center' }}>For {name} · Area {x.area}</p>
        {req.repay && <p style={{ ...muted, textAlign: 'center' }}>Repay {inr(Number(req.repay))} · 3 weeks after harvest</p>}
        <p style={{ color: C.gold, textAlign: 'center' }}>Only confirm when your leader is with you.</p>
        <Primary disabled={!tx.ready} onClick={confirm}>Confirm</Primary>
        <button type="button" onClick={() => setReq(undefined)} style={second}>Cancel</button>
      </Page>
    );
  }
  return (
    <Page title={`${name} · Area ${x.area}`} onBack={onBack}>
      {camera ? <CameraView key={tries} mode="qr" onText={read} /> : (
        // As big as the screen allows (23 Oct): the QR spans the screen's width (its own white margin is the quiet
        // zone), inscribed in a white circle that runs off the screen's sides (clipped there).
        <div style={{ width: '100vw', marginLeft: 'calc(50% - 50vw)', height: 'calc(100vw * 1.2)', overflow: 'hidden', position: 'relative' }}>
          <button type="button" aria-label="Scan your leader's QR" onClick={() => setCamera(true)} style={{ position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)', width: 'calc(100vw * 1.42)', aspectRatio: '1 / 1', padding: 0, border: 0, borderRadius: R.round,
            background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {img && <img src={img} alt="Your crop share QR" style={{ display: 'block', width: '100vw', aspectRatio: '1' }} />}
          </button>
        </div>
      )}
      <p style={{ ...muted, textAlign: 'center' }}>{camera ? "Scan the QR on your leader's phone." : 'Let your leader scan this at the union office.'}</p>
      {!camera && <Primary onClick={() => setCamera(true)}>Scan your union's QR</Primary>}
      {error && <p style={{ color: C.coral, textAlign: 'center' }}>{error}</p>}
    </Page>
  );
}

export function TakeUp({ token, leader, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const shares = useMyShares();
  const checks = useUnionChecks(s?.stellarAddress);
  const tx = useSorobanTx();
  const x = shares.data?.find((y) => y.token_id === token);
  const [cash, setCash] = useState();
  const [hours, setHours] = useState();
  const [sure, setSure] = useState(false);
  if (!x) return <Page title="Your crop share" onBack={onBack}><p style={muted}>…</p></Page>;
  if (!leader) return <ShareScan x={x} onBack={onBack} />;
  const caps = capsFor(checks.data, x.ft);
  const blocked = checks.data?.blocked || [];
  const c = cash ?? Math.min(caps.cash, Math.round(x.share.loan_amount || 0));
  const h = hours ?? Math.min(caps.hours, Math.round(x.share.hours || 0));
  const rows = checkRows(checks.data, c, h, caps);
  const over = c > caps.cash || h > caps.hours;
  const draw = () => tx.run({
    label: `Crop share ${x.crop}`, rows: [['You get', inr(c)], ['For', `${x.crop} · Area ${x.area}`]],
    contractName: 'fund_core', fn: 'draw_loan',
    args: [sv.address(cfg.union), sv.address(s.stellarAddress), sv.bytes32(tokenHex(x.token_id)), sv.i128(BigInt(Math.round(c)) * 10_000_000n), sv.u32(h)],
    invalidate: [['oracle', 'myShares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
  });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  if (sure) {
    return (
      <Page title="Confirm your crop share" onBack={() => setSure(false)}>
        <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>You get {inr(c)}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Made of {inr(c)} cash{h ? ` + ${h} machine hours` : ''}</p>
        <p style={{ textAlign: 'center' }}>For {x.crop} · Area {x.area}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Repay 3 weeks after harvest</p>
        <p style={{ color: C.gold, textAlign: 'center' }}>Get the cash from your leader at the union office.</p>
        <Primary disabled={!tx.ready} onClick={draw}>Confirm</Primary>
      </Page>
    );
  }
  return (
    <Page title={`${rowOf(x)?.name || x.crop.replace(/_/g, ' ')} · Area ${x.area}`} onBack={onBack}>
      {/* The steppers only once the union's caps are read: before that the cap is 0 and the default would jump. */}
      {checks.data && <Stepper label="Cash" value={c} set={setCash} step={100} max={caps.cash} fmt={inr} />}
      {checks.data && <Stepper label="Machine hours" value={h} set={setHours} step={1} max={caps.hours} fmt={(v) => `${v} h`} />}
      {checks.isLoading && <p style={muted}>Checking the union…</p>}
      {checks.isError && <p style={{ color: C.coral }}>Could not read the union. Try again.</p>}
      {blocked.map((b) => <p key={b} style={{ color: C.coral }}>{b.replace(/^She needs/, 'You need').replace(/^She has/, 'You have')}</p>)}
      {rows.map(([k, v, bad]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '4px 0' }}>
          <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, color: bad ? C.coral : C.text }}>{v}</span>
        </div>
      ))}
      {rows[0]?.[2] && <p style={{ ...muted, color: C.coral }}>Not enough cash at the office for this yet. Ask your leader.</p>}
      <Primary disabled={!checks.data || blocked.length > 0 || (!c && !h) || over} onClick={() => setSure(true)}>Get cash and vouchers</Primary>
    </Page>
  );
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
