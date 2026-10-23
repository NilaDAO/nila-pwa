// L11 crop share request + L9 QR (leader) and A1b scan + N10 confirm (member). Boards LeaderRedeem,
// LeaderRequestQR, MemberWalletQR-o19l-1f7c, ConfirmLoan. Decisions 16 Oct: cash (seed included) and
// machine hours only; her tokens from her approved plan's mint list, read with fund_core.food_token.
// DESIGN GAPs: no member names on the node ("Land N", "Your union leader"); the union checks on L11 (cash
// on hand, stock, union limit) are not shown yet; "Type the code" is a text box for the whole code.
import { useEffect, useMemo, useState } from 'react';
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
import { ScreenHeader } from '../shell/ListRow';
import { Card, CardTitle, KV } from './AssetParts';
import { NIN, checkRequest, makeRequest } from './request';
import { checkDeskRequest, isDeskRequest } from './desk';
import { capsFor, checkRows, repayAbout, useUnionChecks } from './unionChecks';
import PostBring from '../anchor/PostBring';
import { typeName, useRates } from '../machine/hooks';

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
  const { data: cfg } = useStellarConfig();
  const plans = useQuery({ queryKey: ['oracle', 'approvedPlans'], enabled: !!api, queryFn: () => api.approvedPlans() });
  const planId = initPlan || undefined;
  const plan = plans.data?.plans?.find((p) => p.id === planId);
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
  // Machine hours per machine type, as the plan sets them (23 Oct): { type: whole hours }. The voucher is their sum;
  // the contract holds hours only, priced at the rate of the machine that does the job.
  const [mach, setMach] = useState({});
  const hours = Object.values(mach).reduce((a, b) => a + b, 0);
  const rates = useRates();
  // The share is picked before this screen (23 Oct, no list here): the one from her QR or G2, else (a To do row, one
  // per plan) her first Ready share; with the plan's cash and hours.
  useEffect(() => {
    const t = Date.now() / 1000;
    const isReady = (y) => !!y.ft && !(Number(y.ft.loan?.flags ?? 0) & FLAG_DRAWN) && Number(y.ft.from_date) <= t;
    const x = !pick && (initToken
      ? shares.data?.find((y) => y.token_id === initToken || tokenHex(y.token_id) === initToken)
      : shares.data?.find(isReady));
    if (!x) return;
    setPick(x.token_id); setCash(Math.round(x.share.loan_amount || 0));
    const ms = Object.values(planRow(plan, x.share)?.finance?.machines || {}).filter((m) => m.type && m.hours > 0);
    setMach(ms.length ? Object.fromEntries(ms.map((m) => [m.type, Math.ceil(m.hours)])) : x.share.hours > 0 ? { 0: Math.ceil(x.share.hours) } : {});
  }, [shares.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // The plan's amounts, within the union's caps once they are read (the steppers start inside the limit).
  useEffect(() => {
    if (!checks.data || !pickFt) return;
    const c = capsFor(checks.data, pickFt);
    setCash((v) => Math.min(v, c.cash));
    // Over the union's machine stock: the last types give way first.
    setMach((m) => {
      let left = c.hours;
      return Object.fromEntries(Object.entries(m).map(([t, h]) => { const k = Math.min(h, left); left -= k; return [t, k]; }));
    });
  }, [checks.data, pickFt]);
  const [req, setReq] = useState();
  const [img, setImg] = useState();
  const [error, setError] = useState();
  // Low error correction and a large image: a phone camera reads it at arm's length (the request is long).
  useEffect(() => { if (req) QRCode.toDataURL(req.qr, { width: 720, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [req]);

  // L9 (board LeaderRequestQR): the request QR as big as the screen allows; no 6 numbers (no typed fallback, 22 Oct).
  if (req) {
    const r = req.request;
    const mv = Object.entries(mach).reduce((t, [k, h]) => t + h * (rates.data?.find((x) => x.type === Number(k))?.total || 0), 0);
    return (
      <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <ScreenHeader title="Crop share request" onBack={() => setReq(undefined)} />
        <Card label="Crop share request" style={{ gap: 12 }}>
          <BigQr img={img} alt="Crop share request QR" caption="Let her scan this with her phone" below={340} />
          <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>
            {r.crop} · {inr(Number(BigInt(r.cash) / NIN))} cash{r.hours ? ` + ${mv ? inr(mv) : `${r.hours} h`} vouchers` : ''}</span>
          <KV k="For" v={`Land ${plan.land_id} · ${r.area}`} />
          <KV k="Valid for" v="48 hours" />
        </Card>
      </div>
    );
  }
  // The page shows at once (header and card); the card fills as the plan, her share and the union are read.
  if (!plan) {
    return (
      <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <ScreenHeader title="Crop share request" onBack={() => window.history.back()} />
        <Card label="Crop share request">
          {plans.isLoading || !plans.data ? <SkeletonRows rows={6} /> : <span style={muted}>This crop plan is not approved. Find her in Members.</span>}
        </Card>
      </div>
    );
  }
  const sel = shares.data?.find((x) => x.token_id === pick);
  const row = sel && planRow(plan, sel.share);
  // The rate fund_core charges (uc.rate_bp). The plan's tree discount (LOAN_RULES §5) is not applied by the
  // contract yet, so it is not promised here (contract gap, P5-Loan.md).
  const rateBp = checks.data?.rateBp;
  const caps = capsFor(checks.data, sel?.ft);
  const blocked = checks.data?.blocked || [];
  const repay = row && rateBp != null ? repayAbout(cash, rateBp, new Date(), row.finance.due) : null;
  const go = async () => {
    setError(undefined);
    try {
      const area = Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1;
      setReq(await makeRequest({
        union: cfg.union, member: sel.ft.member, token: tokenHex(sel.token_id), cash: String(BigInt(Math.round(cash)) * NIN / 1n),
        hours: Math.round(hours), crop: row?.name || sel.share.crop, area: `Area ${area}`,
        repay: repay != null ? String(repay) : '',
        due: row?.finance?.due || '',
      }, s));
    } catch (e) { setError(e.message); }
  };
  // Board LeaderRedeem, without its crop share list (23 Oct: the share comes picked): one card with the share, the
  // steppers, total / interest / repay and the union checks. No seed row: seed is paid as cash (P5).
  const name = sel ? `${row?.name || sel.crop} · Area ${Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1}` : '';
  const rateOf = (t) => rates.data?.find((r) => r.type === Number(t))?.total || 0;
  const machValue = Object.entries(mach).reduce((a, [t, h]) => a + h * rateOf(t), 0);
  // Cash is lent from member money only (junior, above its reserve); the plan's cash above that is shown, not lent.
  const notCovered = sel && checks.data ? Math.max(0, Math.round(sel.share.loan_amount || 0) - caps.cash) : 0;
  const rows = checkRows(checks.data, cash, hours, caps);
  const line = { height: 1, background: C.raised };
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ScreenHeader title={`Land ${plan.land_id}`} onBack={() => window.history.back()} />
      <Card label="Crop share request">
        {(shares.isLoading || (sel && !checks.data && !checks.isError)) && <SkeletonRows rows={6} />}
        {shares.data && !sel && <span style={muted}>No crop share of hers is ready.</span>}
        {sel && (checks.data || checks.isError) && (
          <>
            <CardTitle right={<span style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>Ready</span>}>{name}</CardTitle>
            {checks.isError && <span style={{ color: C.coral }}>Could not read the union. Try again.</span>}
            {checks.data && <Stepper label="Cash" value={cash} set={setCash} step={100} max={caps.cash} fmt={inr} />}
            {notCovered > 0 && <KV k="Not covered by member money" v={inr(notCovered)} color={C.coral} />}
            {checks.data && Object.entries(mach).map(([t, h]) => (
              <Stepper key={t} label={Number(t) ? `${typeName(Number(t))}${rateOf(t) ? ` · ${inr(rateOf(t))}/h` : ''}` : 'Machine hours'} value={h}
                set={(v) => setMach((m) => ({ ...m, [t]: v }))} step={1} max={h + Math.max(0, caps.hours - hours)} fmt={(v) => `${v} h`} />
            ))}
            <div style={line} />
            <KV k="Total" v={inr(cash + machValue)} />
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
            <Primary disabled={!checks.data || blocked.length > 0 || (!cash && !hours) || cash > caps.cash || hours > caps.hours} onClick={go}>Show QR to her</Primary>
          </>
        )}
      </Card>
    </div>
  );
}

/** A1b (Scan) → N10 (Confirm) → N1/N2/N3. */
export function MemberScan({ onDone }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [req, setReq] = useState();
  const [error, setError] = useState();
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const read = useMemo(() => async (text) => {
    setError(undefined);
    try {
      const t = text.trim();
      setReq(isDeskRequest(t) ? { desk: await checkDeskRequest(t, { cfg, me: s?.stellarAddress }) } : await checkRequest(t, { cfg, me: s?.stellarAddress }));
    } catch (e) { setError(e.message); }
  }, [cfg, s]);

  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); setReq(undefined); onDone?.(); }} onRetry={() => tx.retry()} />;
  async function confirm() {
    await tx.run({
      label: `Crop share ${req.crop}`, rows: [['You get', inr(Number(BigInt(req.cash) / NIN))], ['For', `${req.crop} · ${req.area}`]],
      contractName: 'fund_core', fn: 'draw_loan',
      args: [sv.address(req.union), sv.address(req.member), sv.bytes32(req.token), sv.i128(req.cash), sv.u32(req.hours)],
      invalidate: [['stellar', 'account'], ['stellar', 'investment'], ['oracle', 'shares']],
    });
  }
  // Her investment paid over the desk (22 Oct): the leader's signed entry comes in the QR; she submits the claim.
  if (req?.desk) {
    const d = req.desk;
    const collect = () => tx.run({
      label: `Collect ${inr(Math.floor(d.inr))}`, rows: [['You collect', `${inr(Math.floor(d.inr))} in cash`], ['Where', 'Union office']],
      contractName: 'fund_core', fn: 'claim_junior_cash', args: [sv.address(d.union), sv.address(d.member), sv.address(d.leader), sv.i128(0n)],
      auth: d.auth, invalidate: [['stellar', 'investment'], ['stellar', 'fund']],
    });
    return (
      <Sheet landName="Nila" title="Your union leader asks you to confirm">
        <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>You collect {inr(Math.floor(d.inr))}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Your union investment, in cash at the office</p>
        <p style={{ color: C.gold, textAlign: 'center' }}>Only confirm when your leader is with you and hands you the cash.</p>
        <Primary disabled={!tx.ready} onClick={collect}>Confirm</Primary>
        <button type="button" onClick={() => setReq(undefined)} style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, marginTop: 8 }}>Cancel</button>
      </Sheet>
    );
  }
  if (req) {
    const cash = Number(BigInt(req.cash) / NIN);
    return (
      <Sheet landName="Nila" title="Your union leader asks you to confirm">
        <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>You get {inr(cash)}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Made of {inr(cash)} cash{req.hours ? ` + ${req.hours} machine hours` : ''}</p>
        <p style={{ textAlign: 'center' }}>For {req.crop} · {req.area}</p>
        {req.repay && <p style={{ ...muted, textAlign: 'center' }}>Repay {inr(Number(req.repay))} · 3 weeks after harvest</p>}
        <p style={{ color: C.gold, textAlign: 'center' }}>Only confirm when your leader is with you.</p>
        <Primary disabled={!tx.ready} onClick={confirm}>Confirm</Primary>
        <button type="button" onClick={() => setReq(undefined)} style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, marginTop: 8 }}>Cancel</button>
      </Sheet>
    );
  }
  return (
    <Sheet landName="Nila" title="Scan">
      {!typing ? <CameraView mode="qr" onText={read} /> : (
        <>
          <textarea aria-label="The code" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ width: '100%', minHeight: 90, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: 12, boxSizing: 'border-box' }} />
          <Primary disabled={!typed.trim()} onClick={() => read(typed)}>Check the code</Primary>
        </>
      )}
      <p style={{ ...muted, textAlign: 'center' }}>Scan the QR on your leader's phone. You see what your leader prepared and press Confirm.</p>
      {error && <p style={{ color: C.coral, textAlign: 'center' }}>{error}</p>}
      <button type="button" onClick={() => setTyping((t) => !t)} style={{ background: 'none', border: 0, color: C.accent, fontWeight: 700, width: '100%' }}>{typing ? 'Use the camera' : 'Type the code instead'}</button>
    </Sheet>
  );
}
