// One recovery path (executive decision 4 Nov, LOAN_RULES "One recovery path"): a smartphone member whose number is
// lost gets the SMS link on her new number (G2 "Recover on another number"). Nila lite sees the link is for a
// smartphone and opens the full app with the code kept here; she signs up with the new number (Cognito code, Privy),
// then this screen registers her new Privy Stellar key with the link (consent, finish) and waits: the leader's app and
// the node's SMS key call account.recover_by_sms, and after the union's wait the node executes it. From then on her
// account is the returned one, kept per Privy key on this phone: it no longer follows from her key (accountOf).
// The node: nila-sensing 4d31025 (app/routers/keypad.py). DESIGN GAP: no board; the key screens' frame.
import { useCallback, useEffect, useState } from 'react';
import { Card } from './KeyScreens';

const API = process.env.REACT_APP_API_BASE_URL;
const LINK = 'nila.recoverLink';                       // written by public/lite/lite.js
const acctKey = (g) => `nila.account.${g}`;
const waitKey = (g) => `nila.accountWait.${g}`;
const get = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* memory only */ } };

/** The one-time link code waiting on this phone ('' when none). */
export const linkCode = () => get(LINK);
/** Her recovered account for this Privy Stellar key (G…), or undefined: then it follows from the key. */
export const recoveredAccount = (g) => (g && get(acctKey(g))) || undefined;
/** The link is used and the account is not hers yet (the leader's signature, then the union's wait). */
export const recoveryWaits = (g) => !!g && get(waitKey(g)) === '1';

async function node(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(typeof out.detail === 'string' ? out.detail : `${path}: ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return out;
}

const when = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function RecoverLink({ stellar, signHash, onDone }) {
  const code = linkCode();
  const waits = recoveryWaits(stellar);
  const [invite, setInvite] = useState();
  const [rec, setRec] = useState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!code || waits) return;
    node('GET', `/keypad/l/${code}`).then(setInvite)
      .catch((e) => (e.status === 404 || e.status === 410 ? setGone(true) : setError('No connection. Try again.')));
  }, [code, waits]);

  // The new phone asks which account its key controls; the node executes a recovery whose wait is over.
  const check = useCallback(async () => {
    const r = await node('GET', `/keypad/recovered/${stellar}`);
    setRec(r.recovery);
    if (r.account) put(acctKey(stellar), r.account);
    if (r.account && r.recovery?.state === 'ok') { put(waitKey(stellar), ''); onDone(); }
  }, [stellar, onDone]);
  // Every minute, only while this screen is open.
  useEffect(() => {
    if (!waits) return undefined;
    check().catch(() => {});
    const t = setInterval(() => check().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [waits, check]);

  // OK = consent to SMS, then her new Privy key signs sha256("nila-keypad-register\n{CODE}\n{G…}") (Ed25519).
  const agree = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      await node('POST', `/keypad/l/${code}/consent`);
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nila-keypad-register\n${code}\n${stellar}`)));
      const sig = await signHash(h);
      const out = await node('POST', `/keypad/l/${code}/finish`, { stellar_key: stellar, sig: btoa(String.fromCharCode(...sig)) });
      put(acctKey(stellar), out.account);
      put(waitKey(stellar), '1');
      put(LINK, '');
      onDone();
    } catch (e) {
      console.error('[recover] link not finished', e);
      if (e.status === 404 || e.status === 410) setGone(true);
      else setError(e.status ? e.message : 'No connection. Try again.');
    } finally { setBusy(false); }
  };
  const drop = () => { put(LINK, ''); onDone(); };

  if (waits) {
    const r = rec?.state;
    const text = r === 'pending' ? `Waiting for your account to move (works from ${when(rec.at)}).`
      : r === 'other' ? 'Another phone signs for your account. Ask your union leader.'
        : 'Waiting for your account to move. Your union leader confirms it on the leader\'s phone.';
    return <Card title="Moving your account" text={text} button="Check again" busy={busy} error={error}
      onGo={() => { setBusy(true); check().catch(() => setError('No connection. Try again.')).finally(() => setBusy(false)); }} />;
  }
  if (gone) {
    return <Card title="This link no longer works" button="OK" onGo={drop}
      text="It was used already, or it is too old. Ask your union leader to send a new one." />;
  }
  if (!invite) return <Card title="Moving your account" text="…" button="Try again" busy={!error} error={error} onGo={() => window.location.reload()} />;
  return <Card title={`Welcome, ${invite.name}`} busy={busy} error={error} onGo={agree} button="OK"
    text={`${invite.leader_name || 'Your union leader'} is moving your Nila account${invite.union_name ? ` (${invite.union_name})` : ''} to this phone. Nila sends you SMS about your vouchers and farm plan. OK means you agree.`} />;
}
