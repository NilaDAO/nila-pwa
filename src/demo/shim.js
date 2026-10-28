// Demo only: one fetch-level shim for the static demo build (executive decision 23 Oct). Never in a real build:
// src/demo/install.js loads it only when REACT_APP_DEMO_RECORD or REACT_APP_DEMO_STATIC is '1' (both literals at
// build time, config-overrides.js, so webpack drops this module otherwise).
//
// Record (REACT_APP_DEMO_RECORD=1, the local demo stack): every call to the node, the Soroban RPC, Horizon and the
// Polygon RPC goes through as usual, and {who, key, status, ct, body} is posted to /__demo/record on the app's own
// origin (nila-integrations scripts/demo/serve.mjs appends it to .demo/recordings/pwa-<port>.jsonl).
// Static (REACT_APP_DEMO_STATIC=1): the same calls are answered from /demo-fixtures.json (built from the recordings
// by nila-integrations scripts/demo/static-fixtures.mjs). A miss logs `[demo-static] miss <key>` and answers neutrally
// (node GET 404, node POST {}, Soroban/Polygon a JSON-RPC error, getLedgerEntries/getEvents empty). Writes never get
// here: soroban.js invokeContract and plan/mint.js send return a canned success in static mode. The Cognito calls
// (/__demo/cognito) are answered here too, for the demo numbers in the fixtures, code 000000.
//
// Keys (stable across sessions): node `node <METHOD> <path> <body>` with signatures, timestamps, nonces and tx XDR
// dropped from the body (a body over 4 KB, e.g. photos, is left out); Soroban `sim <contract>.<fn>(<args>)` decoded
// from the simulated tx, `ledger <keys>`, `events <filters>`, `stellar <method> [<hash>]`; Polygon `eth_call <to> <data>`,
// else `<method> <params>`; Horizon and other GETs by URL. Per user: `who` = her Polygon address (from her Cognito
// login); a key not recorded for her falls back to the last answer recorded for anyone.
import AES from 'crypto-js/aes';

const RECORD = process.env.REACT_APP_DEMO_RECORD === '1';
const STATIC = process.env.REACT_APP_DEMO_STATIC === '1';
const API = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');
const realFetch = window.fetch.bind(window);
const WHO = 'nila.demo.who';
const who = () => { try { return localStorage.getItem(WHO) || 'anon'; } catch { return 'anon'; } };
const setWho = (a) => { try { if (a) localStorage.setItem(WHO, a.toLowerCase()); } catch { /* kept nowhere */ } };

// ── keys ──
const DROP = /^(sig|signature|polygon_sig|.*_sig|ts|timestamp|nonce|expiry|expires|exp|xdr|signed_xdr|challenge)$/i;
const strip = (v) => (Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter((k) => !DROP.test(k)).map((k) => [k, strip(v[k])])) : v);
const bodyKey = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  if (raw.length > 4096) return '<large>';
  try { return JSON.stringify(strip(JSON.parse(raw))); } catch { return raw; }
};
const plain = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString()
  : x && x.type === 'Buffer' && Array.isArray(x.data) ? Buffer.from(x.data).toString('hex') : x));

let sdk;
async function rpcKey(m) {
  const p = m.params;
  if (/^(eth|net)_/.test(m.method)) {
    if (m.method === 'eth_call') return `eth_call ${String(p[0]?.to).toLowerCase()} ${p[0]?.data || p[0]?.input}`;
    if (m.method === 'eth_chainId' || m.method === 'eth_blockNumber' || m.method === 'eth_gasPrice') return m.method;
    return `${m.method} ${plain(p)}`;
  }
  if (m.method === 'simulateTransaction') {
    try {
      sdk ||= await import('@stellar/stellar-sdk');
      const at = (o, k) => (typeof o[k] === 'function' ? o[k]() : o[k]);   // sdk 17: XDR members are properties
      const tx = at(at(sdk.xdr.TransactionEnvelope.fromXDR(p.transaction, 'base64'), 'value'), 'tx');
      const op = at(at(at(at(at(tx, 'operations')[0], 'body'), 'value'), 'hostFunction'), 'value');
      const c = sdk.Address.fromScAddress(at(op, 'contractAddress')).toString();
      return `sim ${c}.${at(op, 'functionName').toString()}(${plain(at(op, 'args').map((a) => sdk.scValToNative(a)))})`;
    } catch { return `sim ${p.transaction}`; }
  }
  if (m.method === 'getLedgerEntries') return `ledger ${(p.keys || []).join(',')}`;
  if (m.method === 'getEvents') return `events ${plain(p.filters)} ${p.pagination?.limit || ''}`;
  if (m.method === 'getTransaction') return `stellar getTransaction ${p.hash}`;
  return `stellar ${m.method}`;
}

/** What a request is, or null when the shim leaves it alone (the app's own files, other sites' POSTs). */
async function classify(url, init) {
  const method = (init.method || 'GET').toUpperCase();
  const raw = typeof init.body === 'string' ? init.body : '';
  if (API && url.startsWith(API)) {
    const u = new URL(url);
    const q = [...u.searchParams].filter(([k]) => !DROP.test(k)).map(([k, v]) => `${k}=${v}`).join('&');
    return { kind: 'node', method, keys: [`node ${method} ${u.pathname}${q ? `?${q}` : ''} ${bodyKey(raw)}`.trim()] };
  }
  if (method === 'POST' && raw.includes('"jsonrpc"')) {
    let msg; try { msg = JSON.parse(raw); } catch { return null; }
    const list = Array.isArray(msg) ? msg : [msg];
    return { kind: 'rpc', batch: Array.isArray(msg), list, keys: await Promise.all(list.map(rpcKey)) };
  }
  if (method === 'GET' && new URL(url, location.href).origin !== location.origin) {
    const u = new URL(url);
    return { kind: 'get', keys: [u.hostname.includes('horizon') ? `horizon ${u.pathname}${u.search}` : `GET ${url}`] };
  }
  return null;
}

// ── record ──
const send = (rows) => realFetch('/__demo/record', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nila-Demo': '1' },
  body: JSON.stringify(rows) }).catch(() => {});

async function record(c, res) {
  const ct = res.headers.get('content-type') || 'application/json';
  if (!/json|text/.test(ct)) return;                     // images and other binaries are not recorded
  const text = await res.clone().text().catch(() => null);
  if (text == null) return;
  if (c.kind !== 'rpc') { send([{ who: who(), key: c.keys[0], status: res.status, ct, body: text }]); return; }
  let out; try { out = JSON.parse(text); } catch { return; }
  const byId = new Map((Array.isArray(out) ? out : [out]).map((r) => [r.id, r]));
  send(c.list.map((m, i) => { const r = byId.get(m.id) || {}; return { who: who(), key: c.keys[i], rpc: 'error' in r ? { error: r.error } : { result: r.result } }; }));
}

/** Demo QR texts (shell/CameraView): recorded per screen, offered again in the static build. */
export function recordQr(text) { if (RECORD) send([{ who: who(), key: `qr ${location.pathname}${location.hash}`, status: 200, ct: 'text/plain', body: text }]); }

// ── static ──
let fx = {};
const loaded = STATIC ? realFetch('/demo-fixtures.json').then((r) => r.json()).then((j) => { fx = j; }).catch((e) => console.error('[demo-static] no fixtures', e)) : null;
const find = (key) => fx[who()]?.[key] ?? fx['*']?.[key];
const miss = (key) => { console.warn(`[demo-static] miss ${key}`); };
const reply = (body, status = 200, ct = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': ct } });

export const demoQr = () => {
  const here = `qr ${location.pathname}${location.hash}`;
  if (find(here)) return find(here).body;
  const any = Object.entries({ ...fx['*'] }).filter(([k]) => k.startsWith('qr '));
  return any.length ? any[any.length - 1][1].body : null;
};
/** Her Stellar address, from the fixtures (the static build has no Privy). */
export const stellarOf = async (evm) => { await loaded; return fx.__users && Object.values(fx.__users).find((u) => u.address.toLowerCase() === String(evm).toLowerCase())?.stellar; };

function neutralRpc(m, key) {
  miss(key);
  if (m.method === 'getLedgerEntries') return { result: { entries: [], latestLedger: 1 } };
  if (m.method === 'getEvents') return { result: { events: [], latestLedger: 1 } };
  if (m.method === 'getTransaction') return { result: { status: 'NOT_FOUND', latestLedger: 1 } };
  if (m.method === 'eth_chainId') return { result: `0x${Number(process.env.REACT_APP_CHAIN_ID || 137).toString(16)}` };
  return { error: { code: -32000, message: `demo: not recorded (${m.method})` } };
}

// A fresh demo number (__users[phone].demo_new, 1111111111 in the hosted demo, 28 Oct) registers again on every login
// and nothing it does is kept: its field-points job shows only after it sent points in this session.
const SENT = 'nila.demo.sent';
const freshNow = () => Object.values(fx.__users || {}).some((u) => u.demo_new && u.address.toLowerCase() === who());

async function answer(c, init) {
  await loaded;
  if (c.kind === 'node' && freshNow()) {
    if (c.method === 'POST' && /^node POST \/border\/points/.test(c.keys[0])) { try { sessionStorage.setItem(SENT, '1'); } catch { /* none */ } }
    let sent = false; try { sent = sessionStorage.getItem(SENT) === '1'; } catch { /* none */ }
    if (!sent && /^node GET \/border\/mine/.test(c.keys[0])) return reply({ job: null });
  }
  if (c.kind === 'rpc') {
    const out = c.list.map((m, i) => ({ jsonrpc: '2.0', id: m.id, ...(find(c.keys[i])?.rpc || neutralRpc(m, c.keys[i])) }));
    return reply(c.batch ? out : out[0]);
  }
  const hit = find(c.keys[0]);
  if (hit) return reply(hit.body, hit.status, hit.ct);
  if (c.kind === 'get' && !c.keys[0].startsWith('horizon ')) return null;   // another site (tiles, images): the network
  miss(c.keys[0]);
  if (c.kind === 'node' && c.method !== 'GET') return reply({});
  return reply({ detail: 'demo: not recorded' }, 404);
}

// The Cognito stand-in (as nila-integrations scripts/demo/cognito-standin.mjs, in the browser): the demo numbers only.
const b64u = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = (phone, kind) => `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: phone, token_use: kind, exp: Math.floor(Date.now() / 1000) + 30 * 86400 })}.demo`;
const phoneOf = (t) => { try { return JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { return null; } };
const fail = (type, message) => reply({ __type: type, message }, 400, 'application/x-amz-json-1.1');
const ok = (body) => reply(body, 200, 'application/x-amz-json-1.1');

async function cognito(op, b) {
  await loaded;
  const users = fx.__users || {};
  const phone = b.Username || b.AuthParameters?.USERNAME || b.ChallengeResponses?.USERNAME || String(b.Session || '').replace(/^demo-/, '')
    || phoneOf(b.AccessToken) || phoneOf(b.AuthParameters?.REFRESH_TOKEN);
  const u = users[phone];
  if (!u) return fail('UserNotFoundException', 'Only the demo numbers log in here.');
  if (op === 'SignUp') return fail('UsernameExistsException', 'User already exists');
  if (op === 'InitiateAuth' && b.AuthFlow === 'REFRESH_TOKEN_AUTH') return ok({ AuthenticationResult: { AccessToken: token(phone, 'access'), IdToken: token(phone, 'id'), ExpiresIn: 3600 } });
  if (op === 'InitiateAuth') return ok({ ChallengeName: 'CUSTOM_CHALLENGE', Session: `demo-${phone}`, ChallengeParameters: { USERNAME: phone } });
  if (op === 'RespondToAuthChallenge') {
    if (String(b.ChallengeResponses?.ANSWER) !== '000000') return fail('NotAuthorizedException', 'Incorrect username or password.');
    try { localStorage.setItem(`nila.demo.salt.${phone}`, b.ClientMetadata?.salt || ''); sessionStorage.removeItem(SENT); } catch { /* none */ }
    setWho(u.address);
    return ok({ AuthenticationResult: { AccessToken: token(phone, 'access'), RefreshToken: token(phone, 'refresh'), IdToken: token(phone, 'id'), ExpiresIn: 3600, TokenType: 'Bearer' }, ChallengeParameters: {} });
  }
  if (op === 'GetUser') {
    let salt = ''; try { salt = localStorage.getItem(`nila.demo.salt.${phone}`) || ''; } catch { /* none */ }
    setWho(u.address);
    const attrs = { phone_number: phone, 'custom:chain': 'stellar', 'custom:address': u.address, 'custom:prevsalt': salt, 'custom:salt_': '',
      'custom:encryptedPrivateKey': AES.encrypt(u.pk, salt).toString(), 'custom:demo_new': u.demo_new ? '1' : '0' };
    return ok({ Username: phone, UserAttributes: Object.entries(attrs).map(([Name, Value]) => ({ Name, Value })) });
  }
  if (/UpdateUserAttributes$/.test(op)) return ok({});
  return fail('InvalidParameterException', `${op} is not in the static demo`);
}

// ethers sends its JSON-RPC body as bytes, the AWS SDK as a Request.
const bodyText = async (input, init) => {
  const b = init.body;
  if (typeof b === 'string') return b;
  if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return new TextDecoder().decode(b);
  return input instanceof Request ? input.clone().text().catch(() => '') : '';
};

window.fetch = async function demoFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const merged = { method: init.method || (input instanceof Request ? input.method : 'GET'), body: await bodyText(input, init) };
  if (url.endsWith('/__demo/cognito') || url.endsWith('/__demo/cognito/')) {
    let b = {}; try { b = JSON.parse(merged.body || '{}'); } catch { /* empty */ }
    const h = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const op = String(h.get('x-amz-target') || '').split('.').pop();
    if (STATIC) return cognito(op, b);
    const res = await realFetch(input, init);
    if (op === 'GetUser') res.clone().json().then((j) => setWho(j.UserAttributes?.find((a) => a.Name === 'custom:address')?.Value)).catch(() => {});
    return res;
  }
  let c = null;
  try { c = await classify(url, merged); } catch { c = null; }
  if (!c) return realFetch(input, init);
  if (STATIC) return (await answer(c, init)) || realFetch(input, init);
  const res = await realFetch(input, init);
  record(c, res).catch(() => {});
  return res;
};

// The static demo runs in a phone's browser tab too (no install step), as the app's own allowWeb switch does.
if (STATIC) { try { localStorage.setItem('allowWeb', '1'); } catch { /* not kept */ } }
console.log(`[demo] ${STATIC ? 'static: answers from /demo-fixtures.json' : 'record: calls are recorded to /__demo/record'}`);
