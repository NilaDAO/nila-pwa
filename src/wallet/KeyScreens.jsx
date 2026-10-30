// Key backup screens (executive decision 29 Oct, handoffs/Claude_Code_Prompt_Key_Backup_Deletion.md K1). Shown by
// wallet/PrivyRoot.jsx in place of the app while the Privy login needs the member's tap: a passkey (the phone's
// screen lock) must be started by a button. DESIGN GAP: no board for these screens yet; they use the R1–R4 frame.
import RegFrame, { btnDisabled, btnPrimary, btnSecondary, cardTitle, sheetText } from '../register/RegFrame';

const errText = { margin: 0, textAlign: 'center', color: '#F87171', fontSize: 14 };

function Card({ title, text, button, busy, error, onGo, extra }) {
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
export function PasskeyLogin({ mode, busy, error, noPasskey, onGo, onLost, confirming, onConfirmLost, onBack }) {
  if (confirming) {
    return <Card title="Is your old phone lost?" busy={busy} error={error} onGo={onConfirmLost} button="Yes, make new keys"
      text="This phone gets new keys. Two leaders of your union then move your account to them; until then your account is frozen and your old phone stops working."
      extra={<button type="button" style={busy ? btnDisabled : btnSecondary} disabled={busy} onClick={onBack}>Back</button>} />;
  }
  if (mode === 'signup') {
    return <Card title="Protect your wallet" busy={busy} error={error} onGo={onGo} button="Continue"
      text="Your wallet opens with your phone's screen lock: fingerprint, face or PIN." />;
  }
  return (
    <Card title="Open your wallet" busy={busy} onGo={onGo} button="Unlock"
      error={noPasskey ? 'This phone cannot open your wallet.' : error}
      text="Use your phone's screen lock: fingerprint, face or PIN."
      extra={noPasskey && (
        <button type="button" style={busy ? btnDisabled : btnSecondary} disabled={busy} onClick={onLost}>
          My old phone is lost
        </button>
      )} />
  );
}

/** The one-time migration (an existing member): link a passkey, then Privy takes the Polygon key. */
export function KeyMigration({ busy, error, onGo }) {
  return <Card title="Protect your wallet" busy={busy} error={error} onGo={onGo} button="Continue"
    text="From now on your wallet opens with your phone's screen lock: fingerprint, face or PIN. Nila then deletes its copy of your key." />;
}
