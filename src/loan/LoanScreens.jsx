// L11 crop share request + L9 QR (leader) and A1b scan + N10 confirm (member). Boards LeaderRedeem,
// LeaderRequestQR, MemberWalletQR-o19l-1f7c, ConfirmLoan. Decisions 16 Oct: cash (seed included) and
// machine hours only; her tokens from her approved plan's mint list, read with fund_core.food_token.
// DESIGN GAPs: no member names on the node ("Land N", "Your union leader"); the union checks on L11 (cash
// on hand, stock, union limit) are not shown yet; "Type the code" is a text box for the whole code.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import CameraView from '../shell/CameraView';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readFoodTokens, sv, tokenHex } from '../stellar/soroban';
import { SkeletonRows } from '../shell/Skeleton';
import BigQr from '../shell/BigQr';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import { C, FONT, R } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import AreaMap from '../plan/AreaMap';
import { useUnionMembers } from '../leader/unionMembers';
import { Card, CardTitle, KV } from './AssetParts';
import { NIN, isLoanRequest, makeRequest } from './request';
import { capsFor, checkRows, repayAbout, useUnionChecks } from './unionChecks';
import PostBring from '../anchor/PostBring';
import { TRACTOR, hoursFor, th, typeName, unitsOf, useMachines, useRates } from '../machine/hooks';
import ConfirmShare from './ConfirmShare';
import { opensOf } from './MyShares';

const FLAG_DRAWN = 8;
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function Stepper({ label, value, set, step, min = 0, max, fmt }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700, flexShrink: 0 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flexGrow: 1, color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{label}</span>
      <button type="button" aria-label={`Less ${label}`} style={b} onClick={() => set(Math.max(min, +(value - step).toFixed(2)))}>−</button>
      <span style={{ width: 104, height: 44, borderRadius: R.button, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700 }}>{fmt(value)}</span>
      <button type="button" aria-label={`More ${label}`} style={b} onClick={() => set(Math.min(max, +(value + step).toFixed(2)))}>+</button>
    </div>
  );
}

/** The repay for a share: the plan row of that zone and crop whose sow is the share's from_date. */
function planRow(plan, share) {
  for (const s of plan.plan.seasons || []) for (const r of s.rows) if (r.zone === share.zone && r.crop === share.crop && r.sow === share.from_date) return r;
  return null;
}

/** initial: `<plan id>` (a To do row) or `<plan id>_<token id>` (her crop share QR, decimal; her G2 row, hex): opens on
 *  that plan and share. No member picker (23 Oct): a leader comes here from her QR, a To do row or her G2 only. */
export function LeaderLoan({ initial }) {
  const [initPlan, initToken] = String(initial || '').split('_');
  const s = useNilaSigner();
  const api = usePlanClient();
  // Her property behind L11 / L9 (map-centred lane, 23 Oct): from the union list (records kept on the leader's phone).
  const unionList = useUnionMembers(api);
  const { data: cfg } = useStellarConfig();
  // The plan by its id (25 Oct): the approved-plans list holds the newest 200 only, so a union of 1,000 members
  // would show "not approved" for most of them.
  const planId = initPlan || undefined;
  const plans = useQuery({ queryKey: ['plan', 'byId', planId], enabled: !!api && !!planId, queryFn: () => api.plan(planId) });
  const plan = plans.data?.approval?.decision === 'approve' ? plans.data : undefined;
  const holder = unionList.data?.find((m) => m.lands.includes(Number(plan?.land_id)));
  const memberMap = holder?.record ? <AreaMap record={holder.record} /> : <span />;
  const shares = useQuery({
    queryKey: ['oracle', 'shares', planId], enabled: !!plan && !!cfg,
    queryFn: async () => {
      const { mints } = await api.mintList(planId);
      // Every share's state in one batched read (as useMyShares), not a simulation each.
      const withId = mints.filter((m) => m.token_id);
      const fts = withId.length ? await readFoodTokens(cfg, cfg.union, withId.map((m) => tokenHex(m.token_id))).catch(() => ({})) : {};
      return withId.map((m) => ({ ...m, share: (plan.plan.shares || []).find((x) => x.key === m.share) || {}, ft: fts[tokenHex(m.token_id)] || null }));
    },
  });
  const [pick, setPick] = useState();
  const pickFt = shares.data?.find((x) => x.token_id === pick)?.ft;
  const checks = useUnionChecks(pickFt?.member);
  const [cash, setCash] = useState(0);
  // Machine hours per machine type (23 Oct): { type: whole hours }, a row for every type the union registered and
  // confirmed (0 unless the plan sets it) and every type of her plan. The voucher is their value in tractor hours,
  // held in units (centi tractor hours): Σ hours × the type's rate ÷ the tractor's rate, rounded up.
  const [mach, setMach] = useState({});
  const rates = useRates();
  const machines = useMachines();
  const rateOf = (t) => rates.data?.find((r) => r.type === Number(t))?.total || 0;
  const tractorRate = rateOf(TRACTOR);
  const unionTypes = [...new Set((machines.data || []).filter((m) => m.confirmed).map((m) => m.machine_type))];
  const types = [...new Set([...Object.keys(mach).map(Number), ...unionTypes])].filter((t) => t > 0).sort((a, b) => a - b);
  const value = Object.entries(mach).reduce((a, [t, h]) => a + h * rateOf(t), 0);
  const hours = tractorRate > 0 ? unitsOf(1, value, tractorRate) : 0;   // units
  // The share is picked before this screen (23 Oct, no list here): the one from her QR or G2, else (a To do row, one
  // per plan) her first Ready share; with the plan's cash and hours.
  useEffect(() => {
    const t = Date.now() / 1000;
    const isReady = (y) => !!y.ft && !(Number(y.ft.loan?.flags ?? 0) & FLAG_DRAWN) && opensOf(y.ft) <= t;
    const x = !pick && (initToken
      ? shares.data?.find((y) => y.token_id === initToken || tokenHex(y.token_id) === initToken)
      : shares.data?.find(isReady));
    if (!x) return;
    setPick(x.token_id); setCash(Math.round(x.share.loan_amount || 0));
    const ms = Object.values(planRow(plan, x.share)?.finance?.machines || {}).filter((m) => m.type && m.hours > 0);
    setMach(Object.fromEntries(ms.map((m) => [m.type, Math.ceil(m.hours)])));
  }, [shares.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // The plan's amounts, within the union's caps once they are read (the steppers start inside the limit).
  useEffect(() => {
    if (!checks.data || !pickFt) return;
    const c = capsFor(checks.data, pickFt);
    setCash((v) => Math.min(v, c.cash));
    // Over the union's machine stock (units): the last types give way first.
    if (!(tractorRate > 0)) return;
    setMach((m) => {
      let left = c.hours;
      return Object.fromEntries(Object.entries(m).map(([t, h]) => {
        const k = Math.min(h, Math.floor(hoursFor(left, rateOf(t), tractorRate))); left -= unitsOf(k, rateOf(t), tractorRate); return [t, k];
      }));
    });
  }, [checks.data, pickFt, tractorRate]); // eslint-disable-line react-hooks/exhaustive-deps
  const [req, setReq] = useState();
  const [own, setOwn] = useState(false);
  const tx = useSorobanTx();
  const [img, setImg] = useState();
  const [error, setError] = useState();
  // The request is a few characters (23 Oct): a small, coarse QR any phone camera reads.
  useEffect(() => { if (req) QRCode.toDataURL(req.qr, { width: 720, margin: 2, errorCorrectionLevel: 'M' }).then(setImg); }, [req]);

  // L9 (board LeaderRequestQR): the request QR as big as the screen allows; no 6 numbers (no typed fallback, 22 Oct).
  if (req) {
    const r = req.request;
    const mv = value;
    return (
      <MapCard map={memberMap} header={{ title: 'Crop share request', onBack: () => setReq(undefined) }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card label="Crop share request" style={{ gap: 12 }}>
          <BigQr img={img} alt="Crop share request QR" caption="Let the member scan this with their phone" below={340} />
          <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>
            {r.crop} · {inr(Number(BigInt(r.cash) / NIN))} cash{r.hours ? ` + ${inr(mv)} vouchers (${th(r.hours)} tractor h)` : ''}</span>
          <KV k="Valid for" v="48 hours" />
        </Card>
      </MapCard>
    );
  }
  // The page shows at once (header and card); the card fills as the plan, her share and the union are read.
  if (!plan) {
    return (
      <MapCard map={<span />} header={{ title: 'Crop share request', onBack: () => window.history.back() }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card label="Crop share request">
          {plans.isLoading || !plans.data ? <SkeletonRows rows={6} /> : <span style={muted}>This crop plan is not approved. Find the member in Members.</span>}
        </Card>
      </MapCard>
    );
  }
  const sel = shares.data?.find((x) => x.token_id === pick);
  const row = sel && planRow(plan, sel.share);
  // The rate fund_core charges (uc.rate_bp). The plan's tree discount (LOAN_RULES §5) is not applied by the
  // contract yet, so it is not promised here (contract gap, P5-Loan.md).
  const rateBp = checks.data?.rateBp;
  const caps = capsFor(checks.data, sel?.ft);
  // After its last draw date (25 Oct), or lapsed: too late for this cycle, no draw (fund_core TooLate).
  const final = Number(sel?.ft?.final_date || 0);
  const opens = opensOf(sel?.ft);
  const tooLate = !!sel?.ft && (sel.ft.lapsed || (final > 0 && Date.now() / 1000 > final));
  // Its window opens a week before its sowing window (25 Oct; fund_core NotOpenYet before it).
  const tooEarly = !!sel?.ft && !tooLate && Date.now() / 1000 < opens;
  const blocked = [...(tooLate ? ['Too late for this cycle: the last day to use this crop share has passed.'] : []),
    ...(tooEarly ? [`Not open yet: this crop share can be used from ${new Date(opens * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`] : []),
    ...(checks.data?.blocked || [])];
  const repay = row && rateBp != null ? repayAbout(cash, rateBp, new Date(), row.finance.due) : null;
  const go = async () => {
    setError(undefined);
    try {
      const area = Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1;
      setReq(makeRequest({
        union: cfg.union, member: sel.ft.member, token: tokenHex(sel.token_id), cash: String(BigInt(Math.round(cash)) * NIN / 1n),
        hours: Math.round(hours), crop: row?.name || sel.share.crop, area: `Area ${area}`,
        repay: repay != null ? String(repay) : '',
        due: row?.finance?.due || '',
      }));
    } catch (e) { setError(e.message); }
  };
  // Her own share (a leader is a member too, 23 Oct): no QR; she confirms (N10) and signs draw_loan herself.
  const mine = !!sel && sel.ft?.member === s?.stellarAddress;
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); window.location.hash = '#/assets'; }} onRetry={() => tx.retry()} />;
  if (own && sel) {
    const nm = `${row?.name || sel.crop}`;
    const ar = Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1;
    const draw = () => tx.run({
      label: `Crop share ${nm}`, rows: [['Cash', inr(cash)], ...(hours ? [['Machine vouchers', `${th(hours)} tractor hours`]] : []), ['For', `${nm} · Area ${ar}`]],
      contractName: 'fund_core', fn: 'draw_loan',
      args: [sv.address(cfg.union), sv.address(s.stellarAddress), sv.bytes32(tokenHex(sel.token_id)), sv.i128(BigInt(Math.round(cash)) * NIN), sv.u32(hours)],
      invalidate: [['oracle', 'myShares'], ['oracle', 'shares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
    });
    return <ConfirmShare own cash={cash} hours={hours} name={nm} area={ar} ready={tx.ready} onConfirm={draw} onCancel={() => setOwn(false)} map={memberMap} />;
  }
  // Board LeaderRedeem, without its crop share list (23 Oct: the share comes picked): one card with the share, the
  // steppers, total / interest / repay and the union checks. No seed row: seed is paid as cash (P5).
  const name = sel ? `${row?.name || sel.crop} · Area ${Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1}` : '';
  // Cash is lent from member money only (junior, above its reserve); the plan's cash above that is shown, not lent.
  const notCovered = sel && checks.data ? Math.max(0, Math.round(sel.share.loan_amount || 0) - caps.cash) : 0;
  const rows = checkRows(checks.data, cash, hours, caps);
  const line = { height: 1, background: C.raised };
  return (
    <MapCard map={memberMap} header={{ title: `Land ${plan.land_id}`, onBack: () => window.history.back() }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label="Crop share request">
        {(shares.isLoading || (sel && !checks.data && !checks.isError)) && <SkeletonRows rows={6} />}
        {shares.data && !sel && <span style={muted}>None of their crop shares is ready.</span>}
        {sel && (checks.data || checks.isError) && (
          <>
            <CardTitle right={<span style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>Ready</span>}>{name}</CardTitle>
            {checks.isError && <span style={{ color: C.coral }}>Could not read the union. Try again.</span>}
            {checks.data && <Stepper label="Cash" value={cash} set={setCash} step={100} max={caps.cash} fmt={inr} />}
            {/* Cash above member money: only a sold batch's prepayment could fund it. DESIGN GAP: no on-chain record of
                sold-batch prepayments on Stellar yet, so the chip is ₹0. */}
            {notCovered > 0 && (
              <>
                <span style={{ alignSelf: 'flex-start', minHeight: 32, borderRadius: 12, background: C.raised, color: C.muted, padding: '0 12px',
                  display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700 }}>Sold batches · ₹0 prepaid</span>
                <span style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>Cash above member money ({inr(notCovered)} more in the plan) can only be funded by selling a batch (a buyer's prepayment).</span>
              </>
            )}
            {checks.data && types.map((t) => {
              const h = mach[t] || 0;
              const room = tractorRate > 0 ? Math.floor(hoursFor(Math.max(0, caps.hours - hours), rateOf(t), tractorRate)) : 0;
              return (
                <Stepper key={t} label={`${typeName(t)}${rateOf(t) ? ` · ${inr(rateOf(t))}/h` : ''}`} value={h}
                  set={(v) => setMach((m) => ({ ...m, [t]: v }))} step={1} max={h + room} fmt={(v) => `${v} h`} />
              );
            })}
            {hours > 0 && <KV k="Vouchers" v={`≈ ${th(hours)} tractor hours`} />}
            <div style={line} />
            <KV k="Total" v={inr(cash + value)} />
            {rateBp != null && <KV k="Interest" v={`${rateBp / 100}% a year`} />}
            {repay != null && <KV k="Repay" v={`${inr(repay)} · about end of ${monthYear(row.finance.due)}`} />}
            <div style={line} />
            {rows.map(([k, v, bad]) => <KV key={k} k={k} v={v} color={bad ? C.coral : C.text} />)}
            {blocked.map((b) => <span key={b} style={{ color: C.coral, fontSize: 14 }}>{b}</span>)}
            {/* L11 #short: the gap goes to the union's LPs as a Bring (P9). */}
            {rows[0]?.[2] && (cfg?.anchor_url
              ? <PostBring gap={Math.ceil(cash - checks.data.onHand)} />
              : <span style={{ ...muted, color: C.coral }}>Not enough cash at the office for this crop share yet.</span>)}
            {error && <span style={{ color: C.coral }}>{error}</span>}
            <Primary disabled={!checks.data || blocked.length > 0 || (!cash && !hours) || cash > caps.cash || hours > caps.hours} onClick={mine ? () => setOwn(true) : go}>{mine ? 'Get cash and vouchers' : 'Show QR to the member'}</Primary>
          </>
        )}
      </Card>
    </MapCard>
  );
}

/** A1b (Scan): a QR from her leader. A crop share request is scanned on her Ready share (23 Oct); her withdrawals
 *  are her own QR that the leader scans (24 Oct). So this only says where to go. */
export function MemberScan() {
  const [error, setError] = useState();
  const read = (text) => setError(isLoanRequest(text.trim())
    ? 'Open your Ready crop share in Assets, then scan this.'
    : 'This QR is not for this screen. To collect cash, open Union investment or nIN and tap Collect.');
  return (
    <Sheet landName="Nila" title="Scan">
      <CameraView mode="qr" onText={read} />
      <p style={{ ...muted, textAlign: 'center' }}>Scan the QR on your leader's phone.</p>
      {error && <p style={{ color: C.coral, textAlign: 'center' }}>{error}</p>}
    </Sheet>
  );
}
