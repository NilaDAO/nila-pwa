// The crop plan (P4a): CP3 intro → CP4–CP7 intake → CP8 making → CP9 why → CP10 plan → CP11 terms →
// CP12 waiting for the leader (nila-design boards CropPlanIntro … CropPlanPending-590i). Copy from the
// boards; DESIGN GAPs: no map yet (P4c), no suggested crops on CP4 (no source), CP9 shows the
// engine's one explanation text (16 Oct), CP6/CP5 answers mapped to numbers/keys in hooks.js.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStalled } from '../shell/useStalled';
import ErrorFull from '../shell/ErrorFull';
import { Bouncing } from '../register/RegFrame';
import { Loading } from '../register/Boot';
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, R } from '../shell/tokens';
import { Steps as NumberedSteps } from '../shell/MessageSlider';   // G2's numbered steps (14 Nov)
import { KV } from '../loan/AssetParts';
import { COWS, LAND_ROLE, mergedPlan, qkPlan, useAcceptPlan, useApprovePlan, useCropCatalogue, useCropChain, useCropPlan, useDiscardPlan, useExtendPlan, useLandTitles, usePlanClient, usePlanJob, useRevisePlan, useSubmitIntake } from './hooks';
import { CheckRow, Choice, Notice, Primary, Section, Sheet, Steps, inr, muted } from './ui';
import { Sheet as BaseSheet } from './ui';
import { BasisDrawer, BasisList, Drawer, InfoButton } from './Drawer';
import { useMintCropShares } from './mint';
import { NoticeScreen, TxScreens } from '../stellar/TxStatus';
import MoneyChart, { repayment } from './MoneyChart';
import { areasOf, summarize, useFieldRecord } from './record';
import { useTitleName } from './hooks';
import { useStellarTitles } from '../stellar/hooks';
import AreaMap from './AreaMap';
import { neighboursOf } from './neighbours';
import { fieldsMap, useTitleFields } from './titleFields';
import CropsStep from './CropsStep';
import { EDIT_TEXT } from './editTexts';
import { AreaCard, CropSelect, PlanChart, ProsCons, SEASON, SlideBar, sortedCrops, fmtKg, firstRecordYear, pastLabels, planYear, rowsInSeason, yearLabel, zonesOf } from './PlanResult';
import ActivePlan, { currentSeason } from './ActivePlan';
import { seasonsCounted, seasonsOff, seasonsOn, yearSeasons } from './seasonChips';
import { areaHash } from '../shell/MapStage';
import { assisted, useMyShares } from '../loan/MyShares';
import RoundButton from '../shell/RoundButton';
import ReadAloud from './ReadAloud';
import { RefreshIcon, ScanIcon } from '../shell/icons';
import { useUnionInfo } from '../shell/SettingsParts';
import HelpQr from '../loan/HelpQr';
import { titlePending, useMyBorderJob } from '../border/hooks';
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

/** An edited plan's conditions (16 Nov): the node's hard facts, each ticked by the user before the plan is accepted.
 *  ticks: the keys ticked (`c:<condition id>`, shared with CP11's checks). */
function Conditions({ plan, ticks, onTick }) {
  const conds = plan.plan.conditions || [];
  if (!conds.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{EDIT_TEXT.conditions}</span>
      {conds.map((c) => <CheckRow key={c.id} on={ticks.has(`c:${c.id}`)} onClick={() => onTick(`c:${c.id}`)}>{c.text}</CheckRow>)}
    </div>
  );
}

/** The ids of the conditions ticked, and whether all of them are. */
const condTicks = (plan, ticks) => {
  const ids = (plan?.plan?.conditions || []).map((c) => c.id);
  const on = ids.filter((id) => ticks.has(`c:${id}`));
  return { ids: on, all: on.length === ids.length };
};

// 16 Nov: chips (the season chips, as on the approved plan) above the chart; `off` = the season indices whose chip is
// off: the chart dims them (`slots`, the chips that are on) and the money rows and the table leave them out.
function PlanView({ plan, record, checked, onAccept, readOnly, crops, changing, onCrop, pending = {}, onUpdate, areaNo = (z) => z, areaName = (z) => `Area ${areaNo(z)}`, acceptLabel = 'Accept the plan', y0, onArea, ticks = new Set(), onTick, chips, off, slots }) {
  const p = plan.plan;
  const zones = Object.keys(p.proposal);
  // A green manure is its own crop agreement (4 Nov): seed in cash, machine vouchers, repaid with the next crop.
  const { seasons, gm } = seasonsCounted(p, off);
  // What a season costs is what Nila finances (12 Nov: no ₹10,000 cap anywhere): cash plus machine vouchers.
  const cost = (f) => f.cash + f.voucher_value;
  const total = [...seasons, { rows: gm }].reduce((a, s) => {
    const sum = s.rows.reduce((b, r) => ({ cash: b.cash + cost(r.finance), financed: b.financed + r.finance.cash + r.finance.voucher_value, interest: b.interest + r.finance.interest }), { cash: 0, financed: 0, interest: 0 });
    return { cash: a.cash + sum.cash, financed: a.financed + sum.financed, interest: a.interest + sum.interest };
  }, { cash: 0, financed: 0, interest: 0 });
  const vouchersAll = [...seasons, { rows: gm }].reduce((a, s) => a + s.rows.reduce((b, r) => b + (r.finance.voucher_value || 0), 0), 0);
  const lastDue = seasons.flatMap((s) => s.rows.map((r) => r.finance.due)).sort().pop();
  const rate = (p.trees?.effective_rate_bp ?? 1250) / 100;
  const [open, setOpen] = useState(null);   // the season whose areas' crops are open
  const [money, setMoney] = useState(false); // the money details (12 Nov: folded away under three rows)
  const sales = seasons.reduce((a, se) => a + se.rows.reduce((b, r) => b + (r.value || 0), 0), 0);
  const order = [...zones].sort((a, b) => Number(areaNo(a)) - Number(areaNo(b)));
  return (
    <>
      {/* The overview (12 Nov): every area's year on one chart, three money rows, the details folded away. */}
      {chips}
      <PlanChart plan={plan} record={record} zones={order} areaName={areaName} checked={checked} y0={y0} crops={crops} pending={pending} onArea={onArea} slots={slots} />
      <hr style={{ height: 1, background: C.raised, border: 0, margin: '16px 0 12px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* 12 Nov: no ₹10,000 cap in the app; what the plan costs is what Nila finances (cash and machine vouchers). */}
        <KV k="Financed" v={inr(total.cash)} />
        <KV k="of which machine vouchers" v={inr(vouchersAll)} />
        {sales > 0 && <KV k="Sales (estimate)" v={inr(sales)} />}
      </div>
      <button type="button" onClick={() => setMoney((v) => !v)} aria-expanded={money}
        style={{ marginTop: 10, border: 0, background: 'transparent', padding: 0, color: C.accent, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {money ? 'Hide financed per season' : 'Financed per season ›'}
      </button>
      {money && <>
      <table style={{ width: '100%', fontSize: 14, marginTop: 8, borderCollapse: 'collapse' }}>
        {/* Simplified (executive decision 21 Oct): season (its months), use it by, total — no rate column, no repay line.
            Tabs (16 Nov, reverses "no tabs"): the season chips above the chart filter it, as they filter the money rows.
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
                    // A block sown more than 6 weeks ago (16 Nov) is shown locked and cannot be changed.
                    const locked = !!p.locked?.[z]?.[s.slot];
                    return <CropSelect key={z} label={locked ? `${areaName(z)} · ${EDIT_TEXT.locked}` : areaName(z)} crops={sortedCrops(crops)} current={pending[z]?.[s.slot] || r?.crop} currentName={r?.name}
                      disabled={changing || locked} onPick={(key) => onCrop(z, s.slot, key)} />;
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
            <td style={{ padding: '8px 0' }} colSpan={2}>Total financed</td>
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
      {lastDue && <p style={muted}>You repay {inr(total.cash + total.interest)} in {seasons.length} part{seasons.length === 1 ? '' : 's'}, each 21 days after its harvest.</p>}
      </>}
      {/* Her changes are hard rules (21 Oct); only a hard fact refuses one, and anything the node could not read is named. */}
      {p.member_request?.not_followed?.length > 0 && (
        <Notice title="Not followed">{p.member_request.not_followed.map((n) => (n.zone
          ? `${areaName(n.zone)}${n.slot ? `, ${SEASON[n.slot] || n.slot}` : ''}${n.crop ? ` (${n.crop.replace(/_/g, ' ')})` : ''}: ${n.why}`
          : n.why || n.reason || JSON.stringify(n))).join('; ')}</Notice>
      )}
      {/* The pros and cons of the last edit (16 Nov, Haiku; none when it is off), then its conditions to tick. */}
      <ProsCons plan={plan} />
      {!readOnly && <Conditions plan={plan} ticks={ticks} onTick={onTick} />}
      {!readOnly && (Object.keys(pending).length
        ? <Primary disabled={changing} onClick={onUpdate}>{changing ? 'Updating…' : 'Update crop plan'}</Primary>
        : <Primary disabled={!condTicks(plan, ticks).all} onClick={onAccept}>{acceptLabel}</Primary>)}
      {!readOnly && !Object.keys(pending).length && <p style={{ ...muted, textAlign: 'center', marginTop: 8 }}>Tap an area to check it.</p>}
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
 *  5-minute session; the leader accepts it without her QR (sign later, plan 050). */
/** Assist mode: the crop plan is made with the leader (26 Oct). */
function AssistPlan({ map, name, waiting }) {
  const [qr, setQr] = useState(false);
  if (qr) return <HelpQr onBack={() => setQr(false)} note="Show this to your union leader. Your leader makes your crop plan with you and reads it to you." />;
  return (
    <Sheet map={map} landName={name} title={waiting ? 'Your crop plan is with your leader' : 'Your crop plan'}>
      <p style={muted}>{waiting ? 'Your leader checks it and approves it. Your crop agreements come after that.'
        : 'Your union leader makes your crop plan with you at the union office. At the end you show your QR to accept it.'}</p>
      {!waiting && <Primary onClick={() => setQr(true)}>Show your QR</Primary>}
    </Sheet>
  );
}

// What grows on each area now, from the field record (12 Nov): the map shows it on load until she has a plan. First the
// satellite reading `current_cycle` (one entry per area); an area without one takes its open cycle in `cycles` (sown,
// no harvest yet), "since <month>". A crop the reading does not know shows as "Unidentified". An area with neither
// (harvested, or never read) keeps "Area n". Name and colour from the catalogue when it lists the crop.
// 13 Nov: the approved plan's season chips (16 Nov: also the plan overview's). The plan year's seasons (season i is in
// it) as chips, all on at first; at least one stays on. None when the year has one season. `on`: the slots on (shared).
function SeasonChips({ ss, i, on, setOn }) {
  const yearIdx = yearSeasons(ss, i);
  const onIdx = seasonsOn(ss, i, on);
  const toggleSlot = (slot) => {
    const left = onIdx.filter((k) => ss[k].slot !== slot);
    if (left.length === onIdx.length) setOn(new Set([...onIdx.map((k) => ss[k].slot), slot]));
    else if (left.length) setOn(new Set(left.map((k) => ss[k].slot)));
  };
  if (yearIdx.length < 2) return null;
  return (
    <div role="group" aria-label="Seasons shown" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      {yearIdx.map((k) => {
        const isOn = onIdx.includes(k);
        return (
          <button key={k} type="button" aria-pressed={isOn} onClick={() => toggleSlot(ss[k].slot)}
            style={{ height: 32, padding: '0 14px', borderRadius: R.round, border: 0, background: isOn ? C.accent : C.raised, color: isOn ? C.ink : C.muted,
              fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{SEASON[ss[k].slot] || `Season ${k - yearIdx[0] + 1}`}</button>
        );
      })}
    </div>
  );
}
const ALL_SLOTS = ['S1', 'S2', 'S3'];
const words = (k) => String(k).replace(/_/g, ' ');
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sinceOf = (d) => (/^\d{4}-\d{2}/.test(d || '') ? `since ${MONTH[Number(d.slice(5, 7)) - 1]}` : undefined);
// The chip keeps the area's name on top (12 Nov) with the crop under it; every area growing something is filled: a
// crop the catalogue lists in its colour, another named crop in a neutral green, an unidentified one in grey.
const GROWING = '#7BA05B';
const UNKNOWN = '#8A94A6';
// Empty (12 Nov): nothing grows there now, so the plan may use the area at once.
const EMPTY = { key: 'empty', name: 'Empty', colour: '#5B6472' };
// What grows now that is not a crop (13 Nov), in a grid above the crops, Empty first. The node leaves such an area out
// of the plan with this as its reason (plan/engine.COVERS); Empty frees it at once.
const COVERS = [EMPTY,
  { key: 'coconut', name: 'Coconut', colour: '#8C6A3F' }, { key: 'neem', name: 'Neem tree', colour: '#4F7A3A' },
  { key: 'trees', name: 'Other trees', colour: '#3E6B4A' }, { key: 'bushes', name: 'Bushes', colour: '#7A8B4F' },
  { key: 'buildings', name: 'Buildings', colour: '#9A8F86' }, { key: 'water', name: 'Water', colour: '#4A7FA6' }];
const LEFT_OUT = new Set(COVERS.filter((c) => c.key !== 'empty').map((c) => c.key));
/** The map before a plan: what grows now (growingNow), with the crops she set herself (12 Nov) on top, on every screen
 *  until the plan is made. */
function nowLabelsOf(record, crops = [], growing = {}) {
  const now = growingNow(record, crops);
  const zones = areasOf(record);
  const list = [...crops, ...COVERS];
  // Every area (13 Nov): one with no reading and nothing set by her is hatched too, so every area still to set shows.
  return Object.fromEntries(zones.map((z) => {
    const c = growing[z.zone_id] && list.find((x) => x.key === growing[z.zone_id]);
    const l = now[z.zone_id] || { text: z.name || `Area ${zones.indexOf(z) + 1}` };
    // Still to be set (13 Nov): hatched on the map, so she sees which areas are left.
    return [z.zone_id, c ? { ...l, sub: `${c.name}, set by you`, colour: c.colour || GROWING, unknown: false } : { ...l, hatch: !!l.unknown || !now[z.zone_id] }];
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

export default function CropPlanFlow({ forLand, self = false, onExit } = {}) {
  // A member's plan made by the leader (26 Oct): the member's name on every card, no settings button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // A member's plan on the leader's phone (14 Nov): every card without its own Back gets one, back where the leader
  // came from (the member's screen or Tasks).
  // The leader's own land opened from the member list (onExit) gets the same Back.
  const exit = forLand?.onClose || onExit;
  const Sheet = useMemo(() => (forLand ? function MemberSheet(p) { return <BaseSheet {...p} onBack={p.onBack || exit} noSettings />; }
    : exit ? function OwnSheet(p) { return <BaseSheet {...p} onBack={p.onBack || exit} />; } : BaseSheet), [!!forLand, !!exit]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useNilaSigner();
  const qc = useQueryClient();
  const unionInfo = useUnionInfo();
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
  const mint = useMintCropShares();
  const approve = useApprovePlan();
  // Assist mode: the leader accepts, approves and makes the crop agreements in one go (no separate L12); sign later
  // (plan 050, 15 Nov): with no scan, her consent is the codes her phone signs at a later scan of her QR (G2). The leader's own plan likewise (29 Oct): the leader's "I accept"
  // approves it and makes the crop agreements. A self-mode member's own plan still waits for a leader (L12).
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState();
  // The N sequence shows from the scan (or "I accept") on, through accept and approve to the last crop agreement (29 Oct:
  // it showed only from the mint, so the plan flashed back in between).
  const makeMine = async () => {
    setError(undefined); setMakeError(undefined); setMaking(true);
    try {
      if (plan.status !== 'accepted') await accept.mutateAsync({ plan, conditions: condTicks(plan, ticks).ids });
      await approve.mutateAsync({ planId: plan.id, decision: 'approve' });
    } catch (e) { setMakeError(e.message); return; }
    try {
      await mint.run(plan.id);
      qc.invalidateQueries({ queryKey: qkPlan.plan(landId) });
      qc.invalidateQueries({ queryKey: ['stellar', 'unionMembers'] });
    } catch (e) { setError(e.message); }
  };
  // CP11 for everyone (12 Nov): a member's plan made with the leader also goes through the accept screen and its checks.
  const toTerms = () => setStep('terms');
  const when = useRef(new Date());
  const revise = useRevisePlan();
  // An edit's job (16 Nov): polled every 2 s while it runs; done → the new plan is read, keeping the view.
  const [saveJob, setSaveJob] = useState();
  const saveQ = usePlanJob(saveJob, 2000);
  useEffect(() => {
    const st = saveQ.data?.status;
    if (!saveJob || !st || !['done', 'error', 'failed'].includes(st)) return;
    if (st === 'done') { keepView.current = true; qc.invalidateQueries({ queryKey: qkPlan.plan(landId) }); } else { setError(saveQ.data.error); setPending({}); }
    setSaveJob(undefined);
  }, [saveQ.data, saveJob]); // eslint-disable-line react-hooks/exhaustive-deps
  const discard = useDiscardPlan(landId);
  const renew = async () => {
    setError();
    try { await discard.mutateAsync(current.data.id); setCrops(new Set()); setRole(); setCows(); setMonths([]); setFarmCash(''); setJobId(); setStep(null); } catch (e) { setError(e.message); }
  };
  // An approved plan whose crop agreements are already on her wallet opens on "made", not on "Make".
  const approvedId = current.data?.approval?.decision === 'approve' ? current.data.id : undefined;
  const checkMinted = mint.check;
  const checkedFor = useRef();
  useEffect(() => {   // per approved plan: check now, then every 15 s until her crop agreements are made (the union mints them)
    if (!approvedId || making) return undefined;
    if (checkedFor.current !== approvedId) { checkedFor.current = approvedId; checkMinted(approvedId); }
    if (mint.status === 'done' || mint.status === 'partial') return undefined;
    const t = setInterval(() => checkMinted(approvedId), 15_000);
    return () => clearInterval(t);
  }, [approvedId, checkMinted, mint.status, making]);
  // A mint cut off (13 Nov: a reload just as it started): when this app is the one that mints (a leader's own plan, or a
  // member's plan made with the leader) and the check finds crop agreements not made, it continues where it stopped,
  // once per opening. Members wait for their leader, as before.
  const resumedFor = useRef();
  const runMint = mint.run;
  useEffect(() => {
    if (!approvedId || making || !(self || forLand) || mint.status !== 'waiting' || resumedFor.current === approvedId) return;
    resumedFor.current = approvedId;
    runMint(approvedId);
  }, [approvedId, making, self, forLand, mint.status, runMint]);
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
  // Areas added to a touching area before the plan (14 Nov; area → neighbour), for this plan only; the area tapped.
  const [mergeTo, setMergeTo] = useState({});
  const [pickOut, setPickOut] = useState(null);
  const [areasOk, setAreasOk] = useState(false);   // 14 Nov: she confirms the areas before Make my crop plan
  // What grows now, first (12 Nov): she sets the crop on every area the satellite could not identify before the plan
  // is made (area → crop key); sent with the intake as `growing`.
  const [growing, setGrowing] = useState({});
  // The areas card (17 Nov): [down, nonce] — a pick moves it down or up even when it was dragged since.
  const [cardLow, setCardLow] = useState([false, 0]);
  const [cashGiven, setCashGiven] = useState(null);   // CP7b's answer, sent with the leave-out step   // the area asked to remove (CP10 confirm)
  const [afterMake, setAfterMake] = useState('why');
  const [jobId, setJobId] = useState();
  const [pending, setPending] = useState({});   // crops picked, not sent yet (CP10, 28 Oct)
  const [madeId, setMadeId] = useState();   // the plan the last job made: CP9 waits until the latest plan is that one
  const [error, setError] = useState();
  const [ticks, setTicks] = useState(() => new Set());   // the accept screen's checks she has ticked
  // CP10: the season shown (overview), the area picked, and her area accepts until CP11 accepts them on the node.
  const [season, setSeason] = useState(0);
  // A plan year before the plan (12 Nov: plan history from the record); null = the plan's years.
  const [pastYear, setPastYear] = useState(null);
  // 13 Nov: the season chips switched on (CP13): they filter the tasks, the map and the bars.
  const [slotsOn, setSlotsOn] = useState(() => new Set(ALL_SLOTS));
  // 13 Nov: the approved plan (CP13) steps back through the record too; any step change leaves either screen, so reset.
  useEffect(() => { setPastYear(null); }, [step]);
  const [area, setArea] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const planId = current.data?.id;
  // 16 Nov: an edit makes a new plan; the crop picked shows until it is there (pending), and its conditions are ticked
  // again (ticks). The area stays open, so the member sees the edit.
  const keepView = useRef(false);   // an edit's new plan keeps the area and season shown
  useEffect(() => {
    setChecked(new Set(Object.keys(current.data?.accepted || {})));
    if (!keepView.current) { setArea(null); setSeason(0); }
    keepView.current = false;
    setPastYear(null); setTicks(new Set()); setPending({}); setSlotsOn(new Set(ALL_SLOTS));
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Approved: the chain as one plan (its seasons and shares, 25 Oct); a waiting extension shows as itself.
  const plan = current.data?.approval?.decision === 'approve' ? mergedPlan(chainQ.data, current.data) : current.data;
  const myShares = useMyShares();   // CP13: a crop agreement she can collect now is a to-do
  // CP13 opens on the season she is in today (CP10 on the first).
  const approved = plan?.approval?.decision === 'approve';
  useEffect(() => { if (approved) { setSeason(currentSeason(plan.plan.seasons || [])); setPastYear(null); } }, [planId, approved]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // Before a plan: what grows now; the areas she left out (the step before the plan, 5 Nov) are not drawn.
    // 14 Nov: the areas she merged are one shape here too (while the plan is made), as on the leave-out step.
    if (!ss?.length) {
      const end = (z) => { const seen = new Set([z]); let t = z; while (mergeTo[t] && !seen.has(mergeTo[t])) { t = mergeTo[t]; seen.add(t); } return t; };
      return { ...nowLabelsOf(record, catalogue.data?.crops, growing),
        ...Object.fromEntries(Object.keys(mergeTo).map((z) => [z, leftOut.has(end(z)) ? { gone: true } : { join: end(z) }])),
        ...Object.fromEntries([...leftOut].map((z) => [z, { gone: true }])) };
    }
    // A past year on the bar: each area's main crop that year, from the record.
    if (pastYear != null) return pastLabels(record, areasOf(record).map((z) => z.zone_id), pastYear, catalogue.data?.crops);
    // Areas she left out (the step before the plan, or CP10's bin; 5 Nov) are not on the plan's map.
    const gone = Object.entries(plan.plan.left_out_reasons || {}).filter(([, why]) => why === 'removed by her')
      .map(([z]) => [z, { gone: true }]);
    const i = Math.min(season, ss.length - 1);
    // 13 Nov: the approved plan shows every season whose chip is on in the year on the bar; an area with crops in more
    // than one shows them joined ("Groundnut → Maize"), in the first crop's colour.
    const idx = approved ? seasonsOn(ss, i, slotsOn) : [i];
    const per = {};
    for (const k of idx) for (const [z, r] of Object.entries(rowsInSeason(ss, k))) { per[z] = per[z] || []; if (!per[z].includes(r)) per[z].push(r); }
    const rows = Object.fromEntries(Object.entries(per).map(([z, rs]) => [z, rs.length === 1 ? rs[0]
      : { ...rs[0], name: rs.map((r) => r.name).filter((n, k, a) => n !== a[k - 1]).join(' → ') }]));
    // Crops picked and not sent yet (28 Oct): the area shows the picked crop, in its colour.
    const slotNow = ss[idx[0]].slot;
    const pickedHere = (z) => pending[z]?.[slotNow] && (catalogue.data?.crops || []).find((c) => c.key === pending[z][slotNow]);
    // A merged row (same crop on several areas, 21 Oct): its harvest on the first area's chip, "with Area n" on the others.
    const out = Object.fromEntries(Object.entries(rows).map(([z, r]) => [z, pickedHere(z) ? { text: pickedHere(z).name, sub: 'changed',
      colour: pickedHere(z).colour, acc: false } : { text: r.name,
      sub: r.off_catalogue ? 'not in the crop list' : z !== zonesOf(r)[0] ? `with ${areaName(zonesOf(r)[0])}` : fmtKg(r.kg),
      colour: r.colour, acc: checked.has(z) }]));
    // An area with no crop that season but a pick for it.
    for (const z of Object.keys(pending)) if (!out[z] && pickedHere(z)) out[z] = { text: pickedHere(z).name, sub: 'changed', colour: pickedHere(z).colour };
    // A soil cover in this season (no bare soil in the dry months, 21 Oct), where no crop is on the area then.
    for (const c of plan.plan.soil_cover || []) {
      if (out[c.zone] || !idx.some((k) => (c.slots || []).includes(ss[k].slot))) continue;
      const short = c.name.replace(/^(Mulch, then )?green manure: /i, '').replace(/ \(.*\)$/, '');
      out[c.zone] = { text: c.kind === 'bare' ? 'Bare soil' : short.charAt(0).toUpperCase() + short.slice(1),
        sub: c.kind === 'bare' ? 'erosion risk' : c.kind === 'mulch' ? 'soil cover' : 'green manure',
        colour: c.kind === 'bare' ? undefined : c.colour, soil: true, acc: checked.has(c.zone) };
    }
    // An area left out for what stands on it (13 Nov: trees, buildings, water…): named so on the map, in its colour.
    for (const [z, why] of Object.entries(plan.plan.left_out_reasons || {})) {
      const cv = COVERS.find((c) => c.key !== 'empty' && LEFT_OUT.has(c.key) && plan.plan.intake?.growing?.[z] === c.key);
      if (!out[z] && cv) out[z] = { text: cv.name, sub: 'left out', colour: cv.colour };
      else if (!out[z] && why && why !== 'too small' && why !== 'removed by her') out[z] = { text: why, sub: 'left out' };
    }
    // The crop in the field now (13 Nov): on its areas in every season that starts before its (estimated) harvest,
    // where the plan has nothing of its own there yet.
    const start = ss[idx[0]].start;
    for (const st of plan.plan.standing || []) {
      if (out[st.zone] || !start || st.until <= start) continue;
      const m = new Date(st.until).toLocaleDateString('en-GB', { month: 'short' });
      out[st.zone] = { text: st.name, sub: `until ${st.estimate ? '~' : ''}${m}`, colour: st.colour, acc: checked.has(st.zone) };
    }
    // An area she added to a touching one before the plan (14 Nov): drawn as one shape with it, one chip.
    for (const [z, to] of Object.entries(plan.plan.merged || {})) out[z] = { join: to, tapRoot: true };
    return { ...out, ...Object.fromEntries(gone) };
  }, [plan, season, checked, areaName, pending, catalogue.data, record, growing, leftOut, mergeTo, pastYear, approved, slotsOn]);
  const pickable = step === 'plan' || (step == null && plan?.status === 'draft');
  const pickArea = useCallback((z) => { setArea(z); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  // CP10 keeps her areas above its season / area bar (the card starts lower there, Sheet `bar`).
  // CP13 (map-central trial, 21 Oct): a tap on an area opens it (since 13 Nov its area page, not one agreement).
  // A share whose sowing is over a year ahead is made later (the node defers it, 25 Oct): it does not hold the plan up.
  const deferredOnly = mint.status === 'partial' && (mint.refused || []).length > 0
    && mint.refused.every((r) => /more than a year ahead|made later/i.test(r.error || ''));
  const active = approved && (mint.status === 'done' || mint.status === 'partial');
  // 13 Nov: a tap opens the area's page (every agreement on it that plan year, its standing crop), so an area with only
  // the standing crop or a green manure in the season shown opens too.
  const openShare = useCallback((z) => {
    const ss = plan?.plan?.seasons || [];
    if (z) window.location.hash = areaHash(z, planYear(ss[Math.min(season, ss.length - 1)]?.start));
  }, [plan, season]);
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
  // Just minted (12 Nov): "being minted" until her title reads, every 5 s, not the no-title card with its button.
  const minting = titlePending(myJob.data, !forLand && titles.isSuccess && !(titles.data || []).length && stellarTitles.isSuccess && !stellarTitle);
  useEffect(() => {
    if (!minting) return undefined;
    const t = setInterval(() => { titles.refetch(); stellarTitles.refetch(); }, 5000);
    return () => clearInterval(t);
  }, [minting]); // eslint-disable-line react-hooks/exhaustive-deps
  const titlesKnown = !!forLand || (!titles.isLoading && (onPolygon || stellarTitles.isFetched));
  // 16 Nov: never an endless loader: after 30 s "did not load" with Try again (the console names the read).
  const waitOn = !titlesKnown ? (titles.isLoading ? 'the land title on Polygon' : 'the land title on Stellar')
    : current.isLoading ? 'the crop plan' : field.isLoading ? 'the field record' : null;
  const [stalled, retryLoad] = useStalled(waitOn);
  const stalledScreen = stalled ? <ErrorFull title="The land title did not load" primary="Try again"
    onPrimary={() => { retryLoad(); titles.refetch(); stellarTitles.refetch(); current.refetch(); field.refetch(); }} /> : null;
  // Plain loading (titles, plan, record not fetched yet) is S1 (executive decision 21 Oct); CP1's pending card is only
  // for a record that is really not there yet.
  if (making) {
    const seq = makeError ? 'failed' : { busy: 'pending', done: 'success', failed: 'failed', partial: 'failed' }[mint.status] || 'pending';
    if (seq !== 'success') when.current = new Date();
    const tx = { status: seq, label: 'Making the crop agreements', when: when.current,
      rows: [['Crop agreements', mint.total ? `${mint.done || 0} of ${mint.total}` : '…'], ['Member', forLand?.label || `Land ${landId}`]],
      reason: makeError || (mint.refused || []).map((r) => `${r.crop || 'Crop agreement'}: ${r.error}`).join(' · ') || mint.error || 'Not made' };
    return <TxScreens tx={tx} network="Polygon" onClose={() => { window.location.hash = '#/members'; }}
      onRetry={() => (makeError ? makeMine() : mint.run(plan.id))} />;
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
  if (!titlesKnown || current.isLoading) return stalledScreen || <Loading />;
  if (titles.data && !titles.data.length && !stellarTitle) {
    const refresh = () => { titles.refetch(); stellarTitles.refetch(); };
    const busy = titles.isFetching || stellarTitles.isFetching;
    // The leader maps every title (executive decision 3 Nov): a member, in assist or self mode, mints nothing; the leader
    // takes the field points, does the borders and the mint. Only a leader's own title starts here (`self`).
    const helped = !self;
    const unionRep = unionInfo.rep;   // the union's representative by name (14 Nov: not "your leader")
    // Her help QR with her Polygon address (3 Nov, both modes): the leader scans it on Add a member (L14).
    if (helped && titleQr) {
      return <HelpQr withPolygon onBack={() => setTitleQr(false)}
        note={`Show this to ${unionRep || 'your union'} at the office.`} />;
    }
    return (
      <Sheet map={noLandMap} landName="No land title yet" actions={(
        <RoundButton label="Refresh" onClick={busy ? undefined : refresh}>
          <style>{'@keyframes nila-spin{to{transform:rotate(360deg)}}'}</style>
          <span style={{ display: 'flex', animation: busy ? 'nila-spin 900ms linear infinite' : 'none' }}><RefreshIcon color={C.text} /></span>
        </RoundButton>
      )}>
        {/* No title, nothing under way (14 Nov): three steps, the action in its step, as G2's Join the union. */}
        {!minting && !openJob ? (
          <NumberedSteps gap={16} items={helped
            ? [<span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>Tap <ScanIcon color={C.text} size={16} /><b>Scan</b> and show your QR.</span>,
              'Your union maps your fields and mints your land title.', `${unionRep || 'Your union'} makes your crop plan with you.`]
            : ['Map your fields and mint your land title.', 'Make your crop plan.']} />
        ) : (
          <p style={muted}>{minting ? 'Your land title is being minted. Your crop plan starts when it is ready.'
            : self ? 'Your field points are with the union. Check the borders and mint your land title.' : 'Your field points are with the union. Your leader mints your land title.'}</p>
        )}
        {(titles.isError || stellarTitles.isError) && <p style={{ ...muted, color: C.coral }}>Your land title could not be loaded.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {!minting && openJob && self && <Primary onClick={() => { window.location.hash = `#/tasks/border/${openJob.id}`; }}>Mint land title</Primary>}
          {!minting && !openJob && !helped && <Primary onClick={() => { window.location.hash = '#/crop/register'; }}>Mint land title</Primary>}
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
  // An approved plan never goes back to editing or its accept screen (13 Nov: "See my plan" opened the editing view).
  const at = approvedId && (step === 'plan' || step === 'terms') ? 'waiting'
    : step ?? (plan?.status === 'draft' ? 'plan' : plan?.status === 'accepted' ? 'waiting' : 'record');
  const back = (to) => () => setStep(to);
  // The member edits the plan (executive decision 16 Nov): a crop picked for an area in a season is saved at once, as
  // made, without a confirm step; the node recomputes the plan by code (no re-plan) and returns its pros and cons and
  // conditions. The pick shows (`pending`) until the new plan is there; picks wait while one is saved.
  const saving = revise.isPending || !!saveJob || Object.keys(pending).length > 0;
  const changeCrop = async (zone, slot, key) => {
    const row = (plan?.plan?.seasons || []).find((x) => x.slot === slot)?.rows.find((r) => zonesOf(r).includes(zone));
    if (row?.crop === key || saving) return;
    setError(undefined);
    setPending({ [zone]: { [slot]: key } });
    try {
      const res = await revise.mutateAsync({ planId: plan.id, note: '', changes: { [zone]: { [slot]: key } } });
      setSaveJob(res.job_id);
    } catch (e) { setError(e.message); setPending({}); }
  };
  const updatePlan = () => {};   // nothing waits to be sent any more (16 Nov)

  if (at === 'record') {
    // CP1 / CP2 (boards CropPlanPending, CropPlanPending-n9mn-kewp). DESIGN GAPs: no "Main issues" (the
    // oracle detects none yet, design Q20), no "Add your trees and water sources" row (A5 not built).
    if (field.isLoading) return stalledScreen || <Loading />;
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
    const now = growingNow(record, catalogue.data?.crops);
    const zoneIds = areasOf(record).map((z) => z.zone_id);
    const growingCount = zoneIds.filter((z) => !!now[z]).length;
    // Option A (12 Nov, as G2's top block): the record's facts as rows, then the button. 17 Nov: what grows now is
    // set on the areas screen, the last step before the plan (one screen with leave out and merge).
    return (
      <Sheet map={<AreaMap record={record} labels={nowLabelsOf(record, catalogue.data?.crops, growing)} />}
        landName={name /* 14 Nov: no 'Field record' title under the land's name */}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sum.from && <KV k="Period" v={`${sum.from} – ${sum.to}`} />}
          <KV k="Cultivations" v={sum.cultivations} />
          <KV k="Areas" v={`${sum.areas}${growingCount ? ` · ${growingCount} growing` : ''}`} />
        </div>
        <Primary onClick={() => setStep('intro')}>{forLand ? 'Make the crop plan' : 'Make my crop plan'}</Primary>
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
    return <CropsStep map={map} name={name} onBack={back('intro')} record={record} catalogue={catalogue.data?.crops || []} growing={growing}
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
    const make = (amount) => { setError(undefined); setCashGiven(amount); setLeftOut(new Set()); setMergeTo({}); setPickOut(null); setAreasOk(false); setCardLow([false, Date.now()]); setStep('leaveout'); };
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
    // Your areas (17 Nov, one screen, the last step before the plan): what grows now (12 Nov), leave out (5 Nov) and
    // add to a touching area (14 Nov) are set here together. A tap on an area raises the card with its picks; a pick
    // lowers it again so the map shows the next area to set, as the point collector does; with nothing left to set
    // the card comes up with the button. Left out and merged are sent with this plan only, never stored with her land.
    const finalOf = (z) => { const seen = new Set([z]); let t = mergeTo[z]; while (t && mergeTo[t] && !seen.has(t)) { seen.add(t); t = mergeTo[t]; } return t; };
    const outNow = (z) => leftOut.has(z) || (mergeTo[z] && leftOut.has(finalOf(z)));   // added to a left-out area: out too
    const now = growingNow(record, catalogue.data?.crops);
    const cropList = sortedCrops(catalogue.data?.crops || []);
    // An area the satellite could not identify must be set, unless she leaves it out or adds it to another area.
    const toSet = zoneOrder.filter((z) => now[z]?.unknown && !growing[z] && !outNow(z) && !mergeTo[z]);
    const nowLabels = nowLabelsOf(record, catalogue.data?.crops, growing);
    const make = async () => {
      setError(undefined);
      try {
        const intake = { crops: [...crops], cows: COWS[cows], hard_months: months, land_role: LAND_ROLE[role], growing };
        if (cashGiven != null) intake.farm_cash_now = cashGiven;
        const exclude = zoneOrder.filter(outNow);
        const merge = Object.fromEntries(Object.keys(mergeTo).filter((z) => !outNow(z)).map((z) => [z, finalOf(z)]));
        const r = await submit.mutateAsync({ intake, exclude, merge });
        setJobId(r.job_id); setStep('making');
      } catch (e) { setError(e.message); }
    };
    // After a pick: down to the map while an area is still to be set, else up with the button.
    const done = (left) => { setPickOut(null); setAreasOk(false); setCardLow([left.length > 0, Date.now()]); };
    const choose = (z, what) => {
      const out = new Set(leftOut); if (what === 'out') out.add(z); else out.delete(z);
      const to = { ...mergeTo }; if (what && what !== 'out') to[z] = what; else delete to[z];
      setLeftOut(out); setMergeTo(to);
      done(toSet.filter((x) => x !== z));
    };
    const grow = (z, key) => {
      setGrowing((g) => ({ ...g, [z]: key }));
      // A crop she grows now joins her crops (the crops question came before this screen).
      if (cropList.some((c) => c.key === key)) setCrops((c) => new Set([...c, key]));
      done(toSet.filter((x) => x !== z));
    };
    const open = (z) => { setPickOut(z); setCardLow([false, Date.now()]); };
    const outLabels = Object.fromEntries(zoneOrder.map((z) => [z, leftOut.has(z)
      ? { text: 'Left out', sub: areaName(z), colour: '#8A94A6' }
      : mergeTo[z] ? { join: finalOf(z) } : nowLabels[z] || { text: areaName(z) }]));   // added: one shape with its neighbour (14 Nov)
    const all = zoneOrder.length > 0 && zoneOrder.every(outNow);
    const areas = areasOf(record);
    // Touching areas she can add it to: not left out, and not one that is (through others) added to this area.
    const nbrs = pickOut ? neighboursOf(areas, pickOut).filter((z) => !leftOut.has(z) && z !== pickOut && finalOf(z) !== pickOut) : [];
    const pill = (on) => ({ height: 36, padding: '0 14px', borderRadius: 9999, border: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
      cursor: 'pointer', background: on ? '#D4CF5A' : '#1F2733', color: on ? '#121212' : '#F1F5F9' });
    const g = pickOut && growing[pickOut];
    const isCover = COVERS.some((c) => c.key === g);
    const summary = [leftOut.size && `${leftOut.size} left out`, Object.keys(mergeTo).length && `${Object.keys(mergeTo).length} added to another area`,
      toSet.length && `${toSet.length} not set yet`].filter(Boolean).join(' · ');
    return (
      <Sheet map={record ? <AreaMap record={record} labels={outLabels} selected={pickOut} onSelect={(z) => (z ? open(z) : setPickOut(null))}
        fitBottom={Math.round(window.innerHeight / 2) + 72} /> : map} landName={name} onBack={pickOut ? () => setPickOut(null) : back('farmcash')}
        low={cardLow[0]} lowKey={cardLow[1]}>
        {pickOut ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', margin: 0 }}>{areaName(pickOut)}</h1>
            <span style={{ fontSize: 14, fontWeight: 700 }}>What grows here now?</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Land covers</span>
            <CropSelect crops={COVERS} current={isCover ? g : undefined} onPick={(key) => grow(pickOut, key)} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginTop: 8 }}>Crops</span>
            <CropSelect crops={cropList} current={isCover ? undefined : g} onPick={(key) => grow(pickOut, key)} />
            <span style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Or leave it out of the plan</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" style={pill(leftOut.has(pickOut))} onClick={() => choose(pickOut, leftOut.has(pickOut) ? null : 'out')}>Leave out</button>
              {nbrs.map((z) => (
                <button key={z} type="button" style={pill(mergeTo[pickOut] === z)} onClick={() => choose(pickOut, mergeTo[pickOut] === z ? null : z)}>Add to {areaName(z)}</button>
              ))}
              {(leftOut.has(pickOut) || mergeTo[pickOut]) && <button type="button" style={pill(false)} onClick={() => choose(pickOut, null)}>Keep it</button>}
            </div>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Your areas</h1>
            <p style={{ ...muted, textAlign: 'center' }}>Tap an area on the map: set what grows there now, leave it out, or add it to the area next to it.</p>
            {summary && <p style={{ ...muted, textAlign: 'center', margin: '4px 0 0', color: toSet.length ? C.coral : C.muted }}>{summary}</p>}
          </>
        )}
        {error && <p style={{ color: C.coral }}>{error}</p>}
        {/* Two taps (14 Nov): first she confirms the areas (grey), then the same button fills with the accent while its
            words change to Make my crop plan. Off with reduced motion. Waits while an area is not set yet. */}
        {!pickOut && (
        <button type="button" disabled={all || toSet.length > 0 || (areasOk && submit.isPending)}
          onClick={areasOk ? make : () => setAreasOk(true)}
          style={{ position: 'relative', overflow: 'hidden', width: '100%', height: 44, marginTop: 16, borderRadius: R.button, border: 0,
            background: C.raised, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer', opacity: all || toSet.length > 0 || (areasOk && submit.isPending) ? 0.5 : 1 }}>
          <style>{'@media (prefers-reduced-motion: reduce){.nila-sweep,.nila-sweep-t{transition:none!important}}'}</style>
          <span aria-hidden="true" className="nila-sweep" style={{ position: 'absolute', inset: 0, background: C.accent, transformOrigin: 'left center',
            transform: `scaleX(${areasOk ? 1 : 0})`, transition: 'transform 350ms cubic-bezier(0.2,0.8,0.2,1)' }} />
          <span className="nila-sweep-t" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.text, opacity: areasOk ? 0 : 1, transition: 'opacity 200ms ease' }} aria-hidden={areasOk}>Confirm the areas</span>
          <span className="nila-sweep-t" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.ink, opacity: areasOk ? 1 : 0, transition: 'opacity 200ms ease 150ms' }} aria-hidden={!areasOk}>{forLand ? 'Make the crop plan' : 'Make my crop plan'}</span>
        </button>
        )}
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
    // The bar steps plan years (12 Nov: Oct–Sep, "2026–27"); the map shows the first season of the year shown.
    // 12 Nov: the bar also steps back through the record's years (history, faded, on the chart and the map); a button
    // above it comes back to this year.
    const planYears = [...new Set(ss.map((x) => planYear(x.start)))];
    const first = Math.min(firstRecordYear(record) ?? planYears[0], planYears[0]);
    const years = Array.from({ length: Math.max(...planYears) - first + 1 }, (_, i) => first + i);
    const y0 = pastYear ?? planYear(ss[Math.min(season, ss.length - 1)]?.start);
    const toYear = (d) => {
      const y = years[Math.max(0, Math.min(years.length - 1, years.indexOf(y0) + d))];
      if (planYears.includes(y)) { setPastYear(null); setSeason(Math.max(0, ss.findIndex((x) => planYear(x.start) === y))); } else setPastYear(y);
    };
    const thisYear = planYears.includes(planYear()) ? planYear() : planYears[0];
    const reset = () => { setPastYear(null); setSeason(Math.max(0, ss.findIndex((x) => planYear(x.start) === thisYear))); };
    const bar = area
      ? <SlideBar label={<b>{areaName(area)}</b>} prevLabel="Previous area" nextLabel="Next area" onPrev={() => step1(-1)} onNext={() => step1(1)} />
      : ss.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {y0 !== thisYear && (
            <button type="button" onClick={reset} style={{ height: 32, padding: '0 14px', borderRadius: 16, border: 0, background: 'rgba(18,18,18,0.85)', color: C.accent,
              fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back to {yearLabel(null, thisYear)}</button>
          )}
          <div style={{ alignSelf: 'stretch' }}>
            <SlideBar label={`${yearLabel(null, y0)}${pastYear != null ? ' · from your record' : ''}`} prevLabel="Previous year" nextLabel="Next year" onPrev={() => toYear(-1)} onNext={() => toYear(1)} />
          </div>
        </div>
      );
    const next = zones.find((z) => z !== area && !checked.has(z));
    // 16 Nov: the approved plan's season chips here too (the same chips and state); not in a record year.
    const shown = Math.min(season, Math.max(0, ss.length - 1));
    const chipsOn = pastYear == null && yearSeasons(ss, shown).length > 1;
    return (
      <Sheet map={map} landName={name} bar={bar} resetKey={area || ''} onBack={back('why')}>
        {area ? (
          <AreaCard plan={plan} zone={area} name={areaName(area)} record={record} area={areasOf(record).find((z) => z.zone_id === area)}
            accepted={checked.has(area)} total={zones.length} readOnly={readOnly} y0={y0}
            nextName={next ? areaName(next) : null} onNext={() => pickArea(next)} onAll={toTerms}
            onAccept={() => { const n = new Set(checked); n.add(area); setChecked(n); pickArea(zones.find((z) => !n.has(z)) || null); }}
            crops={catalogue.data?.crops} changing={saving} onCrop={(r, key) => changeCrop(area, r.slot, key)}
            picked={pending[area] || {}} onUpdate={updatePlan}
            onRemove={() => setRemoving(area)} />
        ) : (
          <PlanView plan={plan} record={record} checked={checked} areaNo={areaNo} areaName={areaName} onAccept={toTerms} readOnly={readOnly} y0={y0} onArea={pickArea}
            crops={catalogue.data?.crops} changing={saving} onCrop={changeCrop} pending={pending} onUpdate={updatePlan}
            ticks={ticks} onTick={(k) => setTicks((t) => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
            chips={chipsOn && <SeasonChips ss={ss} i={shown} on={slotsOn} setOn={setSlotsOn} />}
            off={chipsOn ? seasonsOff(ss, shown, slotsOn) : undefined}
            slots={chipsOn ? new Set(seasonsOn(ss, shown, slotsOn).map((k) => ss[k].slot)) : undefined}
            />
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
      if (forLand || self) { await makeMine(); return; }
      try { await accept.mutateAsync({ plan, conditions: condTicks(plan, ticks).ids }); setStep('waiting'); } catch (e) { setError(e.message); }
    };
    // The checks she ticks before I accept (12 Nov): first and foremost that she repays all of it, principal and interest.
    const owe = repayment(plan);
    const lastMon = owe.last && new Date(`${owe.last}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const checks = [
      // Locally, paying only the interest and keeping the principal is common; Nila does not work that way (12 Nov).
      ['repay', `I pay back all ${inr(owe.total)}, not only the interest.`],
      owe.parts > 0 && ['when', `I pay after each harvest, all by ${lastMon}.`],
      ['change', <>I understand all numbers are subject to change.<span style={{ display: 'block', fontWeight: 400, color: C.muted }}>When you get the cash, your union can change the amounts.</span></>],
      // An edited plan's conditions (16 Nov), the same ticks as on the plan: all of them before I accept.
      ...(plan.plan.conditions || []).map((c) => [`c:${c.id}`, c.text]),
    ].filter(Boolean);
    const read = checks.every(([key]) => ticks.has(key));
    const tick = (key) => setTicks((t) => { const n = new Set(t); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    return (
      <Sheet map={map} landName={name} onBack={back('plan')} scroll full>
        {/* 12 Nov (Carst): the screen answers the money question. What she gets and the interest come first (sales are an
            estimate); one chart holds the year; the notices made way for the plan's basis, shortened. */}
        {(() => {
          const due = repayment(plan);
          const mon = (m) => m && new Date(`${m}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          // The field record's segment rows (12 Nov): what she gets, the interest, when she repays; then a line.
          return (
            <Section title="Crop agreement" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <KV k="You get" v={inr(due.get)} />
              <KV k="Interest" v={inr(due.interest)} />
              {due.parts > 0 && <KV k="You repay" v={due.parts === 1 ? mon(due.first) : `${due.parts} parts, ${mon(due.first)} – ${mon(due.last)}`} />}
            </Section>
          );
        })()}
        <Section title="Your money through the year"><MoneyChart plan={plan} /></Section>
        {/* Only what the chart does not show: water, crops outside the list, bare soil, sales after this year. */}
        {(plan.plan.consequences || []).filter((c) => ['water_not_confirmed', 'off_catalogue', 'bare_soil', 'harvest_after_year'].includes(c.kind)).map((c) => (
          <Notice key={c.kind + c.text} kind="warn" title={c.title}>{c.text}</Notice>
        ))}
        {plan.plan.basis && <Section title="What this plan is based on"><BasisList basis={plan.plan.basis} /></Section>}
        <p style={{ ...muted, margin: '14px 0 0' }}>Yields, prices and sales are estimates. Cash and vouchers depend on the funds available.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {checks.map(([key, text]) => <CheckRow key={key} on={ticks.has(key)} onClick={() => tick(key)}>{text}</CheckRow>)}
        </div>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <button type="button" disabled={!read || accept.isPending} aria-disabled={!read} onClick={go} style={{
          width: '100%', height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', marginTop: 14,
          color: read ? C.ink : C.muted, background: read ? C.accent : C.raised, cursor: read ? 'pointer' : 'not-allowed' }}>{forLand ? 'Accept the plan' : 'I accept'}</button>
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
    // The union mints her crop agreements at the approval (executive decision 21 Oct): her app only waits for them.
    // 13 Nov: an approved plan always opens on the plan itself (CP13). While its crop agreements are still being made,
    // or when making them failed, one line above it says so — no separate "being made" or "N of M made" screen.
    const ss = plan.plan.seasons || [];
    const shown = Math.min(season, Math.max(0, ss.length - 1));
    // 13 Nov: the bar steps plan years only ("2026–27"; `season` = a season of the year shown, so the area page links
    // keep their year): back past the plan's first year into the record's years, forward into an extension's year.
    const planYears = [...new Set(ss.map((x) => planYear(x.start)))];
    const first = Math.min(firstRecordYear(record) ?? planYears[0], planYears[0]);
    const y0 = pastYear ?? planYear(ss[shown]?.start);
    const nowSeason = currentSeason(ss);
    const nowYear = planYear(ss[nowSeason]?.start);
    const toPlanYear = (y) => { setPastYear(null); setSeason(Math.max(0, ss.findIndex((x) => planYear(x.start) === y))); };
    const prev = () => {
      if (pastYear != null) setPastYear(Math.max(first, pastYear - 1));
      else if (planYears.includes(y0 - 1)) toPlanYear(y0 - 1);
      else if (y0 === planYears[0] && first < y0) setPastYear(y0 - 1);
    };
    const next = () => {
      if (pastYear != null) { if (pastYear + 1 < planYears[0]) setPastYear(pastYear + 1); else toPlanYear(planYears[0]); }
      else if (planYears.includes(y0 + 1)) toPlanYear(y0 + 1);
    };
    const toNow = () => { setPastYear(null); setSeason(nowSeason); };
    const bar = ss.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {/* 13 Nov: only off the year she is in. */}
        {(pastYear != null || y0 !== nowYear) && (
          <button type="button" onClick={toNow} style={{ height: 32, padding: '0 14px', borderRadius: 16, border: 0, background: 'rgba(18,18,18,0.85)', color: C.accent,
            fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back to now</button>
        )}
        <div style={{ alignSelf: 'stretch' }}>
          <SlideBar label={`${yearLabel(null, y0)}${pastYear != null ? ' · from your record' : ''}`} prevLabel="Previous year" nextLabel="Next year" onPrev={prev} onNext={next} />
        </div>
      </div>
    );
    // 13 Nov: the year's seasons as chips (all on at first); at least one stays on. Not in a record year (no plan).
    const onIdx = seasonsOn(ss, shown, slotsOn);
    const chips = <SeasonChips ss={ss} i={shown} on={slotsOn} setOn={setSlotsOn} />;
    const slotsShown = pastYear == null ? new Set(onIdx.map((k) => ss[k].slot)) : undefined;
    // The crop bars (13 Nov, as the draft plan's overview): one lane per area, read-only.
    const zones = Object.keys(plan.plan.proposal || {}).sort((a, b) => Number(areaNo(a)) - Number(areaNo(b)));
    const made = mint.status === 'done' || mint.status === 'partial' || deferredOnly;
    return (
      <Sheet map={map} landName={name} bar={bar}>
        {!made && mint.status !== 'failed' && (
          <p role="status" style={{ ...muted, margin: '0 0 12px' }}>Your crop agreements are being made{mint.total ? `: ${mint.done || 0} of ${mint.total}` : ''}.</p>
        )}
        {mint.status === 'failed' && (self || forLand) && (
          <div style={{ margin: '0 0 12px' }}>
            <p style={{ color: C.coral, margin: 0 }}>Not made: {mint.error || (mint.refused || [])[0]?.error || 'try again'}</p>
            <Primary onClick={() => mint.run(plan.id)}>Try again</Primary>
          </div>
        )}
        {/* 13 Nov: the bars' title follows the year on the bar; a past year shows only its bars (no tasks). */}
        {/* A row opens its area's page (13 Nov), as a tap on its area on the map. */}
        <ActivePlan chart={<PlanChart plan={plan} record={record} zones={zones} areaName={areaName} checked={new Set()} y0={y0} crops={catalogue.data?.crops} onArea={pastYear == null ? openShare : undefined} slots={slotsShown} />}
          chartTitle={pastYear != null ? `${yearLabel(null, pastYear)} · from your record` : y0 === planYear() ? "This year's plan" : `${yearLabel(null, y0)} plan`}
          past={pastYear != null} filter={chips} seasons={pastYear == null ? new Set(onIdx) : undefined}
          plan={plan} areaNo={areaNo} areaName={areaName} season={shown} shares={myShares.data} assist={!self && assisted()}
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
  if (forLand) {
    // A member's plan accepted before the one-go rule (26 Oct): approve it and make the crop agreements here.
    return (
      <Sheet map={map} landName={name} title="Plan accepted">
        <p style={muted}>{forLand.label || 'The member'} accepted the plan. Approve it to make the crop agreements.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={!plan?.id} onClick={makeMine}>Approve and make the crop agreements</Primary>
      </Sheet>
    );
  }
  if (self) {
    // The leader's own plan accepted before the one-go rule (29 Oct): approve it and make the crop agreements here.
    return (
      <Sheet map={map} landName={name} title="Plan accepted">
        <p style={muted}>You accepted your plan. Approve it to make your crop agreements.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={!plan?.id} onClick={makeMine}>Approve and make the crop agreements</Primary>
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
