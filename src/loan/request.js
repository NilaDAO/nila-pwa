// The crop share request (L11 → L9 → she scans → N10), executive decision 16 Oct: signed by the leader's
// Stellar wallet (SEP-53), checked on her phone — signature, signer is a leader of her union, 48 h
// expiry — and N10 is written only from the signed values. A replay cannot draw twice (one loan per food
// token, in fund_core.draw_loan).
import { Keypair } from '@stellar/stellar-sdk';
import { signStellarMessage } from '../plan/api';
import { readContract, sv } from '../stellar/soroban';

const PREFIX = 'nila:loan:';
const VALID_S = 48 * 3600;
const MAX_SKEW_S = 10 * 60;
const enc = new TextEncoder();
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** The signed text: fixed key order, so both sides hash the same bytes. */
const KEYS = ['v', 'union', 'member', 'token', 'cash', 'hours', 'crop', 'area', 'repay', 'due', 'exp', 'n', 'by'];
const canonical = (r) => JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, r[k]])));

export async function makeRequest(fields, { stellarAddress, signHash }) {
  const now = Math.floor(Date.now() / 1000);
  const r = { v: 1, ...fields, exp: now + VALID_S, n: Math.floor(Math.random() * 1e6), by: stellarAddress };
  const msg = canonical(r);
  const sigHex = await signStellarMessage(signHash, msg);
  // Compact for the QR: the signature as base64url (86 chars, not 128 hex).
  const sig = b64u(String.fromCharCode(...sigHex.match(/../g).map((x) => parseInt(x, 16))));
  return { request: r, qr: PREFIX + b64u(JSON.stringify({ m: msg, s: sig })), number: String(r.n).padStart(6, '0') };
}

/** Decode and check a scanned request for her. Throws a plain reason when it is not valid. */
export async function checkRequest(text, { cfg, me }) {
  if (!text?.startsWith(PREFIX)) throw new Error('This is not a Nila request.');
  let m; let s;
  try { ({ m, s } = JSON.parse(unb64u(text.slice(PREFIX.length)))); } catch { throw new Error('This code cannot be read.'); }
  let r;
  try { r = JSON.parse(m); } catch { throw new Error('This code cannot be read.'); }
  if (!r || typeof r !== 'object' || canonical(r) !== m) throw new Error('This code cannot be read.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`Stellar Signed Message:\n${m}`)));
  const sig = /^[0-9a-f]{128}$/i.test(s)
    ? Uint8Array.from(s.match(/../g).map((x) => parseInt(x, 16)))
    : Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  let signed = false;
  try { signed = Keypair.fromPublicKey(r.by).verify(Buffer.from(hash), Buffer.from(sig)); } catch { /* bad key */ }
  if (!signed) throw new Error('This code was not made by a Nila leader.');
  const now = Date.now() / 1000;
  if (!(Number.isInteger(r.exp) && r.exp > now)) throw new Error('This request has expired. Ask your leader for a new one.');
  if (r.exp > now + VALID_S + MAX_SKEW_S) throw new Error('This code cannot be read.');
  // Only values the app can show exactly: whole rupees within the cap, whole hours, a 32-byte token id.
  let cash;
  try { cash = BigInt(r.cash); } catch { throw new Error('This code cannot be read.'); }
  if (typeof r.cash !== 'string' || cash < 0n || cash % NIN !== 0n || cash > MAX_CASH) throw new Error('This code cannot be read.');
  if (!Number.isInteger(r.hours) || r.hours < 0 || r.hours > 0xffffffff || (cash === 0n && r.hours === 0)) throw new Error('This code cannot be read.');
  if (!/^[0-9a-f]{64}$/.test(r.token || '')) throw new Error('This code cannot be read.');
  if (r.member !== me) throw new Error('This request is for someone else.');
  if (r.union !== cfg.union) throw new Error('This request is for another union.');
  const leader = await readContract(cfg, 'roles', 'is_leader', [sv.address(r.union), sv.address(r.by)]);
  if (!leader) throw new Error('This code was not made by a leader of your union.');
  return r;
}

export const NIN = 10_000_000n; // 7 decimals
const MAX_CASH = 10_000n * NIN; // ₹10,000 per loan (LOAN_RULES §5)
