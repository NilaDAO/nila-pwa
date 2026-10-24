// The node's /plan API (oracle O3/O4/O11). Every call is signed with her Stellar wallet (SEP-53):
// "nila-plan\n<METHOD> <path>\n<ts>\n<sha256(body) hex>", headers X-Nila-Account / -Ts / -Sig
// (nila-sensing plan/auth.py). Privy signs a 32-byte hash, so the SEP-53 hash is made here.
const API = process.env.REACT_APP_API_BASE_URL;
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = (bytes) => crypto.subtle.digest('SHA-256', bytes);

/** SEP-53: ed25519 over sha256("Stellar Signed Message:\n" + message). */
export async function signStellarMessage(signHash, message) {
  const h = new Uint8Array(await sha256(enc.encode(`Stellar Signed Message:\n${message}`)));
  return hex(await signHash(h));
}

/** A signed fetch to the node, for /plan and the other signed APIs (border O16 …). */
export function signedCall({ stellarAddress, signHash }) {
  // opts.etag: sent as If-None-Match; a 304 returns { notModified: true } and the reply's ETag is kept in out.etag.
  return async function call(method, path, body, opts = {}) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000);
    const msg = `nila-plan\n${method} ${path.split('?')[0]}\n${ts}\n${hex(await sha256(enc.encode(raw)))}`;
    const sig = await signStellarMessage(signHash, msg);
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Nila-Account': stellarAddress, 'X-Nila-Ts': String(ts), 'X-Nila-Sig': sig,
        ...(opts.etag ? { 'If-None-Match': opts.etag } : {}) },
      body: body === undefined ? undefined : raw,
      ...(opts.etag ? { cache: 'no-store' } : {}),
    });
    if (r.status === 304) return { notModified: true };
    const out = await r.json().catch(() => ({}));
    if (r.headers.get('ETag')) Object.defineProperty(out, 'etag', { value: r.headers.get('ETag'), enumerable: false });
    if (!r.ok) {
      const e = new Error(out.detail || `${path}: ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return out;
  };
}

export function planClient(signer) {
  const call = signedCall(signer);
  return {
    makePlan: (landId, intake, extra = {}) => call('POST', '/plan/jobs', { land_id: landId, intake, ...extra }),
    job: (jobId) => call('GET', `/plan/jobs/${jobId}`),
    latest: (landId) => call('GET', `/plan/land/${landId}`),
    plan: (planId) => call('GET', `/plan/${planId}`),
    accept: (planId, zone) => call('POST', `/plan/${planId}/accept`, { zone }),
    pendingApprovals: () => call('GET', '/plan/approvals/pending'),
    approvedPlans: () => call('GET', '/plan/approvals/approved'),
    discard: (planId) => call('POST', `/plan/${planId}/discard`, {}),
    revise: (planId, note, changes = {}, remove = []) => call('POST', `/plan/${planId}/revise`, { note, changes, remove }),
    approve: (planId, decision, reason, note) => call('POST', `/plan/${planId}/approve`, { decision, reason, note }),
    mintList: (planId) => call('GET', `/plan/${planId}/mint`),
    gas: (planId) => call('POST', `/plan/${planId}/gas`, {}),
    // P6 / O13: the 8 machine photos of L13 → their hash for machinery.register_machine.
    machinePhotos: (photos) => call('POST', '/machines/photos', { photos }),
    // P10 / O15: the union's loan list (the async list) and C2's event search, one window per tap.
    unionLoans: () => call('GET', '/stellar/union/loans'),
    unionTitles: () => call('GET', '/stellar/union/titles'),
    // The compact members list (map-centred lane, 23 Oct): one row per member; 404 until the node has it.
    // With the ETag of the list kept on the phone: { notModified: true } when the node's list has not changed (24 Oct).
    unionMembers: (etag) => call('GET', '/stellar/union/members', undefined, { etag }),
    unionSearch: (window) => call('POST', '/stellar/union/search', { window }),
  };
}

export async function getCatalogue() {
  const r = await fetch(`${API}/plan/catalogue`);
  if (!r.ok) throw new Error(`catalogue ${r.status}`);
  return r.json();
}
