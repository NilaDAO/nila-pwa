// R1–R4 — create or recover a wallet (boards RegWallet-ss0b, RegPhone-a6bc, RegCode-nflo, RegCodeKeyboard; notes
// reg-recover, reg-r4). Replaces features/registration/registerRecover.js in the new app (Privy builds); the same
// Cognito calls (utils/cognito_helpers) and the same local data as today, so the Lambdas need no change.
// After the code: a new wallet goes on to registration (R5–R14, src/register/Registration.jsx); a recovered one to
// the app (StellarGate: a Polygon wallet sees the move M1 first).
// R4 is the phone's own number keyboard with the code suggested above it: one numeric input with
// autocomplete="one-time-code" behind the six boxes.
// Every new wallet is created on Stellar (notes move-spec "NEW REGISTRATIONS"); a chain from the invite link is ignored.
// SMS only (executive decision, 20 Oct; LOAN_RULES §5 "Login and Privy": no WhatsApp with Privy): R2 has one button,
// 'Send code via SMS', and no WhatsApp line; R3 and R4 say SMS (the boards' #sms state).
import { useEffect, useRef, useState } from 'react';
import PhoneField, { phoneOk, phoneValue } from './PhoneField';
import { createItem } from '../utils/db';
import { signUp, initAuth, respondToAuthChallenge, getUserAttributes } from '../utils/cognito_helpers';
import { announceAuthChange } from '../wallet/session';
import { DEMO_COGNITO } from '../utils/demoMode';
import RegFrame, { Bouncing, btnDisabled, btnPrimary, btnSecondary, cardTitle } from './RegFrame';

const NEW_CHAIN = 'stellar';
// Demo stack only (utils/demoMode.js): R2 sends nothing; R3 takes the dummy code 000000, and only then the
// wallet is made (the demo's Cognito stand-in, never AWS). Unset in every real build.
const DEMO = DEMO_COGNITO;                               // utils/demoMode.js: never in a real build
const DEMO_CODE = '000000';
const BOX = { width: 44, height: 44, borderRadius: 12, background: '#1F2733', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 16, fontWeight: 700 };

const errName = (e) => e?.name || e?.__type || '';

/** Store what today's flow stores (registerRecover.js handleStoreLocalData). */
async function storeLocal({ phone, salt, attrs, refresh, access }) {
  const get = (n) => attrs.find((a) => a.Name === n)?.Value;
  await createItem({ id: 'phone', value: phone }, 'Init');
  await createItem({ id: 'union', value: undefined }, 'Init');
  await createItem({ id: 'salt', value: salt }, 'Init');
  await createItem({ id: 'refresh_token', value: refresh }, 'Init');
  await createItem({ id: 'jwt_token', value: access }, 'Init');
  for (const id of ['withdrawal', 'refin', 'backup', 'farmname']) await createItem({ id, value: undefined }, 'Init');
  await createItem({ id: 'thumb', value: undefined }, 'FarmData');
  await createItem({ id: 'invest', value: undefined }, 'FarmData');
  await createItem({ id: 'chain', value: get('custom:chain') }, 'Init');
  await createItem({ id: 'address', value: get('custom:address') }, 'Init');
  // Demo only (DEMO_COGNITO: flag + chain 31337 + localhost): the stand-in marks a pooled wallet handed to a new
  // number as new, so the new-user path (R5) runs without making a Privy user (AfterCode reads it).
  if (DEMO_COGNITO) {
    const a = String(get('custom:address')).toLowerCase();
    const fresh = get('custom:demo_new') === '1';
    try {
      sessionStorage.setItem(`nila.demoNew.${a}`, fresh ? '1' : '0');
      // A demo wallet handed out fresh starts registration from R5: drop what an earlier run left on this phone.
      if (fresh) { localStorage.removeItem(`nila.reg.${a}`); localStorage.removeItem(`nila.border.points.${a}`); localStorage.removeItem(`nila.privyNew.${a}`); }
    } catch { /* not kept */ }
  }
}

/** R1: create a new wallet or recover one. */
function Wallet({ onPick }) {
  return (
    <RegFrame drop zoom info="This is free of charge. In your wallet you hold your land title, vouchers and other tokens.">
      <button type="button" style={btnPrimary} onClick={() => onPick('create')}>Create a new digital wallet</button>
      <button type="button" style={btnSecondary} onClick={() => onPick('recover')}>Recover wallet</button>
    </RegFrame>
  );
}

/** R2: her phone number. Today's input, with +91 already in it; it can be deleted to give another country code. */
function Phone({ busy, error, onSend }) {
  const [phone, setPhone] = useState('+91');         // shown from the start; backspace changes it
  // Demo only: the dummy numbers 0000000000 (leader), 1111111111 (new member), 2222222222 (member with a title) and
  // 3333333333 (keypad member, L14).
  const ok = phoneOk(phone);
  return (
    <RegFrame info="We send a 6-digit code to this number.">
      <h1 style={cardTitle}>Your phone number</h1>
      <PhoneField value={phone} onChange={setPhone} />
      {error && <p role="alert" style={{ margin: 0, color: '#E69283', fontSize: 14 }}>{error}</p>}
      <button type="button" style={ok && !busy ? btnPrimary : btnDisabled} disabled={!ok || busy} onClick={() => onSend(phoneValue(phone))}>Send code via SMS</button>
    </RegFrame>
  );
}

function Sending({ title }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...cardTitle, padding: '8px 0 0 0' }}>{title}</div>
      <Bouncing />
    </div>
  );
}

/** R3 / R4: the 6-digit code; resend waits 30 s; offline says so. */
function Code({ verifying, error, onVerify, onResend, sent }) {
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(0);
  const [phase, setPhase] = useState('idle');           // idle | sending | offline
  const input = useRef(null);
  const sms = true;                                      // SMS only (see the note at the top)
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);
  const resend = async () => {
    if (!navigator.onLine) { setPhase('offline'); return; }
    setPhase('sending');
    const t0 = Date.now();
    try { await onResend(); } catch { /* shown by the parent */ }
    await new Promise((r) => setTimeout(r, Math.max(0, 3000 - (Date.now() - t0))));
    setPhase('idle'); setLeft(30); setCode('');
  };
  const full = code.length === 6;
  const title = sent ? (sms ? 'We sent you a new code by SMS.' : 'We sent you a new code.') : (sms ? 'Enter the code we sent by SMS.' : 'Enter the code we sent to you.');
  return (
    <RegFrame info="Open your SMS messages for a 6-digit code.">
      {phase === 'sending' && <Sending title="Resending the code" />}
      {phase === 'offline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardTitle}>No internet on this phone</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>Nila needs mobile data or Wi-Fi to send the code. Turn on mobile data and try again.</p>
          <button type="button" style={btnPrimary} onClick={resend}>Try again</button>
        </div>
      )}
      {phase === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardTitle}>{title}</div>
          <div style={{ position: 'relative' }} onClick={() => input.current?.focus()}>
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ ...BOX, outline: i === code.length ? '2px solid #D4CF5A' : 'none' }}>{code[i] || ''}</span>)}
            </div>
            <input ref={input} autoFocus aria-label="Enter the code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 0 }} />
          </div>
          {error && <p role="alert" style={{ margin: 0, color: '#E69283', fontSize: 14, textAlign: 'center' }}>{error}</p>}
          <button type="button" style={full && !verifying ? btnPrimary : btnDisabled} disabled={!full || verifying} onClick={() => onVerify(code)}>Verify your code</button>
          {left <= 0
            ? <button type="button" style={btnSecondary} onClick={resend}>Sorry, I didn't receive anything</button>
            : <button type="button" style={btnDisabled} disabled>{`Send again in 0:${String(left).padStart(2, '0')}`}</button>}
        </div>
      )}
    </RegFrame>
  );
}

/** onDone({ isNew }): the wallet is on this phone. */
export default function Start({ onDone }) {
  const [step, setStep] = useState('wallet');            // wallet | phone | code
  const [kind, setKind] = useState('create');
  const [phone, setPhone] = useState('+91');         // shown from the start; backspace changes it
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [isNew, setIsNew] = useState(true);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const salt = useRef(Math.random().toString(36).substring(2, 15));

  // New or recovered is decided once, at the first send for this number: a resend signs up again and gets
  // UsernameExists for the user that first send made, which must not turn a new wallet into a recovery.
  const decided = useRef(null);                          // { phone, isNew }
  const decide = (p, v) => { if (!decided.current || decided.current.phone !== p) { decided.current = { phone: p, isNew: v }; setIsNew(v); } };

  // As registerRecover.js: create falls back to recover when the number exists, recover to create when it does not.
  const begin = async (p, k) => {
    if (k === 'create') {
      try { await signUp(p, NEW_CHAIN); decide(p, true); } catch (e) {
        if (errName(e) !== 'UsernameExistsException') throw e;
        decide(p, false);
      }
    }
    let ses = await initAuth(p);
    if (!ses && k === 'recover') {                       // initAuth swallows UserNotFound: sign up instead
      await signUp(p, NEW_CHAIN); decide(p, true);
      ses = await initAuth(p);
    } else if (k === 'recover') decide(p, false);
    if (!ses?.Session) throw new Error('The code could not be sent. Try again.');
    setSession(ses.Session);
    sessionRef.current = ses.Session;
  };

  const beginDemo = async (p, k) => { await begin(p, k); return sessionRef.current; };

  const send = async (p) => {
    if (DEMO) { setPhone(p); setError(null); setSent(false); setStep('code'); return; }   // demo: no SMS is sent
    if (!navigator.onLine) { setError('No internet on this phone. Turn on mobile data and try again.'); return; }
    setBusy(true); setError(null);
    try {
      setPhone(p);
      await begin(p, kind);
      setSent(false); setStep('code');
    } catch (e) { setError(e?.message || 'The code could not be sent. Try again.'); }
    setBusy(false);
  };

  const verify = async (code) => {
    setBusy(true); setError(null);
    try {
      let ses = session;
      if (DEMO) {                                        // demo: the dummy code, then the stand-in makes the wallet
        if (code !== DEMO_CODE) throw Object.assign(new Error('wrong code'), { name: 'CodeMismatchException' });
        ses = await beginDemo(phone, kind);
      }
      const r = await respondToAuthChallenge(phone, code, ses, salt.current);
      await new Promise((res) => setTimeout(res, 1500));  // as today: the Lambda writes the wallet first
      const access = r.AuthenticationResult.AccessToken;
      const attrs = (await getUserAttributes(access)).UserAttributes;
      await storeLocal({ phone, salt: salt.current, attrs, refresh: r.AuthenticationResult.RefreshToken, access });
      announceAuthChange();
      onDone({ isNew: decided.current ? decided.current.isNew : isNew,
        address: attrs.find((x) => x.Name === 'custom:address')?.Value });
    } catch (e) {
      setError(errName(e) === 'NotAuthorizedException' || errName(e) === 'CodeMismatchException'
        ? 'This code is not right. Check the message and try again.' : (e?.message || 'Something went wrong. Try again.'));
      setBusy(false);
    }
  };

  if (step === 'wallet') return <Wallet onPick={(k) => { setKind(k); setStep('phone'); }} />;
  if (step === 'phone') return <Phone busy={busy} error={error} onSend={send} />;
  // No back arrow on R3 (executive decision, 20 Oct).
  return <Code sent={sent} verifying={busy} error={error}
    onVerify={verify} onResend={async () => { if (!DEMO) await begin(phone, kind); setSent(true); }} />;
}
