// Plan 053: the first open of a phone with no key and no login. "I am a member" makes her key on this phone (no
// Privy, no Cognito) and opens her help QR; the leader's Join the union makes her account from it. "Leader / I use
// Nila myself" goes on to today's login (Start.jsx R1–R4), unchanged.
// DESIGN GAP: no board for this screen; texts in wallet/phoneKeyTexts.js (for approval).
import { useState } from 'react';
import RegFrame, { btnPrimary, btnSecondary, btnDisabled, sheetText } from './RegFrame';
import { loadOrMakeKey, markPhoneKeyPhone } from '../wallet/phoneKey';
import { PHONE_KEY_TEXTS as T } from '../wallet/phoneKeyTexts';

const line = { ...sheetText, margin: '-6px 0 4px', textAlign: 'center' };

export default function FirstOpen({ onLogin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const member = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      await loadOrMakeKey();
      markPhoneKeyPhone();
      // Opens on her help QR (#/wallet is the help QR in assist mode) with the phone-key signer.
      window.location.hash = '#/wallet';
      window.location.reload();
    } catch (e) {
      console.error('[phonekey] key not made', e);
      setError(T.noKey); setBusy(false);
    }
  };
  return (
    <RegFrame drop zoom>
      <button type="button" style={busy ? btnDisabled : btnPrimary} disabled={busy} onClick={member}>
        {busy ? T.making : T.memberButton}</button>
      <p style={line}>{T.memberLine}</p>
      <button type="button" style={btnSecondary} disabled={busy} onClick={onLogin}>{T.leaderButton}</button>
      <p style={line}>{T.leaderLine}</p>
      {error && <p role="alert" style={{ ...line, color: '#F87171' }}>{error}</p>}
    </RegFrame>
  );
}
