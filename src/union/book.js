// The leaders' contact book (executive decision 1 Nov): the full name (and an optional phone) a leader gives an
// address, shared between the union's leaders. The farm name stays public on-chain; this is the leaders' own reference.
// Everything is locked with the union key, which the leaders pass to each other face to face as a QR:
//   key   32 random bytes, kept on this phone only (localStorage, per union)
//   fp    sha256('nila-book' || key), first 16 bytes hex: the node keeps it, so a leader with another key is told
//   tag   HMAC-SHA256(key, address) hex: the node cannot tell which address an entry is about
//   box   base64(iv || AES-GCM(key, JSON {a, n, p})): address, name, phone
// The node (GET/POST /stellar/union/book) stores tags and boxes only.
const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (b) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

const KEY = (union) => `nila.book.key.${union}`;
const CACHE = (union) => `nila.book.cache.${union}`;

export function loadKey(union) {
  try { const k = localStorage.getItem(KEY(union)); return k ? unb64url(k) : null; } catch { return null; }
}
export function saveKey(union, raw) {
  try { localStorage.setItem(KEY(union), b64url(raw)); localStorage.removeItem(CACHE(union)); } catch { /* private window */ }
}
export const newKey = () => crypto.getRandomValues(new Uint8Array(32));

export async function fingerprint(raw) {
  const pre = new Uint8Array([...enc.encode('nila-book'), ...raw]);
  return hex(await crypto.subtle.digest('SHA-256', pre)).slice(0, 32);
}

/** The key QR: NILA:K:<union>:<key>. Shown only after the leader confirms; scanned on another leader's phone. */
export const keyQr = (union, raw) => `NILA:K:${union}:${b64url(raw)}`;
export function parseKeyQr(text) {
  const m = /^NILA:K:([GC][A-Z2-7]{55}):([A-Za-z0-9_-]{43})$/.exec(String(text || '').trim());
  return m ? { union: m[1], key: unb64url(m[2]) } : null;
}

const hmacKey = (raw) => crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function tagOf(raw, address) {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(raw), enc.encode(address)));
}

export async function seal(raw, { address, name, phone }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = JSON.stringify({ a: address, n: name, ...(phone ? { p: phone } : {}) });
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(raw), enc.encode(body));
  return b64(new Uint8Array([...iv, ...new Uint8Array(ct)]));
}

export async function open(raw, box) {
  const all = unb64(box);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(raw), all.slice(12));
  const o = JSON.parse(dec.decode(pt));
  return { address: o.a, name: o.n || '', phone: o.p || '' };
}

/** The opened book kept on the phone ({seq, fp, entries: {tag: {address, name, phone}}}), so only changes are fetched. */
export function loadCache(union) {
  try { return JSON.parse(localStorage.getItem(CACHE(union))) || null; } catch { return null; }
}
export function saveCache(union, c) {
  try { localStorage.setItem(CACHE(union), JSON.stringify(c)); } catch { /* full or private */ }
}
