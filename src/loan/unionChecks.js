// The union checks on a crop share (board LeaderRedeem rows "Cash on hand", "Seed and machine stock",
// "Loan limit of the union"), read from the contracts. HARD caps: the ones fund_core.draw_loan enforces —
// - cash: the junior cash above its reserve (no ₹10,000 cap in code since 30 Oct: the crop plan and the leaders
//   hold it for the first cycle; max_loan is kept as that recommendation)
//   (claimable × (1 + safety_bp) + safety_floor; ReserveStop / InsufficientCash);
// - machine work: free senior money ÷ the value of a tractor acre (NoSeniorBacking);
// - with the union's switch on, the attested amount and hours of her token (AboveFoodToken);
// - blockers: lending on hold (LendingOnHold), her investment below the gate (BelowGate), too many open
//   loans (TooManyLoans).
// Cash on hand (the rupees at the office: cash at hand + the union treasury) is a warning when short.
// Until the checks are loaded, no request can be made (the screens disable their button).
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';

const U = 10_000_000; // nIN 7 decimals
const num = (v) => Number(BigInt(v ?? 0)) / U;
const MAX_LOANS_PER_MEMBER = 32;
const GATE_ROUNDING = 10n; // stroops, as fund_core

export function useUnionChecks(member) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionChecks', cfg?.union, member],
    enabled: !!cfg?.contracts?.fund_core && !!member,
    staleTime: 30_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const um = [...u, sv.address(member)];
      const [uc, junior, senior, earmark, treasury, atHand, perHour, hold, pos, loans] = await Promise.all([
        readContract(cfg, 'fund_core', 'get_union_config', u),
        readContract(cfg, 'fund_core', 'get_junior_market', u),
        readContract(cfg, 'fund_core', 'get_senior_market', u),
        readContract(cfg, 'fund_core', 'senior_earmark', u),
        readContract(cfg, 'fund_core', 'union_treasury', u),
        readContract(cfg, 'fx_pool', 'cash_at_hand', u).catch(() => 0n),
        // A voucher hour is lent at the tractor hour's whole value (26 Oct), out of free senior money.
        cfg.contracts.machinery ? readContract(cfg, 'machinery', 'value_per_tractor_acre', u).catch(() => 0n) : 0n,
        readContract(cfg, 'fund_core', 'union_book', u).then((b) => b?.on_hold ?? 0),
        readContract(cfg, 'fund_core', 'position', um),
        readContract(cfg, 'fund_core', 'loans_of', um),
      ]);
      if (!uc) throw new Error('The union is not set up on Stellar yet.');
      const claimable = BigInt(junior?.claimable_principal ?? 0);
      const reserve = claimable + (claimable * BigInt(uc.safety_bp ?? 0)) / 10_000n + BigInt(uc.safety_floor ?? 0);
      const juniorCash = BigInt(junior?.cash ?? 0);
      const lendable = juniorCash > reserve ? juniorCash - reserve : 0n;
      const maxLoan = num(uc.max_loan);
      // The voucher reserve is outside senior cash (26 Oct): all of it is free.
      const seniorFree = num(senior?.cash);
      void earmark;
      const ph = num(perHour);
      const blocked = [];
      if (Number(hold) > 0) blocked.push('Lending is on hold in the union.');
      if (BigInt(pos?.invested ?? 0) + GATE_ROUNDING < BigInt(uc.gate ?? 0)) blocked.push(`The member needs ₹${Math.round(num(uc.gate)).toLocaleString('en-IN')} invested in the union first.`);
      if ((loans?.length ?? 0) >= MAX_LOANS_PER_MEMBER) blocked.push('The member has too many open crop shares.');
      return {
        maxLoan,
        // Whole rupees: the request is in whole rupees.
        cashCap: Math.max(0, Math.floor(num(lendable))),
        // No machine price set for the union → no machine work can be granted yet.
        // In units (centi tractor acres, 27 Oct): the senior money free for the value of tractor acres.
        hoursCap: ph > 0 ? Math.max(0, Math.floor((seniorFree * 100) / ph)) : 0,
        valuePerHour: ph,
        enforceToken: !!uc.enforce_token_amount,
        onHand: num(atHand) + num(treasury),
        rateBp: Number(uc.rate_bp),
        blocked,
      };
    },
  });
}

/** The caps for one food token: the union's, and with the switch on, the attested amount and hours. */
export function capsFor(c, ft) {
  if (!c) return { cash: 0, hours: 0 };
  if (!c.enforceToken || !ft) return { cash: c.cashCap, hours: c.hoursCap };
  return { cash: Math.min(c.cashCap, Math.floor(num(ft.amount))), hours: Math.min(c.hoursCap, Number(ft.hours)) };
}

/** Repay about: simple interest at the rate fund_core charges, from the draw to the due date. */
export function repayAbout(cash, rateBp, from, due) {
  const days = Math.max(0, (new Date(due) - new Date(from)) / 864e5);
  return Math.round(cash * (1 + (rateBp / 10_000) * (days / 365)));
}

/** The three rows, as the board words them. */
export function checkRows(c, cash, hours, caps = capsFor(c)) {
  if (!c) return [];
  const short = cash - c.onHand;
  return [
    ['Cash on hand', short > 0 ? `₹${Math.round(c.onHand).toLocaleString('en-IN')} · ₹${Math.round(short).toLocaleString('en-IN')} short` : `₹${Math.round(c.onHand).toLocaleString('en-IN')} · enough`, short > 0],
    ['Seed and machine stock', hours <= caps.hours ? 'Enough' : `${(Math.floor(caps.hours / 10) / 10).toFixed(1)} tractor acres at most`, hours > caps.hours],
    ['Loan limit of the union', cash <= caps.cash ? 'Within' : `₹${Math.round(caps.cash).toLocaleString('en-IN')} at most`, cash > caps.cash],
  ];
}
