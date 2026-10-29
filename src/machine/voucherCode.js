// Her voucher code, compact (executive decision 23 Oct): the QR holds only her address, the max tractor hours (units),
// the expiry ledger and her signature: `NILA:V:` + base32 of 32 | 4 | 4 | 64 bytes (~167 characters, the QR's
// alphanumeric mode). The signed authorization is the same machinery.claim(union, token, max_units) entry as before,
// with nonce = the expiry ledger, so it needs no field of its own. The owner's app finds which of her vouchers it is
// by rebuilding the preimage for each of her tokens and checking the signature, then rebuilds the full entry.
import { Address, Keypair, StrKey, hash, xdr } from '@stellar/stellar-sdk';
import { contractId, server, sv } from '../stellar/soroban';
import { memberEntry, memberOf, signatureVal } from '../stellar/account';
import { readContract } from '../stellar/soroban';

const PREFIX = 'NILA:V:';
const LEN = 104;
// A keypad phone's code (27 Oct, Nila lite session.js): kind 2 (P-256 device key) | account 32 | units | expiry | signature.
const LEN_KEYPAD = 105;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const toB32 = (bytes) => {
  let bits = 0; let val = 0; let out = '';
  for (const b of bytes) { val = ((val << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
};
const fromB32 = (str) => {
  let bits = 0; let val = 0; const out = [];
  for (const ch of str) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error('bad');
    val = ((val << 5) | i) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
};

function invocation(cfg, token, units) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
      contractAddress: new Address(contractId(cfg, 'machinery')).toScAddress(), functionName: 'claim',
      args: [sv.address(cfg.union), sv.bytes32(token), sv.u32(units)] })),
    subInvocations: [],
  });
}
const payload = (cfg, inv, exp) => hash(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
  networkId: hash(Buffer.from(cfg.passphrase)), nonce: xdr.Int64.fromString(String(exp)), signatureExpirationLedger: exp, invocation: inv,
})).toXDR());

/** Her phone: sign claim(union, token, units) valid for `ledgers`; returns { qr, until }. */
export async function signVoucherCode({ cfg, signer, signHash, token, units, ledgers }) {
  const exp = (await server(cfg).getLatestLedger()).sequence + ledgers;
  const sig = Uint8Array.from(await signHash(payload(cfg, invocation(cfg, token, units), exp)));
  const b = new Uint8Array(LEN); const d = new DataView(b.buffer);
  b.set(StrKey.decodeEd25519PublicKey(signer), 0); d.setUint32(32, units); d.setUint32(36, exp); b.set(sig, 40);
  return { qr: PREFIX + toB32(b), until: Math.floor(Date.now() / 1000) + ledgers * 5 };
}

/** The owner's app: { member (her account), key (her Privy key), units, exp, sig } from a scanned code. Throws a plain
 *  reason. */
export function readVoucherCode(text, cfg) {
  const t = (text || '').trim().toUpperCase();
  let b;
  try { if (!t.startsWith(PREFIX)) throw new Error(); b = fromB32(t.slice(PREFIX.length)); } catch { throw new Error('This is not a machine-hours QR. The member makes one under Machine hours (keypad) or Machine vouchers (phone).'); }
  if (b.length === LEN_KEYPAD && b[0] === 2) {
    const k = new DataView(b.buffer);
    return { member: StrKey.encodeContract(Buffer.from(b.slice(1, 33))), p256: true, units: k.getUint32(33), exp: k.getUint32(37), sig: b.slice(41) };
  }
  if (b.length !== LEN) throw new Error('This is not a machine-hours QR. The member makes one under Machine hours (keypad) or Machine vouchers (phone).');
  const d = new DataView(b.buffer);
  const key = StrKey.encodeEd25519PublicKey(Buffer.from(b.slice(0, 32)));
  return { member: cfg ? memberOf(cfg, key) : key, key, units: d.getUint32(32), exp: d.getUint32(36), sig: b.slice(40) };
}

/** A keypad code: which of her tokens it signs, checked with her account's P-256 key (read from the account). */
export async function matchTokenP256(cfg, code, tokens) {
  const signer = await readContract(cfg, code.member, 'signer', []).catch(() => null);
  const raw = Array.isArray(signer) ? signer[1] : signer?.P256 || signer?.values?.[0];
  if (!raw || raw.length !== 65) return null;
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(raw), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  for (const t of tokens) {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Uint8Array.from(code.sig), payload(cfg, invocation(cfg, t, code.units), code.exp));
    if (ok) return t;
  }
  return null;
}

/** Which of her tokens the code signs (its signature checks), or null. */
export function matchToken(cfg, code, tokens) {
  const kp = Keypair.fromPublicKey(code.key);
  return tokens.find((t) => kp.verify(payload(cfg, invocation(cfg, t, code.units), code.exp), Buffer.from(code.sig))) || null;
}

/** The full authorization entry (base64 XDR) for her code on `token`: for her smart account (26 Oct). */
export function voucherEntry(cfg, code, token) {
  if (code.p256) {
    return new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
        address: new Address(code.member).toScAddress(), nonce: xdr.Int64.fromString(String(code.exp)),
        signatureExpirationLedger: code.exp, signature: signatureVal('P256', code.sig) })),
      rootInvocation: invocation(cfg, token, code.units),
    }).toXDR('base64');
  }
  return memberEntry(cfg, code.key, code.sig, code.exp, invocation(cfg, token, code.units));
}
