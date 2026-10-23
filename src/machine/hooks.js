// P6 machinery vouchers (executive decision, 17 Oct; LOAN_RULES §5 "Machinery vouchers (P6)"), read from the
// Stellar machinery contract (the design's Polygon voucher contract is replaced by C5; query keys moved
// to `stellar`). Vouchers in tractor hours (executive decision 23 Oct): held on-chain in hundredths (units); an hour
// of a machine uses its rate ÷ the tractor's (type 1) rate, rounded up to a unit, as machinery.claim counts it.
// The contract has no list views: machine types are found by reading rate(union, 1..16), machines by
// reading machine(1..) until the first empty id, her vouchers through fund_core.loans_of.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';

const NIN = 10_000_000;
export const num = (v) => Number(BigInt(v ?? 0)) / NIN;
const hexOf = (b) => Buffer.from(b).toString('hex');

// Type numbers as the plan engine's finance table uses them (plan/reference/finance_v1.json); a type the
// union sets a rate for without a name here shows as "Machine type N". DESIGN GAP: no type names on-chain.
// One type per tractor + implement (executive decision 22 Oct, lean): an owner registers her tractor once per implement.
export const TYPE_NAMES = {
  1: 'Tractor + rotavator', 2: 'Seed drill / planter', 3: 'Power weeder', 4: 'Tractor + cultivator', 5: 'Tractor + plough',
  6: 'Tractor + disc harrow', 7: 'Tractor + ridger', 8: 'Tractor + puddler', 9: 'Tractor + trailer', 10: 'Tractor + cane trailer',
  11: 'Power tiller', 12: 'Paddy transplanter', 13: 'Sugarcane sett planter',
};
export const typeName = (t) => TYPE_NAMES[t] || `Machine type ${t}`;
export const PARTS = [['diesel', 'Diesel'], ['driver', 'Driver'], ['maintenance', 'Maintenance'],
  ['insurance', 'Insurance'], ['depreciation', 'Depreciation'], ['margin', 'Margin']];
export const HOLD_REASONS = { 1: 'In repair', 2: 'Driver not available', 3: 'Other' };
const MAX_TYPES = 16;
/** The machine type whose hour is the voucher's unit. */
export const TRACTOR = 1;
/** Units (centi tractor hours) as tractor hours with one decimal. */
export const th = (u) => (Math.round(Number(u || 0) / 10) / 10).toFixed(1);
/** Units that `hours` of a machine at `rate` (₹ an hour) use against a tractor at `tractor` (as the contract, rounded up). */
export const unitsOf = (hours, rate, tractor) => (tractor > 0 ? Math.ceil(Math.round((hours * rate * 100) / tractor * 1e6) / 1e6) : 0);
/** Whole hours of a machine at `rate` that `units` pay for. */
export const hoursFor = (units, rate, tractor) => (rate > 0 ? Math.floor(Math.round((units * tractor) / (100 * rate) * 1e6) / 1e6) : 0);
const MAX_MACHINES = 500;

/** The union's rate table: [{type, name, parts (₹ an hour), total}] (machinery.rate, set by the union account). */
export function useRates() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'rates', cfg?.union], enabled: !!cfg?.contracts?.machinery, staleTime: 300_000,
    queryFn: async () => {
      const out = [];
      const types = Array.from({ length: MAX_TYPES }, (_, i) => i + 1);
      const rates = await Promise.all(types.map((t) => readContract(cfg, 'machinery', 'rate', [sv.address(cfg.union), sv.u32(t)]).catch(() => null)));
      rates.forEach((r, i) => {
        if (!r) return;
        const parts = Object.fromEntries(PARTS.map(([k]) => [k, num(r[k])]));
        out.push({ type: types[i], name: typeName(types[i]), parts, total: Object.values(parts).reduce((a, b) => a + b, 0) });
      });
      return out;
    },
  });
}

// Her voucher code (A8a, 23 Oct): { entry, token, hours, type, used, until }, the one signed code on this phone.
const CODE_KEY = 'nila.voucher.signed';
export const loadVoucherCode = () => { try { return JSON.parse(localStorage.getItem(CODE_KEY)) || null; } catch { return null; } };
export const saveVoucherCode = (c) => { try { if (c) localStorage.setItem(CODE_KEY, JSON.stringify(c)); else localStorage.removeItem(CODE_KEY); } catch { /* private */ } };

/** Her vouchers: one per loan with hours (fund_core.loans_of → machinery.voucher), in units. Left = hours − used. */
export function useVouchers(member) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'vouchers', cfg?.union, member], enabled: !!cfg?.contracts?.machinery && !!member, staleTime: 30_000,
    queryFn: async () => {
      const ids = await readContract(cfg, 'fund_core', 'loans_of', [sv.address(cfg.union), sv.address(member)]);
      const rows = await Promise.all((ids || []).map(async (id) => {
        const token = hexOf(id);
        const v = await readContract(cfg, 'machinery', 'voucher', [sv.address(cfg.union), sv.bytes32(token)]).catch(() => null);
        if (!v || v.void) return null;
        return { token, hours: Number(v.hours), used: Number(v.used), left: Number(v.hours) - Number(v.used) };
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
        if (m.union === cfg.union) out.push({ id, ...m, machine_type: Number(m.machine_type), hours_per_week: Number(m.hours_per_week), hold_reason: Number(m.hold_reason) });
      }
      return out;
    },
  });
}

/** Her machines as owner (A13): `pick` (machine id) or the first not confirmed yet, else the newest; with this
 *  week's hours and `all` her machines. */
export function useMyMachine(owner, { pick, poll } = {}) {
  const machines = useMachines({ poll });
  const { data: cfg } = useStellarConfig();
  const all = machines.data?.filter((m) => m.owner === owner) || [];
  const mine = all.find((m) => m.id === pick) || all.find((m) => !m.confirmed) || all[all.length - 1];
  const week = useQuery({
    queryKey: ['stellar', 'machine', mine?.id, 'week'], enabled: !!mine && !!cfg, staleTime: 30_000,
    queryFn: () => readContract(cfg, 'machinery', 'hours_this_week', [sv.u64(mine.id)]),
  });
  return { ...machines, data: machines.data && (mine ? { ...mine, usedThisWeek: Number(week.data ?? 0), all } : null) };
}

// The owner's jobs, kept on her phone from her claim results (no indexer yet, 17 Oct): the pending part
// is read again from each loan's voucher_book.
const JOBS = 'nila.machine.jobs';
export const loadJobs = () => { try { return JSON.parse(localStorage.getItem(JOBS)) || []; } catch { return []; } };
export const saveJob = (j) => { try { localStorage.setItem(JOBS, JSON.stringify([...loadJobs(), j])); } catch { /* private */ } };

/** A13 "Paid to you": received at the job (her claims), pending per job, ready to collect (owner_balance). */
export function useOwnerDues(owner) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'dues', cfg?.union, owner], enabled: !!cfg && !!owner, staleTime: 30_000,
    queryFn: async () => {
      const jobs = loadJobs().filter((j) => j.owner === owner);
      const books = {};
      for (const t of new Set(jobs.map((j) => j.token))) {
        books[t] = await readContract(cfg, 'fund_core', 'voucher_book', [sv.address(cfg.union), sv.bytes32(t)]).catch(() => null);
      }
      const pendingOf = (t) => num((books[t]?.dues || []).filter((d) => d.owner === owner).reduce((a, d) => a + BigInt(d.amount), 0n));
      const ready = num(await readContract(cfg, 'fund_core', 'owner_balance', [sv.address(cfg.union), sv.address(owner)]));
      return {
        received: jobs.reduce((a, j) => a + j.prepay, 0),
        pending: [...new Set(jobs.map((j) => j.token))].reduce((a, t) => a + pendingOf(t), 0),
        ready,
        jobs: jobs.map((j) => ({ ...j, pendingNow: pendingOf(j.token) })),
      };
    },
  });
}
