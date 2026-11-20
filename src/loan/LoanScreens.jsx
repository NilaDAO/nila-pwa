// L11 crop agreement request + L9 QR (leader) and A1b scan + N10 confirm (member). Boards LeaderRedeem,
// LeaderRequestQR, MemberWalletQR-o19l-1f7c, ConfirmLoan. Since 26 Oct (executive decision: one QR at the office, the
// help QR) there is no request QR: the leader scans the member's help QR and uses the crop agreement for the member in the
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
import { useFieldRecord } from '../plan/record';
import { useUnionMembers } from '../leader/unionMembers';
import { Card, CardTitle, KV } from './AssetParts';
import { NIN } from './request';
import StartHelp from './StartHelp';
import { useSessionUntil } from '../stellar/session';
import { capsFor, checkRows, repayAbout, useUnionChecks } from './unionChecks';
import { usePost } from '../anchor/LeaderLp';
import { useBringRoom } from '../anchor/hooks';
import { BRING } from '../anchor/sep';
import { TRACTOR, TYPES, acresFor, ta, typeName, unitsOf, useMachines, useRates } from '../machine/hooks';
import ConfirmShare from './ConfirmShare';
import { areaNames, opensOf } from './MyShares';
import { InfoFooter } from '../plan/ActivePlan';
import { useContactBook } from '../union/hooks';
import PhotoCount from './PhotoCount';
import { recordCash } from './CashDesk';
import { overRoom, useDeskRoom } from './deskRoom';

// A share's areas by their field names (13 Nov; was "Area n").
const areaOf = (plan, share) => {
  const order = Object.keys(plan.plan.proposal).sort();
  return areaNames((share.zones || [share.zone]).map((z) => plan.plan.area_names?.[z] || `Area ${order.indexOf(z) + 1}`));
};

const FLAG_DRAWN = 8;
const FLAG_ENDED = 2 | 4;   // defaulted or closed
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function Stepper({ label, value, set, step, min = 0, max, fmt, tone, onZero }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700, flexShrink: 0 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flexGrow: 1, color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{label}</span>
      <button type="button" aria-label={`Less ${label}`} style={b} onClick={() => (onZero && value <= min ? onZero() : set(Math.max(min, +(value - step).toFixed(2))))}>−</button>
      <span style={{ width: 104, height: 44, borderRadius: R.button, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700, color: tone || C.text }}>{fmt(value)}</span>
      <button type="button" aria-label={`More ${label}`} style={b} onClick={() => set(Math.min(max, +(value + step).toFixed(2)))}>+</button>
    </div>
  );
}

/** The repay for a share: the plan row of that zone and crop whose sow is the share's from_date. A green manure's
 *  agreement (18 Nov): its covers (one per area, merged into one agreement), as one row: name, due, machine acres. */
function planRow(plan, share) {
  for (const s of plan.plan.seasons || []) for (const r of s.rows) if (r.zone === share.zone && r.crop === share.crop && r.sow === share.from_date) return r;
  if (share.green_manure) {
    const zs = share.zones || [share.zone];
    const cs = (plan.plan.soil_cover || []).filter((c) => c.finance && zs.includes(c.zone) && c.sow === share.from_date);
    if (!cs.length) return null;
    const machines = {};
    for (const c of cs) for (const [k, m] of Object.entries(c.finance.machines || {})) {
      machines[k] = { ...m, acres: (machines[k]?.acres || 0) + (m.acres || 0) };
    }
    const raw = String(cs[0].name || share.crop).replace(/^mulch, then /i, '').replace(/^green manure: /i, '');
    return { name: `Green manure · ${raw}`, finance: { due: cs[0].finance.due, machines } };
  }
  return null;
}
// A crop key as words when no plan row names it ("wild_indigo" → "Wild indigo").
const words = (k) => { const t = String(k || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

/** initial: `<plan id>` (a To do row) or `<plan id>_<token id>` (her crop agreement QR, decimal; her G2 row, hex): opens on
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
  const book = useContactBook();
  // 18 Nov: the field record the plan was made on (its area ids are the plan's), not the title's newest record: after a
  // Redo the newest one has other ids and none of the agreement's areas were found on the map.
  const planRecord = useFieldRecord(plan?.land_id, undefined, plan ? (plan.plan?.record_hash || plan.record_hash || '') : undefined);
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
  // 18 Nov: the voucher rows are the crop agreement's own machine work; more types are added from a list of the ones
  // the union prices (rates) or has (Add a voucher).
  const types = Object.keys(mach).map(Number).filter((t) => t > 0);
  const owned = [...new Set((machines.data || []).map((m) => Number(m.machine_type)))];
  // 18 Nov: every machine type in the list; one the union does not have is shown but cannot be picked.
  const listed = TYPES.filter((t) => t > 0 && !types.includes(t));
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
    // 18 Nov: the cash stays at what the crop agreement asks, even above what the union can lend now (shown in red).
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
  // 19 Nov (executive decision): lake sludge is financed (its haulage) only once a leader confirms the permit here.
  const [permitSeen, setPermitSeen] = useState(false);
  const tx = useSorobanTx();
  const bring = usePost();   // L11 #short, automatic (25 Oct): see askBring
  const bringRoom = useBringRoom();
  const [error, setError] = useState();
  const helpUntil = useSessionUntil(shares.data?.find((x) => x.token_id === pick)?.ft?.member);
  // Invest in the flow (18 Nov): when the member is below the union's gate, the leader counts the cash here.
  const desk = useDeskRoom();
  const investTx = useSorobanTx();
  const [invest, setInvest] = useState(null);   // rupees to invest, null: not started
  const [counting, setCounting] = useState(false);
  const [noPhotos, setNoPhotos] = useState(false);

  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); window.location.hash = '#/assets'; }} onRetry={() => tx.retry()} />;
  if (investTx.status !== 'idle') return <TxScreens tx={investTx} onClose={() => { investTx.reset(); setInvest(null); checks.refetch(); }} onRetry={() => investTx.retry()} />;
  // No session yet (26 Oct: the help QR is the one office QR): the leader scans the member's help QR first, then uses
  // the crop agreement for the member in the session.
  if (req) {
    return <StartHelp member={req.member} label="the member" title="Take up the crop agreement" onBack={() => setReq(undefined)} onStarted={() => { setReq(undefined); setOwn(true); }} />;
  }
  // The page shows at once (header and card); the card fills as the plan, her share and the union are read.
  if (!plan) {
    return (
      <MapCard map={<span />} header={{ title: 'Crop agreement request', onBack: () => window.history.back() }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card label="Crop agreement request">
          {plans.isLoading || !plans.data ? <SkeletonRows rows={6} /> : <span style={muted}>This crop plan is not approved. Find the member in Members.</span>}
        </Card>
      </MapCard>
    );
  }
  const sel = shares.data?.find((x) => x.token_id === pick);
  const row = sel && planRow(plan, sel.share);
  // 18 Nov: the crop agreement's areas on the map (the others faded), the card half way up; the title is the member's
  // name from the leaders' contact book, else the farm's.
  const member = sel?.ft?.member;
  const zones = sel ? (sel.share.zones || [sel.share.zone]).filter(Boolean) : [];
  // Its areas filled in the crop's colour (green manure: its own), the others faded.
  const colour = row?.colour || (sel?.share.green_manure ? (plan.plan.soil_cover || []).find((c) => zones.includes(c.zone) && c.colour)?.colour : null) || C.accent;
  // No chips on these areas: the card's title names the crop (a chip per area repeated it four times).
  // 20 Nov: the accent line around each of its areas and a light fill, so a dark crop colour (black gram) does not blend
  // the areas into one.
  // 20 Nov: each of its areas named on the map (was hidden: the card names the crop, but not which area is which).
  const order0 = Object.keys(plan?.plan?.proposal || {}).sort();
  const mapLabels = Object.fromEntries(zones.map((z) => [z, { text: plan?.plan?.area_names?.[z] || `Area ${order0.indexOf(z) + 1}`,
    colour, edge: C.accent, soil: true }]));
  // 18 Nov: an area the plan joined to another (plan.merged, e.g. D · 3 into D · 4) is drawn as part of it, as on the plan.
  for (const [z, to] of Object.entries(plan?.plan?.merged || {})) if (!zones.includes(z)) mapLabels[z] = { join: to };
  const rec = planRecord.data?.record || holder?.record;
  const memberMap = rec ? <AreaMap record={rec} labels={mapLabels} focus={zones.length ? zones : null} fitBottom={Math.round(window.innerHeight * 0.5)} /> : <span />;
  const title = (member && book.data?.names.get(member)?.name) || holder?.label || holder?.name || `Land ${plan.land_id}`;
  if (counting && member) {
    return <PhotoCount name={`Invest · ${title}`} target={invest || 0} verb="Invest" desk={desk.data}
      onBack={() => setCounting(false)} onDone={async (c) => {
        setCounting(false);
        if (!(await recordCash({ tx: investTx, leader: s.stellarAddress, cfg, purpose: 'invest', who: member, total: c.total, s3Keys: c.s3Keys, amount: invest }))) setNoPhotos(true);
      }} />;
  }
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
  const blocked = [...(tooLate ? [more ? 'Too late: machine work can be added until the last day to use this crop agreement.' : 'Too late for this cycle: the last day to use this crop agreement has passed.'] : []),
    ...(ended ? ['This crop agreement\'s loan is closed: no machine work can be added.'] : []),
    ...(tooEarly ? [`Not open yet: this crop agreement can be used from ${new Date(opens * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`] : []),
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
    const nm = `${row?.name || words(sel.share.crop || sel.crop)}`;
    const ar = areaOf(plan, sel.share);
    const draw = () => tx.run({
      label: more ? `More machine work · ${nm}` : `Crop agreement ${nm}`, rows: [...(more ? [] : [['Cash', inr(cash)]]), ...(hours ? [['Machine vouchers', `${ta(hours)} tractor acres`]] : []), ['For', `${nm} · ${ar}`]],
      contractName: 'fund_core', fn: 'draw_loan',
      args: [sv.address(cfg.union), sv.address(s.stellarAddress), sv.bytes32(tokenHex(sel.token_id)), sv.i128(BigInt(Math.round(cash)) * NIN), sv.u32(hours)],
      invalidate: [['oracle', 'myShares'], ['oracle', 'shares'], ['stellar', 'investment'], ['stellar', 'unionChecks']],
    });
    return <ConfirmShare own more={more} cash={cash} hours={hours} name={nm} area={ar} ready={tx.ready} onConfirm={draw} onCancel={() => setOwn(false)} map={memberMap} />;
  }
  if (own && sel && helping) {
    const nm = `${row?.name || words(sel.share.crop || sel.crop)}`;
    const ar = areaOf(plan, sel.share);
    const draw = () => tx.run({
      label: more ? `More machine work · ${nm} · for the member` : `Crop agreement ${nm} · for the member`, rows: [...(more ? [] : [['Cash', inr(cash)]]), ...(hours ? [['Machine vouchers', `${ta(hours)} tractor acres`]] : []), ['For', `${nm} · ${ar}`]],
      contractName: 'fund_core', fn: 'draw_loan', session: sel.ft.member,
      args: [sv.address(cfg.union), sv.address(sel.ft.member), sv.bytes32(tokenHex(sel.token_id)), sv.i128(BigInt(Math.round(cash)) * NIN), sv.u32(hours)],
      invalidate: [['oracle', 'shares'], ['stellar', 'unionChecks']],
    });
    return <ConfirmShare forMember more={more} cash={cash} hours={hours} name={nm} area={ar} ready={tx.ready} onConfirm={draw} onCancel={() => setOwn(false)} map={memberMap} />;
  }
  // Board LeaderRedeem, without its crop agreement list (23 Oct: the share comes picked): one card with the share, the
  // steppers, total / interest / repay and the union checks. No seed row: seed is paid as cash (P5).
  const name = sel ? (row?.name || words(sel.share.crop || sel.crop)) : '';
  // Cash is lent from member money only (junior, above its reserve); the plan's cash above that is shown, not lent.
  const notCovered = sel && checks.data && !more ? Math.max(0, Math.round(sel.share.loan_amount || 0) - caps.cash) : 0;
  const rows = checkRows(checks.data, cash, hours, caps);
  // L11 #short, automatic (25 Oct): when the office has less cash than this crop agreement, the gap goes to the union's
  // LPs as a Bring when the leader shows the QR (or takes up an own share); fx_pool adds it to an open Bring no LP
  // has accepted yet. Kept per crop agreement on this phone, so showing the QR again never asks twice. At most what the
  // union's USDC can serve (LP positions, 31 Oct: useBringRoom).
  const short = !!rows?.[0]?.[2] && !!cfg?.anchor_url && !!checks.data;
  const gap = short ? Math.min(Math.ceil(cash - checks.data.onHand), bringRoom.data || 0) : 0;
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
  // 18 Nov: the investment gate is not a dead end: the leader counts the member's cash in this flow.
  const gateShort = checks.data?.gateShort || 0;
  const blockedNoGate = blocked.filter((b) => !/invested in the union first/.test(b));
  const needsInvest = gateShort > 0;
  // Every note goes to the info panel on top of the bottom bar (18 Nov), not into the card.
  const notes = [
    // Texts approved 18 Nov.
    ...(needsInvest ? [`Invest ${inr(gateShort)} first, then take up the crop agreement.`] : []),
    ...(notCovered > 0 ? ['Your union lacks investment to cover the full amount.'] : []),
    ...blockedNoGate,
    // A bring is only promised when the LPs can bring something (18 Nov: it said "bring ₹0").
    ...(rows[0]?.[2] ? [cfg?.anchor_url && gap > 0 ? `Not enough cash at the office: your LPs are asked to bring ${inr(gap)} when you ${mine ? 'get the cash' : 'show the QR'}.` : 'Not enough cash at the office for this crop agreement yet.'] : []),
    ...(checks.isError ? ['Could not read the union. Try again.'] : []),
    ...(noPhotos ? ['The photos were not saved, so the cash was not recorded. Count again.'] : []),
    ...(error ? [error] : []),
    ...(helping ? [`You can act for this member until ${new Date(helpUntil * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`] : []),
  ];
  const btn = (on = true) => ({ flex: 1, height: 44, borderRadius: R.button, border: 0, background: on ? C.accent : C.raised, color: on ? C.ink : C.muted,
    fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: on ? 'pointer' : 'default' });
  return (
    <MapCard map={memberMap} full={false} top={Math.round(window.innerHeight * 0.5)} header={{ title, onBack: () => window.history.back() }}
      style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card label={more ? 'More machine work' : 'Crop agreement request'}>
        {(shares.isLoading || (sel && !checks.data && !checks.isError)) && <SkeletonRows rows={6} />}
        {shares.data && !sel && <span style={muted}>None of their crop agreements is ready.</span>}
        {sel && (checks.data || checks.isError) && (
          <>
            <CardTitle right={more ? <span style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>Cash received</span> : null}>{name}</CardTitle>
            {more && <span style={muted}>Add machine work to this crop agreement: owed from today, with interest, like the vouchers you got with the cash.</span>}
            {/* 18 Nov: up to what the crop agreement asks, even when the union cannot lend it all now: then in red. */}
            {/* Above it, the first − goes straight to what the union can lend now (18 Nov). */}
            {checks.data && !more && <Stepper label="Cash" value={cash} set={(v) => setCash(cash > caps.cash && v < cash ? caps.cash : v)} step={100}
              // Open (9 Oct): the union may give more than the agreement, unless its switch holds it to the attested amount.
              max={checks.data.enforceToken ? Math.max(caps.cash, Math.round(sel.ft ? Number(BigInt(sel.ft.amount ?? 0) / NIN) : sel.share.loan_amount || 0)) : 10_000_000} fmt={inr} tone={cash > caps.cash ? C.coral : undefined} />}
            {checks.data && types.map((t) => {
              const h = mach[t] || 0;
              const room = tractorRate > 0 ? Math.floor(acresFor(Math.max(0, caps.hours - hours), rateOf(t), tractorRate) * 10) / 10 : 0;
              return (
                <Stepper key={t} label={`${typeName(t)}${rateOf(t) ? ` · ${inr(rateOf(t))}/ac` : ''}`} value={h}
                  set={(v) => setMach((m) => ({ ...m, [t]: v }))} onZero={() => setMach((m) => { const n = { ...m }; delete n[t]; return n; })} step={0.1} max={Math.round((h + room) * 10) / 10} fmt={(v) => `${v} ac`} />
              );
            })}
            {checks.data && listed.length > 0 && (
              <select aria-label="Add a voucher" value="" onChange={(e) => { const t = Number(e.target.value); if (t) setMach((m) => ({ ...m, [t]: 0 })); }}
                style={{ height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700, padding: '0 20px 0 12px' }}>
                <option value="">+ Add a voucher</option>
                {listed.map((t) => <option key={t} value={t} disabled={!owned.includes(t)}>{typeName(t)}{owned.includes(t) && rateOf(t) ? ` · ${inr(rateOf(t))}/ac` : !owned.includes(t) ? ' · not in your union' : ''}</option>)}
              </select>
            )}
            {hours > 0 && <KV k="Vouchers" v={`≈ ${ta(hours)} tractor acres`} />}
            <div style={line} />
            <KV k="Total" v={inr(cash + value)} />
            {rateBp != null && <KV k="Interest" v={`${rateBp / 100}% a year`} />}
            {repay != null && !more && <KV k="Repay" v={`${inr(repay)} · about end of ${monthYear(row.finance.due)}`} />}
            <div style={line} />
            {rows.map(([k, v, bad]) => <KV key={k} k={k} v={v} color={bad ? C.coral : C.text} />)}
            {/* 18 Nov: invest here when the member is below the gate: the amount, then the photo count of the cash. */}
            {needsInvest && member && (
              <>
                <div style={line} />
                <Stepper label="Invest" value={invest ?? gateShort} set={setInvest} step={100} min={gateShort} max={Math.max(gateShort, desk.data?.room ?? gateShort * 100)} fmt={inr} />
                {desk.data && (invest ?? gateShort) > desk.data.room && <span style={{ color: C.coral, fontSize: 14 }}>{overRoom(desk.data, invest ?? gateShort)}</span>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={btn(!desk.data || (invest ?? gateShort) <= desk.data.room)} disabled={!!desk.data && (invest ?? gateShort) > desk.data.room}
                    onClick={() => { setNoPhotos(false); setInvest(invest ?? gateShort); setCounting(true); }}>Photo count</button>
                  <button type="button" style={btn(false)} disabled>Cash teller · soon</button>
                </div>
              </>
            )}
            {!needsInvest && sel.share?.permit && !more && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4, cursor: 'pointer' }}>
                <input type="checkbox" checked={permitSeen} onChange={(e) => setPermitSeen(e.target.checked)} style={{ width: 20, height: 20, margin: 0, accentColor: C.accent }} />
                <span>I have seen the permit to take the lake sludge.</span>
              </label>
            )}
            {!needsInvest && (
              <Primary disabled={(sel.share?.permit && !more && !permitSeen) || !checks.data || checks.data.unknown || blocked.length > 0 || (!cash && !hours) || (more && !hours) || cash > caps.cash || hours > caps.hours} onClick={mine || helping ? async () => { if (await askBring()) setOwn(true); } : go}>{more ? (mine ? 'Add the machine work' : helping ? 'Add the machine work for the member' : "Scan the member's QR") : mine ? 'Get cash and vouchers' : helping ? 'Use it for the member' : "Scan the member's QR"}</Primary>
            )}
          </>
        )}
      </Card>
      {/* 18 Nov: the notes in the info panel above the bar, which slides out while the card is lowered (as registration). */}
      {notes.length > 0 && <InfoFooter text={notes.map((n) => <span key={n} style={{ display: 'block' }}>{n}</span>)} onClose={() => { setError(undefined); setNoPhotos(false); }} />}
    </MapCard>
  );
}

/** A1b in assist mode (26 Oct, A2): the member's help QR; the member's phone reads no QR. */
export { default as MemberScan } from './HelpQr';
