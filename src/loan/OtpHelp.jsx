// Leader OTP (executive decision 24 Nov): instead of the member's help QR, Nila texts a 6-digit code to the member's
// number on record (the number the member's own phone confirmed); the member reads it out, the leader types it, signs,
// and the node adds the union's SMS key: nila-account start_session_by_sms opens the same 5-minute session as the QR.
// The node is needed for this path; the help QR stays the path without it.
import { useState } from 'react';
import DeskCard from '../shell/DeskCard';
import { C } from '../shell/tokens';
import { muted } from '../plan/ui';
import { useKeypadClient, useKeypadMembers } from '../keypad/hooks';
import { useNilaSigner } from '../wallet/signer';
import { setSession } from '../stellar/session';
import { useUnionInfo } from '../shell/SettingsParts';

const hex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
const b64 = (sig) => btoa(String.fromCharCode(...new Uint8Array(sig)));

/** The member's keypad row (her phone set up: her number confirmed), or null: then only the QR. */
export function useOtpMember(member) {
  const list = useKeypadMembers();
  return member ? (list.data || []).find((m) => m.account === member && m.device) || null : null;
}

export default function OtpHelp({ row, member, onBack, onStarted }) {
  const api = useKeypadClient();
  const leaderName = useUnionInfo()?.rep;
  const s = useNilaSigner();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const run = async (f) => { setBusy(true); setError(undefined); try { await f(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const send = () => run(async () => { await api.otpSend(row.id, leaderName); setSent(true); setCode(''); });
  const open = () => run(async () => {
    const { hash } = await api.otpCheck(row.id, code);
    await api.otpSign(row.id, b64(await s.signHash(hex(hash))));
    setSession(member, Math.floor(Date.now() / 1000) + 300);
    onStarted(member);
  });
  const last4 = String(row.phone || '').slice(-4);
  return (
    <DeskCard title="Code from the member" onBack={onBack}>
      {!sent ? (
        <>
          <p style={muted}>Nila sends a 6-digit code to the member's number ending {last4}. The member reads it out to you.</p>
          <button type="button" disabled={busy} onClick={send} style={btn}>{busy ? 'Sending…' : 'Send the code'}</button>
        </>
      ) : (
        <>
          <p style={muted}>Code sent to the number ending {last4}. It is valid for 5 minutes.</p>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} aria-label="Code"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={field} />
          <button type="button" disabled={busy || code.length !== 6} onClick={open} style={btn}>{busy ? 'One moment…' : 'Act for the member'}</button>
          <button type="button" disabled={busy} onClick={send} style={link}>Send a new code</button>
        </>
      )}
      {error && <p style={{ color: C.coral }}>{error}</p>}
    </DeskCard>
  );
}

const btn = { minHeight: 48, borderRadius: 9999, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontSize: 16, width: '100%' };
const link = { minHeight: 44, border: 0, background: 'none', color: C.muted, fontSize: 14, width: '100%', textDecoration: 'underline' };
const field = { minHeight: 48, borderRadius: 12, border: `1px solid ${C.raised}`, background: C.ink, color: C.text, fontSize: 24,
  letterSpacing: 8, textAlign: 'center', width: '100%', boxSizing: 'border-box' };
