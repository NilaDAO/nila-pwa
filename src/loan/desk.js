// Her investment paid over the desk (executive decision 22 Oct; her signed QR since 24 Oct, deskCode.js): what she can
// collect now, read by the leader's Pay out cash before it submits fund_core.claim_junior_cash.
import { readContract, sv } from '../stellar/soroban';

const RAY = 10n ** 27n;
const DAYS_14 = 14 * 86400;

/** Her claim at the desk now: shares that can be claimed (claimable, or pending after 14 days) and their rupees. */
export async function deskClaim(cfg, member) {
  const u = [sv.address(cfg.union), sv.address(member)];
  const [p, m] = await Promise.all([
    readContract(cfg, 'fund_core', 'position', u),
    readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)]),
  ]);
  const now = Date.now() / 1000;
  const ready = p?.request_ts && Number(p.request_ts) + DAYS_14 <= now;
  const shares = BigInt(p?.claimable_shares ?? 0) + (ready ? BigInt(p?.pending_shares ?? 0) : 0n);
  const inr = Number((shares * BigInt(m?.index ?? 0)) / RAY) / 1e7;
  const pendingFrom = !ready && BigInt(p?.pending_shares ?? 0) > 0n ? Number(p.request_ts) + DAYS_14 : null;
  return { shares, inr, pendingFrom };
}
