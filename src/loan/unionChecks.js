// The union checks on a crop share (board LeaderRedeem rows "Cash on hand", "Seed and machine stock",
// "Loan limit of the union"), read from the contracts:
// - loan limit: the union's max_loan (₹10,000) and the junior money free to lend — HARD caps (draw_loan
//   refuses above them: CapExceeded / no junior cash);
// - machine stock: free senior money ÷ the prepaid part per hour (draw_loan refuses NoSeniorBacking) — HARD cap;
// - cash on hand: the rupees at the office (cash at hand + the union treasury) — a warning when short
//   (the board's #short; the LP offer comes with the LP lane).
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';

const U = 10_000_000; // nIN 7 decimals
const num = (v) => Number(BigInt(v ?? 0)) / U;

export function useUnionChecks() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionChecks', cfg?.union],
    enabled: !!cfg?.contracts?.fund_core,
    staleTime: 30_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const [uc, junior, senior, earmark, treasury, atHand, perHour] = await Promise.all([
        readContract(cfg, 'fund_core', 'get_union_config', u),
        readContract(cfg, 'fund_core', 'get_junior_market', u),
        readContract(cfg, 'fund_core', 'get_senior_market', u),
        readContract(cfg, 'fund_core', 'senior_earmark', u),
        readContract(cfg, 'fund_core', 'union_treasury', u),
        readContract(cfg, 'fx_pool', 'cash_at_hand', u).catch(() => 0n),
        cfg.contracts.machinery ? readContract(cfg, 'machinery', 'max_prepay_per_hour', u).catch(() => 0n) : 0n,
      ]);
      const maxLoan = num(uc?.max_loan);
      const juniorFree = num(junior?.cash);
      const seniorFree = num(senior?.cash) - num(earmark);
      const ph = num(perHour);
      return {
        maxLoan, juniorFree,
        cashCap: Math.max(0, Math.min(maxLoan, juniorFree)),
        // No machine rate set for the union → no machine hours can be granted yet.
        hoursCap: ph > 0 ? Math.max(0, Math.floor(seniorFree / ph)) : 0,
        onHand: num(atHand) + num(treasury),
        rateBp: uc?.rate_bp,
      };
    },
  });
}

/** The three rows, as the board words them. */
export function checkRows(c, cash, hours) {
  if (!c) return [];
  const short = cash - c.onHand;
  return [
    ['Cash on hand', short > 0 ? `₹${Math.round(c.onHand).toLocaleString('en-IN')} · ₹${Math.round(short).toLocaleString('en-IN')} short` : `₹${Math.round(c.onHand).toLocaleString('en-IN')} · enough`, short > 0],
    ['Seed and machine stock', hours <= c.hoursCap ? 'Enough' : `${c.hoursCap} h at most`, hours > c.hoursCap],
    ['Loan limit of the union', cash <= c.cashCap ? 'Within' : `₹${Math.round(c.cashCap).toLocaleString('en-IN')} at most`, cash > c.cashCap],
  ];
}
