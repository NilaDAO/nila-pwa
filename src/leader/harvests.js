// Harvests (H1, H2; 25 Oct): the union's crop shares by crop and harvest, from the members list kept on the phone, and
// each crop's price, which a leader sets on Polygon (FoodTokenUpgradeable.setBatchPrice on the crop's standing batch;
// executive decision 25 Oct: on-chain, set by the leaders now and then, as it is local). The batch keeps the price in
// USDT per kg (6 decimals, as Polygon USDT); the leader works in rupees per quintal or tonne, turned into USDT at
// today's fx_pool rate. Selling (buyer, sold lots) is not built: every harvest is "Not sold" (open Q2, X6, O8).
import { useCallback, useState } from 'react';
import { ethers } from 'ethers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProvider } from '../hooks/useWallet.ts';
import { useNilaSigner } from '../wallet/signer';
import { getCropBatches } from '../plan/api';
import foodTokenAbi from '../components/ABI/FoodTokenP1.json';

const FOODTOKEN = process.env.REACT_APP_FOODTOKEN_ADDRESS;
const CHAIN_ID = Number(process.env.REACT_APP_CHAIN_ID) || 137;
const USDT = 1e6;

/** The unit a crop is weighed in on H1 (the boards): tonnes for cane, banana and cassava, else quintals. */
export const unitOf = (crop) => (['sugarcane', 'banana', 'cassava'].some((k) => String(crop).startsWith(k)) ? { per: 1000, name: 'MT', short: 'MT' }
  : { per: 100, name: 'quintal', short: 'q' });

/** Each crop's standing batch and its price on Polygon: [{ crop, name, colour, code, batch, usdtPerKg, catalogueInrPerKg }]. */
export function useCropBatches() {
  const { provider } = useProvider();
  return useQuery({
    queryKey: ['polygon', 'batches'], enabled: !!provider && !!FOODTOKEN, staleTime: 60 * 60_000,
    queryFn: async () => {
      const { batches } = await getCropBatches();
      const ft = new ethers.Contract(FOODTOKEN, foodTokenAbi, provider);
      return Promise.all((batches || []).map(async (b) => {
        let usdtPerKg = 0;
        if (b.batch) {
          try { usdtPerKg = Number((await ft.getBatch(b.batch)).pricePerKgUsdt) / USDT; } catch { /* not readable: no price */ }
        }
        return { ...b, usdtPerKg, catalogueInrPerKg: Number(b.catalogue_inr_per_kg || 0) };
      }));
    },
  });
}

/** Sets a crop's price on its standing batch, signed by this leader's own Polygon key (as the mint at approval). */
export function useSetPrice() {
  const s = useNilaSigner();
  const { provider } = useProvider();
  const qc = useQueryClient();
  const [state, setState] = useState({ status: 'idle' });
  const set = useCallback(async (batch, inrPerKg, inrPerUsd) => {
    setState({ status: 'busy' });
    try {
      if (!(inrPerUsd > 0)) throw new Error('No exchange rate today: try again later.');
      const price = BigInt(Math.round((inrPerKg / inrPerUsd) * USDT));
      const ft = new ethers.Contract(FOODTOKEN, foodTokenAbi, provider);
      const data = ft.interface.encodeFunctionData('setBatchPrice', [batch, price]);
      const me = s.evmAddress;
      const [nonce, fees, gas] = await Promise.all([provider.getTransactionCount(me, 'pending'), provider.getFeeData(),
        provider.estimateGas({ from: me, to: FOODTOKEN, data })]);
      const raw = await s.signEvmTx({ to: FOODTOKEN, data, chainId: CHAIN_ID, nonce, gasLimit: (gas * 12n) / 10n,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0, type: 2 });
      const r = await (await provider.broadcastTransaction(raw)).wait();
      if (r.status !== 1) throw new Error('The price was not set on Polygon.');
      await qc.invalidateQueries({ queryKey: ['polygon', 'batches'] });
      setState({ status: 'done' });
      return true;
    } catch (e) {
      const m = String(e?.shortMessage || e?.message || e);
      setState({ status: 'failed', error: /NotAuthorized/.test(m) ? 'Only a leader of the union can set the price.'
        : /insufficient funds/i.test(m) ? 'Your Polygon wallet has no POL for the fee.' : m });
      return false;
    }
  }, [s, provider, qc]);
  return { state, set, reset: () => setState({ status: 'idle' }) };
}

const half = (d) => (d.getUTCDate() <= 10 ? 0 : d.getUTCDate() <= 20 ? 1 : 2);
const PART = ['start of', 'mid', 'end of'];

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
      const key = `${x.crop_key}.${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.${half(d)}`;
      const c = (crops[x.crop_key] ||= { crop: x.crop_key, name: x.crop, colour: x.colour, groups: {} });
      const g = (c.groups[key] ||= { key, crop: x.crop_key, at: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), [1, 11, 21][half(d)]) / 1000,
        label: `Harvest ${PART[half(d)]} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}${d.getUTCFullYear() !== new Date().getUTCFullYear() ? ` ${d.getUTCFullYear()}` : ''}`,
        shares: [] });
      const m = label[addr];
      g.shares.push({ ...x, member: addr, who: m?.label || `${addr.slice(0, 4)}…${addr.slice(-4)}`, route: m?.route,
        planned: t / 1000, late: !!x.loan && !x.harvested && t / 1000 < now });
    }
  }
  return Object.values(crops).map((c) => ({ ...c, groups: Object.values(c.groups).sort((a, b) => a.at - b.at) }))
    .sort((a, b) => a.groups[0].at - b.groups[0].at);
}
