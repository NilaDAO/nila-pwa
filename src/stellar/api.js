// The node's Stellar endpoints (nila-sensing app/routers/stellar.py, oracle O1/O1b) and Horizon reads.
const API = process.env.REACT_APP_API_BASE_URL;

async function call(path, init) {
  const r = await fetch(`${API}${path}`, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body.detail || `${path}: ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return body;
}

const post = (path, body) => call(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** Network, passphrase, public RPC and Horizon URLs, nIN asset, union, contract ids. */
export const getStellarConfig = () => call('/stellar/config');

/** Step 1: the sponsored account tx (create + nIN trustline) for her to sign. */
export const buildAccount = (member) => post('/stellar/account', { member });

/** Step 2: her signed tx and her Polygon key's signature on the wallet pair. */
export const submitAccount = (xdr, polygon, polygonSig) =>
  post('/stellar/account/submit', { xdr, polygon, polygon_sig: polygonSig });

/** Her existing account without this network's nIN trustline (22 Oct): the sponsored trustline, two steps. */
export const buildNinTrustline = (member) => post('/stellar/nin-trustline', { member });
export const submitNinTrustline = (xdr) => post('/stellar/nin-trustline/submit', { xdr });

/** What her Polygon key signs (must match stellar/sponsor.py link_message). */
export const linkMessage = (network, stellar, polygon) =>
  `Nila: my Stellar account\nnetwork: ${network}\nstellar: ${stellar}\npolygon: ${polygon}`;

/** Her account on Horizon: null when it does not exist yet. */
export async function getAccount(horizonUrl, address) {
  const r = await fetch(`${horizonUrl}/accounts/${address}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`horizon ${r.status}`);
  return r.json();
}
