// The union's money for the leader's cash boards (P10: A1L, C1, C4, A9), read from the contracts. One query, 30 s.
// Rupees as numbers (nIN has 7 decimals, 1 nIN = ₹1); USDC as numbers.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
export const PURPOSES = ['Invest', 'Repay', 'Recovery', 'Treasury', 'LP brings cash'];

export function useUnionCash({ poll = 30_000 } = {}) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionCash', cfg?.union], enabled: !!cfg?.contracts?.fund_core && !!cfg?.contracts?.fx_pool,
    refetchInterval: poll, staleTime: 15_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const fx = (fn, args = u) => readContract(cfg, 'fx_pool', fn, args);
      const fc = (fn, args = u) => readContract(cfg, 'fund_core', fn, args);
      const [treasury, rainy, atHand, ids, lpUsdc, dom, off, hold] = await Promise.all([
        fc('union_treasury'), fc('union_rainy_day').catch(() => 0n), fx('cash_at_hand'), fx('escrows_of'),
        fx('lp_usdc').catch(() => 0n), fx('senior_usdc', [...u, sv.u32(1)]).catch(() => 0n), fx('senior_usdc', [...u, sv.u32(0)]).catch(() => 0n),
        fc('on_hold').catch(() => 0),
      ]);
      const escrows = (await Promise.all((ids || []).map(async (id) => {
        const e = await fx('get_escrow', [sv.u64(id)]).catch(() => null);
        return e && { id: Number(id), member: e.member, purpose: PURPOSES[Number(e.purpose)] || 'Cash', amount: n(e.amount), remaining: n(e.remaining), expires: Number(e.expires) };
      }))).filter(Boolean).sort((a, b) => a.expires - b.expires);
      return {
        treasury: n(treasury), rainy: n(rainy), atHand: n(atHand), escrows,
        // The union's USDC per tag (R24): what LPs brought in (domestic) and senior USDC, domestic and offshore.
        usdc: { lp: n(lpUsdc), domestic: n(dom), offshore: n(off) },
        // Lending is on hold while a loan is overdue (fund_core.on_hold: the count).
        overdue: Number(hold || 0),
        // Available to cash in = treasury − cash in circulation (cash at hand never exceeds the treasury).
        free: Math.max(0, n(treasury) - n(atHand)),
      };
    },
  });
}

const YEAR = 365 * 86400;
export const SEARCH_WINDOWS = [['24h', 'the last 24 hours'], ['week', 'the last week'], ['month', 'the last month'], ['6months', 'the last 6 months']];

/**
 * The union's book (C1/C2, LOAN_RULES §5 20 Oct): the node's loan list (async list, O15) with each loan's live
 * numbers from fund_core.get_loan. Interest pending = accrued and unpaid plus simple interest since the last accrual
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
        const g = await readContract(cfg, 'fund_core', 'get_loan', [u, sv.bytes32(l.token_id)]).catch(() => null);
        if (!g || g.closed) return null;
        const out = n(g.principal) - n(g.principal_paid);
        const since = Math.max(0, now - Number(g.last_accrual_ts || g.drawdown_ts));
        const interest = n(g.interest_accrued) - n(g.interest_paid) + (out * Number(g.rate_bp) * since) / (10_000 * YEAR);
        return { token: l.token_id, borrower: l.borrower, drawnAt: l.drawn_at, outstanding: out, interest, rateBp: Number(g.rate_bp), overdue: !!g.overdue };
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
