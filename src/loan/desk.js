// Her investment paid over the desk (executive decision 22 Oct, LOAN_RULES "No nIN in a member's wallet (desk
// only)"): fund_core.claim_junior_cash(union, member, leader, max_shares) needs both signatures. The leader's app
// signs the leader's authorization entry and shows it as a QR (L9 direction, as the crop share request); her phone
// checks it, shows what she collects and submits the call with her own signature (the node fee-bumps her call).
// TODO(reverse QR): when the reverse-QR flow is built (product/specs/Keypad_Reverse_QR_Consent.md) the leader
// prepares the request and scans her signed QR instead; this direction then goes.
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import { readAuthEntry, readContract, signAuthFor, sv } from '../stellar/soroban';

const PREFIX = 'nila:desk:';
const RAY = 10n ** 27n;
const DAYS_14 = 14 * 86400;
const ONE_NIN = 10_000_000n;
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

// Withdrawal start, the leader drives (executive decision 23 Oct, LOAN_RULES "Member signature by task"): the leader
// prepares it on G2 (node POST /stellar/union/task), her phone reads it on A3 (GET), she confirms and shows her signed
// authorization of fund_core.request_unbond_junior as a QR; the leader's app scans it and submits the call (fee-bumped
// by the node like her own calls). The QR is the authorization entry itself (base64 XDR), valid ~10 minutes.

/** Shares for `rupees` of her free part now; her free part moves every second while she owes (interest), so it is
 *  read just before, with a margin of 1 nIN while a loan is open (else BadShares). */
export async function unbondShares(cfg, member, rupees) {
  const u = [sv.address(cfg.union), sv.address(member)];
  const [pos, m] = await Promise.all([
    readContract(cfg, 'fund_core', 'position', u),
    readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)]),
  ]);
  const freeNow = BigInt(pos.free) - (BigInt(pos.locked) > 0n ? ONE_NIN : 0n);
  const want = BigInt(rupees) * ONE_NIN;
  const take = want < freeNow ? want : freeNow;
  return { take, shares: take > 0n ? (take * RAY) / BigInt(m.index) : 0n };
}

/** Member: her signed authorization for the leader's withdrawal task, as the QR text. */
export async function signUnbond(cfg, { task, me, signHash }) {
  const { shares } = await unbondShares(cfg, me, task.amount);
  if (shares <= 0n) throw new Error('None of your investment is free to withdraw now.');
  return signAuthFor({ cfg, source: task.leader, signer: me, signHash, contractName: 'fund_core', fn: 'request_unbond_junior',
    args: [sv.address(cfg.union), sv.address(me), sv.i128(shares)], ledgers: 120 });
}

/** Leader: her scanned withdrawal QR. Throws a plain reason when it is not her signed withdrawal in this union. */
export function readUnbond(cfg, text, member) {
  let e;
  try { e = readAuthEntry(cfg, (text || '').trim()); } catch { throw new Error('This is not her withdrawal code.'); }
  if (e.contractName !== 'fund_core' || e.fn !== 'request_unbond_junior' || e.native.length !== 3) throw new Error('This is not her withdrawal code.');
  if (e.signer !== member || String(e.native[1]) !== member) throw new Error('This code is from someone else.');
  if (String(e.native[0]) !== cfg.union) throw new Error('This code is for another union.');
  return { entry: text.trim(), args: e.args };
}
