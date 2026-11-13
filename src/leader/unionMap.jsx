// The leader's union map (map-centred lane, executive decision 23 Oct; release plan "Map-centred lane"): every
// member's property on the one shared map, filtered by the tab, at any scroll position of the card, with a chip on
// the map naming the filter and its count. A tap on the leader's own property opens her own Crop plan; on any other
// member's property, that member's G2.
// 13 Nov (Carst), per area from each member's field record (her title's outline when there is no record yet):
//  - members: every property's outline, with the member's name;
//  - assets: every area's outline; the areas with a crop agreement ready to use in accent, named by its crop;
//  - cash: the areas whose crop agreement was taken up (cash drawn), as outlines, the member's name on one;
//  - harvests: what grows on each area now, from the record (its crop's colour; unidentified in grey).
// (Crop plan keeps the leader's own property, CropPlanFlow.)
import { useCallback, useMemo } from 'react';
import AreaMap, { ringsOf } from '../plan/AreaMap';
import { useCropCatalogue, usePlanClient } from '../plan/hooks';
import { useNilaSigner } from '../wallet/signer';
import { C } from '../shell/tokens';
import { useUnionMembers, useUnionShares } from './unionMembers';
import { UNION_START } from '../shell/MapStage';

// Where the union map looks before any member has land on it: UNION_START (MapStage).

/** The middle of all the union's land (every member's property and title fields), for a filter with nothing in it. */
export function unionCentre(members) {
  let lat = 0; let lng = 0; let k = 0;
  for (const m of members || []) {
    for (const g of [...(m.places || []), ...(m.fields || [])].map((x) => x.geometry)) {
      ringsOf(g).forEach((ring) => ring.forEach(([x, y]) => { lng += x; lat += y; k += 1; }));
    }
  }
  return k ? { lat: Math.round((lat / k) * 1e5) / 1e5, lng: Math.round((lng / k) * 1e5) / 1e5 } : UNION_START;
}
export const FILTER_NAMES = { members: 'Members', assets: 'Ready to use', cash: 'Taken up', harvests: 'Growing now' };

/** { map, count }: the union map for a tab. fitBottom: the room the card leaves at the bottom (px). on: false reads
 *  nothing (a member's app, where the hook is still called). */
export function useLeaderMap(filter = 'members', fitBottom = 170, on = true) {
  const client = usePlanClient();
  const api = on ? client : null;
  const s = useNilaSigner();
  const members = useUnionMembers(api);
  const shares = useUnionShares(api);
  const catalogue = useCropCatalogue();
  const all = useMemo(() => members.data || [], [members.data]);
  const me = s?.stellarAddress;
  const pick = useCallback((key) => {
    const m = all.find((x) => x.key === key);
    if (!m) return;
    window.location.hash = m.address && m.address === me ? '#/crop' : `#/members/${m.route}`;
  }, [all, me]);

  return useMemo(() => {
    const crops = catalogue.data?.crops || [];
    const cropOf = (key) => {
      if (!key || key === 'unknown') return { name: 'Unidentified', colour: '#8A94A6' };
      const hit = crops.find((c) => c.key === key) || crops.find((c) => key.startsWith(`${c.key}_`));
      return { name: hit?.name || String(key).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), colour: hit?.colour || '#7BA05B' };
    };
    // What grows on each area now (the record's current reading, else its open cycle), as the crop plan's first step.
    const growing = (rec) => {
      const out = {};
      for (const c of Array.isArray(rec?.current_cycle) ? rec.current_cycle : []) {
        const z = c.cluster_id ?? c.zone_id;
        if (z != null && c.crop_type !== undefined) out[z] = c.crop_type || 'unknown';
      }
      for (const c of Array.isArray(rec?.cycles) ? rec.cycles : []) {
        if (c.zone_id != null && !c.eos && out[c.zone_id] === undefined) out[c.zone_id] = c.crop_type || 'unknown';
      }
      return out;
    };
    const label = {};
    const zones = [];
    let count = 0;
    const add = (id, geometry, lab) => { if (geometry && !label[id]) { zones.push({ zone_id: id, geometry }); label[id] = lab; } };
    for (const m of all) {
      const areas = (m.record?.zones || []).filter((z) => z.geometry);
      const mine = shares.data?.[m.address]?.shares || [];
      const outline = () => m.places.forEach((p, i) => add(`${m.key}#p${i}`, p.geometry, i ? { hide: true } : { text: m.label }));
      if (!areas.length && !m.places.length) continue;
      if (filter === 'members') {
        // Every property, its outline and her name.
        if (areas.length) areas.forEach((z, i) => add(`${m.key}#${z.zone_id}`, z.geometry, i ? { hide: true } : { text: m.label }));
        else outline();
        count += 1;
      } else if (filter === 'assets') {
        // Every area as an outline; an area with a crop agreement ready to use in accent, named by its crop.
        const ready = new Map();
        mine.filter((x) => x.ready).forEach((x) => (x.zones || []).forEach((z) => ready.set(z, x)));
        if (areas.length) {
          areas.forEach((z) => {
            const x = ready.get(z.zone_id);
            add(`${m.key}#${z.zone_id}`, z.geometry, x ? { text: x.crop || 'Ready', sub: 'Ready to use', colour: C.accent } : { hide: true });
          });
        } else outline();
        count += ready.size ? 1 : 0;
      } else if (filter === 'cash') {
        // Only the areas whose crop agreement was taken up (cash drawn), as outlines.
        const taken = new Set(mine.filter((x) => x.drawn).flatMap((x) => x.zones || []));
        const hit = areas.filter((z) => taken.has(z.zone_id));
        if (!hit.length) continue;
        hit.forEach((z, i) => add(`${m.key}#${z.zone_id}`, z.geometry, i ? { hide: true, colour: '#ffffff', outline: true } : { text: m.label, colour: '#ffffff', outline: true }));
        count += 1;
      } else if (filter === 'harvests') {
        // What grows on each area now, in its crop's colour.
        const now = growing(m.record);
        if (!areas.length) continue;
        let any = false;
        areas.forEach((z) => {
          const k = now[z.zone_id];
          if (k === undefined) { add(`${m.key}#${z.zone_id}`, z.geometry, { hide: true }); return; }
          const c = cropOf(k);
          any = any || k !== 'unknown';
          add(`${m.key}#${z.zone_id}`, z.geometry, { text: c.name, colour: c.colour });
        });
        count += any ? 1 : 0;
      }
    }
    const chip = `${FILTER_NAMES[filter] || filter} · ${count}`;
    // No property to show (26 Oct): the satellite map centred on the union's land, the chip saying 0.
    const map = <AreaMap record={zones.length ? { zones } : null} center={zones.length ? undefined : unionCentre(all)} labels={label} onSelect={(z) => z && pick(String(z).split('#')[0])} fitSide={90} fitBottom={fitBottom} chip={chip} />;
    return { map, count, loading: !members.data };
  }, [all, filter, shares.data, catalogue.data, pick, fitBottom, members.data]);
}
