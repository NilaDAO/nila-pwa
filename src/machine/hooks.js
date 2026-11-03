// P6 machinery vouchers (executive decision, 17 Oct; LOAN_RULES §5 "Machinery vouchers (P6)"), read from the
// Stellar machinery contract (the design's Polygon voucher contract is replaced by C5; query keys moved
// to `stellar`). Vouchers in tractor ACRES (executive decision 27 Oct; were tractor hours): held on-chain in hundredths
// (units); an acre of a machine's work uses its price an acre ÷ the tractor's (type 1), rounded up to a unit, as
// machinery.claim counts it. The union may price a machine for one crop (trailer × sugarcane): rate_for_crop.
// The contract has no list views: machine types are found by reading rate(union, 1..16), machines by
// reading machine(1..) until the first empty id, her vouchers through fund_core.loans_of.
import { useQuery } from '@tanstack/react-query';
import { useMyShares } from '../loan/MyShares';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv, tokenHex } from '../stellar/soroban';

const NIN = 10_000_000;
export const num = (v) => Number(BigInt(v ?? 0)) / NIN;
const hexOf = (b) => Buffer.from(b).toString('hex');

// Type numbers as the plan engine's finance table uses them (plan/reference/finance_v1.json, 1–13), then the standard
// range a union may add (14–24); a number without a name here shows as "Machine type N". Names live in the app only
// (executive decision 2 Nov): the contract keeps the number.
// One type per tractor + implement (executive decision 22 Oct, lean): an owner registers her tractor once per implement.
export const TYPE_NAMES = {
  1: 'Tractor + rotavator', 2: 'Seed drill / planter', 3: 'Power weeder', 4: 'Tractor + cultivator', 5: 'Tractor + plough',
  6: 'Tractor + disc harrow', 7: 'Tractor + ridger', 8: 'Tractor + puddler', 9: 'Tractor + trailer', 10: 'Tractor + cane trailer',
  11: 'Power tiller', 12: 'Paddy transplanter', 13: 'Sugarcane sett planter',
  // The standard range a union may add a price for (LS Add a machine, 2 Nov); not in the plan engine's catalogue, so
  // crop plans do not propose them: members pick them for a voucher, owners register them (L13).
  14: 'Combine harvester', 15: 'Paddy reaper', 16: 'Thresher', 17: 'Tractor + boom sprayer', 18: 'Power sprayer',
  19: 'Drone sprayer', 20: 'Laser land leveller', 21: 'Tractor + mulcher', 22: 'Groundnut digger', 23: 'Sugarcane harvester',
  24: 'Baler',
};
/** The voucher categories of LS Add a voucher (2 Nov). Only Mechanisation exists on-chain (machinery prices an acre
 *  of machine work); the other categories are samples of what the union could offer, not on-chain yet: they need their
 *  own voucher contract (input prices, R57), so the app lists them and does not let a signer propose them. */
export const VOUCHER_CATEGORIES = [
  { name: 'Mechanisation', onChain: true },
  { name: 'Seeds', items: ['Paddy seed (certified)', 'Maize hybrid seed', 'Groundnut seed', 'Black gram seed', 'Cotton seed'] },
  { name: 'Storage', items: ['Hermetic grain bags', 'Warehouse space', 'Cold storage'] },
  { name: 'Fertilisers', items: ['Urea', 'DAP', 'Potash (MOP)', 'Vermicompost', 'Micronutrient mix'] },
  { name: 'Pesticides', items: ['Neem oil', 'Trichoderma (bio-fungicide)', 'Herbicide', 'Insecticide spray'] },
];
/** The standard machine types, in order (the app's catalogue; the contract keeps only the number). */
export const TYPES = Object.keys(TYPE_NAMES).map(Number);
export const typeName = (t) => TYPE_NAMES[t] || `Machine type ${t}`;
export const PARTS = [['diesel', 'Diesel'], ['driver', 'Driver'], ['maintenance', 'Maintenance'],
  ['insurance', 'Insurance'], ['depreciation', 'Depreciation'], ['margin', 'Margin']];
export const HOLD_REASONS = { 1: 'In repair', 2: 'Driver not available', 3: 'Other' };
/** machinery's MAX_TYPES: the most machine types one union can price. */
export const MAX_UNION_TYPES = 16;
/** The machine type whose acre is the voucher's unit. */
export const TRACTOR = 1;
/** Units (centi tractor acres) as tractor acres with one decimal. */
export const ta = (u) => (Math.round(Number(u || 0) / 10) / 10).toFixed(1);
/** Acres worked as the contract takes them: hundredths of an acre (27 Oct). */
export const centi = (acres) => Math.round(Number(acres || 0) * 100);
/** Units that `acres` of a machine at `rate` (₹ an acre) use against a tractor at `tractor` (as the contract:
 *  ceil(hundredths worked × price ÷ tractor price)). */
export const unitsOf = (acres, rate, tractor) => (tractor > 0 ? Math.ceil(Math.round((centi(acres) * rate) / tractor * 1e6) / 1e6) : 0);
/** Acres of a machine at `rate` that `units` pay for, down to a hundredth of an acre. */
export const acresFor = (units, rate, tractor) => (rate > 0 ? Math.floor(Math.round((units * tractor) / rate * 1e6) / 1e6) / 100 : 0);
/** Acres with up to two decimals ("1.07 ac"). */
export const acresText = (a) => `${Math.round(Number(a || 0) * 100) / 100} ac`;

/** A crop share's crop family and area as machinery reads them from its token id (FoodToken packTokenId: crop code
 *  at bit 204, area in m² at bit 148): { family, centiAcres } (rounded up, as the contract's area cap). */
export function shareOfToken(token) {
  const t = BigInt(`0x${String(token).replace(/^0x/, '').padStart(64, '0')}`);
  const bits = (shift, width) => Number((t >> BigInt(shift)) & ((1n << BigInt(width)) - 1n));
  const m2 = bits(148, 24);
  return { family: Math.floor(bits(204, 20) / 1000), centiAcres: Math.ceil((m2 * 1_000_000) / 40_468_564) };
}

const priceOf = (r) => {
  if (!r) return null;
  const parts = Object.fromEntries(PARTS.map(([k]) => [k, num(r[k])]));
  return { parts, total: Object.values(parts).reduce((x, y) => x + y, 0) };
};
/** The price an acre of `type` on a crop family: the union's crop price if set, else the type's (machinery.rate_for_crop). */
export async function rateForCrop(cfg, type, family) {
  return priceOf(await readContract(cfg, 'machinery', 'rate_for_crop', [sv.address(cfg.union), sv.u32(type), sv.u32(family)]).catch(() => null));
}
/** The price an acre of `type` (machinery.rate), read now: null when the union set none; a failed read throws. */
export async function readRate(cfg, type) {
  return priceOf(await readContract(cfg, 'machinery', 'rate', [sv.address(cfg.union), sv.u32(type)]));
}
const MAX_MACHINES = 500;

/** The union's price table: [{type, name, parts (₹ an acre), total}] (machinery.rate, set by the union account). */
export function useRates() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'rates', cfg?.union], enabled: !!cfg?.contracts?.machinery, staleTime: 300_000,
    queryFn: async () => {
      const types = TYPES;   // every standard type (the contract has no list view): a union prices at most 16 of them
      // A type without a price reads as None (null). A failed read throws, so the query retries and keeps the last good
      // table: a swallowed error used to drop the tractor's price (type 1) from the cached table for 5 minutes, and
      // every acre figure built on it read 0 (A13 "Up to 0 ac on this code", A8 "Nothing left on this voucher").
      const rates = await Promise.all(types.map((t) => readRate(cfg, t)));
      return rates.flatMap((p, i) => (p ? [{ type: types[i], name: typeName(types[i]), ...p }] : []));
    },
  });
}

// Her voucher code (A8a, 23 Oct): { entry, token, units, type, used, until }, the one signed code on this phone.
const CODE_KEY = 'nila.voucher.signed';
export const loadVoucherCode = () => { try { return JSON.parse(localStorage.getItem(CODE_KEY)) || null; } catch { return null; } };
export const saveVoucherCode = (c) => { try { if (c) localStorage.setItem(CODE_KEY, JSON.stringify(c)); else localStorage.removeItem(CODE_KEY); } catch { /* private */ } };

/** Her vouchers: one per crop share with machine work (machinery.voucher), in units. Left = units − used. They stay hers
 *  after the loan is repaid (26 Oct), and a repaid loan leaves fund_core.loans_of: so her drawn crop shares (her plans'
 *  mint lists, `tokens`) are read too, not only her open loans. */
export function useVouchers(member) {
  const { data: cfg } = useStellarConfig();
  const tokens = (useMyShares().data || []).filter((x) => x.drawn).map((x) => tokenHex(x.token_id));
  return useQuery({
    queryKey: ['stellar', 'vouchers', cfg?.union, member, tokens.join(',')], enabled: !!cfg?.contracts?.machinery && !!member, staleTime: 30_000,
    queryFn: async () => {
      const open = await readContract(cfg, 'fund_core', 'loans_of', [sv.address(cfg.union), sv.address(member)]);
      const all = [...new Set([...(open || []).map(hexOf), ...tokens.map((t) => String(t).replace(/^0x/, '').toLowerCase().padStart(64, '0'))])];
      const rows = await Promise.all(all.map(async (token) => {
        const v = await readContract(cfg, 'machinery', 'voucher', [sv.address(cfg.union), sv.bytes32(token)]).catch(() => null);
        if (!v || v.void || v.member !== member) return null;
        return { token, units: Number(v.units), used: Number(v.used), left: Number(v.units) - Number(v.used) };
      }));
      return rows.filter(Boolean);
    },
  });
}

/** Every machine of the union with its id (machinery.machine(1..) until the first empty id). A read error fails
 *  the query, so the last good list stays (a cut-short list would hide her machine). `poll`: refresh every
 *  minute (A13 while she waits for the leader's registration); elsewhere on open only. */
export function useMachines({ poll = false, on = true } = {}) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'machines', cfg?.union], enabled: on && !!cfg?.contracts?.machinery, staleTime: 60_000,
    refetchInterval: poll ? 60_000 : false,
    queryFn: async () => {
      const out = [];
      for (let id = 1; id <= MAX_MACHINES; id++) {
        const m = await readContract(cfg, 'machinery', 'machine', [sv.u64(id)]);
        if (!m) break;
        if (m.union === cfg.union) out.push({ id, ...m, machine_type: Number(m.machine_type), acres_per_week: Number(m.acres_per_week), hold_reason: Number(m.hold_reason) });
      }
      return out;
    },
  });
}

/** Her machines as owner (A13): `pick` (machine id) or the first not confirmed yet, else the newest; with this
 *  week's acres and `all` her machines. */
export function useMyMachine(owner, { pick, poll } = {}) {
  const machines = useMachines({ poll });
  const { data: cfg } = useStellarConfig();
  const all = machines.data?.filter((m) => m.owner === owner) || [];
  const mine = all.find((m) => m.id === pick) || all.find((m) => !m.confirmed) || all[all.length - 1];
  const week = useQuery({
    queryKey: ['stellar', 'machine', mine?.id, 'week'], enabled: !!mine && !!cfg, staleTime: 30_000,
    queryFn: () => readContract(cfg, 'machinery', 'acres_this_week', [sv.u64(mine.id)]),
  });
  return { ...machines, data: machines.data && (mine ? { ...mine, usedThisWeek: Number(week.data ?? 0) / 100, all } : null) };
}

// The owner's jobs, kept on the owner's phone from the claim results (no indexer yet, 17 Oct): the prepay paid at the job
// and the rest held until the member repays (owner split, 1 Nov).
const JOBS = 'nila.machine.jobs';
export const loadJobs = () => { try { return JSON.parse(localStorage.getItem(JOBS)) || []; } catch { return []; } };
export const saveJob = (j) => { try { localStorage.setItem(JOBS, JSON.stringify([...loadJobs(), j])); } catch { /* private */ } };

/** A13 "Paid to you" (owner split, 1 Nov): the prepay paid at each job (from the jobs on this phone), what is ready to
 *  collect (fund_core.owner_balance: the held parts the members' repayments settled) and what each voucher still owes
 *  the owner until its member repays (fund_core.owner_dues per crop share of the owner's jobs). */
export function useOwnerDues(owner) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'dues', cfg?.union, owner], enabled: !!cfg?.contracts?.fund_core && !!owner, staleTime: 30_000,
    queryFn: async () => {
      const u = sv.address(cfg.union);
      const jobs = loadJobs().filter((j) => j.owner === owner);
      const tokens = [...new Set(jobs.map((j) => j.token))];
      const [balance, owed] = await Promise.all([
        readContract(cfg, 'fund_core', 'owner_balance', [u, sv.address(owner)]).catch(() => 0n),
        Promise.all(tokens.map((t) => readContract(cfg, 'fund_core', 'owner_dues', [u, sv.bytes32(t)])
          .then((d) => num((d?.owners || []).filter((o) => o.owner === owner).reduce((a, o) => a + BigInt(o.amount), 0n)))
          .catch(() => 0))),
      ]);
      const owedBy = Object.fromEntries(tokens.map((t, i) => [t, owed[i]]));
      // A crop share's owed amount is shown on its latest job (the contract keeps one figure per share and owner).
      const last = Object.fromEntries(jobs.map((j, i) => [j.token, i]));
      return {
        received: jobs.reduce((a, j) => a + j.prepay, 0),
        ready: num(balance),
        pending: owed.reduce((a, x) => a + x, 0),
        jobs: jobs.map((j, i) => ({ ...j, pendingNow: last[j.token] === i ? owedBy[j.token] : 0 })).reverse(),
      };
    },
  });
}

/** The union's split of a machine's price (owner split and the union's parts, executive decisions 1–2 Nov): which
 *  parts go to the union treasury (machinery.union_parts, PART_* bits; default depreciation and margin) and the share of
 *  the driver part paid at the job (machinery.prepay_share, basis points). */
export const UNION_PART_BITS = { maintenance: 4, insurance: 8, depreciation: 16, margin: 32 };
export function useUnionSplit() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionSplit', cfg?.union], enabled: !!cfg?.contracts?.machinery, staleTime: 300_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const [mask, bp] = await Promise.all([
        readContract(cfg, 'machinery', 'union_parts', u).catch(() => 48),
        readContract(cfg, 'machinery', 'prepay_share', u).catch(() => 0),
      ]);
      return { mask: Number(mask ?? 48), driverBp: Number(bp ?? 0) };
    },
  });
}

/** One job's money as machinery.claim splits it: `toUnion` (the union's parts), `now` (diesel plus the union's share of
 *  the driver part, paid at the job), `later` (the rest of the owner's part, when the member repays). ₹ for `acres`. */
export function splitOf(parts, acres, split) {
  const mask = split?.mask ?? 48;
  const total = PARTS.reduce((a, [k]) => a + (parts[k] || 0), 0) * acres;
  const toUnion = Object.entries(UNION_PART_BITS).reduce((a, [k, b]) => a + ((mask & b) ? parts[k] || 0 : 0), 0) * acres;
  const own = total - toUnion;
  const now = Math.min(own, ((parts.diesel || 0) + (parts.driver || 0) * (split?.driverBp ?? 0) / 10_000) * acres);
  return { total, toUnion, now, later: own - now };
}
