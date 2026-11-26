// Plan 053 (26 Nov): an assist-mode member's own key on her own phone, no Privy, no Cognito. ECDSA P-256 made with
// WebCrypto, not extractable, kept in this phone's IndexedDB (as Nila lite's device key, public/lite/lite.js). Its own
// database ('nila-phonekey'), apart from the app's other data; Settings › Reset deletes it too since a leader can
// recover a joined account on a new key (plan 054 §5).
// The account checks secp256r1 over sha256(payload), which is what WebCrypto's ECDSA/SHA-256 signs; s is made low
// (the account accepts only that form, as public/lite/session.js lowS).
// No React here: WalletRoot and App read the flag at start.

const DB = 'nila-phonekey';
const FLAG = 'nila.signer';
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: { name: 'SHA-256' } };

/** This phone is a phone-key member's (localStorage nila.signer = 'phone'). Only in Privy builds (the Stellar app). */
export function isPhoneKeyPhone() {
  if (!process.env.REACT_APP_PRIVY_APP_ID || process.env.REACT_APP_DEMO_STATIC === '1') return false;
  try { return localStorage.getItem(FLAG) === 'phone'; } catch { return false; }
}
export function markPhoneKeyPhone() {
  try { localStorage.setItem(FLAG, 'phone'); localStorage.setItem('nila.mode', 'assist'); } catch { /* not kept */ }
}

function idb() {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}
async function get() {
  const db = await idb();
  return new Promise((ok, fail) => {
    const req = db.transaction('keys', 'readonly').objectStore('keys').get('device');
    req.onsuccess = () => ok(req.result || null);
    req.onerror = () => fail(req.error);
  });
}
async function put(rec) {
  const db = await idb();
  return new Promise((ok, fail) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(rec, 'device');
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
  });
}

/** Whether this phone holds a phone key (any error: no). */
export async function hasPhoneKey() {
  try { return !!(await get())?.pair; } catch { return false; }
}

/** The phone key: { pair, pub (65 bytes, uncompressed) }; made (and storage made persistent) when there is none. */
export async function loadOrMakeKey() {
  const c = window.crypto?.subtle;
  if (!c) throw new Error('no WebCrypto (not a secure connection)');
  const rec = await get();
  if (rec?.pair) return { pair: rec.pair, pub: new Uint8Array(rec.pub || await c.exportKey('raw', rec.pair.publicKey)) };
  const pair = await c.generateKey(ALGO, false, ['sign', 'verify']);
  const pub = new Uint8Array(await c.exportKey('raw', pair.publicKey));
  await put({ pair, pub, at: Date.now() });
  // Android may clear site storage under low space unless it is persistent (plan 053 point 6).
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  return { pair, pub };
}

const N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');   // the P-256 order
const toBig = (u8) => BigInt(`0x${[...u8].map((b) => b.toString(16).padStart(2, '0')).join('') || '0'}`);
const toBytes32 = (n) => Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g), (x) => parseInt(x, 16));

/** r | s with s in the lower half. */
export function lowS(sig) {
  const s = toBig(sig.subarray(32, 64));
  if (s <= N / BigInt(2)) return sig;
  const out = new Uint8Array(64);
  out.set(sig.subarray(0, 32), 0); out.set(toBytes32(N - s), 32);
  return out;
}

/** A Soroban payload (32 bytes) signed for the account: 64 bytes r | s, low s. */
export async function signPayload(pair, payload) {
  return lowS(new Uint8Array(await window.crypto.subtle.sign(SIGN, pair.privateKey, payload)));
}

/** Any message (a signed node call): the raw 64-byte r | s of ECDSA P-256 / SHA-256 over the bytes. */
export async function signBytes(pair, bytes) {
  return new Uint8Array(await window.crypto.subtle.sign(SIGN, pair.privateKey, bytes));
}

const MAINNET = 'Public Global Stellar Network ; September 2015';
/** The event indexer (nila-sensing indexer, public): REACT_APP_INDEXER_URL, else indexer.nila.land on mainnet only. */
export const indexerUrl = (cfg) => process.env.REACT_APP_INDEXER_URL
  || (cfg?.passphrase === MAINNET ? 'https://indexer.nila.land' : '');

/** After a reset (recover_by_sms put this key on her account): the account whose latest signer_set names this key
 *  (hex, lowercase), from the indexer's signer_set events; undefined when none does. */
export async function findAccountByKey(base, keyHex) {
  const last = new Map();                       // account → whether its latest signer_set names this key
  let after;
  for (let page = 0; page < 40; page++) {
    const r = await fetch(`${base}/events?name=signer_set&limit=500${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    if (!r.ok) throw new Error(`indexer ${r.status}`);
    const out = await r.json();
    for (const e of out.events || []) {
      const acct = e.contract_id || e.contract;
      last.delete(acct);
      last.set(acct, JSON.stringify(e.value ?? '').toLowerCase().includes(keyHex));
    }
    if (!out.next) break;
    after = out.next;
  }
  return [...last].filter(([, mine]) => mine).map(([a]) => a).pop();
}
