// The crop plan (P4a): CP3 intro → CP4–CP7 intake → CP8 making → CP9 why → CP10 plan → CP11 terms →
// CP12 waiting for the leader (nila-design boards CropPlanIntro … CropPlanPending-590i). Copy from the
// boards; DESIGN GAPs: no map yet (P4c), no suggested crops on CP4 (no source), CP9 shows the
// engine's one explanation text (16 Oct), CP6/CP5 answers mapped to numbers/keys in hooks.js.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bouncing } from '../register/RegFrame';
import { Loading } from '../register/Boot';
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT } from '../shell/tokens';
import { KV } from '../loan/AssetParts';
import { COWS, LAND_ROLE, mergedPlan, qkPlan, useAcceptPlan, useApprovePlan, useCropCatalogue, useCropChain, useCropPlan, useDiscardPlan, useExtendPlan, useLandTitles, usePlanClient, usePlanJob, useRevisePlan, useSubmitIntake } from './hooks';
import { CheckRow, Choice, Notice, Primary, Sheet, Steps, inr, muted } from './ui';
import { Sheet as BaseSheet } from './ui';
import { BasisDrawer, Drawer, InfoButton } from './Drawer';
import { useMintCropShares } from './mint';
import { NoticeScreen, TxScreens } from '../stellar/TxStatus';
import MoneyChart from './MoneyChart';
import { areasOf, summarize, useFieldRecord } from './record';
import { useTitleName } from './hooks';
import { useStellarTitles } from '../stellar/hooks';
import AreaMap from './AreaMap';
import { fieldsMap, useTitleFields } from './titleFields';
import CropsStep from './CropsStep';
import { AreaCard, CropSelect, SEASON, SlideBar, sortedCrops, TapLine, fmtKg, rowsInSeason, seasonLabel, yearLabel, zonesOf } from './PlanResult';
import ActivePlan, { currentSeason } from './ActivePlan';
import { shareOn } from '../shell/MapStage';
import { assisted, useMyShares } from '../loan/MyShares';
import RoundButton from '../shell/RoundButton';
import ReadAloud from './ReadAloud';
import { RefreshIcon } from '../shell/icons';
import HelpQr from '../loan/HelpQr';
import StartHelp from '../loan/StartHelp';
import { useSessionUntil } from '../stellar/session';
import { useMyBorderJob } from '../border/hooks';
import { unionCentre } from '../leader/unionMap';
import { useUnionMembers } from '../leader/unionMembers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Making({ jobId, onDone, onError, label = 'Making your crop plan' }) {
  const job = usePlanJob(jobId);
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (job.data?.status === 'done') onDone(job.data.plan_id);
    if (job.data?.status === 'error') onError(job.data.error);
  }, [job.data, onDone, onError]);
  // Board CropPlanMaking (CP8): the bouncing Nila logo (the same bounce as R14), then the counter and "Time passed".
  return (
    <div style={{ textAlign: 'center' }}>
      <Bouncing top={42} bottom={8} label={label} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span aria-label="Time passed" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
        <span style={muted}>Time passed</span>
      </div>
    </div>
  );
}

const secondaryBtn = { flex: 1, height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer' };

function PlanView({ plan, checked, onAccept, readOnly, crops, changing, onCrop, pending = {}, onUpdate, areaNo = (z) => z, areaName = (z) => `Area ${areaNo(z)}`, acceptLabel = 'Accept the plan' }) {
  const p = plan.plan;
  const zones = Object.keys(p.proposal);
  const seasons = p.seasons || [];
  // The table shows each season's cost as it is (executive decision 21 Oct): cash, including any part above the
  // ₹10,000 loan cap, plus machine vouchers. The cap is a note under the table, not a cut in the numbers.
  const cost = (f) => f.cash + (f.cash_above_cap || 0) + f.voucher_value;
  // A green manure is its own crop share (4 Nov): seed in cash, machine vouchers, repaid with the next crop.
  const gm = (p.soil_cover || []).filter((c) => c.finance);
  const total = [...seasons, { rows: gm }].reduce((a, s) => {
    const sum = s.rows.reduce((b, r) => ({ cash: b.cash + cost(r.finance), financed: b.financed + r.finance.cash + r.finance.voucher_value, interest: b.interest + r.finance.interest }), { cash: 0, financed: 0, interest: 0 });
    return { cash: a.cash + sum.cash, financed: a.financed + sum.financed, interest: a.interest + sum.interest };
  }, { cash: 0, financed: 0, interest: 0 });
  const above = [...seasons, { rows: gm }].reduce((a, s) => a + s.rows.reduce((b, r) => b + (r.finance.cash_above_cap || 0), 0), 0);
  const lastDue = seasons.flatMap((s) => s.rows.map((r) => r.finance.due)).sort().pop();
  const rate = (p.trees?.effective_rate_bp ?? 1250) / 100;
  const [open, setOpen] = useState(null);   // the season whose areas' crops are open
  return (
    <>
      {!readOnly && <TapLine done={checked.size} total={zones.length} />}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: C.muted, margin: '16px 0 8px' }}>Finance</h2>
      <table style={{ width: '100%', fontSize: 14, marginTop: 8, borderCollapse: 'collapse' }}>
        {/* Simplified (executive decision 21 Oct): season (its months), use it by, total — no rate column, no repay line, no tabs.
            "Use it by" (25 Oct): the season's last draw date (no floor any more: a share is usable once made). */}
        <thead><tr style={{ color: C.muted }}><td>Season</td><td>Use it by</td><td style={{ textAlign: 'right' }}>Total</td></tr></thead>
        <tbody>
          {seasons.map((s) => {
            // A green manure is counted in the season it grows in (5 Nov), as that season's crops are.
            const gmHere = gm.filter((c) => (c.slots || [])[0] === s.slot);
            const cash = [...s.rows, ...gmHere].reduce((a, r) => a + cost(r.finance), 0);
            // The season's shares: their planned sowing is one of the season's rows' (or green manures') sowing dates.
            const sows = new Set([...s.rows, ...gmHere].map((r) => r.sow).filter(Boolean));
            const by = (p.shares || []).filter((sh) => sows.has(sh.from_date) && sh.final_date).map((sh) => sh.final_date).sort().pop();
            return (
              <Fragment key={s.slot}>
              {/* A tap on the season opens its areas' crops (28 Oct, replaces Change my plan): one list per area. */}
              <tr onClick={!readOnly && onCrop ? () => setOpen(open === s.slot ? null : s.slot) : undefined} aria-expanded={open === s.slot}
                style={{ borderTop: `1px solid ${C.raised}`, cursor: !readOnly && onCrop ? 'pointer' : 'default', background: open === s.slot ? C.raised : undefined }}>
                <td style={{ padding: open === s.slot ? '8px 0 8px 10px' : '8px 0', borderRadius: open === s.slot ? '12px 0 0 0' : undefined }}><b>{SEASON[s.slot]}</b>{!readOnly && onCrop && <span style={{ color: C.muted }}> {open === s.slot ? '▴' : '▾'}</span>}
                  {gmHere.length > 0 && <><br /><span style={muted}>with green manure, repaid with the next crop</span></>}</td>
                <td>{by ? new Date(by).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                <td style={{ textAlign: 'right', paddingRight: open === s.slot ? 10 : 0, borderRadius: open === s.slot ? '0 12px 0 0' : undefined }}>{inr(cash)}</td>
              </tr>
              {open === s.slot && (
                // The season row itself grows (28 Oct): its areas' crops in the same raised box, no list over the map.
                <tr style={{ background: C.raised }}><td colSpan={3} style={{ padding: '0 10px 10px', borderRadius: '0 0 12px 12px' }}>
                  {[...zones].sort((a, b) => Number(areaNo(a)) - Number(areaNo(b))).map((z) => {
                    const r = s.rows.find((x) => zonesOf(x).includes(z));
                    return <CropSelect key={z} label={areaName(z)} crops={sortedCrops(crops)} current={pending[z]?.[s.slot] || r?.crop} currentName={r?.name} disabled={changing}
                      onPick={(key) => onCrop(z, s.slot, key)} />;
                  })}
                </td></tr>
              )}
              </Fragment>
            );
          })}
          {p.trees?.discount > 0 && (
            <tr style={{ borderTop: `1px solid ${C.raised}` }}>
              <td style={{ padding: '8px 0' }} colSpan={3}><b>Tree discount</b><br /><span style={muted}>{p.trees.discount} points off the rate ({rate}%) · trees registered</span></td>
            </tr>
          )}
          <tr style={{ borderTop: `1px solid ${C.raised}`, fontWeight: 700 }}>
            <td style={{ padding: '8px 0' }} colSpan={2}>Total cost</td>
            <td style={{ textAlign: 'right' }}>{inr(total.cash)}</td>
          </tr>
        </tbody>
      </table>
      {(() => {
        // What the totals hold (executive decision 21 Oct): hand or hired work (no union machine) is paid in cash; machine
        // hours are vouchers. Both are in the totals above.
        const rows = seasons.flatMap((s) => s.rows.map((r) => r.finance));
        const hand = rows.reduce((a, f) => a + (f.hand_work_cash || 0), 0);
        const vouchers = rows.reduce((a, f) => a + (f.voucher_value || 0), 0);
        if (!hand && !vouchers) return null;
        return (
          <Notice kind="info" title="What the totals include">
            {hand > 0 && <>{inr(hand)} in cash for work done by hand or hired, as the union has no machine for it (at reference rates). </>}
            {vouchers > 0 && <>{inr(vouchers)} in machine vouchers.</>}
          </Notice>
        );
      })()}
      {above > 0 && (
        <Notice title="Loans are capped at ₹10,000">
          Each loan (one area in one season) gives at most ₹10,000 in cash. The {inr(above)} above the cap is financed by the member contributions in Nila.
        </Notice>
      )}
      {lastDue && <p style={muted}>The loans are {inr(total.financed)}; you repay {inr(total.financed + total.interest)} in {seasons.length} parts, each 21 days after its harvest.</p>}
      {p.left_out?.length > 0 && <p style={muted}>Areas too small to plan: {p.left_out.length}.</p>}
      {/* Her changes are hard rules (21 Oct); only a hard fact refuses one, and anything the node could not read is named. */}
      {p.member_request?.not_followed?.length > 0 && (
        <Notice title="Not followed">{p.member_request.not_followed.map((n) => (n.zone
          ? `${areaName(n.zone)}${n.slot ? `, ${SEASON[n.slot] || n.slot}` : ''}${n.crop ? ` (${n.crop.replace(/_/g, ' ')})` : ''}: ${n.why}`
          : n.why || n.reason || JSON.stringify(n))).join('; ')}</Notice>
      )}
      {!readOnly && (Object.keys(pending).length
        ? <Primary disabled={changing} onClick={onUpdate}>{changing ? 'Updating…' : 'Update crop plan'}</Primary>
        : <Primary disabled={checked.size < zones.length} onClick={onAccept}>{acceptLabel}</Primary>)}
      {/* CP10: a crop is changed on its season row in the area card (28 Oct; Renew plan is on CP9). */}
    </>
  );
}

/** CP1 (board CropPlanPending): her field record is on its way. Shown while titles and the record load. */
function Pending({ map, error }) {
  // The header says what is happening (1 Nov), not the land's name; no second title.
  return (
    <Sheet map={map} landName="Getting your field record">
      <Bouncing top={40} bottom={40} label="Waiting for your record" />
      <p style={{ ...muted, textAlign: 'center' }}>This can take up to an hour.</p>
      {error && <p style={muted}>Your field record could not be loaded. It is tried again in a moment.</p>}
    </Sheet>
  );
}

/** `forLand` (26 Oct, assist mode): a leader makes a member's crop plan with the member: the member's land
 *  { landId, recordHash, evm, account, label } instead of the signed-in person's own. Making the plan takes longer than a
 *  5-minute session, so the member's help QR is scanned only at the end, to accept it (CP11). */
/** Assist mode: the crop plan is made with the leader (26 Oct). */
function AssistPlan({ map, name, waiting }) {
  const [qr, setQr] = useState(false);
  if (qr) return <HelpQr onBack={() => setQr(false)} note="Show this to your union leader. Your leader makes your crop plan with you and reads it to you." />;
  return (
    <Sheet map={map} landName={name} title={waiting ? 'Your crop plan is with your leader' : 'Your crop plan'}>
      <p style={muted}>{waiting ? 'Your leader checks it and approves it. Your crop shares come after that.'
        : 'Your union leader makes your crop plan with you at the union office. At the end you show your QR to accept it.'}</p>
      {!waiting && <Primary onClick={() => setQr(true)}>Show your QR</Primary>}
    </Sheet>
  );
}

// What grows on each area now, from the field record (12 Nov): the map shows it on load until she has a plan. First the
// satellite reading `current_cycle` (one entry per area); an area without one takes its open cycle in `cycles` (sown,
// no harvest yet), "since <month>". A crop the reading does not know shows as "Unidentified". An area with neither
// (harvested, or never read) keeps "Area n". Name and colour from the catalogue when it lists the crop.
const words = (k) => String(k).replace(/_/g, ' ');
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sinceOf = (d) => (/^\d{4}-\d{2}/.test(d || '') ? `since ${MONTH[Number(d.slice(5, 7)) - 1]}` : undefined);
// The chip keeps the area's name on top (12 Nov) with the crop under it; every area growing something is filled: a
// crop the catalogue lists in its colour, another named crop in a neutral green, an unidentified one in grey.
const GROWING = '#7BA05B';
const UNKNOWN = '#8A94A6';
// Barren (12 Nov): nothing grows there now, so the plan may use the area at once.
const BARREN = { key: 'barren', name: 'Barren', colour: '#5B6472' };
/** The map before a plan: what grows now (growingNow), with the crops she set herself (12 Nov) on top, on every screen
 *  until the plan is made. */
function nowLabelsOf(record, crops = [], growing = {}) {
  const now = growingNow(record, crops);
  const zones = areasOf(record);
  const list = [...crops, BARREN];
  return Object.fromEntries(zones.filter((z) => now[z.zone_id] || growing[z.zone_id]).map((z, i) => {
    const c = growing[z.zone_id] && list.find((x) => x.key === growing[z.zone_id]);
    const l = now[z.zone_id] || { text: z.name || `Area ${zones.indexOf(z) + 1}` };
    return [z.zone_id, c ? { ...l, sub: `${c.name}, set by you`, colour: c.colour || GROWING, unknown: false } : l];
  }));
}

function growingNow(record, crops = []) {
  const zones = areasOf(record);
  const nameOf = (z) => zones.find((x) => x.zone_id === z)?.name || `Area ${zones.findIndex((x) => x.zone_id === z) + 1}`;
  const label = (z, key, when) => {
    const hit = key && key !== 'unknown' && (crops.find((x) => x.key === key) || crops.find((x) => key.startsWith(`${x.key}_`)));
    const unknown = !key || key === 'unknown';
    const crop = unknown ? 'Unidentified' : hit && hit.key === key ? hit.name : words(key).replace(/^./, (x) => x.toUpperCase());
    return { text: nameOf(z), sub: [crop, when].filter(Boolean).join(', '), colour: unknown ? UNKNOWN : hit?.colour || GROWING, unknown };
  };
  const out = {};
  for (const c of Array.isArray(record?.current_cycle) ? record.current_cycle : []) {
    const z = c.cluster_id ?? c.zone_id;
    if (z != null) out[z] = label(z, c.crop_type, c.stage ? words(c.stage) : sinceOf(c.sos));
  }
  const open = {};
  for (const c of Array.isArray(record?.cycles) ? record.cycles : []) {
    const z = c.zone_id;
    if (z == null || out[z] || c.eos) continue;
    if (!open[z] || (c.sos || '') > (open[z].sos || '')) open[z] = c;
  }
  for (const [z, c] of Object.entries(open)) out[z] = label(z, c.crop_type, sinceOf(c.sos));
  return out;
}

export default function CropPlanFlow({ forLand, self = false } = {}) {
  // A member's plan made by the leader (26 Oct): the member's name on every card, no settings button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const Sheet = useMemo(() => (forLand ? function MemberSheet(p) { return <BaseSheet {...p} noSettings />; } : BaseSheet), [!!forLand]);
  const s = useNilaSigner();
  const qc = useQueryClient();
  const [titleQr, setTitleQr] = useState(false);
  const titles = useLandTitles(forLand ? undefined : s?.evmAddress);
  // A title on Stellar only (the demo writes new titles there, 21 Oct): used when she has none on Polygon.
  const stellarTitles = useStellarTitles(forLand ? null : s);
  const onPolygon = !forLand && (titles.data || []).length > 0;
  const stellarTitle = forLand ? { title_id: forLand.landId, record_hash: forLand.recordHash } : !onPolygon ? stellarTitles.data?.[0] : undefined;
  const landId = forLand ? forLand.landId : onPolygon ? titles.data[0] : stellarTitle?.title_id;
  const current = useCropPlan(landId);
  // Extend, not update (25 Oct): the approved plan and its extensions, shown as one once active.
  const chainQ = useCropChain(landId);
  const extend = useExtendPlan(landId);
  const catalogue = useCropCatalogue();
  const field = useFieldRecord(landId, forLand ? forLand.evm : s?.evmAddress, stellarTitle ? stellarTitle.record_hash || '' : undefined);
  const record = field.data?.record;
  const submit = useSubmitIntake(landId);
  const accept = useAcceptPlan(landId);
  const sessionUntil = useSessionUntil(forLand?.account);
  const [scanToAccept, setScanToAccept] = useState(false);
  const mint = useMintCropShares();
  const approve = useApprovePlan();
  // Assist mode (26 Oct): the leader made the plan, so the member's scan at CP11 is the whole consent: accept, approve
  // and make the crop shares in one go (no separate L12). The leader's own plan likewise (29 Oct): the leader's "I accept"
  // approves it and makes the crop shares. A self-mode member's own plan still waits for a leader (L12).
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState();
  // The N sequence shows from the scan (or "I accept") on, through accept and approve to the last crop share (29 Oct:
  // it showed only from the mint, so the plan flashed back in between).
  const makeMine = async () => {
    setError(undefined); setMakeError(undefined); setMaking(true);
    try {
      if (plan.status !== 'accepted') await accept.mutateAsync(plan);
      await approve.mutateAsync({ planId: plan.id, decision: 'approve' });
    } catch (e) { setMakeError(e.message); return; }
    try {
      await mint.run(plan.id);
      qc.invalidateQueries({ queryKey: qkPlan.plan(landId) });
      qc.invalidateQueries({ queryKey: ['stellar', 'unionMembers'] });
    } catch (e) { setError(e.message); }
  };
  // The member's scan is the acceptance (26 Oct): no CP11 conditions step in assist mode.
  const toTerms = () => {
    if (!forLand) { setStep('terms'); return; }
    if (sessionUntil > Date.now() / 1000 + 10) makeMine(); else setScanToAccept(true);
  };
  const when = useRef(new Date());
  const revise = useRevisePlan();
  const discard = useDiscardPlan(landId);
  const renew = async () => {
    setError();
    try { await discard.mutateAsync(current.data.id); setCrops(new Set()); setRole(); setCows(); setMonths([]); setFarmCash(''); setJobId(); setStep(null); } catch (e) { setError(e.message); }
  };
  // An approved plan whose crop shares are already on her wallet opens on "made", not on "Make".
  const approvedId = current.data?.approval?.decision === 'approve' ? current.data.id : undefined;
  const checkMinted = mint.check;
  const checkedFor = useRef();
  useEffect(() => {   // per approved plan: check now, then every 15 s until her crop shares are made (the union mints them)
    if (!approvedId || making) return undefined;
    if (checkedFor.current !== approvedId) { checkedFor.current = approvedId; checkMinted(approvedId); }
    if (mint.status === 'done' || mint.status === 'partial') return undefined;
    const t = setInterval(() => checkMinted(approvedId), 15_000);
    return () => clearInterval(t);
  }, [approvedId, checkMinted, mint.status, making]);
  const [step, setStep] = useState(null);
  const [crops, setCrops] = useState(new Set());
  const [role, setRole] = useState();
  const [cows, setCows] = useState();
  const [months, setMonths] = useState([]);
  const [farmCash, setFarmCash] = useState('');
  const [basisOpen, setBasisOpen] = useState(false);
  const [lang, setLang] = useState('ta');   // CP9's language (4 Nov): Tamil when the plan has it
  const [removing, setRemoving] = useState(null);
  const [leftOut, setLeftOut] = useState(() => new Set());   // areas left out before the plan is made (5 Nov)
  // What grows now, first (12 Nov): she sets the crop on every area the satellite could not identify before the plan
  // is made (area → crop key); sent with the intake as `growing`.
  const [growing, setGrowing] = useState({});
  const [growArea, setGrowArea] = useState(null);
  const [cashGiven, setCashGiven] = useState(null);   // CP7b's answer, sent with the leave-out step   // the area asked to remove (CP10 confirm)
  const [afterMake, setAfterMake] = useState('why');
  const [jobId, setJobId] = useState();
  const [pending, setPending] = useState({});   // crops picked, not sent yet (CP10, 28 Oct)
  const [madeId, setMadeId] = useState();   // the plan the last job made: CP9 waits until the latest plan is that one
  const [error, setError] = useState();
  const [read, setRead] = useState(false);
  // CP10: the season shown (overview), the area picked, and her area accepts until CP11 accepts them on the node.
  const [season, setSeason] = useState(0);
  const [area, setArea] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const planId = current.data?.id;
  useEffect(() => { setChecked(new Set(Object.keys(current.data?.accepted || {}))); setArea(null); setSeason(0); }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Approved: the chain as one plan (its seasons and shares, 25 Oct); a waiting extension shows as itself.
  const plan = current.data?.approval?.decision === 'approve' ? mergedPlan(chainQ.data, current.data) : current.data;
  const myShares = useMyShares();   // CP13: a crop share she can collect now is a to-do
  // CP13 opens on the season she is in today (CP10 on the first).
  const approved = plan?.approval?.decision === 'approve';
  useEffect(() => { if (approved) setSeason(currentSeason(plan.plan.seasons || [])); }, [planId, approved]); // eslint-disable-line react-hooks/exhaustive-deps
  // Her land's name comes from the land title's metadata (not the record), "Land <id>" only when it has none.
  const titleName = useTitleName(landId, onPolygon, stellarTitle);
  const name = (forLand && forLand.label) || titleName || (landId != null ? `Land ${landId}` : 'Nila');
  const zoneOrder = useMemo(() => areasOf(record).map((z) => z.zone_id), [record]);
  const areaNo = useCallback((zone) => (zoneOrder.indexOf(zone) + 1) || zone, [zoneOrder]);
  // The area's name from the record (12 Nov: after its field, "field in 3 · 2"), else "Area n".
  const zoneNames = useMemo(() => Object.fromEntries(areasOf(record).filter((z) => z.name).map((z) => [z.zone_id, z.name])), [record]);
  const areaName = useCallback((zone) => zoneNames[zone] || `Area ${areaNo(zone)}`, [zoneNames, areaNo]);
  // The map is the list (CP10): each area's chip shows what grows there in the season shown, or just "Area n".
  const labels = useMemo(() => {
    const ss = plan?.plan?.seasons;
    if (!ss?.length) return nowLabelsOf(record, catalogue.data?.crops, growing);
    // Areas she left out (the step before the plan, or CP10's bin; 5 Nov) are not on the plan's map.
    const gone = Object.entries(plan.plan.left_out_reasons || {}).filter(([, why]) => why === 'removed by her')
      .map(([z]) => [z, { gone: true }]);
    const i = Math.min(season, ss.length - 1);
    const rows = rowsInSeason(ss, i);
    // Crops picked and not sent yet (28 Oct): the area shows the picked crop, in its colour.
    const slotNow = ss[i].slot;
    const pickedHere = (z) => pending[z]?.[slotNow] && (catalogue.data?.crops || []).find((c) => c.key === pending[z][slotNow]);
    // A merged row (same crop on several areas, 21 Oct): its harvest on the first area's chip, "with Area n" on the others.
    const out = Object.fromEntries(Object.entries(rows).map(([z, r]) => [z, pickedHere(z) ? { text: pickedHere(z).name, sub: 'changed',
      colour: pickedHere(z).colour, acc: false } : { text: r.name,
      sub: r.off_catalogue ? 'not in the crop list' : z !== zonesOf(r)[0] ? `with ${areaName(zonesOf(r)[0])}` : fmtKg(r.kg),
      colour: r.colour, acc: checked.has(z) }]));
    // An area with no crop that season but a pick for it.
    for (const z of Object.keys(pending)) if (!out[z] && pickedHere(z)) out[z] = { text: pickedHere(z).name, sub: 'changed', colour: pickedHere(z).colour };
    // A soil cover in this season (no bare soil in the dry months, 21 Oct), where no crop is on the area then.
    const slot = ss[i].slot;
    for (const c of plan.plan.soil_cover || []) {
      if (out[c.zone] || !(c.slots || []).includes(slot)) continue;
      const short = c.name.replace(/^(Mulch, then )?green manure: /i, '').replace(/ \(.*\)$/, '');
      out[c.zone] = { text: c.kind === 'bare' ? 'Bare soil' : short.charAt(0).toUpperCase() + short.slice(1),
        sub: c.kind === 'bare' ? 'erosion risk' : c.kind === 'mulch' ? 'soil cover' : 'green manure',
        colour: c.kind === 'bare' ? undefined : c.colour, soil: true, acc: checked.has(c.zone) };
    }
    return { ...out, ...Object.fromEntries(gone) };
  }, [plan, season, checked, areaNo, areaName, pending, catalogue.data, record, growing]);
  const pickable = step === 'plan' || (step == null && plan?.status === 'draft');
  const pickArea = useCallback((z) => { setArea(z); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  // CP10 keeps her areas above its season / area bar (the card starts lower there, Sheet `bar`).
  // CP13 (map-central trial, 21 Oct): a tap on an area opens its crop share in the season shown (A4/A4a).
  // A share whose sowing is over a year ahead is made later (the node defers it, 25 Oct): it does not hold the plan up.
  const deferredOnly = mint.status === 'partial' && (mint.refused || []).length > 0
    && mint.refused.every((r) => /more than a year ahead|made later/i.test(r.error || ''));
  const active = approved && (mint.status === 'done' || deferredOnly);
  const openShare = useCallback((z) => {
    const ss = plan?.plan?.seasons || [];
    const x = z && shareOn(myShares.data, ss, Math.min(season, ss.length - 1), z);
    if (x) window.location.hash = `#/cropshare/${x.token_id}`;
  }, [plan, season, myShares.data]);
  // Before the field record (CP1, 1 Nov): the land title's field outlines, as on the land title screen (A5).
  const titleShape = fieldsMap(useTitleFields(landId, onPolygon, stellarTitle, null));
  const map = record ? <AreaMap record={record} labels={labels} selected={pickable ? area : null} onSelect={pickable ? pickArea : active ? openShare : undefined}
    fitBottom={pickable ? Math.round(window.innerHeight / 2) + 72 : undefined} />
    : titleShape.record ? <AreaMap record={titleShape.record} labels={titleShape.labels} /> : null;
  const names = useMemo(() => Object.fromEntries((catalogue.data?.crops || []).map((c) => [c.key, c])), [catalogue.data]);

  // While her titles load (the Stellar list also waits for her signer), CP1's pending sheet — never "No land title"
  // before both chains have answered.
  // No title yet (28 Oct): the satellite map on the union's land behind the card, never an empty screen.
  const planApi = usePlanClient();
  const unionMembers = useUnionMembers(self && !record ? planApi : null);
  const noLandMap = <AreaMap record={null} center={unionCentre(unionMembers.data)} />;
  // Her field points already with the union (28 Oct): the title is minted from that border job (L2a–L4), never by
  // registering again.
  const myJob = useMyBorderJob();
  const openJob = myJob.data && myJob.data.status !== 'failed' && myJob.data.status !== 'minted' ? myJob.data : null;
  const titlesKnown = !!forLand || (!titles.isLoading && (onPolygon || stellarTitles.isFetched));
  // Plain loading (titles, plan, record not fetched yet) is S1 (executive decision 21 Oct); CP1's pending card is only
  // for a record that is really not there yet.
  if (making) {
    const seq = makeError ? 'failed' : { busy: 'pending', done: 'success', failed: 'failed', partial: 'failed' }[mint.status] || 'pending';
    if (seq !== 'success') when.current = new Date();
    const tx = { status: seq, label: 'Making the crop shares', when: when.current,
      rows: [['Crop shares', mint.total ? `${mint.done || 0} of ${mint.total}` : '…'], ['Member', forLand?.label || `Land ${landId}`]],
      reason: makeError || (mint.refused || []).map((r) => `${r.crop || 'Crop share'}: ${r.error}`).join(' · ') || mint.error || 'Not made' };
    return <TxScreens tx={tx} network="Polygon" onClose={() => { window.location.hash = '#/members'; }}
      onRetry={() => (makeError ? makeMine() : mint.run(plan.id))} />;
  }
  if (scanToAccept) {
    return (
      <StartHelp member={forLand.account} label={forLand.label} onBack={() => setScanToAccept(false)}
        onStarted={async () => { setScanToAccept(false); await makeMine(); }} />
    );
  }
  // The Privy login failed (busy, 429): no Stellar wallet, so her titles cannot be read; say so instead of S1's
  // "Loading is slow" until PrivyRoot's next try (1–5 minutes).
  if (!titlesKnown && s?.error && !s?.ready) {
    return (
      <Sheet map={noLandMap} landName="Connecting your wallet">
        <p style={muted}>Your wallet did not connect: the login service is busy. Nila tries again by itself in a few minutes; keep the app open.</p>
      </Sheet>
    );
  }
  if (!titlesKnown || current.isLoading) return <Loading />;
  if (titles.data && !titles.data.length && !stellarTitle) {
    const refresh = () => { titles.refetch(); stellarTitles.refetch(); };
    const busy = titles.isFetching || stellarTitles.isFetching;
    // The leader maps every title (executive decision 3 Nov): a member, in assist or self mode, mints nothing; the leader
    // takes the field points, does the borders and the mint. Only a leader's own title starts here (`self`).
    const helped = !self;
    // Her help QR with her Polygon address (3 Nov, both modes): the leader scans it on Add a member (L14).
    if (helped && titleQr) {
      return <HelpQr withPolygon onBack={() => setTitleQr(false)}
        note="Show this to your union leader at the office. Your leader takes your field points, maps your land and mints your land title." />;
    }
    return (
      <Sheet map={noLandMap} landName="No land title yet" actions={(
        <RoundButton label="Refresh" onClick={busy ? undefined : refresh}>
          <style>{'@keyframes nila-spin{to{transform:rotate(360deg)}}'}</style>
          <span style={{ display: 'flex', animation: busy ? 'nila-spin 900ms linear infinite' : 'none' }}><RefreshIcon color={C.text} /></span>
        </RoundButton>
      )}>
        <p style={muted}>{openJob
          ? (self ? 'Your field points are with the union. Check the borders and mint your land title.' : 'Your field points are with the union. Your leader mints your land title.')
          : helped ? 'Your leader takes the field points at your farm and mints your land title. Your crop plan starts when it is ready.'
            : 'Your crop plan starts when your land title is ready.'}</p>
        {(titles.isError || stellarTitles.isError) && <p style={{ ...muted, color: C.coral }}>Your land title could not be loaded.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {openJob
            ? self && <Primary onClick={() => { window.location.hash = `#/tasks/border/${openJob.id}`; }}>{openJob.status === 'ready' ? 'Check borders and mint' : 'See my fields'}</Primary>
            : helped ? <Primary onClick={() => setTitleQr(true)}>Show your QR</Primary>
              : <Primary onClick={() => { window.location.hash = '#/crop/register'; }}>Mint a new land title</Primary>}
        </div>
      </Sheet>
    );
  }
  // Assist mode (26 Oct): the member's phone makes no crop plan; the leader makes it with the member at the office, in a
  // session from the member's help QR. Until the plan is approved the phone says so and shows the help QR.
  // No QR before the field record (3 Nov): a plan made without it is a plan made on nothing, so the member waits on CP1.
  const recordReady = !!record && areasOf(record).length > 0;
  if (!forLand && !self && assisted() && !approved && !plan && !recordReady && !field.isLoading) return <Pending map={map} error={field.error} />;
  if (!forLand && !self && assisted() && !approved) return <AssistPlan map={map} name={name} waiting={plan?.status === 'accepted'} />;
  const at = step ?? (plan?.status === 'draft' ? 'plan' : plan?.status === 'accepted' ? 'waiting' : 'record');
  const back = (to) => () => setStep(to);
  // Crops picked for an area in a season (28 Oct, replaces Change my plan's free text) wait in `pending` (zone → slot →
  // crop key); Update crop plan sends them all as one new version, and the node re-plans around them (her change is
  // followed unless a hard fact refuses it). Picking the crop the plan has drops the pick.
  const changeCrop = (zone, slot, key) => setPending((p0) => {
    const row = (plan?.plan?.seasons || []).find((x) => x.slot === slot)?.rows.find((r) => zonesOf(r).includes(zone));
    const z = { ...(p0[zone] || {}) };
    if (row?.crop === key) delete z[slot]; else z[slot] = key;
    const next = { ...p0, [zone]: z };
    if (!Object.keys(z).length) delete next[zone];
    return next;
  });
  const updatePlan = async () => {
    setError(undefined);
    try {
      const res = await revise.mutateAsync({ planId: plan.id, note: '', changes: pending });
      setPending({}); setAfterMake('plan'); setJobId(res.job_id); setStep('making');
    } catch (e) { setError(e.message); }
  };

  if (at === 'record') {
    // CP1 / CP2 (boards CropPlanPending, CropPlanPending-n9mn-kewp). DESIGN GAPs: no "Main issues" (the
    // oracle detects none yet, design Q20), no "Add your trees and water sources" row (A5 not built).
    if (field.isLoading) return <Loading />;
    // The leader with a member (forLand): the member's help QR is already scanned and a 5-minute session would run
    // out long before the record (up to an hour), so an N-board says to try again later and closes itself (28 Oct).
    if (!recordReady && forLand) {
      return (
        <NoticeScreen title="The field record is not ready yet" onClose={forLand.onClose}
          text="Nila is still building this member's field record from the satellite images. This can take up to an hour. Make the crop plan later; the member shows their QR again then."
          rows={[['Member', forLand.label || name], ['Land title', String(forLand.landId)]]} />
      );
    }
    if (!recordReady) return <Pending map={map} error={field.error} />;
    const sum = summarize(record);
    // First what grows now (12 Nov): every area the satellite could not identify needs its crop before the plan.
    const now = growingNow(record, catalogue.data?.crops);
    // Barren (12 Nov): nothing grows there now, so the plan may use the area at once.
    const cropList = [...sortedCrops(catalogue.data?.crops || []), BARREN];
    const toSet = Object.keys(now).filter((z) => now[z].unknown && !growing[z]);
    // An empty area can take a crop too (12 Nov): she may have just sown it, which no image shows yet. Optional there;
    // an unidentified area must be set. A crop the satellite named is not asked again.
    const zoneIds = areasOf(record).map((z) => z.zone_id);
    const nameOf = (z) => areasOf(record).find((x) => x.zone_id === z)?.name || `Area ${zoneIds.indexOf(z) + 1}`;
    const nowLabels = nowLabelsOf(record, catalogue.data?.crops, growing);
    const settable = (z) => !!z && (!now[z] || !!now[z].unknown);
    const growingCount = zoneIds.filter((z) => (growing[z] ? growing[z] !== 'barren' : !!now[z])).length;
    // Option A (12 Nov, as G2's top block): the record's facts as rows, a line, then the button.
    return (
      <Sheet map={<AreaMap record={record} labels={nowLabels} selected={growArea} onSelect={(z) => setGrowArea(settable(z) ? z : null)} />}
        landName={name} title={forLand ? 'Field record' : 'Your field record'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sum.from && <KV k="Period" v={`${sum.from} – ${sum.to}`} />}
          <KV k="Cultivations" v={sum.cultivations} />
          <KV k="Areas" v={`${sum.areas}${growingCount ? ` · ${growingCount} growing` : ''}`} />
        </div>
        <hr style={{ height: 1, background: C.raised, border: 0, margin: '16px 0 0' }} />
        {growArea && settable(growArea) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 0 8px' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>What grows on {nowLabels[growArea]?.text || nameOf(growArea)} now?</span>
            <CropSelect crops={cropList} current={growing[growArea]}
              onPick={(key) => { setGrowing((g) => ({ ...g, [growArea]: key })); setGrowArea(null); }} />
          </div>
        )}
        <Primary disabled={toSet.length > 0} onClick={() => setStep('intro')}>{forLand ? 'Make the crop plan' : 'Make my crop plan'}</Primary>
        {/* Under the button (12 Nov, option B): why it waits. */}
        {!growArea && toSet.length > 0 && (
          <p role="note" style={{ ...muted, textAlign: 'center', marginTop: 8 }}>Tap the grey areas to set what is growing there at this moment.</p>
        )}
      </Sheet>
    );
  }
  if (at === 'intro') {
    return (
      <Sheet map={map} landName={name} title="What is a crop plan?">
        <Steps items={[
          ['Income all year', 'Different crops are ready at different times, so money comes in through the year, not once.'],
          ['Money in the hard months', 'You tell us which months are hard. The plan brings sales and cash to those months.'],
          ['Better soil, bigger harvests', 'Changing crops and keeping the soil covered makes it richer. Harvests grow year after year.'],
        ]} />
        <p style={{ ...muted, textAlign: 'center' }}>First, 4 short questions.</p>
        <Primary onClick={() => setStep('crops')}>Start</Primary>
      </Sheet>
    );
  }
  if (at === 'crops') {
    return <CropsStep map={map} name={name} onBack={back('intro')} record={record} catalogue={catalogue.data?.crops || []}
      crops={crops} setCrops={setCrops} onContinue={() => setStep('role')} />;
  }
  if (at === 'role') {
    return (
      <Sheet map={map} landName={name} onBack={back('crops')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>2 / 5</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>What is this land for your family?</h1>
        {Object.keys(LAND_ROLE).map((k) => <Choice key={k} on={role === k} onClick={() => { setRole(k); setStep('cows'); }}>{k}</Choice>)}
      </Sheet>
    );
  }
  if (at === 'cows') {
    return (
      <Sheet map={map} landName={name} onBack={back('role')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>3 / 5</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>How many cows does this land feed?</h1>
        {Object.keys(COWS).map((k) => <Choice key={k} on={cows === k} onClick={() => { setCows(k); setStep('months'); }}>{k}</Choice>)}
      </Sheet>
    );
  }
  if (at === 'months') {
    const go = () => { setError(undefined); setStep('farmcash'); };
    return (
      <Sheet map={map} landName={name} onBack={back('cows')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>4 / 5</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>In which months does your family need money most?</h1>
        <p style={{ ...muted, textAlign: 'center' }}>Choose up to 3 months.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {MONTHS.map((m, i) => {
            const on = months.includes(i + 1);
            return (
              <button key={m} type="button" aria-pressed={on} disabled={!on && months.length >= 3}
                onClick={() => setMonths((x) => (on ? x.filter((v) => v !== i + 1) : [...x, i + 1]))}
                style={{ height: 44, borderRadius: 12, border: 0, fontWeight: 700, background: on ? C.accent : C.raised, color: on ? C.ink : C.text, opacity: !on && months.length >= 3 ? 0.5 : 1 }}>{m}</button>
            );
          })}
        </div>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={submit.isPending} onClick={go}>Continue</Primary>
      </Sheet>
    );
  }
  if (at === 'farmcash') {
    // CP7b, her farm business's money now (executive decision 21 Oct). DESIGN GAP: no board. Optional and skippable:
    // skipped = no farm_cash_now at all (the cash flow starts at ₹0; nothing assumes or mentions her farm's money).
    // Then the areas to leave out (5 Nov), the last step before the plan is made.
    const make = (amount) => { setError(undefined); setCashGiven(amount); setLeftOut(new Set()); setStep('leaveout'); };
    const n = Number(farmCash.replace(/[^0-9]/g, ''));
    const given = farmCash.trim() !== '' && Number.isFinite(n);
    return (
      <Sheet map={map} landName={name} onBack={back('months')}>
        <p style={{ ...muted, textAlign: 'center', margin: 0 }}>5 / 5</p>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Does your farm business have money now?</h1>
        <p style={{ ...muted, textAlign: 'center' }}>For example from a harvest you just sold. Optional, only used for your plan.</p>
        <label htmlFor="farm-cash" style={{ display: 'block', fontSize: 14, fontWeight: 700, margin: '8px 0' }}>Farm money now (₹)</label>
        <input id="farm-cash" inputMode="numeric" value={farmCash} placeholder="0"
          onChange={(e) => setFarmCash(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          style={{ width: '100%', height: 44, boxSizing: 'border-box', borderRadius: 12, border: 0, padding: '0 16px', fontSize: 16,
            fontFamily: 'inherit', background: C.raised, color: C.text }} />
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" disabled={submit.isPending} onClick={() => make(null)} style={{ ...secondaryBtn, opacity: submit.isPending ? 0.5 : 1 }}>Skip</button>
          <button type="button" disabled={submit.isPending || !given} onClick={() => make(n)} style={{ ...secondaryBtn, background: C.accent, color: C.ink, opacity: submit.isPending || !given ? 0.5 : 1 }}>Continue</button>
        </div>
      </Sheet>
    );
  }
  if (at === 'leaveout') {
    // Leave out areas (executive decision 5 Nov; DESIGN GAP: no board): just before the plan is made, she taps the
    // areas with buildings, a road or a path; they get no crops in this plan. Asked again at every new plan (areas
    // change), sent with this plan only, never stored with her land; her land title keeps its acres.
    const make = async () => {
      setError(undefined);
      try {
        const intake = { crops: [...crops], cows: COWS[cows], hard_months: months, land_role: LAND_ROLE[role], growing };
        if (cashGiven != null) intake.farm_cash_now = cashGiven;
        const r = await submit.mutateAsync({ intake, exclude: [...leftOut] });
        setJobId(r.job_id); setStep('making');
      } catch (e) { setError(e.message); }
    };
    const toggle = (z) => z && setLeftOut((x) => { const y = new Set(x); if (y.has(z)) y.delete(z); else y.add(z); return y; });
    const outLabels = Object.fromEntries(zoneOrder.map((z, i) => [z, leftOut.has(z)
      ? { text: 'Left out', sub: areaName(z), colour: '#8A94A6' } : { text: areaName(z) }]));
    const all = zoneOrder.length > 0 && zoneOrder.every((z) => leftOut.has(z));
    return (
      <Sheet map={record ? <AreaMap record={record} labels={outLabels} onSelect={toggle}
        fitBottom={Math.round(window.innerHeight / 2) + 72} /> : map} landName={name} onBack={back('farmcash')}>
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Leave out areas you do not farm</h1>
        <p style={{ ...muted, textAlign: 'center' }}>Tap an area with a house, a shed, a road or a path. It gets no crops in this plan. Tap it again to keep it.</p>
        <p style={{ ...muted, textAlign: 'center', margin: '4px 0 0' }}>{leftOut.size ? `${leftOut.size} of ${zoneOrder.length} areas left out` : 'No areas left out'}</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={submit.isPending || all} onClick={make}>{forLand ? 'Make the crop plan' : 'Make my crop plan'}</Primary>
      </Sheet>
    );
  }
  if (at === 'making') {
    return (
      // No farm name over the wait (26 Oct): the card's header says whose plan is made (a leader for a member: the name).
      <Sheet map={map} title={forLand ? `Making the crop plan for ${forLand.label || 'the member'}` : 'Making your crop plan'} noSettings>
        <Making label={forLand ? `Making the crop plan for ${forLand.label || 'the member'}` : undefined} jobId={jobId} onDone={(pid) => { setMadeId(pid); qc.invalidateQueries({ queryKey: qkPlan.plan(landId) }); setStep(afterMake); setAfterMake('why'); }}
          onError={(e) => { setError(e); setStep('leaveout'); }} />
      </Sheet>
    );
  }
  if (at === 'why') {
    // After a new plan or a change, the cached plan is the old one until the refetch lands: show the new one only.
    const fresh = !madeId || plan?.id === madeId;
    // Tamil (Anand, 4 Nov): the LLM's Tamil version, shown first when there is one; English one tap away.
    const ta = fresh ? plan?.plan?.explain?.ta?.text : null;
    const text = ta && lang === 'ta' ? ta : fresh ? plan?.plan?.explain?.text || plan?.plan?.proposal_why : null;
    return (
      <Sheet map={map} landName={name}>
        {/* The info button opens "What this plan is based on" (21 Oct): the node's plan.basis, by code. */}
        <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          Why this plan{fresh && plan && <InfoButton label="What this plan is based on" onClick={() => setBasisOpen(true)} />}
        </h1>
        {text ? <p style={{ lineHeight: 1.5 }}>{text}</p> : <p style={muted}>…</p>}
        {ta && (
          <button type="button" onClick={() => setLang((l) => (l === 'ta' ? 'en' : 'ta'))}
            style={{ background: 'none', border: 0, padding: 0, color: C.accent, fontFamily: FONT, fontSize: 14, cursor: 'pointer' }}>
            {lang === 'ta' ? 'In English' : 'தமிழில்'}
          </button>
        )}
        {text && <ReadAloud text={text} lang={ta && lang === 'ta' ? 'ta-IN' : 'en-IN'} />}
        {basisOpen && <BasisDrawer basis={plan?.plan?.basis} onClose={() => setBasisOpen(false)} />}
        <Primary disabled={!fresh} onClick={() => setStep('plan')}>See my plan</Primary>
        {/* Renew plan (moved from CP10, executive decision 21 Oct): her draft is removed and she starts again on CP1. */}
        {plan?.status === 'draft' && (
          <button type="button" onClick={renew} disabled={discard.isPending} style={{ ...secondaryBtn, width: '100%', marginTop: 8, opacity: discard.isPending ? 0.5 : 1 }}>
            {discard.isPending ? 'Removing…' : 'Renew plan'}
          </button>
        )}
        {error && <p style={{ ...muted, color: C.coral }}>{error}</p>}
      </Sheet>
    );
  }
  if (at === 'plan' && plan) {
    const ss = plan.plan.seasons || [];
    const zones = zoneOrder.filter((z) => plan.plan.proposal[z]).concat(Object.keys(plan.plan.proposal).filter((z) => !zoneOrder.includes(z)));
    const readOnly = plan.status !== 'draft';
    const step1 = (d) => { const k = zones.indexOf(area); pickArea(zones[(k + d + zones.length) % zones.length]); };
    const bar = area
      ? <SlideBar label={<><b>{areaName(area)}</b> · {yearLabel(ss)}</>} prevLabel="Previous area" nextLabel="Next area" onPrev={() => step1(-1)} onNext={() => step1(1)} />
      : ss.length > 0 && <SlideBar label={seasonLabel(ss[Math.min(season, ss.length - 1)], Math.min(season, ss.length - 1))} prevLabel="Previous season" nextLabel="Next season"
        onPrev={() => setSeason((i) => (i + ss.length - 1) % ss.length)} onNext={() => setSeason((i) => (i + 1) % ss.length)} />;
    const next = zones.find((z) => z !== area && !checked.has(z));
    return (
      <Sheet map={map} landName={name} bar={bar} resetKey={area || ''} onBack={back('why')}>
        {area ? (
          <AreaCard plan={plan} zone={area} name={areaName(area)} record={record} area={areasOf(record).find((z) => z.zone_id === area)}
            accepted={checked.has(area)} total={zones.length} done={checked.size} readOnly={readOnly}
            nextName={next ? areaName(next) : null} onNext={() => pickArea(next)} onAll={toTerms} acceptLabel={forLand ? 'Scan the member\'s QR to accept' : undefined}
            onBack={() => pickArea(null)}
            onAccept={() => { const n = new Set(checked); n.add(area); setChecked(n); pickArea(zones.find((z) => !n.has(z)) || null); }}
            crops={catalogue.data?.crops} changing={revise.isPending} onCrop={(r, key) => changeCrop(area, r.slot, key)}
            picked={pending[area] || {}} onUpdate={updatePlan}
            onRemove={() => setRemoving(area)} />
        ) : (
          <PlanView plan={plan} checked={checked} areaNo={areaNo} areaName={areaName} onAccept={toTerms} readOnly={readOnly}
            crops={catalogue.data?.crops} changing={revise.isPending} onCrop={changeCrop} pending={pending} onUpdate={updatePlan}
            acceptLabel={forLand ? 'Scan the member\'s QR to accept' : undefined} />
        )}
        {error && <p style={{ color: C.coral }}>{error}</p>}
        {removing && (() => {
          // CP10 remove-area confirm (21 Oct): the node removes it by code (no Claude call).
          const label = areaName(removing);
          const remove = async () => {
            setError(undefined);
            try {
              const r = await revise.mutateAsync({ planId: plan.id, note: '', changes: {}, remove: [removing] });
              setChecked((c) => { const n = new Set(c); n.delete(removing); return n; });
              setRemoving(null); pickArea(null); setAfterMake('plan'); setJobId(r.job_id); setStep('making');
            } catch (e) { setError(e.message); setRemoving(null); }
          };
          return (
            <Drawer title={`Remove ${label} from your plan?`} onClose={() => setRemoving(null)}
              actions={[{ label: revise.isPending ? 'Removing…' : 'Remove', primary: true, disabled: revise.isPending, onClick: remove },
                { label: 'Cancel', onClick: () => setRemoving(null) }]}>
              <p style={{ ...muted, margin: 0 }}>No crops, loans or vouchers are planned on it. You can add it back by renewing the plan.</p>
            </Drawer>
          );
        })()}
      </Sheet>
    );
  }
  if (at === 'terms' && plan) {
    // CP11 (board CropPlanTerms): the money chart, the two conditions, read-and-accept. The card scrolls inside.
    const go = async () => {
      setError(undefined);
      // The leader accepts for the member only in the member's session: scan the help QR first (26 Oct).
      if (forLand && !(sessionUntil > Date.now() / 1000 + 10)) { setScanToAccept(true); return; }
      if (forLand || self) { await makeMine(); return; }
      try { await accept.mutateAsync(plan); setStep('waiting'); } catch (e) { setError(e.message); }
    };
    return (
      <Sheet map={map} landName={name} title="Before you accept your crop plan" onBack={back('plan')} scroll>
        <MoneyChart plan={plan} />
        {/* What the plan means for her (21 Oct): the node's consequences, code-computed; Claude's retelling above them. */}
        {plan.plan.consequences?.length > 0 && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 0' }}>What this plan means for you</h2>
            {plan.plan.explain?.means && <p style={{ ...muted, margin: '4px 0 0' }}>{plan.plan.explain.means}</p>}
            {plan.plan.consequences.map((c) => (
              <Notice key={c.kind + c.text} kind={c.severity === 'warn' ? 'warn' : 'info'} title={c.title}>{c.text}</Notice>
            ))}
          </>
        )}
        <Notice title="Estimates, not guarantees">Yield, sales and cash flow are estimated from your field record and can contain errors. Vouchers and cash depend on available funds: Nila and your union cannot guarantee them.</Notice>
        <Notice kind="info" title="Amounts can be changed">You can change your cash and voucher amounts together with your union leaders.</Notice>
        <CheckRow on={read} onClick={() => setRead((r) => !r)} style={{ marginTop: 14 }}>I have read these conditions</CheckRow>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <button type="button" disabled={!read || accept.isPending} aria-disabled={!read} onClick={go} style={{
          width: '100%', height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', marginTop: 14,
          color: read ? C.ink : C.muted, background: read ? C.accent : C.raised, cursor: read ? 'pointer' : 'not-allowed' }}>{forLand ? 'Scan the member\'s QR and accept' : 'I accept'}</button>
      </Sheet>
    );
  }
  // CP12: the leader approves next (P4b mints after the approval).
  const ap = plan?.approval;
  if (ap?.decision === 'deny') {
    return (
      <Sheet map={map} landName={name} title="Your leader denied your plan">
        <p style={muted}>{[ap.reason, ap.note].filter(Boolean).join('. ')}</p>
        <Primary onClick={() => setStep('intro')}>Make a new plan</Primary>
      </Sheet>
    );
  }
  if (ap?.decision === 'approve') {
    // The union mints her crop shares at the approval (executive decision 21 Oct): her app only waits for them.
    if (mint.status === 'done' || deferredOnly) {
      // CP13's season bar (board CropPlanActive): it opens on the season she is in; the map's chips follow it.
      const ss = plan.plan.seasons || [];
      const shown = Math.min(season, Math.max(0, ss.length - 1));
      const bar = ss.length > 0 && <SlideBar label={seasonLabel(ss[shown], shown)} prevLabel="Previous season" nextLabel="Next season"
        onPrev={() => setSeason((i) => (i + ss.length - 1) % ss.length)} onNext={() => setSeason((i) => (i + 1) % ss.length)} />;
      return (
        <Sheet map={map} landName={name} bar={bar}>
          <ActivePlan plan={plan} areaNo={areaNo} areaName={areaName} season={shown} shares={myShares.data} assist={!self && assisted()}
            canExtend={chainQ.data?.pending ? [] : chainQ.data?.can_extend || []} extending={extend.isPending} extendError={error}
            onExtend={async () => {
              setError(undefined);
              try {
                const r = await extend.mutateAsync(plan.id);
                if (r.nothing_to_add) { chainQ.refetch(); return; }
                setAfterMake('why'); setJobId(r.job_id); setStep('making');
              } catch (e) { setError(e.message); }
            }} />
        </Sheet>
      );
    }
    if (mint.status === 'partial') {
      return (
        <Sheet map={map} landName={name} title="Your crop shares are made">
          <p style={muted}>{mint.done} of {mint.total} crop shares made.</p>
          {mint.refused?.map((r) => <p key={r.share || r.token_id} style={muted}>{r.crop || 'Crop share'}: {r.error}</p>)}
          <button type="button" onClick={() => setStep('plan')} style={{ ...secondaryBtn, width: '100%', flex: 'none', marginTop: 14 }}>See my plan</button>
        </Sheet>
      );
    }
    // DESIGN GAP: no board for "your union is making your crop shares"; CP12's waiting layout is used.
    return (
      <Sheet map={map} landName={name} title="Your plan is approved">
        <Bouncing top={24} bottom={24} label="Your union is making your crop shares" />
        <p style={{ ...muted, textAlign: 'center' }}>Your crop shares are being made by your union.{mint.total ? ` ${mint.done || 0} of ${mint.total} made.` : ''}</p>
        <button type="button" onClick={() => setStep('plan')} style={{ ...secondaryBtn, width: '100%', flex: 'none', marginTop: 14 }}>See my plan</button>
      </Sheet>
    );
  }
  if (forLand) {
    // A member's plan accepted before the one-go rule (26 Oct): approve it and make the crop shares here.
    return (
      <Sheet map={map} landName={name} title="Plan accepted">
        <p style={muted}>{forLand.label || 'The member'} accepted the plan. Approve it to make the crop shares.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={!plan?.id} onClick={makeMine}>Approve and make the crop shares</Primary>
      </Sheet>
    );
  }
  if (self) {
    // The leader's own plan accepted before the one-go rule (29 Oct): approve it and make the crop shares here.
    return (
      <Sheet map={map} landName={name} title="Plan accepted">
        <p style={muted}>You accepted your plan. Approve it to make your crop shares.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={!plan?.id} onClick={makeMine}>Approve and make the crop shares</Primary>
        <button type="button" onClick={() => setStep('plan')} style={{ ...secondaryBtn, width: '100%', flex: 'none', marginTop: 10, fontSize: 14, fontFamily: 'inherit' }}>See the plan</button>
      </Sheet>
    );
  }
  return (
    // CP12 #waiting (board CropPlanPending-590i): the amber clock in a raised circle, then a secondary "See my plan".
    <Sheet map={map} landName={name}>
      <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 9999, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '8px auto 14px' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
      </div>
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Waiting for your union leader</span>
        <span style={muted}>Your leader checks your plan. You get a message when they are ready.</span>
      </div>
      <button type="button" onClick={() => setStep('plan')} style={{ ...secondaryBtn, width: '100%', flex: 'none', marginTop: 14, fontSize: 14, fontFamily: 'inherit' }}>See my plan</button>
    </Sheet>
  );
}
