// L11 crop share request + L9 QR (leader) and A1b scan + N10 confirm (member). Boards LeaderRedeem,
// LeaderRequestQR, MemberWalletQR-o19l-1f7c, ConfirmLoan. Since 26 Oct (executive decision: one QR at the office, the
// help QR) there is no request QR: the leader scans the member's help QR and uses the crop share for the member in the
// 5-minute session; a leader's own share is drawn on the leader's own phone. Decisions 16 Oct: cash (seed included) and
// machine hours only; her tokens from her approved plan's mint list, read with fund_core.food_token.
// DESIGN GAPs: no member names on the node ("Land N", "Your union leader"); the union checks on L11 (cash
// on hand, stock, union limit) are not shown yet; "Type the code" is a text box for the whole code.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readFoodTokens, sv, tokenHex } from '../stellar/soroban';
import { SkeletonRows } from '../shell/Skeleton';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Primary, inr, muted } from '../plan/ui';
import { C, FONT, R } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import AreaMap from '../plan/AreaMap';
import { useUnionMembers } from '../leader/unionMembers';
import { Card, CardTitle, KV } from './AssetParts';
import { NIN } from './request';
import StartHelp from './StartHelp';
import { useSessionUntil } from '../stellar/session';
import { capsFor, checkRows, repayAbout, useUnionChecks } from './unionChecks';
import { usePost } from '../anchor/LeaderLp';
import { useLpOwed } from '../anchor/hooks';
import { BRING } from '../anchor/sep';
import { TRACTOR, acresFor, ta, typeName, unitsOf, useMachines, useRates } from '../machine/hooks';
import ConfirmShare from './ConfirmShare';
import { opensOf } from './MyShares';

const FLAG_DRAWN = 8;
const FLAG_ENDED = 2 | 4;   // defaulted or closed
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
  // Machine work per machine type (27 Oct: in ACRES): { type: acres }, a row for every type the union registered and
  // confirmed (0 unless the plan sets it) and every type of her plan (the plan's acres: the area × passes). The
  // voucher is their value in tractor acres, held in units: Σ acres × the type's price an acre ÷ the tractor's.
  // (A crop's own price, e.g. trailer × sugarcane, is applied at the owner's claim; here the type's price.)
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
    // Taken up already (27 Oct): only machine work is added, from 0.
    if (Number(x.ft?.loan?.flags ?? 0) & FLAG_DRAWN) { setPick(x.token_id); setCash(0); setMach({}); return; }
    setPick(x.token_id); setCash(Math.round(x.share.loan_amount || 0));
    const ms = Object.values(planRow(plan, x.share)?.finance?.machines || {}).filter((m) => m.type && (m.acres ?? 0) > 0);
    setMach(Object.fromEntries(ms.map((m) => [m.type, Math.round(m.acres * 10) / 10])));
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
        const k = Math.min(h, Math.floor(acresFor(left, rateOf(t), tractorRate) * 10) / 10); left -= unitsOf(k, rateOf(t), tractorRate); return [t, k];
      }));
    });
  }, [checks.data, pickFt, tractorRate]); // eslint-disable-line react-hooks/exhaustive-deps
  const [req, setReq] = useState();
  const [own, setOwn] = useState(false);
  const tx = useSorobanTx();
  const bring = usePost();   // L11 #short, automatic (25 Oct): see askBring
  const lpOwed = useLpOwed();
  const [error, setError] = useState();
  const helpUntil = useSessionUntil(shares.data?.find((x) => x.token_id === pick)?.ft?.member);

  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); window.location.hash = '#/assets'; }} onRetry={() => tx.retry()} />;
  // No session yet (26 Oct: the help QR is the one office QR): the leader scans the member's help QR first, then uses
  // the crop share for the member in the session.
  if (req) {
    return <StartHelp member={req.member} label="the member" onBack={() => setReq(undefined)} onStarted={() => { setReq(undefined); setOwn(true); }} />;
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
  // More machine work on a share already taken up (executive decision 27 Oct): draw_loan again with cash 0, until
  // its last draw date, while its loan is open.
  const more = !!sel?.ft && !!(Number(sel.ft.loan?.flags ?? 0) & FLAG_DRAWN);
  const ended = more && !!(Number(sel.ft.loan?.flags ?? 0) & FLAG_ENDED);
  // Its window opens a week before its sowing window (25 Oct; fund_core NotOpenYet before it).
  const tooEarly = !!sel?.ft && !more && !tooLate && Date.now() / 1000 < opens;
  const blocked = [...(tooLate ? [more ? 'Too late: machine work can be added until the last day to use this crop share.' : 'Too late for this cycle: the last day to use this crop share has passed.'] : []),
    ...(ended ? ['This crop share\'s loan is closed: no machine work can be added.'] : []),
    ...(tooEarly ? [`Not open yet: this crop share can be used from ${new Date(opens * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`] : []),
    ...(checks.data?.blocked || [])];
  // The voucher is debt too (26 Oct): interest on cash and vouchers together.
  const repay = row && rateBp != null ? repayAbout(cash + value, rateBp, new Date(), row.finance.due) : null;
  const go = async () => {
    setError(undefined);
    if (!(await askBring())) return;
    setReq({ member: sel.ft.member });
  };
  // Her own share (a leader is a member too, 23 Oct): no QR; she confirms (N10) and signs draw_loan herself.
  const mine = !!sel && sel.ft?.member === s?.stellarAddress;
  // Helping the member (A2, 26 Oct): in a session the leader draws for the member at once, no request QR.
  const helping = !mine && helpUntil > 0;
  if (bring.tx.status === 'pending' || bring.tx.status === 'failed') return <TxScreens tx={bring.tx} onClose={() => bring.tx.reset()} onRetry={() => bring.tx.retry()} />;
  if (own && sel && mine) {
    const nm = `${row?.name || sel.crop}`;
    const ar = Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1;
    const draw = () => tx.run({
      label: more ? `More machine work · ${nm}` : `Crop share ${nm}`, rows: [...(more ? [] : [['Cash', inr(cash)]]), ...(hours ? [['Machine vouchers', `${ta(hours)} tractor acres`]] : []), ['For', `${nm} · Area ${ar}`]],
      contractName: 'fund_core', fn: 'draw_loan',
      args: [sv.address(cfg.union), sv.address(s.stellarAddress), sv.bytes32(tokenHex(sel.token_id)), sv.i128(BigInt(Math.round(cash)) * NIN), sv.u32(hours)],
      invalidate: [['oracle', 'myShares'], ['oracle', 'shares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
    });
    return <ConfirmShare own more={more} cash={cash} hours={hours} name={nm} area={ar} ready={tx.ready} onConfirm={draw} onCancel={() => setOwn(false)} map={memberMap} />;
  }
  if (own && sel && helping) {
    const nm = `${row?.name || sel.crop}`;
    const ar = Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1;
    const draw = () => tx.run({
      label: more ? `More machine work · ${nm} · for the member` : `Crop share ${nm} · for the member`, rows: [...(more ? [] : [['Cash', inr(cash)]]), ...(hours ? [['Machine vouchers', `${ta(hours)} tractor acres`]] : []), ['For', `${nm} · Area ${ar}`]],
      contractName: 'fund_core', fn: 'draw_loan', session: sel.ft.member,
      args: [sv.address(cfg.union), sv.address(sel.ft.member), sv.bytes32(tokenHex(sel.token_id)), sv.i128(BigInt(Math.round(cash)) * NIN), sv.u32(hours)],
      invalidate: [['oracle', 'shares'], ['stellar', 'unionChecks']],
    });
    return <ConfirmShare forMember more={more} cash={cash} hours={hours} name={nm} area={ar} ready={tx.ready} onConfirm={draw} onCancel={() => setOwn(false)} map={memberMap} />;
  }
  // Board LeaderRedeem, without its crop share list (23 Oct: the share comes picked): one card with the share, the
  // steppers, total / interest / repay and the union checks. No seed row: seed is paid as cash (P5).
  const name = sel ? `${row?.name || sel.crop} · Area ${Object.keys(plan.plan.proposal).sort().indexOf(sel.share.zone) + 1}` : '';
  // Cash is lent from member money only (junior, above its reserve); the plan's cash above that is shown, not lent.
  const notCovered = sel && checks.data && !more ? Math.max(0, Math.round(sel.share.loan_amount || 0) - caps.cash) : 0;
  const rows = checkRows(checks.data, cash, hours, caps);
  // L11 #short, automatic (25 Oct): when the office has less cash than this crop share, the gap goes to the union's
  // LPs as a Bring when the leader shows the QR (or takes up an own share); fx_pool adds it to an open Bring no LP
  // has accepted yet. Kept per crop share on this phone, so showing the QR again never asks twice. Since the LP pledge
  // (30 Oct) only LPs who hold the union's cash bring it back: at most what they hold.
  const short = !!rows?.[0]?.[2] && !!cfg?.anchor_url && !!checks.data;
  const gap = short ? Math.min(Math.ceil(cash - checks.data.onHand), lpOwed.data || 0) : 0;
  const askBring = async () => {
    if (!short || gap <= 0 || !sel) return true;
    const k = `nila.bring.${tokenHex(sel.token_id)}`;
    let asked = 0;
    try { asked = Number(localStorage.getItem(k) || 0); } catch { /* private mode */ }
    if (gap <= asked) return true;
    const out = await bring.post(BRING, gap - asked);
    if (!out) return false;
    try { localStorage.setItem(k, String(gap)); } catch { /* private mode */ }
    bring.tx.reset();
    return true;
  };
  const line = { height: 1, background: C.raised };
  return (
    <MapCard map={memberMap} header={{ title: `Land ${plan.land_id}`, onBack: () => window.history.back() }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label={more ? 'More machine work' : 'Crop share request'}>
        {(shares.isLoading || (sel && !checks.data && !checks.isError)) && <SkeletonRows rows={6} />}
        {shares.data && !sel && <span style={muted}>None of their crop shares is ready.</span>}
        {sel && (checks.data || checks.isError) && (
          <>
            <CardTitle right={<span style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>{more ? 'Taken up' : 'Ready'}</span>}>{name}</CardTitle>
            {more && <span style={muted}>Add machine work to this crop share: owed from today, with interest, like the vouchers at the take-up.</span>}
            {checks.isError && <span style={{ color: C.coral }}>Could not read the union. Try again.</span>}
            {checks.data && !more && <Stepper label="Cash" value={cash} set={setCash} step={100} max={caps.cash} fmt={inr} />}
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
              const room = tractorRate > 0 ? Math.floor(acresFor(Math.max(0, caps.hours - hours), rateOf(t), tractorRate) * 10) / 10 : 0;
              return (
                <Stepper key={t} label={`${typeName(t)}${rateOf(t) ? ` · ${inr(rateOf(t))}/ac` : ''}`} value={h}
                  set={(v) => setMach((m) => ({ ...m, [t]: v }))} step={0.1} max={Math.round((h + room) * 10) / 10} fmt={(v) => `${v} ac`} />
              );
            })}
            {hours > 0 && <KV k="Vouchers" v={`≈ ${ta(hours)} tractor acres`} />}
            <div style={line} />
            <KV k="Total" v={inr(cash + value)} />
            {rateBp != null && <KV k="Interest" v={`${rateBp / 100}% a year`} />}
            {repay != null && !more && <KV k="Repay" v={`${inr(repay)} · about end of ${monthYear(row.finance.due)}`} />}
            <div style={line} />
            {rows.map(([k, v, bad]) => <KV key={k} k={k} v={v} color={bad ? C.coral : C.text} />)}
            {blocked.map((b) => <span key={b} style={{ color: C.coral, fontSize: 14 }}>{b}</span>)}
            {/* L11 #short: the gap goes to the union's LPs as a Bring (P9). */}
            {rows[0]?.[2] && (cfg?.anchor_url
              ? <span style={muted}>Not enough cash at the office: your LPs are asked to bring {inr(gap)} when you {mine ? 'take it up' : 'show the QR'}.</span>
              : <span style={{ ...muted, color: C.coral }}>Not enough cash at the office for this crop share yet.</span>)}
            {error && <span style={{ color: C.coral }}>{error}</span>}
            <Primary disabled={!checks.data || blocked.length > 0 || (!cash && !hours) || (more && !hours) || cash > caps.cash || hours > caps.hours} onClick={mine || helping ? async () => { if (await askBring()) setOwn(true); } : go}>{more ? (mine ? 'Add the machine work' : helping ? 'Add the machine work for the member' : "Scan the member's QR") : mine ? 'Get cash and vouchers' : helping ? 'Use it for the member' : "Scan the member's QR"}</Primary>
            {helping && <span style={muted}>You can act for this member until {new Date(helpUntil * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</span>}
          </>
        )}
      </Card>
    </MapCard>
  );
}

/** A1b in assist mode (26 Oct, A2): the member's help QR; the member's phone reads no QR. */
export { default as MemberScan } from './HelpQr';
