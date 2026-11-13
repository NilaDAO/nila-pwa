// How much cash the office may still take in (executive decision 30 Oct; on-chain since 31 Oct: fund_core.cash_room,
// which fx_pool enforces at every cash scan): the union's treasury plus the cash members are due to take out again,
// withdrawals started and not collected and the cash parts of undrawn crop agreements whose window closes within 9 weeks.
// The app reads the same figure so the leader sees the reason before a count is refused.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { NIN } from './request';

const rupees = (v) => Number(BigInt(v ?? 0)) / Number(NIN);

/** { limit, room, treasury, withdrawals, shares, atHand } in rupees; limit = fund_core.cash_room, room = what one more
 *  scan may add. */
export function useDeskRoom() {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'deskRoom', 'limit', cfg?.union],
    enabled: !!cfg, staleTime: 10_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const [treasury, atHand, junior, cashRoom] = await Promise.all([
        readContract(cfg, 'fund_core', 'union_treasury', u),
        readContract(cfg, 'fx_pool', 'cash_at_hand', u).catch(() => 0n),
        readContract(cfg, 'fund_core', 'get_junior_market', u),
        readContract(cfg, 'fund_core', 'cash_room', u),
      ]);
      const parts = { treasury: rupees(treasury), withdrawals: rupees(junior?.claimable_principal), atHand: rupees(atHand) };
      parts.shares = Math.max(0, rupees(cashRoom) - parts.treasury - parts.withdrawals);
      return { ...parts, limit: rupees(cashRoom), room: Math.max(0, Math.floor(rupees(cashRoom) - parts.atHand)) };
    },
  });
}

/** The line shown when a count is more than the office may take in. */
export const overRoom = (r, total) => `The office may take in ${r.room.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} more, `
  + `not ${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}: treasury, withdrawals waiting and crop agreements whose cash is due in the next 9 weeks, less the cash already here. `
  + 'Let an LP take cash, or pay out a withdrawal or crop agreement first.';
