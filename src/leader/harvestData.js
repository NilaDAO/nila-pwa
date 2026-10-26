// Harvests (H1, H2; 25 Oct): the union's crop shares by crop and harvest, from the members list kept on the phone, and
// each crop's local price, which a leader sets on Stellar (crop_calendar.set_price(leader, union, family, paise per kg),
// sponsored by the node; executive decision 26 Oct: per union, on-chain, set by the leaders now and then). Not on the
// Polygon batch: the standing batches belong to no union, so a leader cannot set their price, and a price there would
// be every union's. The leader works in rupees per quintal or tonne. Selling (buyer, sold lots) is not built: every
// harvest is "Not sold" (open Q2, X6, O8).
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { invokeContract, readContract, sv } from '../stellar/soroban';
import { plainError } from '../stellar/errors';
import { getCropBatches } from '../plan/api';

/** The unit a crop is weighed in on H1 (the boards): tonnes for cane, banana and cassava, else quintals. */
export const unitOf = (crop) => (['sugarcane', 'banana', 'cassava'].some((k) => String(crop).startsWith(k)) ? { per: 1000, name: 'MT', short: 'MT' }
  : { per: 100, name: 'quintal', short: 'q' });

/** Each crop and the union's local price of it: [{ crop, name, colour, code, inrPerKg, catalogueInrPerKg }]. */
export function useCropPrices() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'cropPrices', cfg?.union], enabled: !!cfg?.union && !!cfg?.contracts?.crop_calendar, staleTime: 60 * 60_000,
    queryFn: async () => {
      const { batches } = await getCropBatches();
      return Promise.all((batches || []).map(async (b) => {
        let inrPerKg = 0;
        if (b.code) {
          try { inrPerKg = Number((await readContract(cfg, 'crop_calendar', 'price', [sv.address(cfg.union), sv.u32(b.code)]))?.paise_per_kg || 0) / 100; } catch { /* not readable: no price */ }
        }
        return { ...b, inrPerKg, catalogueInrPerKg: Number(b.catalogue_inr_per_kg || 0) };
      }));
    },
  });
}

/** Sets the union's local price of a crop family, this leader's own call (the node pays the fee). */
export function useSetPrice() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const qc = useQueryClient();
  const [state, setState] = useState({ status: 'idle' });
  const set = useCallback(async (family, inrPerKg) => {
    setState({ status: 'busy' });
    try {
      await invokeContract({ cfg, source: s.senderAddress, account: s.stellarAddress, signHash: s.signHash, contractName: 'crop_calendar', fn: 'set_price',
        args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.u32(family), sv.u32(Math.round(inrPerKg * 100))] });
      await qc.invalidateQueries({ queryKey: ['stellar', 'cropPrices'] });
      setState({ status: 'done' });
      return true;
    } catch (e) {
      setState({ status: 'failed', error: plainError(e?.message || String(e), cfg) });
      return false;
    }
  }, [s, cfg, qc]);
  return { state, set, reset: () => setState({ status: 'idle' }) };
}

const half = (d) => (d.getUTCDate() <= 10 ? 0 : d.getUTCDate() <= 20 ? 1 : 2);
// early / mid / late (25 Oct): "Harvest start of May 2027" read as a date ("starts on May 27").
const PART = ['early', 'mid', 'late'];

/** The union's crop shares by crop, then by harvest (start, mid or end of a month): the H1 rows and an H2 group. */
export function harvestGroups(members, shares, now = Date.now() / 1000) {
  const label = Object.fromEntries((members || []).map((m) => [m.address, m]));
  const crops = {};
  for (const [addr, v] of Object.entries(shares || {})) {
    for (const x of v.shares || []) {
      if (x.lapsed || !x.harvest) continue;
      const t = Date.parse(`${String(x.harvest).slice(0, 10)}T00:00:00Z`);
      if (t / 1000 < now - 60 * 86400 && !x.loan) continue;        // a harvest long past and settled
      const d = new Date(t);
      // Letters, digits and _ only: the id is a route argument (#/harvests/<id>).
      const key = `${x.crop_key}_${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${half(d)}`;
      const c = (crops[x.crop_key] ||= { crop: x.crop_key, name: x.crop, colour: x.colour, groups: {} });
      const g = (c.groups[key] ||= { key, crop: x.crop_key, at: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), [1, 11, 21][half(d)]) / 1000,
        // No "Harvest" before it (25 Oct): the tab and the card say so already.
        label: `${PART[half(d)][0].toUpperCase()}${PART[half(d)].slice(1)} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}${d.getUTCFullYear() !== new Date().getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ''}`,
        short: `${PART[half(d)]} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`,
        shares: [] });
      const m = label[addr];
      g.shares.push({ ...x, member: addr, who: m?.label || `${addr.slice(0, 4)}…${addr.slice(-4)}`, route: m?.route,
        planned: t / 1000, late: !!x.loan && !x.harvested && t / 1000 < now });
    }
  }
  return Object.values(crops).map((c) => ({ ...c, groups: Object.values(c.groups).sort((a, b) => a.at - b.at) }))
    .sort((a, b) => a.groups[0].at - b.groups[0].at);
}
