// The union's money for the leader's cash boards (P10: A1L, C1, C4, A9), read from the contracts. One query, 30 s.
// Rupees as numbers (nIN has 7 decimals, 1 nIN = ₹1); USDC as numbers.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { useUnionMembers } from './unionMembers';
import { loanOf } from '../loan/owed';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
export const PURPOSES = ['Invest', 'Repay', 'Recovery', 'Treasury', 'LP brings cash'];

export function useUnionCash({ poll = 30_000, on = true } = {}) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionCash', cfg?.union], enabled: on && !!cfg?.contracts?.fund_core && !!cfg?.contracts?.fx_pool,
    refetchInterval: poll, staleTime: 15_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const fx = (fn, args = u) => readContract(cfg, 'fx_pool', fn, args);
      const fc = (fn, args = u) => readContract(cfg, 'fund_core', fn, args);
      // fund_core's union book in one read (30 Oct): treasury, rainy-day fund and the loans on hold.
      const [book, atHand, rows, lpUsdc, dom, off] = await Promise.all([
        fc('union_book'), fx('cash_at_hand'), fx('open_escrows'),
        fx('lp_usdc').catch(() => 0n), fx('senior_usdc', [...u, sv.u32(1)]).catch(() => 0n), fx('senior_usdc', [...u, sv.u32(0)]).catch(() => 0n),
      ]);
      const { treasury, rainy, on_hold: hold } = book || {};
      // The union's open escrows in one read (fx_pool keeps them in one list since 24 Oct).
      const escrows = (rows || []).map((e) => ({ id: Number(e.id), member: e.member, purpose: PURPOSES[Number(e.purpose)] || 'Cash',
        amount: n(e.amount), remaining: n(e.remaining), expires: Number(e.expires) })).sort((a, b) => a.expires - b.expires);
      return {
        treasury: n(treasury), rainy: n(rainy), atHand: n(atHand), escrows,
        // The union's USDC per tag (R24): what LPs brought in (domestic) and senior USDC, domestic and offshore.
        usdc: { lp: n(lpUsdc), domestic: n(dom), offshore: n(off) },
        // Lending is on hold while a loan is overdue (fund_core.on_hold: the count).
        overdue: Number(hold || 0),
        // Available to cash in = treasury − cash at the office, never below 0 (cash at hand may pass the treasury, 24 Oct).
        free: Math.max(0, n(treasury) - n(atHand)),
      };
    },
  });
}

const YEAR = 365 * 86400;
export const SEARCH_WINDOWS = [['24h', 'the last 24 hours'], ['week', 'the last week'], ['month', 'the last month'], ['6months', 'the last 6 months']];

/**
 * The union's book (C1/C2, LOAN_RULES §5 20 Oct): the node's loan list (async list, O15) with each loan's live
 * numbers from fund_core.food_token (its loan). Interest pending = accrued and unpaid plus simple interest since the last accrual
 * at the loan's rate (as fund_core accrues); earnings pending = the union's cut of it as fund_core pays it
 * (treasury + rainy-day fee, in basis points of the interest). Accounted for: the list's outstanding cash principal against the chain's junior
 * borrows (fund_core.get_junior_market.total_borrows). DESIGN GAP: "Member contributions" and the fund total have no
 * formula in the design; here junior cash + borrows, and that plus the senior pool.
 */
export function useUnionBook(api) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionBook', cfg?.union], enabled: !!api && !!cfg?.contracts?.fund_core, staleTime: 60_000,
    queryFn: async () => {
      const u = sv.address(cfg.union);
      const [{ loans }, uc, junior, senior] = await Promise.all([
        api.unionLoans(), readContract(cfg, 'fund_core', 'get_union_config', [u]),
        readContract(cfg, 'fund_core', 'get_junior_market', [u]), readContract(cfg, 'fund_core', 'get_senior_market', [u]),
      ]);
      const now = Date.now() / 1000;
      const rows = await Promise.all(loans.map(async (l) => {
        const [g, v] = await Promise.all([
          readContract(cfg, 'fund_core', 'food_token', [u, sv.bytes32(l.token_id)]).then(loanOf).catch(() => null),
          // Her voucher's tractor acres left, from the chain (27 Oct; the node's list carries no units).
          cfg.contracts.machinery ? readContract(cfg, 'machinery', 'voucher', [u, sv.bytes32(l.token_id)]).catch(() => null) : null,
        ]);
        if (!g || g.closed) return null;
        const out = n(g.principal) - n(g.principal_paid);
        const since = Math.max(0, now - Number(g.last_accrual_ts || g.drawdown_ts));
        const interest = n(g.interest_accrued) - n(g.interest_paid) + (out * Number(g.rate_bp) * since) / (10_000 * YEAR);
        return { token: l.token_id, borrower: l.borrower, drawnAt: l.drawn_at, outstanding: out, interest, rateBp: Number(g.rate_bp), overdue: !!g.overdue,
          hours: v && !v.void ? (Number(v.units) - Number(v.used)) / 100 : 0 };   // tractor acres left (field name kept)
      }));
      const open = rows.filter(Boolean);
      const feeBp = Number(uc?.treasury_fee_bp ?? 0) + Number(uc?.rainy_fee_bp ?? 0);
      const interestPending = open.reduce((t, r) => t + r.interest, 0);
      // The union's cut of interest as fund_core pays it (distribute_interest: interest × fee_bp / 10,000).
      const earningsPending = open.reduce((t, r) => t + (r.interest * feeBp) / 10_000, 0);
      const listed = open.reduce((t, r) => t + r.outstanding, 0);
      const chain = n(junior?.total_borrows);
      const contributions = n(junior?.cash) + n(junior?.total_borrows);
      return {
        loans: open, interestPending, earningsPending, listed, chain,
        gap: Math.round(chain - listed),               // > 0: loans on-chain the list does not know yet
        contributions, fundTotal: contributions + n(senior?.cash) + n(senior?.total_borrows),
      };
    },
  });
}

/**
 * The union's members the leader's app knows (L5 "Who is it for?"): every member of the members list with a Stellar
 * account, with their land (25 Oct: from the list kept on the phone, no mint list or chain read per plan).
 */
export function useKnownMembers(api) {
  const members = useUnionMembers(api);
  return { ...members, data: members.data?.filter((m) => m.address).map((m) => ({ address: m.address, lands: m.lands })) };
}

/** The union's to-do items for L1 (25 Oct): from the members list kept on the phone, not one call per plan or loan.
 *  Crop shares ready: one row with the count, which opens the Assets map (every member with a Ready share is marked
 *  there). Repayments: from the list's loans and their estimated due date (LOAN_RULES §1); her G2 reads the contract's. */
export function useLeaderTodo(api, cash) {
  const { data: cfg } = useStellarConfig();
  const members = useUnionMembers(api);
  return useQuery({
    queryKey: ['stellar', 'leaderTodo', cfg?.union, members.dataUpdatedAt],
    enabled: !!api && !!cfg?.contracts?.fund_core && Array.isArray(members.data), staleTime: 60_000, refetchInterval: 60_000,
    queryFn: async () => {
      const now = Date.now() / 1000;
      const out = [];
      const pending = (await api.pendingApprovals().catch(() => ({ plans: [] }))).plans || [];
      for (const p of pending) out.push({ key: `approve-${p.id}`, title: 'Approve crop plan', who: `Land ${p.land_id}`, to: `approvals/${p.id}` });
      let shares = 0; let who = 0;
      for (const m of members.data) {
        const ready = (m.shareList || []).filter((x) => x.state === 'ready' && !(Number(x.final || 0) > 0 && now > Number(x.final)));
        if (ready.length) { shares += ready.length; who += 1; }
      }
      if (shares) out.push({ key: 'share-ready', title: 'Crop shares ready', who: `${shares} share${shares === 1 ? '' : 's'} · ${who} member${who === 1 ? '' : 's'}`, to: 'assets' });
      for (const m of members.data) {
        for (const l of m.loans) {
          if (l.overdue || (l.due && l.due < now)) out.push({ key: `collect-${l.token}`, title: 'Collect repayment', amount: l.left, who: m.label, to: `members/${m.route}`, urgent: true });
          else if (l.due && l.due - now < 14 * 86400) out.push({ key: `payback-${l.token}`, title: 'Payback coming', amount: l.left, who: m.label, to: `members/${m.route}` });
        }
      }
      return out;
    },
  });
}
