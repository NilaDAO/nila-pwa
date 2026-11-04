// His signed nIN cash-out QR (NILA:N; executive decisions 24 Oct and 4 Nov, LOAN_RULES "Two withdrawals"): a machine
// owner takes his nIN income as cash only this way. A7 Collect shows a QR with his signed authorization of
// fx_pool.cash_out_signed(leader, union, member, amount), args (union, amount); after handing over the cash the leader
// scans it (Tasks → Scan a member QR) and submits; his nIN is burned and leaves the union's cash at hand.
// He signs the arguments without a leader (require_auth_for_args), so any leader of his union may scan and submit it.
// Compact as the voucher code (voucherCode.js), in base32: account 32 | key 32 | amount 8 | expiry ledger 4 |
// signature 64; nonce = the expiry ledger, so a QR is used once. ~48 h.
// The account is in the QR (4 Nov): after a recovery it no longer follows from the key. Account bytes equal to the
// key's: no smart account (a node without an account deployer), the key's own address.
// NILA:W (her investment, fund_core.claim_junior_cash) is gone (4 Nov): nothing scanned it; the leader pays a
// withdrawal out from her G2.
import { Address, Keypair, StrKey, hash, xdr } from '@stellar/stellar-sdk';
import { contractId, server, sv } from '../stellar/soroban';
import { memberEntry } from '../stellar/account';

export const DESK_TERM = 34_560;     // ledgers (~5 s each): about 48 hours
const PREFIX = 'NILA:N:';
const LEN = 32 + 32 + 8 + 4 + 64;
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

const invocation = (cfg, amount) => new xdr.SorobanAuthorizedInvocation({
  function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
    contractAddress: new Address(contractId(cfg, 'fx_pool')).toScAddress(), functionName: 'cash_out_signed',
    args: [sv.address(cfg.union), sv.i128(amount)] })),
  subInvocations: [],
});
const payload = (cfg, inv, exp) => hash(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
  networkId: hash(Buffer.from(cfg.passphrase)), nonce: xdr.Int64.fromString(String(exp)), signatureExpirationLedger: exp, invocation: inv,
})).toXDR());
const bytesOf = (a) => (a.startsWith('C') ? StrKey.decodeContract(a) : StrKey.decodeEd25519PublicKey(a));

/** His phone: `amount` nIN (stroops) from `account` (C…, or his G key without smart accounts), signed by his key
 *  `signer` (G…). Returns { qr, until }. */
export async function signDeskCode({ cfg, account, signer, signHash, amount, ledgers = DESK_TERM }) {
  const exp = (await server(cfg).getLatestLedger()).sequence + ledgers;
  const sig = Uint8Array.from(await signHash(payload(cfg, invocation(cfg, amount), exp)));
  const b = new Uint8Array(LEN); const d = new DataView(b.buffer);
  b.set(bytesOf(account), 0); b.set(StrKey.decodeEd25519PublicKey(signer), 32);
  d.setBigUint64(64, BigInt(amount)); d.setUint32(72, exp); b.set(sig, 76);
  return { qr: PREFIX + toB32(b), until: Math.floor(Date.now() / 1000) + ledgers * 5 };
}

export const isDeskCode = (text) => (text || '').trim().toUpperCase().startsWith(PREFIX);

/** The leader's app: { member (the account in the QR), key, amount, exp, entry } from a scanned QR whose signature
 *  checks for this union. The entry is for that account: its own check takes the key when the leader submits.
 *  Throws a plain reason. */
export function readDeskCode(cfg, text) {
  let b;
  try { b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length)); } catch { b = null; }
  if (!isDeskCode(text) || !b || b.length !== LEN) throw new Error('This is not a Nila cash QR.');
  const d = new DataView(b.buffer);
  const key = StrKey.encodeEd25519PublicKey(Buffer.from(b.slice(32, 64)));
  const own = b.slice(0, 32).every((x, i) => x === b[32 + i]);
  const member = own ? key : StrKey.encodeContract(Buffer.from(b.slice(0, 32)));
  const amount = d.getBigUint64(64); const exp = d.getUint32(72); const sig = b.slice(76);
  const inv = invocation(cfg, amount);
  if (!Keypair.fromPublicKey(key).verify(payload(cfg, inv, exp), Buffer.from(sig))) throw new Error('This QR is not signed for your union.');
  return { member, key, amount, exp, entry: memberEntry(cfg, key, sig, exp, inv, own ? null : member) };
}
