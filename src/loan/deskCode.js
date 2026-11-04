// His signed nIN cash-out QR (NILA:N; executive decisions 24 Oct and 4 Nov, LOAN_RULES "Two withdrawals"): a machine
// owner takes his nIN income as cash only this way. A7 Collect shows a QR with his signed authorization of
// fx_pool.cash_out_signed(leader, union, member, amount), args (union, amount); after handing over the cash the leader
// scans it (Tasks → Scan a member QR) and submits; his nIN is burned and leaves the union's cash at hand.
// He signs the arguments without a leader (require_auth_for_args), so any leader of his union may scan and submit it.
// Compact as the voucher code (voucherCode.js), in base32: account 32 | key 32 | amount 8 | expiry ledger 4 |
// signature 64; nonce = the expiry ledger, so a QR is used once. ~48 h.
// The account is in the QR (4 Nov): after a recovery it no longer follows from the key. Account bytes equal to the
// key's: no smart account (a node without an account deployer), the key's own address.
// G9 (executive decision 4 Nov): a self-mode member signs every office task that takes on debt or takes value out
// this way, never with the help QR. Two more kinds, same layout with their own fields:
//   NILA:W: collect her withdrawal, fund_core.claim_junior_cash(union, member, leader, 0), args (union, 0): all she can
//           claim; no fields.
//   NILA:L: use a crop share, fund_core.draw_loan(union, member, token, cash, hours), all args (require_auth): token 32,
//           cash 8 (stroops), hours 4 (voucher units).
import { Address, Keypair, StrKey, hash, xdr } from '@stellar/stellar-sdk';
import { contractId, readContract, server, sv } from '../stellar/soroban';
import { memberEntry } from '../stellar/account';

export const DESK_TERM = 34_560;     // ledgers (~5 s each): about 48 hours
const KINDS = {
  N: { prefix: 'NILA:N:', fields: 8 },
  W: { prefix: 'NILA:W:', fields: 0 },
  L: { prefix: 'NILA:L:', fields: 32 + 8 + 4 },
};
const lenOf = (k) => 32 + 32 + KINDS[k].fields + 4 + 64;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const toB32 = (bytes) => {
  let bits = 0; let val = 0; let out = '';
  for (const b of bytes) { val = ((val << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
};
export const fromB32 = (str) => {
  let bits = 0; let val = 0; const out = [];
  for (const ch of str) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error('bad');
    val = ((val << 5) | i) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
};

function invocation(cfg, kind, f, account) {
  const [contract, fn, args] = kind === 'N' ? ['fx_pool', 'cash_out_signed', [sv.address(cfg.union), sv.i128(f.amount)]]
    : kind === 'W' ? ['fund_core', 'claim_junior_cash', [sv.address(cfg.union), sv.i128(0n)]]
      : ['fund_core', 'draw_loan', [sv.address(cfg.union), sv.address(account), sv.bytes32(f.token), sv.i128(f.cash), sv.u32(f.hours)]];
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
      contractAddress: new Address(contractId(cfg, contract)).toScAddress(), functionName: fn, args })),
    subInvocations: [],
  });
}
const payload = (cfg, inv, exp) => hash(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
  networkId: hash(Buffer.from(cfg.passphrase)), nonce: xdr.Int64.fromString(String(exp)), signatureExpirationLedger: exp, invocation: inv,
})).toXDR());
const bytesOf = (a) => (a.startsWith('C') ? StrKey.decodeContract(a) : StrKey.decodeEd25519PublicKey(a));

/** Her phone: kind 'N' (`amount` nIN in stroops), 'W' (her withdrawal, all of it) or 'L' (`token` hex, `cash` stroops,
 *  `hours` units), from `account` (C…, or her G key without smart accounts), signed by her key `signer` (G…).
 *  Returns { qr, until }. */
export async function signDeskCode({ cfg, account, signer, signHash, kind = 'N', amount, token, cash, hours, ledgers = DESK_TERM }) {
  const f = { amount: BigInt(amount ?? 0), token, cash: BigInt(cash ?? 0), hours: Number(hours ?? 0) };
  const exp = (await server(cfg).getLatestLedger()).sequence + ledgers;
  const sig = Uint8Array.from(await signHash(payload(cfg, invocation(cfg, kind, f, account), exp)));
  const b = new Uint8Array(lenOf(kind)); const d = new DataView(b.buffer);
  b.set(bytesOf(account), 0); b.set(StrKey.decodeEd25519PublicKey(signer), 32);
  let i = 64;
  if (kind === 'N') { d.setBigUint64(i, f.amount); i += 8; }
  if (kind === 'L') { b.set(Buffer.from(token, 'hex'), i); d.setBigUint64(i + 32, f.cash); d.setUint32(i + 40, f.hours); i += 44; }
  d.setUint32(i, exp); b.set(sig, i + 4);
  return { qr: KINDS[kind].prefix + toB32(b), until: Math.floor(Date.now() / 1000) + ledgers * 5 };
}

const kindOf = (text) => Object.keys(KINDS).find((k) => (text || '').trim().toUpperCase().startsWith(KINDS[k].prefix));
export const isDeskCode = (text) => !!kindOf(text);

/** The leader's app: { kind, member (the account in the QR), key, amount | token, cash, hours, exp, entry } from a
 *  scanned QR whose signature checks for this union. The entry is for that account: its own check takes the key when
 *  the leader submits. Throws a plain reason. */
export function readDeskCode(cfg, text) {
  const kind = kindOf(text);
  let b;
  try { b = fromB32((text || '').trim().toUpperCase().slice(KINDS[kind].prefix.length)); } catch { b = null; }
  if (!kind || !b || b.length !== lenOf(kind)) throw new Error('This is not a Nila cash QR.');
  const d = new DataView(b.buffer);
  const key = StrKey.encodeEd25519PublicKey(Buffer.from(b.slice(32, 64)));
  const own = b.slice(0, 32).every((x, i) => x === b[32 + i]);
  const member = own ? key : StrKey.encodeContract(Buffer.from(b.slice(0, 32)));
  const f = {};
  let i = 64;
  if (kind === 'N') { f.amount = d.getBigUint64(i); i += 8; }
  if (kind === 'L') {
    f.token = Buffer.from(b.slice(i, i + 32)).toString('hex'); f.cash = d.getBigUint64(i + 32); f.hours = d.getUint32(i + 40); i += 44;
  }
  const exp = d.getUint32(i); const sig = b.slice(i + 4);
  const inv = invocation(cfg, kind, f, member);
  if (!Keypair.fromPublicKey(key).verify(payload(cfg, inv, exp), Buffer.from(sig))) throw new Error('This QR is not signed for your union.');
  return { kind, member, key, ...f, exp, entry: memberEntry(cfg, key, sig, exp, inv, own ? null : member) };
}

const RAY = 10n ** 27n;
const DAYS_14 = 14 * 86400;

/** Her withdrawal at the desk now (NILA:W): shares she can claim (claimable, or pending after 14 days) and their rupees. */
export async function deskClaim(cfg, member) {
  const u = [sv.address(cfg.union), sv.address(member)];
  const [p, m] = await Promise.all([
    readContract(cfg, 'fund_core', 'position', u),
    readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)]),
  ]);
  const ready = p?.request_ts && Number(p.request_ts) + DAYS_14 <= Date.now() / 1000;
  const shares = BigInt(p?.claimable_shares ?? 0) + (ready ? BigInt(p?.pending_shares ?? 0) : 0n);
  const inr = Number((shares * BigInt(m?.index ?? 0)) / RAY) / 1e7;
  const pendingFrom = !ready && BigInt(p?.pending_shares ?? 0) > 0n ? Number(p.request_ts) + DAYS_14 : null;
  return { shares, inr, pendingFrom };
}
