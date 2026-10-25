// DEVIATION (executive decision 21 Oct, map-central trial; branch t1/pwa/P13-map): one satellite map of her land
// behind the Crop plan and Assets tabs, member and leader app alike. No board has A1 on a map yet.
//  - The map is mounted once in the Shell and stays mounted on every tab and screen, so moving between tabs never
//    loads it again; full-screen screens (nIN, Invested, vouchers, settings, history, tasks) cover it with the gradient.
//  - A Sheet with an AreaMap hands the map's props to the stage (ui.jsx) instead of drawing its own map, so CP1–CP13,
//    A1, A4/A4a and A5 all move the same map: labels, the picked area, where the card leaves room.
//  - useHomeMap: A1's map, her areas labelled with what grows there in the season she is in; a tap on an area opens
//    its crop share for that season.
import { useCallback, useMemo, useState } from 'react';
import { LabelsCtx, StageCtx } from './stageCtx';
import AreaMap from '../plan/AreaMap';
import { useFieldRecord } from '../plan/record';
import { useCropPlan } from '../plan/hooks';
import { currentSeason } from '../plan/ActivePlan';
import { fmtKg, rowsInSeason, zonesOf } from '../plan/PlanResult';
import { rowOf, useMyLand, useMyShares } from '../loan/MyShares';

export { useStage } from './stageCtx';

const same = (a, b) => (a === b) || (!!a && !!b && a.record === b.record && a.selected === b.selected && a.onSelect === b.onSelect
  && a.fitBottom === b.fitBottom && a.chip === b.chip && JSON.stringify(a.labels || {}) === JSON.stringify(b.labels || {}));

const LOGO = `${process.env.PUBLIC_URL || ''}/images/reg-logo.png`;

/** The leader's tab filter (23 Oct): a chip naming it and its count, on the map at any card position. */
const Chip = ({ text }) => (
  <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 72px)', left: '50%', transform: 'translateX(-50%)', zIndex: 2,
    pointerEvents: 'none', background: 'rgba(18,18,18,0.85)', color: '#F1F5F9', borderRadius: 9999, padding: '4px 12px',
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</div>
);

const LABELS_KEY = 'nila.map.labels';

export default function MapStage({ children }) {
  const [props, setProps] = useState(null);
  const api = useMemo(() => ({ set: (p) => setProps((was) => (same(was, p) ? was : p)) }), []);
  // Labels off (25 Oct): the outlines stay, their names and notes are hidden; kept on this phone for every map.
  const [off, setOff] = useState(() => { try { return localStorage.getItem(LABELS_KEY) === 'off'; } catch { return false; } });
  const labels = useMemo(() => ({ off, toggle: () => setOff((v) => { try { localStorage.setItem(LABELS_KEY, v ? 'on' : 'off'); } catch { /* private mode */ } return !v; }) }), [off]);
  const shownLabels = useMemo(() => (off && props?.labels
    ? Object.fromEntries(Object.entries(props.labels).map(([k, v]) => [k, { ...v, text: undefined, sub: undefined, hide: true }])) : props?.labels), [off, props]);
  return (
    <StageCtx.Provider value={api}>
    <LabelsCtx.Provider value={labels}>
      {props?.record ? (
        // Clipped: the map's tiles reach past its box and would otherwise make the page taller than the card.
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }} data-testid="map-stage">
          <AreaMap {...props} labels={shownLabels} height="100%" />
          {props.chip && <Chip text={props.chip} />}
        </div>
      ) : (
        // No record (yet): a filter with nothing to show keeps its chip; a map still loading shows the bouncing logo
        // where the map will be, never a black screen (24 Oct).
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', background: '#121212' }} data-testid="map-stage">
          {props?.chip ? <Chip text={props.chip} /> : (
            <>
              <style>{'@keyframes nila-bounce{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-14px)}}'}</style>
              <img src={LOGO} alt="" aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '14vh', width: 56, height: 56,
                animation: 'nila-bounce 1s ease-in-out infinite' }} />
            </>
          )}
        </div>
      )}
      {children}
    </LabelsCtx.Provider>
    </StageCtx.Provider>
  );
}

/** The share standing on `zone` in season i of her approved plan (a merged share counts on each of its areas). */
export function shareOn(shares, seasons, i, zone) {
  const row = rowsInSeason(seasons, i)[zone];
  if (!row) return undefined;
  return (shares || []).find((x) => (x.zones || x.share?.zones || [x.zone]).includes(zone)
    && (x.crop === row.crop || x.crop === row.name) && (rowOf(x)?.sow === row.sow));
}

/** Where A1's card opens (its top, px): a strip of map above it. */
export const homeTop = () => Math.round(window.innerHeight * 0.34);

/** A1's map: { map, record } — her areas with this season's crops; a tap on an area opens its crop share. */
export function useHomeMap(onShare, fitBottom) {
  const land = useMyLand();
  const field = useFieldRecord(land.landId, land.evm, land.stellarTitle ? land.stellarTitle.record_hash || '' : undefined);
  const record = field.data?.record;
  const plan = useCropPlan(land.landId).data;
  const shares = useMyShares().data;
  const seasons = plan?.approval?.decision === 'approve' ? plan.plan?.seasons || [] : [];
  const i = seasons.length ? currentSeason(seasons) : -1;
  const labels = useMemo(() => {
    if (i < 0) return {};
    const rows = rowsInSeason(seasons, i);
    return Object.fromEntries(Object.entries(rows).map(([z, r]) => [z, { text: r.name,
      sub: z !== zonesOf(r)[0] ? 'same crop' : r.kg ? fmtKg(r.kg) : undefined, colour: r.colour }]));
  }, [plan, i]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSelect = useCallback((z) => {
    const x = z && i >= 0 ? shareOn(shares, seasons, i, z) : undefined;
    if (x) onShare(x.token_id);
  }, [shares, plan, i, onShare]); // eslint-disable-line react-hooks/exhaustive-deps
  const map = record ? <AreaMap record={record} labels={labels} onSelect={i >= 0 ? onSelect : undefined} fitBottom={fitBottom} /> : null;
  return { map, record, loading: field.isLoading };
}
