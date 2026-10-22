// Her investment paid over the desk (executive decision 22 Oct, LOAN_RULES "No nIN in a member's wallet (desk
// only)"): fund_core.claim_junior_cash(union, member, leader, max_shares) needs both signatures. The leader's app
// signs the leader's authorization entry and shows it as a QR (L9 direction, as the crop share request); her phone
// checks it, shows what she collects and submits the call with her own signature (the node fee-bumps her call).
// TODO(reverse QR): when the reverse-QR flow is built (product/specs/Keypad_Reverse_QR_Consent.md) the leader
// prepares the request and scans her signed QR instead; this direction then goes.
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { readContract, signAuthFor, sv } from '../stellar/soroban';

const PREFIX = 'nila:desk:';
const RAY = 10n ** 27n;
const DAYS_14 = 14 * 86400;
const b64u = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => s.replace(/-/g, '+').replace(/_/g, '/');
const get = (o, k) => (typeof o?.[k] === 'function' ? o[k]() : o?.[k]);

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

/** Leader: her signed entry for this member's claim (max_shares 0 = all she can claim), as the QR text. */
export async function makeDeskRequest(cfg, { leader, member, signHash }) {
  const entry = await signAuthFor({ cfg, source: member, signer: leader, signHash, contractName: 'fund_core', fn: 'claim_junior_cash',
    args: [sv.address(cfg.union), sv.address(member), sv.address(leader), sv.i128(0n)] });
  return PREFIX + b64u(entry);
}

export const isDeskRequest = (text) => !!text?.startsWith(PREFIX);

/** Member: decode and check a scanned desk request for her. Throws a plain reason when it is not valid. */
export async function checkDeskRequest(text, { cfg, me }) {
  let e;
  try { e = xdr.SorobanAuthorizationEntry.fromXDR(unb64u(text.slice(PREFIX.length)), 'base64'); } catch { throw new Error('This code cannot be read.'); }
  const f = get(get(e, 'rootInvocation'), 'function');
  const c = get(f, 'contractFn');
  if (!c) throw new Error('This code cannot be read.');
  const contract = Address.fromScAddress(get(c, 'contractAddress')).toString();
  const fn = String(get(c, 'functionName'));
  const args = (get(c, 'args') || []).map((a) => scValToNative(a));
  if (contract !== cfg.contracts.fund_core || fn !== 'claim_junior_cash' || args.length !== 4) throw new Error('This code cannot be read.');
  const [union, member, leader] = args.map(String);
  if (member !== me) throw new Error('This request is for someone else.');
  if (union !== cfg.union) throw new Error('This request is for another union.');
  if (!(await readContract(cfg, 'roles', 'is_leader', [sv.address(union), sv.address(leader)]))) {
    throw new Error('This code was not made by a leader of your union.');
  }
  const claim = await deskClaim(cfg, me);
  if (claim.shares <= 0n) throw new Error('You have nothing to collect yet.');
  return { entry: text.slice(PREFIX.length), union, member, leader, inr: claim.inr, auth: [unb64u(text.slice(PREFIX.length))] };
}
