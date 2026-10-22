// G1 (board LeaderGrowers): the union's growers for the leader. There is no member list on chain (LOAN_RULES
// "Membership"), so the list is built from what the leader's app can already read, newest data wins:
//  - the border jobs of the union (names: her farm or name as sent at registration; GET /border/jobs),
//  - the approved crop plans of lands she leads, their crop shares (mint list) and each share's state on Stellar
//    (fund_core.food_token: attested, drawn), with the plan's crop, harvest and kilos,
//  - the node's union loan list (O15): what is left to repay and whether the loan is overdue.
// DESIGN GAPs: no contact book (names only where a border job has one, else her land or short address); no "Sold"
// (no sales yet); crop health (useCropHealth) not shown.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { borderClient } from '../border/api';
import { useNilaSigner } from '../wallet/signer';
import { rowOf } from '../loan/MyShares';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
const FLAG_DRAWN = 8;
const hexOf = (id) => BigInt(id).toString(16).padStart(64, '0');
const short = (g) => (g ? `${g.slice(0, 4)}…${g.slice(-4)}` : '');

export function useUnionMembers(api) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionMembers', cfg?.union], enabled: !!api && !!s?.signHash && !!cfg?.contracts?.fund_core,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const u = sv.address(cfg.union);
      const now = Date.now() / 1000;
      const by = new Map();
      const get = (g) => { if (!by.has(g)) by.set(g, { address: g, name: '', lands: new Set(), shares: [] }); return by.get(g); };
      const [jobs, plans, loanList] = await Promise.all([
        borderClient(s).jobs().then((r) => r || []).catch(() => []),
        api.approvedPlans().then((r) => r.plans || []).catch(() => []),
        api.unionLoans().then((r) => r.loans || []).catch(() => []),
      ]);
      for (const j of jobs) if (j.member && !j.member.startsWith('keypad:')) { const m = get(j.member); m.name = m.name || j.farm || j.name || ''; }
      const loans = new Map(loanList.map((l) => [String(l.token_id).toLowerCase().replace(/^0x/, ''), l]));
      for (const p of plans) {
        const { mints } = await api.mintList(p.id).catch(() => ({ mints: [] }));
        const zones = Object.keys(p.plan?.proposal || {}).sort();
        await Promise.all(mints.filter((x) => x.token_id).map(async (x) => {
          const hex = hexOf(x.token_id);
          const ft = await readContract(cfg, 'fund_core', 'food_token', [u, sv.bytes32(hex)]).catch(() => null);
          if (!ft?.member) return;
          const share = (p.plan.shares || []).find((y) => y.key === x.share) || {};
          const r = rowOf({ ...x, share, plan: p }) || {};
          const drawn = !!(Number(ft.loan?.flags ?? 0) & FLAG_DRAWN);
          const m = get(ft.member); m.lands.add(p.land_id);
          m.shares.push({ token: hex, crop: r.name || x.crop.replace(/_/g, ' '), colour: r.colour, area: zones.indexOf(x.zone) + 1,
            harvest: r.harvest, kg: r.kg, from: Number(ft.from_date), drawn, ready: !drawn && Number(ft.from_date) <= now });
        }));
      }
      // Loans: what is left and overdue, on the share it was drawn on (or a row of its own for a loan without a plan here).
      await Promise.all([...loans.entries()].map(async ([hex, l]) => {
        const [g, due] = await Promise.all([
          readContract(cfg, 'fund_core', 'get_loan', [u, sv.bytes32(hex)]).catch(() => null),
          readContract(cfg, 'fund_core', 'due_date', [u, sv.bytes32(hex)]).catch(() => null),
        ]);
        if (!g || g.closed) return;
        const left = n(g.principal) - n(g.principal_paid) + n(g.interest_accrued) - n(g.interest_paid);
        const overdue = !!g.overdue || (Number(due || 0) > 0 && Number(due) < now);
        const m = get(l.borrower);
        const sh = m.shares.find((x) => x.token === hex);
        if (sh) Object.assign(sh, { left, overdue, drawn: true, ready: false });
        else m.shares.push({ token: hex, crop: 'Loan', left, overdue, drawn: true });
      }));
      return [...by.values()].map((m) => ({ ...m, lands: [...m.lands].sort((a, b) => a - b),
        label: m.name || (m.lands.size ? `Land ${[...m.lands].join(', ')}` : short(m.address)) }))
        .sort((a, b) => b.shares.some((x) => x.overdue) - a.shares.some((x) => x.overdue) || a.label.localeCompare(b.label));
    },
  });
}
