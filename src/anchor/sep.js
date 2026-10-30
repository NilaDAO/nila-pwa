// The trust's anchor (nila-anchor, A0) for LPs: SEP-1 → SEP-10 → SEP-12 (K1) → SEP-38 → SEP-24, drawn in the
// app (no web view). Design: data/DataAnchor.md, hooks useSep10Token, useKyc, useQuote, useAcceptOffer,
// useAnchorTx. The anchor's home comes from the node (/stellar/config anchor_url); its business server
// (consent, the in-app SEP-24 step) from the toml's NILA_ANCHOR_SERVER. Her Stellar key signs only the SEP-10
// challenge, checked first (the server's key, her account, the home domain).
import { StellarToml, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';

export const INR = 'iso4217:INR';
export const BRING = 0;
export const COLLECT = 1;
const b64 = (u8) => btoa(String.fromCharCode(...u8));

async function json(r, what) {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    // The Anchor Platform passes the anchor's 400 on without its reason (29 Oct): say what it means.
    const plain = r.status === 400 && /^K1/.test(what) ? 'The anchor did not accept these details. Check each field and the selfie.' : `${what}: ${r.status}`;
    const err = new Error(body.error || body.detail || plain);
    err.status = r.status;
    throw err;
  }
  return body;
}

/** The anchor's stellar.toml: endpoints, its SEP-10 signing key, the USDC it serves. */
export async function anchorInfo(anchorUrl) {
  const u = new URL(anchorUrl);
  const toml = await StellarToml.Resolver.resolve(u.host, { allowHttp: u.protocol === 'http:', timeout: 10_000 });
  for (const k of ['WEB_AUTH_ENDPOINT', 'SIGNING_KEY', 'KYC_SERVER', 'TRANSFER_SERVER_SEP0024', 'ANCHOR_QUOTE_SERVER', 'NILA_ANCHOR_SERVER']) {
    if (!toml[k]) throw new Error(`the anchor's stellar.toml has no ${k}`);
  }
  return { ...toml, homeDomain: u.host };
}

/** SEP-10: the anchor's challenge, checked, signed by her Privy Stellar wallet. Returns { token, exp }. */
export async function sep10(info, account, signHash, chainPassphrase) {
  // The challenge is the anchor's own: checked and signed with the passphrase its stellar.toml names (the demo's local
  // network runs Anchor Platform as FUTURENET, 26 Oct); it is never submitted.
  const passphrase = info.NETWORK_PASSPHRASE || chainPassphrase;
  const c = await json(await fetch(`${info.WEB_AUTH_ENDPOINT}?account=${account}&home_domain=${encodeURIComponent(info.homeDomain)}`), 'SEP-10');
  const webAuthDomain = new URL(info.WEB_AUTH_ENDPOINT).host;
  // Throws unless it is a real challenge from the anchor's signing key, for her account and this home domain.
  const { clientAccountID } = WebAuth.readChallengeTx(c.transaction, info.SIGNING_KEY, passphrase, info.homeDomain, webAuthDomain);
  if (clientAccountID !== account) throw new Error('the SEP-10 challenge is not for your account');
  const tx = TransactionBuilder.fromXDR(c.transaction, passphrase);
  tx.addSignature(account, b64(await signHash(tx.hash())));
  const { token } = await json(await fetch(info.WEB_AUTH_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction: tx.toXDR() }),
  }), 'SEP-10');
  const exp = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
  return { token, exp };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** K1 (SEP-12): her record at the anchor (status NEEDS_INFO | PROCESSING | ACCEPTED | REJECTED). */
export const getCustomer = async (info, token, type = 'lp') =>
  json(await fetch(`${info.KYC_SERVER}/customer?type=${type}`, { headers: auth(token) }), 'K1');

/** K1 fields (SEP-9 names, k1.py in nila-anchor) and the selfie (multipart, AP forwards it as binary). */
export async function putCustomer(info, token, fields, selfie, type = 'lp') {
  const r = await json(await fetch(`${info.KYC_SERVER}/customer`, {
    method: 'PUT', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...fields }),
  }), 'K1');
  if (selfie) {
    const f = new FormData();
    f.append('id', r.id);
    f.append('type', type);
    f.append('proof_of_liveness', selfie, 'selfie.jpg');
    await json(await fetch(`${info.KYC_SERVER}/customer`, { method: 'PUT', headers: auth(token), body: f }), 'K1 selfie');
  }
  return r;
}

/** Her consent to the phone and location check (not a SEP-9 field: the anchor's own endpoint). */
export const putConsent = async (info, token, type = 'lp') => json(await fetch(`${info.NILA_ANCHOR_SERVER}/k1/consent`, {
  method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ type }),
}), 'consent');

/** SEP-38 firm quote for an offer's rupees (Bring: she sells INR; Collect: she sells USDC). */
export async function firmQuote(info, token, usdcId, kind, inr) {
  const side = kind === BRING
    ? { sell_asset: INR, buy_asset: usdcId, sell_amount: String(inr), sell_delivery_method: 'cash' }
    : { sell_asset: usdcId, buy_asset: INR, buy_amount: String(inr), buy_delivery_method: 'cash' };
  return json(await fetch(`${info.ANCHOR_QUOTE_SERVER}/quote`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...side, context: 'sep24' }),
  }), 'SEP-38');
}

/** The anchor's SEP-24 page (T1-A A3, 30 Oct) in a frame over the app: resolves with the swap's id once the member
 *  confirms there, rejects when the page refuses or the member cancels. The page posts only the id and the outcome. */
function confirmOnPage(url, origin) {
  return new Promise((resolve, reject) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Confirm your swap with the Nila trust');
    Object.assign(wrap.style, { position: 'fixed', inset: '0', zIndex: '9999', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.6)' });
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'Nila trust';
    Object.assign(frame.style, { flex: '1', width: '100%', border: '0', background: '#fff' });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, { height: '56px', border: '0', font: 'inherit', fontWeight: '600', background: '#1F1E1C', color: '#EDEBE6' });
    const done = (fn, v) => { window.removeEventListener('message', onMessage); wrap.remove(); fn(v); };
    function onMessage(e) {
      if (e.origin !== origin || e.data?.type !== 'nila-sep24') return;
      if (e.data.status === 'confirmed') done(resolve, e.data.id);
      else done(reject, new Error(e.data.reason || 'The Nila trust did not open this swap.'));
    }
    window.addEventListener('message', onMessage);
    cancel.onclick = () => done(reject, new Error('Swap cancelled.'));
    wrap.append(frame, cancel);
    document.body.appendChild(wrap);
  });
}

/**
 * SEP-24 for one offer: open the deposit (Bring) or withdraw (Collect) with the quote, then the member confirms on
 * the anchor's own page (A3), where the business server checks the offer, the LP status and the quote; the app then
 * takes the accept the anchor signed with its swap key (fx_pool pays only a swap the anchor signed, C16). Returns
 * { id, usdc (units), valid_until, sig (hex) } for fx_pool.accept.
 */
export async function openSwap(info, token, usdcAsset, account, kind, offerId, quote) {
  const [code, issuer] = usdcAsset.split(':');
  const body = { asset_code: code, asset_issuer: issuer, amount: quote.sell_amount, quote_id: quote.id, account };
  body[kind === BRING ? 'source_asset' : 'destination_asset'] = INR;
  const t = await json(await fetch(`${info.TRANSFER_SERVER_SEP0024}/transactions/${kind === BRING ? 'deposit' : 'withdraw'}/interactive`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), 'SEP-24');
  const page = new URL(t.url);
  const step = page.searchParams.get('token');
  page.searchParams.set('offer_id', String(Number(offerId)));
  const confirmed = await confirmOnPage(page.href, new URL(info.NILA_ANCHOR_SERVER).origin);
  if (confirmed !== t.id) throw new Error('the anchor answered for another swap');
  const signed = await json(await fetch(`${info.NILA_ANCHOR_SERVER}/sep24/signed?token=${encodeURIComponent(step)}`), 'anchor');
  if (signed.sep24_id !== t.id || signed.quote_id !== quote.id) throw new Error('the anchor answered for another swap');
  return { id: t.id, usdc: signed.usdc, validUntil: signed.valid_until, sig: signed.sig };
}

/** SEP-24 status: pending_user_transfer_start | pending_anchor | completed | expired | error … */
export const swapStatus = async (info, token, id) =>
  (await json(await fetch(`${info.TRANSFER_SERVER_SEP0024}/transaction?id=${id}`, { headers: auth(token) }), 'SEP-24')).transaction;
