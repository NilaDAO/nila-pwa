// Key backup screens (executive decision 29 Oct, handoffs/Claude_Code_Prompt_Key_Backup_Deletion.md K1). Shown by
// wallet/PrivyRoot.jsx in place of the app while the Privy login needs the member's tap: a passkey (the phone's
// screen lock) must be started by a button. DESIGN GAP: no board for these screens yet; they use the R1–R4 frame.
import RegFrame, { btnDisabled, btnPrimary, cardTitle, sheetText } from '../register/RegFrame';

const errText = { margin: 0, textAlign: 'center', color: '#F87171', fontSize: 14 };

export function Card({ title, text, button, busy, error, onGo, extra }) {
  return (
    <RegFrame info="Nila keeps no copy of your keys. Your wallet opens with your phone's screen lock.">
      <h2 style={cardTitle}>{title}</h2>
      <p style={{ ...sheetText, margin: 0, textAlign: 'center' }}>{text}</p>
      {error && <p style={errText}>{error}</p>}
      <button type="button" style={busy ? btnDisabled : btnPrimary} disabled={busy} onClick={onGo}>
        {busy ? 'One moment…' : button}
      </button>
      {extra}
    </RegFrame>
  );
}

/** A member whose key Cognito no longer keeps: log in to Privy with the passkey (login), or make one (signup). */
export function PasskeyLogin({ mode, busy, error, noPasskey, onGo }) {
  if (mode === 'signup') {
    return <Card title="Protect your wallet" busy={busy} error={error} onGo={onGo} button="Continue"
      text="Your wallet opens with your phone's screen lock: fingerprint, face or PIN." />;
  }
  // One recovery path (4 Nov): no new keys on this phone. The leader recovers her account to another number on G2.
  return (
    <Card title="Open your wallet" busy={busy} onGo={onGo} button="Unlock"
      error={noPasskey ? 'This phone cannot open your wallet. Ask your union leader to recover your account on another number.' : error}
      text="Use your phone's screen lock: fingerprint, face or PIN." />
  );
}

/** The one-time migration (an existing member): link a passkey, then Privy takes the Polygon key. */
export function KeyMigration({ busy, error, onGo }) {
  return <Card title="Protect your wallet" busy={busy} error={error} onGo={onGo} button="Continue"
    text="From now on your wallet opens with your phone's screen lock: fingerprint, face or PIN. Nila then deletes its copy of your key." />;
}
