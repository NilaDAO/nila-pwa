// How much cash the office may still take in (30 Oct, executive decision; checked in the app only, fund_core has no room
// for it): the cash at the office after a scan stays within the union's treasury plus the cash members are due to
// take out again: withdrawals started and not collected (fund_core's junior claimable_principal) and the cash parts
// of crop shares Ready now (in their window, unused; from the members list kept on the phone). The chain's own
// backstop stays (24 Oct): a scan above the treasury still opens a Collect offer.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { usePlanClient } from '../plan/hooks';
import { useUnionMembers } from '../leader/unionMembers';
import { NIN } from './request';

const rupees = (v) => Number(BigInt(v ?? 0)) / Number(NIN);

/** The cash parts of the members' crop shares that can be taken up now (rupees). */
export function readyCash(members, now = Date.now() / 1000) {
  let sum = 0;
  for (const m of members || []) {
    for (const x of m.shareList || []) {
      if (x.state !== 'ready' || !(x.cash > 0)) continue;
      if ((x.open && x.open > now) || (x.final && x.final < now)) continue;
      sum += x.cash;
    }
  }
  return sum;
}

/** { room, treasury, withdrawals, shares, atHand } in rupees; room = what one more scan may add. */
export function useDeskRoom() {
  const { data: cfg } = useStellarConfig();
  const members = useUnionMembers(usePlanClient());
  return useQuery({
    queryKey: ['stellar', 'deskRoom', 'limit', cfg?.union, members.dataUpdatedAt],
    enabled: !!cfg && !!members.data, staleTime: 10_000,
    queryFn: async () => {
      const u = [sv.address(cfg.union)];
      const [treasury, atHand, junior] = await Promise.all([
        readContract(cfg, 'fund_core', 'union_treasury', u),
        readContract(cfg, 'fx_pool', 'cash_at_hand', u).catch(() => 0n),
        readContract(cfg, 'fund_core', 'get_junior_market', u),
      ]);
      const parts = { treasury: rupees(treasury), withdrawals: rupees(junior?.claimable_principal), shares: readyCash(members.data), atHand: rupees(atHand) };
      return { ...parts, room: Math.max(0, Math.floor(parts.treasury + parts.withdrawals + parts.shares - parts.atHand)) };
    },
  });
}

/** The line shown when a count is more than the office may take in. */
export const overRoom = (r, total) => `The office may take in ${r.room.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} more, `
  + `not ${total.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}: treasury, withdrawals waiting and Ready crop shares, less the cash already here. `
  + 'Let an LP collect cash, or pay out a withdrawal or crop share first.';
