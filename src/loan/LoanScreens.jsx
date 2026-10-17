// L11 crop share request + L9 QR (leader) and A1b scan + N10 confirm (member). Boards LeaderRedeem,
// LeaderRequestQR, MemberWalletQR-o19l-1f7c, ConfirmLoan. Decisions 16 Oct: cash (seed included) and
// machine hours only; her tokens from her approved plan's mint list, read with fund_core.food_token.
// DESIGN GAPs: no member names on the node ("Land N", "Your union leader"); the union checks on L11 (cash
// on hand, stock, union limit) are not shown yet; "Type the code" is a text box for the whole code.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { NIN, checkRequest, makeRequest } from './request';
import { capsFor, checkRows, repayAbout, useUnionChecks } from './unionChecks';

const FLAG_DRAWN = 8;
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function Stepper({ label, value, set, step, min = 0, max, fmt }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" aria-label={`Less ${label}`} style={b} onClick={() => set(Math.max(min, +(value - step).toFixed(2)))}>−</button>
        <span style={{ minWidth: 72, textAlign: 'center', fontWeight: 700 }}>{fmt(value)}</span>
        <button type="button" aria-label={`More ${label}`} style={b} onClick={() => set(Math.min(max, +(value + step).toFixed(2)))}>+</button>
      </span>
    </div>
  );
}

/** The repay for a share: the plan row of that zone and crop whose sow is the share's from_date. */
function planRow(plan, share) {
  for (const s of plan.plan.seasons || []) for (const r of s.rows) if (r.zone === share.zone && r.crop === share.crop && r.sow === share.from_date) return r;
  return null;
}

export function LeaderLoan() {
  const s = useNilaSigner();
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const plans = useQuery({ queryKey: ['oracle', 'approvedPlans'], enabled: !!api, queryFn: () => api.approvedPlans() });
  const [planId, setPlanId] = useState();
  const plan = plans.data?.plans?.find((p) => p.id === planId);
  const shares = useQuery({
    queryKey: ['oracle', 'shares', planId], enabled: !!plan && !!cfg,
    queryFn: async () => {
      const { mints } = await api.mintList(planId);
      return Promise.all(mints.filter((m) => m.token_id).map(async (m) => {
        const ft = await readContract(cfg, 'fund_core', 'food_token', [sv.address(cfg.union), sv.bytes32(tokenHex(m.token_id))]).catch(() => null);
        const share = (plan.plan.shares || []).find((x) => x.key === m.share) || {};
        return { ...m, share, ft };
      }));
    },
  });
  const [pick, setPick] = useState();
  const pickFt = shares.data?.find((x) => x.token_id === pick)?.ft;
  const checks = useUnionChecks(pickFt?.member);
  const [cash, setCash] = useState(0);
  const [hours, setHours] = useState(0);
  const [req, setReq] = useState();
  const [img, setImg] = useState();
  const [error, setError] = useState();
  // Low error correction and a large image: a phone camera reads it at arm's length (the request is long).
  useEffect(() => { if (req) QRCode.toDataURL(req.qr, { width: 360, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [req]);

  if (req) {
    return (
      <Sheet landName={`Land ${plan.land_id}`} title="Crop share request" onBack={() => setReq(undefined)}>
        <p style={{ ...muted, textAlign: 'center' }}>{req.request.crop} · {inr(Number(req.request.cash))} cash + {req.request.hours} machine hours</p>
        {img && <img src={img} alt="Crop share request QR" style={{ display: 'block', margin: '0 auto', width: '100%', maxWidth: 360, aspectRatio: '1', background: '#fff', borderRadius: 12 }} />}
        <p style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 2 }}>{req.number.slice(0, 3)} {req.number.slice(3)}</p>
        <p style={{ ...muted, textAlign: 'center' }}>Let her scan this with her phone.</p>
        <p style={muted}>For: Land {plan.land_id} · Valid for: 48 hours</p>
      </Sheet>
    );
  }
  if (!plan) {
    return (
      <Sheet landName="Crop share request" title="Pick a member">
        {plans.isLoading && <p style={muted}>…</p>}
        {!plans.isLoading && !plans.data?.plans?.length && <p style={muted}>No approved crop plans yet.</p>}
        {plans.data?.plans?.map((p) => <Choice key={p.id} sub={`${(p.plan.shares || []).length} crop shares`} onClick={() => setPlanId(p.id)}>Land {p.land_id}</Choice>)}
      </Sheet>
    );
  }
  const now = Date.now() / 1000;
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
  return (
    <Sheet landName={`Land ${plan.land_id}`} title="Pick a crop share" onBack={() => { setPlanId(undefined); setPick(undefined); }}>
      <p style={{ ...muted, textAlign: 'center' }}>From her plan</p>
      {shares.isLoading && <p style={muted}>…</p>}
      {shares.data?.map((x) => {
        const drawn = x.ft && (Number(x.ft.loan?.flags ?? 0) & FLAG_DRAWN);
        const ready = !!x.ft && !drawn && Number(x.ft.from_date) <= now;
        const tag = !x.ft ? 'Not attested yet' : drawn ? 'Financed' : ready ? 'Ready' : `From ${monthYear(Number(x.ft.from_date) * 1000)}`;
        return (
          <Choice key={x.token_id} on={pick === x.token_id} sub={`${x.share.zone} · ${tag}`}
            onClick={() => { if (!ready) return; setPick(x.token_id); setCash(Math.round(x.share.loan_amount || 0)); setHours(Math.round(x.share.hours || 0)); }}>
            {x.crop}
          </Choice>
        );
      })}
      {sel && (
        <>
          <Stepper label="Cash" value={cash} set={setCash} step={100} max={caps.cash} fmt={inr} />
          <Stepper label="Machine hours" value={hours} set={setHours} step={1} max={caps.hours} fmt={(h) => `${h} h`} />
          {checks.isLoading && <p style={muted}>Checking the union…</p>}
          {checks.isError && <p style={{ color: C.coral }}>Could not read the union. Try again.</p>}
          {blocked.map((b) => <p key={b} style={{ color: C.coral }}>{b}</p>)}
          {checkRows(checks.data, cash, hours, caps).map(([k, v, bad]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '4px 0' }}>
              <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, color: bad ? C.coral : C.text }}>{v}</span>
            </div>
          ))}
          {checkRows(checks.data, cash, hours, caps)[0]?.[2] && <p style={{ ...muted, color: C.coral }}>Not enough cash at the office for this crop share yet.</p>}
          {rateBp != null && <p style={muted}>Interest {rateBp / 100}% a year{repay != null ? ` · repay about ${inr(repay)} by end of ${monthYear(row.finance.due)}` : ''}</p>}
          {error && <p style={{ color: C.coral }}>{error}</p>}
          <Primary disabled={!checks.data || blocked.length > 0 || (!cash && !hours) || cash > caps.cash || hours > caps.hours} onClick={go}>Show QR to her</Primary>
        </>
      )}
    </Sheet>
  );
}

export function Camera({ onText }) {
  const box = useRef();
  useEffect(() => {
    let scanner;
    let live = true;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!live || !box.current) return;
      scanner = new Html5Qrcode(box.current.id);
      scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (t) => { onText(t); scanner.stop().catch(() => {}); }, () => {}).catch(() => {});
    });
    return () => { live = false; scanner?.stop().catch(() => {}); };
  }, [onText]);
  return <div id="nila-scan" ref={box} style={{ width: '100%', minHeight: 260, background: '#000', borderRadius: 12 }} aria-label="Camera view" />;
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
    try { setReq(await checkRequest(text.trim(), { cfg, me: s?.stellarAddress })); } catch (e) { setError(e.message); }
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
      {!typing ? <Camera onText={read} /> : (
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
