// A leader session (A2, executive decision 26 Oct): in assist and keypad mode the member's phone shows one QR, made
// fresh each time, that lets any leader of the union sign for the member's account for 5 minutes (nila-account
// start_session). The QR is the member's signed authorization of `start_session(not_after)` on their own account:
//   NILA:S:<base32: kind 1 (1 Ed25519 Privy, 2 P-256 keypad) | account 32 | not_after 8 | nonce 8 | expiry ledger 4 |
//          signature 64>   (Nila lite makes the same QR: public/lite/session.js)
// `not_after` (unix seconds, the phone's clock, about 5 minutes ahead) ends the QR; the nonce makes it one use. The
// leader's app sends start_session with it, then does the member's task: every entry of the member's account is
// signed `Leader(<the leader's account>)`, and the leader's account approves it inside the member's check.
import { useEffect, useState } from 'react';
import { Address, StrKey, authorizeEntry, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { fromB32, toB32 } from '../loan/deskCode';
import { server } from './soroban';
import { signatureVal } from './account';

const PREFIX = 'NILA:S:';
const LEN = 1 + 32 + 8 + 8 + 4 + 64;
const KINDS = { 1: 'Ed25519', 2: 'P256' };
export const QR_LIFE = 300;          // seconds a session QR can be used
const LEDGERS = 120;                 // its signature's expiry, ~10 minutes

const startInvocation = (account, notAfter) => new xdr.SorobanAuthorizedInvocation({
  function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
    contractAddress: new Address(account).toScAddress(), functionName: 'start_session',
    args: [nativeToScVal(BigInt(notAfter), { type: 'u64' })] })),
  subInvocations: [],
});
const entryOf = (account, notAfter, nonce, exp, signature = xdr.ScVal.scvVoid()) => new xdr.SorobanAuthorizationEntry({
  credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
    address: new Address(account).toScAddress(), nonce: xdr.Int64.fromString(String(nonce)), signatureExpirationLedger: exp, signature })),
  rootInvocation: startInvocation(account, notAfter),
});

/** The member's phone: a fresh session QR for `account`, signed by `sign(payload)` (64 bytes) of key `kind`. */
export async function makeSessionQr(cfg, account, sign, kind = 'Ed25519') {
  const notAfter = Math.floor(Date.now() / 1000) + QR_LIFE;
  const exp = (await server(cfg).getLatestLedger()).sequence + LEDGERS;
  const nonce = BigInt.asIntN(64, BigInt(`0x${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')}`));
  let sig;
  await authorizeEntry(entryOf(account, notAfter, nonce, exp), async (_p, payload) => {
    sig = Uint8Array.from(await sign(payload));
    return { signatureScVal: signatureVal(kind, sig), address: account };
  }, exp, cfg.passphrase, account);
  const b = new Uint8Array(LEN); const d = new DataView(b.buffer);
  b[0] = kind === 'P256' ? 2 : 1;
  b.set(StrKey.decodeContract(account), 1);
  d.setBigUint64(33, BigInt(notAfter)); d.setBigInt64(41, nonce); d.setUint32(49, exp); b.set(sig, 53);
  return { qr: PREFIX + toB32(b), until: notAfter, kind };
}

export const isSessionQr = (text) => (text || '').trim().toUpperCase().startsWith(PREFIX);

/** The leader's app: { member, notAfter, entry (base64 XDR) } from a scanned session QR. The signature is checked by
 *  the member's account when start_session is sent (its key type is the account's). Throws a plain reason. */
export function readSessionQr(text) {
  let b;
  try { b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length)); } catch { b = null; }
  if (!isSessionQr(text) || !b || b.length !== LEN || !KINDS[b[0]]) throw new Error("This is not a member's Nila QR.");
  const d = new DataView(b.buffer);
  const member = StrKey.encodeContract(Buffer.from(b.slice(1, 33)));
  const notAfter = Number(d.getBigUint64(33));
  if (Date.now() / 1000 > notAfter) throw new Error('This QR has expired. The member shows a new one.');
  const entry = entryOf(member, notAfter, d.getBigInt64(41), d.getUint32(49), signatureVal(KINDS[b[0]], b.slice(53)));
  return { member, notAfter, args: [nativeToScVal(BigInt(notAfter), { type: 'u64' })], entry: entry.toXDR('base64') };
}

/** A member's QR's phone (27 Oct): 'keypad' (P-256 device key), 'phone' (Privy key), or '' when it is not one. */
export function sessionQrPhone(text) {
  try {
    if (!isSessionQr(text)) return '';
    const b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length));
    return b && b.length === LEN ? ({ 1: 'phone', 2: 'keypad' }[b[0]] || '') : '';
  } catch { return ''; }
}

/** The member's account from a help QR, without checking its time (26 Oct): any screen that finds a member by
 *  address (the member search, a scan) also takes the help QR. '' when it is not one. */
export function accountOfQr(text) {
  try {
    if (!isSessionQr(text)) return '';
    const b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length));
    return b && b.length === LEN && KINDS[b[0]] ? StrKey.encodeContract(Buffer.from(b.slice(1, 33))) : '';
  } catch { return ''; }
}

// The sessions this leader's app holds: member account → until (unix seconds, the contract's own 5 minutes).
const sessions = new Map();
const listeners = new Set();
export const sessionUntil = (member) => { const u = sessions.get(member); return u && u > Date.now() / 1000 ? u : 0; };
export const setSession = (member, until) => { sessions.set(member, until); listeners.forEach((f) => f()); };
export const onSessions = (f) => { listeners.add(f); return () => listeners.delete(f); };

/** Until when this leader may act for `member` (0: no session); follows new sessions and the clock. */
export function useSessionUntil(member) {
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onSessions(() => tick((x) => x + 1));
    const t = setInterval(() => tick((x) => x + 1), 5000);
    return () => { off(); clearInterval(t); };
  }, []);
  return member ? sessionUntil(member) : 0;
}
