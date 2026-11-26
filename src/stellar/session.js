// A leader session (A2, executive decision 26 Oct): in assist and keypad mode the member's phone shows one QR, made
// fresh each time, that lets any leader of the union sign for the member's account for 5 minutes (nila-account
// start_session). The QR is the member's signed authorization of `start_session(not_after)` on their own account:
//   NILA:S:<base32: kind 1 (1 Ed25519 Privy, 2 P-256 keypad) | account 32 | not_after 8 | nonce 8 | expiry ledger 4 |
//          signature 64>   (Nila lite makes the same QR: public/lite/session.js)
// Kind 3 (29 Oct, an assist-mode smartphone): kind 1 followed by the member's Polygon address (20 bytes), so a leader
// can take the field points and mint the land title of someone not yet a member (L14) from the QR alone. The keypad's
// QR stays without it (a keypad member is added through its SMS link).
// Kind 4 (3 Nov, a keypad whose account names no union yet): kind 2 followed by her join, so the leader's scan makes
// her account and names its union with no node in between: device key 65 (P-256, uncompressed) | union 32 (the G
// account's key) | nonce 8 | expiry ledger 4 | her signed set_union 64.
// Kind 5 (4 Nov, a smartphone whose account is not made yet or names no union): kind 3 followed by her join, so the
// leader's scan makes her account and names its union (she holds no XLM for the fee since the node fee-bump went):
// Privy key 32 (Ed25519) | union 32 | nonce 8 | expiry ledger 4 | her signed set_union 64.
// `not_after` (unix seconds, the phone's clock, about 5 minutes ahead) ends the QR; the nonce makes it one use. The
// leader's app sends start_session with it, then does the member's task: every entry of the member's account is
// signed `Leader(<the leader's account>)`, and the leader's account approves it inside the member's check.
import { useEffect, useState } from 'react';
import { Address, Keypair, StrKey, authorizeEntry, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { fromB32, toB32 } from '../loan/deskCode';
import { server } from './soroban';
import { accountOf, signatureVal, unionEntry } from './account';

const PREFIX = 'NILA:S:';
const LEN = 1 + 32 + 8 + 8 + 4 + 64;
const KINDS = { 1: 'Ed25519', 2: 'P256', 3: 'Ed25519', 4: 'P256', 5: 'Ed25519' };
const POLY = 20;
const JOIN = 65 + 32 + 8 + 4 + 64;
const SJOIN = 32 + 32 + 8 + 4 + 64;  // kind 5's join: a Privy key instead of a device key
const sizeOk = (b) => !!b && !!KINDS[b[0]] && b.length === LEN + ({ 3: POLY, 4: JOIN, 5: POLY + SJOIN }[b[0]] || 0);
const plainHex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
/** Kind 4's or 5's join: { signer, union, nonce, exp, sig } (hex), as the node kept it (ensureKeypadAccount,
 *  unionEntry). */
function joinOf(b) {
  const j = b[0] === 5 ? b.slice(LEN + POLY) : b.slice(LEN); const k = b[0] === 5 ? 32 : 65;
  const d = new DataView(j.buffer, j.byteOffset);
  return { signer: plainHex(j.slice(0, k)), union: StrKey.encodeEd25519PublicKey(Buffer.from(j.slice(k, k + 32))),
    nonce: plainHex(j.slice(k + 32, k + 40)), exp: d.getUint32(k + 40), sig: plainHex(j.slice(k + 44, k + 108)) };
}
const hex = (u8) => '0x' + [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
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

/** A smartphone's join for its help QR (kind 5, 4 Nov): her Privy key (G…) signs `set_union(union)` on her account,
 *  for the leader's app to send after making the account. Valid until ledger `exp`. Plan 053: a phone key (kind 4,
 *  `kind` 'P256', `key` its 65 bytes) the same way, as Nila lite's join. */
async function signJoin(cfg, account, key, union, sign, exp, kind = 'Ed25519') {
  const nonce = new Uint8Array(8); crypto.getRandomValues(nonce);
  const blank = { nonce: plainHex(nonce), exp, sig: '00'.repeat(64) };
  let sig;
  await authorizeEntry(xdr.SorobanAuthorizationEntry.fromXDR(unionEntry(account, union, blank, kind), 'base64'), async (_p, payload) => {
    sig = Uint8Array.from(await sign(payload));
    return { signatureScVal: signatureVal(kind, sig), address: account };
  }, exp, cfg.passphrase, account);
  const k = kind === 'P256' ? Uint8Array.from(key) : StrKey.decodeEd25519PublicKey(key);
  const out = new Uint8Array(k.length + 32 + 8 + 4 + 64);
  out.set(k, 0); out.set(StrKey.decodeEd25519PublicKey(union), k.length); out.set(nonce, k.length + 32);
  new DataView(out.buffer).setUint32(k.length + 40, exp); out.set(sig, k.length + 44);
  return out;
}

/** SMS-only members (executive decision 25 Nov, option A): the leader's app makes a one-time key, signs the new
 *  account's set_union(union) with it, and forgets it (it lives only in this call). → { account, first_signer, set_union }
 *  for ensureKeypadAccount. From then on only codes (leader OTP) and recovery reach the account. */
export async function oneTimeJoin(cfg) {
  const kp = Keypair.random();
  const account = accountOf(cfg, kp.publicKey());
  const exp = (await server(cfg).getLatestLedger()).sequence + LEDGERS;
  const nonce = new Uint8Array(8); crypto.getRandomValues(nonce);
  const blank = { nonce: plainHex(nonce), exp, sig: '00'.repeat(64) };
  let sig;
  await authorizeEntry(xdr.SorobanAuthorizationEntry.fromXDR(unionEntry(account, cfg.union, blank, 'Ed25519'), 'base64'), async (_p, payload) => {
    sig = Uint8Array.from(kp.sign(Buffer.from(payload)));
    return { signatureScVal: signatureVal('Ed25519', sig), address: account };
  }, exp, cfg.passphrase, account);
  return { account, first_signer: plainHex(kp.rawPublicKey()), set_union: { union: cfg.union, nonce: blank.nonce, exp, sig: plainHex(sig) } };
}

/** The member's phone: a fresh session QR for `account`, signed by `sign(payload)` (64 bytes) of key `kind`;
 *  `polygon` (an assist-mode smartphone) adds the member's Polygon address (kind 3). `join` (4 Nov): { key (her Privy
 *  key, G…), union } while her account is not made or names no union; with `polygon` it makes kind 5. Plan 053: with
 *  `kind` 'P256' and `join` { key (her phone key, 65 bytes), union } it makes kind 4 (as Nila lite). */
export async function makeSessionQr(cfg, account, sign, kind = 'Ed25519', polygon, join) {
  const notAfter = Math.floor(Date.now() / 1000) + QR_LIFE;
  const exp = (await server(cfg).getLatestLedger()).sequence + LEDGERS;
  const nonce = BigInt.asIntN(64, BigInt(`0x${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')}`));
  let sig;
  await authorizeEntry(entryOf(account, notAfter, nonce, exp), async (_p, payload) => {
    sig = Uint8Array.from(await sign(payload));
    return { signatureScVal: signatureVal(kind, sig), address: account };
  }, exp, cfg.passphrase, account);
  const withPoly = kind !== 'P256' && /^0x[0-9a-fA-F]{40}$/.test(polygon || '');
  const j = (withPoly || kind === 'P256') && join?.key && join?.union
    ? await signJoin(cfg, account, join.key, join.union, sign, exp, kind) : null;
  const b = new Uint8Array((withPoly ? LEN + POLY : LEN) + (j ? j.length : 0)); const d = new DataView(b.buffer);
  b[0] = kind === 'P256' ? (j ? 4 : 2) : j ? 5 : withPoly ? 3 : 1;
  if (withPoly) b.set(Uint8Array.from(polygon.slice(2).match(/../g), (x) => parseInt(x, 16)), LEN);
  if (j) b.set(j, withPoly ? LEN + POLY : LEN);
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
  if (!isSessionQr(text) || !sizeOk(b)) throw new Error("This is not a member's Nila QR.");
  const d = new DataView(b.buffer);
  const member = StrKey.encodeContract(Buffer.from(b.slice(1, 33)));
  const notAfter = Number(d.getBigUint64(33));
  if (Date.now() / 1000 > notAfter) throw new Error('This QR has expired. The member shows a new one.');
  const entry = entryOf(member, notAfter, d.getBigInt64(41), d.getUint32(49), signatureVal(KINDS[b[0]], b.slice(53, LEN)));
  return { member, notAfter, polygon: [3, 5].includes(b[0]) ? hex(b.slice(LEN, LEN + POLY)) : '', join: [4, 5].includes(b[0]) ? joinOf(b) : null,
    args: [nativeToScVal(BigInt(notAfter), { type: 'u64' })], entry: entry.toXDR('base64') };
}

/** Plan 054 §5 "Recover on this phone": whether a scanned help QR of `account` was signed by the P-256 key `keyHex`
 *  (65 bytes, hex: the key the new phone registered through the SMS link). The QR's session cannot start before the
 *  recovery has run; its signature still shows the phone in front of the leader holds that key. */
export async function qrSignedByKey(cfg, text, account, keyHex) {
  const q = readSessionQr(text);
  const b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length));
  if (q.member !== account || KINDS[b[0]] !== 'P256' || !/^04[0-9a-f]{128}$/i.test(keyHex || '')) return false;
  // The payload the phone signed, made as makeSessionQr makes it (authorizeEntry hands it to the signer).
  const d = new DataView(b.buffer, b.byteOffset);
  const exp = d.getUint32(49);
  let payload;
  await authorizeEntry(entryOf(account, q.notAfter, d.getBigInt64(41), exp), async (_p, p) => {
    payload = Uint8Array.from(p);
    return { signatureScVal: xdr.ScVal.scvVoid(), address: account };
  }, exp, cfg.passphrase, account);
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(keyHex.match(/../g), (x) => parseInt(x, 16)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b.slice(53, LEN), payload);
}

/** A member's QR's phone (27 Oct): 'keypad' (P-256 device key), 'phone' (Privy key), or '' when it is not one. */
export function sessionQrPhone(text) {
  try {
    if (!isSessionQr(text)) return '';
    const b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length));
    return sizeOk(b) ? ({ 1: 'phone', 2: 'keypad', 3: 'phone', 4: 'keypad', 5: 'phone' }[b[0]] || '') : '';
  } catch { return ''; }
}

/** The member's account from a help QR, without checking its time (26 Oct): any screen that finds a member by
 *  address (the member search, a scan) also takes the help QR. '' when it is not one. */
export function accountOfQr(text) {
  try {
    if (!isSessionQr(text)) return '';
    const b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length));
    return sizeOk(b) ? StrKey.encodeContract(Buffer.from(b.slice(1, 33))) : '';
  } catch { return ''; }
}

/** L14 (29 Oct): { account, polygon, join } from an assist-mode smartphone's help QR, without checking its time; null
 *  when it is not one, or carries no Polygon address (a keypad's, or an app from before 29 Oct). `join` (kind 5, 4 Nov):
 *  her signed set_union while her account is not made or names no union, else null. */
export function memberOfQr(text) {
  try {
    if (!isSessionQr(text)) return null;
    const b = fromB32((text || '').trim().toUpperCase().slice(PREFIX.length));
    if (!sizeOk(b) || ![3, 5].includes(b[0])) return null;
    return { account: StrKey.encodeContract(Buffer.from(b.slice(1, 33))), polygon: hex(b.slice(LEN, LEN + POLY)),
      join: b[0] === 5 ? joinOf(b) : null };
  } catch { return null; }
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
