// One page per area (13 Nov, product owner): a tap on an area on the approved plan's map, or on its row in the crop
// bars, opens this page instead of one crop agreement of the season shown — so an area with only the standing crop or
// a green manure that season opens too. It lists every crop agreement on the area in the plan year, in date order,
// each a compact block (crop, months, state, what she collects, the ready / repay action); the crop standing there now
// as one line; the plan's bars at the bottom with this area in full. The bar on top steps between areas (a swipe too).
// Each block opens its full agreement page (#/cropshare/<token>, A4/A4a) for its details and actions.
import { useMemo } from 'react';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import AreaMap from '../plan/AreaMap';
import { Loading } from '../register/Boot';
import { areasOf, useFieldRecord } from '../plan/record';
import { mergedPlan, useCropCatalogue, useCropChain } from '../plan/hooks';
import { PlanChart, SlideBar, planYear, yearLabel } from '../plan/PlanResult';
import { currentSeason } from '../plan/ActivePlan';
import { tapRule } from '../plan/mapTap';
import { areaHash } from '../shell/MapStage';
import { C, FONT } from '../shell/tokens';
import { BanknoteIcon, ChevronIcon, TractorIcon } from '../shell/icons';
import { SEASON, rowOf, useMyLand, useMyShares } from './MyShares';
import { collectOf, dayOf, statusOf, windowOf } from './CropShare';

const FLAG_CLOSED = 4;
const mon = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep');
const zonesOfShare = (x) => x.zones || x.share?.zones || [x.zone];
const line = { height: 1, background: C.raised, margin: '8px 0' };

/** One crop agreement on the area: crop, months, state, what she collects, and its action. */
function Block({ x, onTakeUp }) {
  const r = rowOf(x) || {};
  const name = r.name || x.crop.replace(/_/g, ' ');
  const from = r.sow || x.share.from_date;
  const months = from && r.harvest ? `${mon(from)} – ${mon(r.harvest)}` : SEASON[r.slot] || (from ? `from ${mon(from)}` : '');
  const { cash, hours, vouchers } = collectOf(x);
  const { until, opens, over } = windowOf(x);
  // The status line as on the agreement page: its window before a draw, its harvest after.
  const when = x.drawn ? (r.harvest ? `harvest ${mon(r.harvest)}` : '')
    : over ? (until ? `last day was ${dayOf(until)}` : '')
      : [opens && `${x.ready ? 'ready since' : 'ready from'} ${dayOf(opens)}`, until && `use it by ${dayOf(until)}`].filter(Boolean).join(' · ');
  const open = x.drawn && !(Number(x.ft?.loan?.flags ?? 0) & FLAG_CLOSED);
  const go = (suffix = '') => { window.location.hash = `#/cropshare/${x.token_id}${suffix}`; };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0' }}>
      <button type="button" onClick={() => go()} aria-label={`${name}: open the crop agreement`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, padding: 0, background: 'transparent', color: C.text, fontFamily: FONT, cursor: 'pointer', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 9999, background: r.colour || C.muted, flex: 'none' }} />
        <span style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{name}{x.share.green_manure ? ' · Green manure' : ''}</span>
          <span style={{ ...muted, fontSize: 13, lineHeight: 1.5 }}>{months}</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, textAlign: 'right' }}>{statusOf(x)}</span>
        <ChevronIcon color={C.muted} />
      </button>
      {when && <span style={{ ...muted, fontSize: 13, paddingLeft: 18 }}>{when.charAt(0).toUpperCase() + when.slice(1)}</span>}
      <div style={{ display: 'flex', gap: 16, paddingLeft: 18, fontSize: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BanknoteIcon color={C.gold} /><b>{inr(cash)}</b></span>
        {hours > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TractorIcon color={C.gold} /><b>{vouchers ? inr(vouchers) : '—'}</b></span>}
      </div>
      {/* The agreement page's actions (13 Nov): take it up when ready; repay opens its QR (#/cropshare/<token>/qr). */}
      {x.ready && <Primary onClick={() => onTakeUp(x.token_id)}>Get cash and vouchers</Primary>}
      {open && (
        <button type="button" onClick={() => go('/qr')} style={{ width: '100%', height: 44, marginTop: 4, borderRadius: 12, border: 0, background: C.raised,
          color: C.text, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>Repay at the office</button>
      )}
    </div>
  );
}

/** #/croparea/<zone>[/<plan year>]: the area's page. year: the plan year shown on the plan (default: the season she is in). */
export default function CropArea({ zone, year, onBack, onTakeUp }) {
  const shares = useMyShares();
  const land = useMyLand();
  const field = useFieldRecord(land.landId, land.evm, land.stellarTitle ? land.stellarTitle.record_hash || '' : undefined);
  const record = field.data?.record;
  const chain = useCropChain(land.landId);
  const crops = useCropCatalogue().data?.crops;
  const ps = chain.data?.plans || [];
  const plan = mergedPlan(chain.data, ps[ps.length - 1]);
  const ss = plan?.plan?.seasons || [];
  const y0 = year ?? (ss.length ? planYear(ss[currentSeason(ss)].start) : planYear());
  const areas = areasOf(record);
  // The bar's order: the plan's areas in record order; an area outside the plan steps over all of them.
  const order = useMemo(() => {
    const all = areasOf(record).map((z) => z.zone_id);
    const inPlan = all.filter((z) => plan?.plan?.proposal?.[z]);
    return inPlan.includes(zone) ? inPlan : all;
  }, [record, plan, zone]);
  if (!record && !field.error) return <Loading />;
  if (chain.isLoading || (shares.isLoading && ps.length > 0)) return <Loading />;

  const nameOf = (z) => areas.find((y) => y.zone_id === z)?.name || `Area ${areas.findIndex((y) => y.zone_id === z) + 1}`;
  const here = (shares.data || []).filter((x) => zonesOfShare(x).includes(zone) && planYear(x.share?.from_date) === y0)
    .sort((a, b) => String(a.share?.from_date || '').localeCompare(String(b.share?.from_date || '')));
  // The crop in the field now (plan.standing), while it stands into this plan year.
  const standing = (plan?.plan?.standing || []).filter((st) => st.zone === zone && st.until && st.until > `${y0}-10-01`);
  const total = here.filter((x) => !x.lapsed && !x.late).reduce((t, x) => { const c = collectOf(x); return t + c.cash + c.vouchers; }, 0);

  const toArea = (z) => window.location.replace(areaHash(z, y0));   // a step replaces the entry: back returns to the plan
  const i = order.indexOf(zone);
  const step = (d) => { if (i >= 0 && order.length > 1) toArea(order[(i + d + order.length) % order.length]); };
  const bar = order.length > 1 && i >= 0
    ? <SlideBar label={<b>{nameOf(zone)}</b>} prevLabel="Previous area" nextLabel="Next area" onPrev={() => step(-1)} onNext={() => step(1)} />
    : undefined;
  const map = record ? <AreaMap record={record} labels={{ [zone]: { text: nameOf(zone) } }} selected={areas.length > 1 ? zone : null}
    onSelect={tapRule([zone], { back: onBack, open: toArea })} fitBottom={bar ? Math.round(window.innerHeight / 2) + 72 : undefined} /> : null;

  return (
    <Sheet map={map} onBack={onBack} bar={bar} onSwipe={bar ? step : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{nameOf(zone)}</span>
        <span style={{ ...muted, lineHeight: 1.5 }}>{yearLabel(null, y0)}</span>
      </div>
      {standing.map((st) => (
        <p key={st.crop} style={{ ...muted, margin: '4px 0' }}>
          In the field now: <b style={{ color: C.text }}>{st.name}, until {st.estimate ? '~' : ''}{mon(st.until)}</b>
        </p>
      ))}
      {here.length === 0 && <p style={{ ...muted, margin: '8px 0' }}>No crop agreement on this area in {yearLabel(null, y0)}.</p>}
      {here.map((x, k) => (
        <div key={x.token_id}>
          {k > 0 && <div style={line} />}
          <Block x={x} onTakeUp={onTakeUp} />
        </div>
      ))}
      {here.length > 0 && (
        <>
          <div style={line} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ color: C.muted }}>Total</span><span style={{ fontWeight: 700 }}>{inr(total)}</span>
          </div>
        </>
      )}
      {/* The plan's bars at the bottom, below Total: this area in full, the others faded; a row opens its area. */}
      {plan?.plan && order.length > 0 && (
        <div style={{ margin: '16px 0 0' }}>
          <PlanChart plan={plan} record={record} zones={order} areaName={nameOf} checked={new Set()} focus={[zone]} y0={y0} crops={crops}
            onArea={(z) => (z === zone ? undefined : toArea(z))} />
        </div>
      )}
    </Sheet>
  );
}
