// One QR pair for every task the member signs (A1, executive decision 26 Oct): the leader starts the task (L11, G2,
// Pay out cash), fills it in and shows a request QR; the member's phone reads it, shows what it asks and, once the
// member confirms, shows one answer QR: the member's signature of that exact call. The leader's app scans it and
// submits the call (the node pays the fee). In self mode the member's own phone may submit the call instead.
//   request  NILA:R:<base32: task | member | expiry ledger | the task's values>
//   answer   NILA:A:<base32: signature>
// The leader picks the expiry (TASK_TERM, about 10 minutes), so a phone without internet (keypad) can sign too; the
// expiry ledger is the nonce, so an answer is used once. The member signs the call's Soroban authorization
// (as deskCode.js), so the contract itself checks it; nothing is trusted from the leader's app.
//   D  crop share draw   fund_core.draw_loan(union, member, token, cash, hours)
//   U  start withdrawal  fund_core.request_unbond_junior(union, member, shares)
//   W  collect it        fund_core.claim_junior_cash: the member signs (union, max_shares = 0)
import { Address, Keypair, StrKey, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { contractId, server, sv } from '../stellar/soroban';
import { fromB32, toB32 } from './deskCode';

export const TASK_TERM = 120;   // ledgers (~5 s each): about 10 minutes
const LEN = { D: 32 + 8 + 4, U: 8, W: 0 };

/** The call the member signs: { contract, fn, args (the whole call), signed (what the member's signature covers) }. */
export function callOf(cfg, r) {
  const u = sv.address(cfg.union); const m = sv.address(r.member);
  if (r.task === 'D') {
    const args = [u, m, sv.bytes32(r.token), sv.i128(r.cash), sv.u32(r.hours)];
    return { contract: 'fund_core', fn: 'draw_loan', args, signed: args };
  }
  if (r.task === 'U') {
    const args = [u, m, sv.i128(r.shares)];
    return { contract: 'fund_core', fn: 'request_unbond_junior', args, signed: args };
  }
  // claim_junior_cash(union, member, leader, 0): the leader is filled in by whoever submits.
  return { contract: 'fund_core', fn: 'claim_junior_cash', args: null, signed: [u, sv.i128(0n)] };
}

function payload(cfg, r) {
  const c = callOf(cfg, r);
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
      contractAddress: new Address(contractId(cfg, c.contract)).toScAddress(), functionName: c.fn, args: c.signed })),
    subInvocations: [],
  });
  const h = hash(xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
    networkId: hash(Buffer.from(cfg.passphrase)), nonce: xdr.Int64.fromString(String(r.exp)), signatureExpirationLedger: r.exp, invocation,
  })).toXDR());
  return { h, invocation };
}

/** The leader's app: the request QR text for `r` = { task, member, token?, cash?, hours?, shares? }, valid TASK_TERM. */
export async function makeTask(cfg, r) {
  const exp = (await server(cfg).getLatestLedger()).sequence + TASK_TERM;
  const b = new Uint8Array(1 + 32 + 4 + LEN[r.task]); const d = new DataView(b.buffer);
  b[0] = r.task.charCodeAt(0);
  b.set(StrKey.decodeEd25519PublicKey(r.member), 1);
  d.setUint32(33, exp);
  if (r.task === 'D') {
    b.set(Uint8Array.from(r.token.match(/../g).map((x) => parseInt(x, 16))), 37);
    d.setBigUint64(69, BigInt(r.cash)); d.setUint32(77, Number(r.hours));
  }
  if (r.task === 'U') d.setBigUint64(37, BigInt(r.shares));
  return { ...r, exp, qr: `NILA:R:${toB32(b)}`, until: Math.floor(Date.now() / 1000) + TASK_TERM * 5 };
}

export const isTask = (text) => (text || '').trim().toUpperCase().startsWith('NILA:R:');

/** Any phone: the request in a scanned QR, or a plain reason. */
export function readTask(text) {
  let b;
  try { b = fromB32((text || '').trim().toUpperCase().slice(7)); } catch { b = null; }
  const task = b && String.fromCharCode(b[0]);
  if (!isTask(text) || !(task in LEN) || b.length !== 1 + 32 + 4 + LEN[task]) throw new Error('This is not a Nila request.');
  const d = new DataView(b.buffer);
  const r = { task, member: StrKey.encodeEd25519PublicKey(Buffer.from(b.slice(1, 33))), exp: d.getUint32(33) };
  if (task === 'D') {
    r.token = [...b.slice(37, 69)].map((x) => x.toString(16).padStart(2, '0')).join('');
    r.cash = String(d.getBigUint64(69)); r.hours = d.getUint32(77);
  }
  if (task === 'U') r.shares = String(d.getBigUint64(37));
  return r;
}

/** The member's phone: the answer QR text, the member's signature of request `r`. */
export async function answerTask(cfg, r, signHash) {
  const sig = Uint8Array.from(await signHash(payload(cfg, r).h));
  return `NILA:A:${toB32(sig)}`;
}

/** The leader's app: the member's signed authorization entry (base64 XDR) from a scanned answer to request `r`. */
export function readAnswer(cfg, r, text) {
  const t = (text || '').trim().toUpperCase();
  let sig;
  try { if (!t.startsWith('NILA:A:')) throw new Error(); sig = fromB32(t.slice(7)); } catch { throw new Error("This is not the member's answer QR."); }
  const { h, invocation } = payload(cfg, r);
  if (sig.length !== 64 || !Keypair.fromPublicKey(r.member).verify(h, Buffer.from(sig))) {
    throw new Error("This answer does not match this request: let the member scan the request again.");
  }
  const sigVal = nativeToScVal({ public_key: StrKey.decodeEd25519PublicKey(r.member), signature: Buffer.from(sig) },
    { type: { public_key: ['symbol', null], signature: ['symbol', null] } });
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: new Address(r.member).toScAddress(), nonce: xdr.Int64.fromString(String(r.exp)),
      signatureExpirationLedger: r.exp, signature: xdr.ScVal.scvVec([sigVal]),
    })),
    rootInvocation: invocation,
  }).toXDR('base64');
}
