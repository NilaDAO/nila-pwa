// Her signed desk QR (executive decision 24 Oct, LOAN_RULES "Two withdrawals"): both withdrawals are paid in cash at
// the union office, and the leader scans a QR on her phone that holds her signed authorization:
//   NILA:W: her investment, fund_core.claim_junior_cash(union, max_shares = 0: all she can claim); no nIN reaches her.
//   NILA:N: her nIN (a machine owner's income), fx_pool.cash_out_signed(union, amount); her nIN is burned.
// She signs the arguments without a leader (require_auth_for_args), so any leader of her union may scan and submit
// it. Compact as the voucher code (voucherCode.js): her address | [amount, 8 bytes] | expiry ledger | signature, in
// base32; nonce = the expiry ledger, so a QR is used once. ~48 h.
import { Address, Keypair, StrKey, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { contractId, server, sv } from '../stellar/soroban';

export const DESK_TERM = 34_560;     // ledgers (~5 s each): about 48 hours
const KIND = { W: { prefix: 'NILA:W:', len: 100 }, N: { prefix: 'NILA:N:', len: 108 } };
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

function invocation(cfg, kind, amount) {
  const [contract, fn, args] = kind === 'W'
    ? ['fund_core', 'claim_junior_cash', [sv.address(cfg.union), sv.i128(0n)]]
    : ['fx_pool', 'cash_out_signed', [sv.address(cfg.union), sv.i128(amount)]];
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
      contractAddress: new Address(contractId(cfg, contract)).toScAddress(), functionName: fn, args })),
    subInvocations: [],
  });
}
const payload = (cfg, inv, exp) => hash(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
  networkId: hash(Buffer.from(cfg.passphrase)), nonce: xdr.Int64.fromString(String(exp)), signatureExpirationLedger: exp, invocation: inv,
})).toXDR());

/** Her phone: kind 'W' (her investment, all she can claim) or 'N' (`amount` nIN in stroops). Returns { qr, until }. */
export async function signDeskCode({ cfg, signer, signHash, kind, amount = 0n, ledgers = DESK_TERM }) {
  const exp = (await server(cfg).getLatestLedger()).sequence + ledgers;
  const sig = Uint8Array.from(await signHash(payload(cfg, invocation(cfg, kind, amount), exp)));
  const { prefix, len } = KIND[kind];
  const b = new Uint8Array(len); const d = new DataView(b.buffer);
  b.set(StrKey.decodeEd25519PublicKey(signer), 0);
  let i = 32;
  if (kind === 'N') { d.setBigUint64(i, BigInt(amount)); i += 8; }
  d.setUint32(i, exp); b.set(sig, i + 4);
  return { qr: prefix + toB32(b), until: Math.floor(Date.now() / 1000) + ledgers * 5 };
}

/** The leader's app: { kind, member, amount, exp, entry } from a scanned QR whose signature checks for this union.
 *  Throws a plain reason. */
export function readDeskCode(cfg, text) {
  const t = (text || '').trim().toUpperCase();
  const kind = Object.keys(KIND).find((k) => t.startsWith(KIND[k].prefix));
  let b;
  try { if (!kind) throw new Error(); b = fromB32(t.slice(KIND[kind].prefix.length)); } catch { throw new Error('This is not a Nila cash QR.'); }
  if (b.length !== KIND[kind].len) throw new Error('This is not a Nila cash QR.');
  const d = new DataView(b.buffer);
  const member = StrKey.encodeEd25519PublicKey(Buffer.from(b.slice(0, 32)));
  let i = 32;
  const amount = kind === 'N' ? d.getBigUint64(i) : 0n;
  if (kind === 'N') i += 8;
  const exp = d.getUint32(i); const sig = b.slice(i + 4);
  const inv = invocation(cfg, kind, amount);
  if (!Keypair.fromPublicKey(member).verify(payload(cfg, inv, exp), Buffer.from(sig))) throw new Error('This QR is not signed for your union.');
  const sigVal = nativeToScVal({ public_key: StrKey.decodeEd25519PublicKey(member), signature: Buffer.from(sig) },
    { type: { public_key: ['symbol', null], signature: ['symbol', null] } });
  const entry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: new Address(member).toScAddress(), nonce: xdr.Int64.fromString(String(exp)),
      signatureExpirationLedger: exp, signature: xdr.ScVal.scvVec([sigVal]),
    })),
    rootInvocation: inv,
  }).toXDR('base64');
  return { kind, member, amount, exp, entry };
}
