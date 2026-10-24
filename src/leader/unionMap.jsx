// The leader's union map (map-centred lane, executive decision 23 Oct; release plan "Map-centred lane"): every
// member's property on the one shared map, filtered by the tab, at any scroll position of the card, with a chip on
// the map naming the filter and its count. A tap on the leader's own property opens her own Crop plan; on any other
// member's property, that member's G2.
//  - members: all members' properties, name labels (the default);
//  - assets: where the union's assets stand: machines (their owners' properties) and crop shares Ready to take up;
//  - cash: properties with an active loan, by repayment (due within 14 days gold, overdue coral);
//  - harvests: properties with a harvest in the next 60 days, by weeks to harvest.
// (Crop plan keeps the leader's own property, CropPlanFlow.)
import { useCallback, useMemo } from 'react';
import AreaMap from '../plan/AreaMap';
import { usePlanClient } from '../plan/hooks';
import { useNilaSigner } from '../wallet/signer';
import { useMachines, typeName } from '../machine/hooks';
import { C } from '../shell/tokens';
import { useLoanDues, useUnionMembers, useUnionShares } from './unionMembers';

const DAY = 86_400;
export const FILTER_NAMES = { members: 'Members', assets: 'Assets', cash: 'Active loans', harvests: 'Harvests' };

/** { map, count }: the union map for a tab. fitBottom: the room the card leaves at the bottom (px). on: false reads
 *  nothing (a member's app, where the hook is still called). */
export function useLeaderMap(filter = 'members', fitBottom = 170, on = true) {
  const client = usePlanClient();
  const api = on ? client : null;
  const s = useNilaSigner();
  const members = useUnionMembers(api);
  const shares = useUnionShares(api);
  const machines = useMachines({ on: on && filter === 'assets' });
  const all = useMemo(() => members.data || [], [members.data]);
  const loans = useMemo(() => (filter === 'cash' ? all.flatMap((m) => m.loans.filter((l) => !l.due)) : []), [filter, all]);
  const dues = useLoanDues(loans);
  const me = s?.stellarAddress;
  const pick = useCallback((key) => {
    const m = all.find((x) => x.key === key);
    if (!m) return;
    window.location.hash = m.address && m.address === me ? '#/crop' : `#/members/${m.route}`;
  }, [all, me]);

  return useMemo(() => {
    const now = Date.now() / 1000;
    const label = {};
    for (const m of all) {
      if (!m.places.length) continue;
      const mine = shares.data?.[m.address]?.shares || [];
      if (filter === 'members') label[m.key] = { text: m.label };
      else if (filter === 'assets') {
        const owned = (machines.data || []).filter((x) => x.confirmed && x.owner === m.address);
        const ready = mine.filter((x) => x.ready).length || Number(m.shareCounts?.ready || 0);
        if (owned.length) label[m.key] = { text: m.label, sub: owned.map((x) => typeName(x.machine_type)).join(', '), colour: C.text };
        if (ready) label[m.key] = { text: m.label, sub: `${owned.length ? `${owned.length} machine${owned.length === 1 ? '' : 's'} · ` : ''}${ready} Ready`, colour: C.accent };
      } else if (filter === 'cash') {
        const open = [...m.loans, ...mine.filter((x) => x.loan && !m.loans.some((l) => l.token === x.token)).map((x) => x.loan)];
        if (!open.length) continue;
        const due = Math.min(...open.map((l) => l.due || dues.data?.[l.token] || Infinity));
        const late = open.some((l) => l.overdue) || due < now;
        const soon = !late && due - now < 14 * DAY;
        label[m.key] = { text: m.label, sub: late ? 'Overdue' : soon ? `Due in ${Math.max(1, Math.ceil((due - now) / DAY))} d` : 'Active loan',
          colour: late ? C.coral : soon ? C.gold : '#ffffff' };
      } else if (filter === 'harvests') {
        const next = mine.filter((x) => x.drawn && x.harvest).map((x) => Date.parse(x.harvest) / 1000)
          .concat(m.nextHarvest ? [Date.parse(m.nextHarvest) / 1000] : []).filter((t) => t >= now - 7 * DAY).sort((a, b) => a - b)[0];
        if (!next || next - now > 60 * DAY) continue;
        const weeks = Math.max(0, Math.round((next - now) / (7 * DAY)));
        label[m.key] = { text: m.label, sub: weeks ? `Harvest in ${weeks} wk` : 'Harvest now', colour: weeks <= 2 ? C.accent : C.gold };
      }
    }
    const shown = all.filter((m) => label[m.key]);
    const zones = shown.flatMap((m) => m.places.map((p) => ({ zone_id: m.key, geometry: p.geometry })))
      .filter((z, i, a) => a.findIndex((y) => y.zone_id === z.zone_id) === i);
    const count = shown.length;
    const chip = `${FILTER_NAMES[filter] || filter} · ${count}`;
    // No property to show: the map stays clear (the chip still says 0).
    const map = <AreaMap record={zones.length ? { zones } : null} labels={label} onSelect={(z) => z && pick(z)} fitSide={90} fitBottom={fitBottom} chip={chip} />;
    return { map, count, loading: !members.data };
  }, [all, filter, shares.data, machines.data, dues.data, pick, fitBottom, members.data]);
}
