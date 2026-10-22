// L14 — Add a member (board LeaderAddMember, #sent): the leader at her farm enters her name and number and her phone
// type, and Nila texts her the app link (oracle O17). A keypad phone gets a one-time link to Nila lite (/l/<code>,
// 30 minutes, one use, bound to her number; F9); a smartphone the app's address (she registers herself, R1–R14).
// #sent follows her progress: link sent, opened and agreed, PIN made, then her fields (F14, not built yet: "Match
// field shapes" stays disabled until her fields come in). DESIGN GAPs: the leader's own name is not on Stellar, so the
// link names the union's representative (R9's union list); the hooks' names are the design's proposal (Q53).
import { useState } from 'react';
import { C, FONT, R } from '../shell/tokens';
import { ScreenHeader } from '../shell/ListRow';
import { Card, CardButton, Row, Text } from '../shell/SettingsParts';
import { useUnionInfo } from '../shell/SettingsParts';
import { Notice, Primary } from '../plan/ui';
import { useInviteLink, useKeypadMember } from '../keypad/hooks';

const field = { height: 48, borderRadius: R.button, border: 0, background: C.raised, color: C.text, padding: '0 16px', boxSizing: 'border-box',
  width: '100%', fontFamily: FONT, fontSize: 14, fontWeight: 700, outline: 'none' };
const label = { fontSize: 14, lineHeight: 1.5, color: C.muted, marginTop: 4 };
const time = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const phoneText = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p; };

function Radio({ title, sub, on, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={on ? 'true' : 'false'} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      textAlign: 'left', background: C.raised, border: `2px solid ${on ? C.accent : 'transparent'}`, borderRadius: R.button, padding: '12px 16px',
      color: C.text, fontFamily: FONT, fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 700 }}>{title}</span><span style={{ color: C.muted }}>{sub}</span>
      </span>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: R.round, border: `2px solid ${on ? C.accent : C.muted}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {on && <span style={{ width: 10, height: 10, borderRadius: R.round, background: C.accent }} />}
      </span>
    </button>
  );
}

function Step({ done, title, sub }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, padding: '4px 0' }}>
      <span aria-hidden="true" style={{ width: 18, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
        {done
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          : <span style={{ width: 10, height: 10, marginTop: 4, borderRadius: R.round, border: `2px solid ${C.muted}` }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', color: done ? C.text : C.muted }}>
        <span style={{ fontWeight: 700 }}>{title}</span>{sub && <span style={{ color: C.muted }}>{sub}</span>}
      </span>
    </div>
  );
}

/** #sent: her progress, polled while the leader is with her. */
function Sent({ id, go }) {
  const q = useKeypadMember(id);
  const send = useInviteLink();
  const m = q.data;
  if (!m) return <Text>{q.error ? q.error.message : '…'}</Text>;
  const l = m.link || {};
  const keypad = m.phone_type === 'keypad';
  return (
    <>
      <Card label="Her progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 16, lineHeight: 1.3, marginBottom: 6 }}>
          <span style={{ fontWeight: 700 }}>{m.name}</span><span style={{ color: C.muted }}>{phoneText(m.phone)}</span>
        </div>
        {keypad ? (
          <>
            <Step done title="Link sent" sub={`${time(l.sent)} · works once, for 30 minutes`} />
            <Step done={!!m.consent} title="Opened, agreed to SMS and calls" sub={m.consent ? time(m.consent) : (l.live ? 'Waiting for her' : 'The link no longer works: send it again')} />
            <Step done={!!m.pin} title="PIN made" sub={time(m.pin)} />
            <Step title="Field 1" sub="Walk with her to her first field" />
            <Notice kind="info">Pin Nila to her apps menu: on her phone, in the browser, Options → Pin to Apps Menu.</Notice>
          </>
        ) : (
          <>
            <Step done title="Link sent" sub={time(l.sent || m.added)} />
            <Step title="She registers herself" sub="In the Nila app, with her own number" />
          </>
        )}
        {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
        <CardButton onClick={send.isPending ? undefined : () => send.mutate({ again: m.id })}>Send the link again</CardButton>
      </Card>
      {keypad && (
        <Card title="Fields">
          <Notice kind="info">When she has sent every field, match the shapes. The land title cannot change later.</Notice>
          <Primary disabled onClick={() => go('tasks')}>Match field shapes</Primary>
        </Card>
      )}
    </>
  );
}

export default function AddMember({ id, go }) {
  const union = useUnionInfo();
  const send = useInviteLink();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('keypad');
  const digits = phone.replace(/\D/g, '');
  const ok = name.trim() && (digits.length === 10 || (digits.length === 12 && digits.startsWith('91')));
  const submit = () => send.mutate({ name: name.trim(), phone, phoneType: type, unionName: union.name, leaderName: union.rep },
    { onSuccess: (m) => go(`tasks/member/${m.id}`) });
  return (
    <div style={{ padding: '0 8px 24px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ScreenHeader title="Add a member" onBack={() => go('tasks')} onSettings={() => go('settings')} />
      {id ? <Sent id={id} go={go} /> : (
        <>
          <Card title="Member">
            <label style={label} htmlFor="l14-name">Name</label>
            <input id="l14-name" style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <label style={label} htmlFor="l14-phone">Phone number</label>
            <input id="l14-phone" style={field} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91" autoComplete="off" />
            <Row k={<b style={{ color: C.text }}>Union</b>} v={union.name || '—'} />
          </Card>
          <Card title="Her phone">
            <div role="radiogroup" aria-label="Her phone" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Radio title="Smartphone" sub="Nila app. She registers herself." on={type === 'smartphone'} onClick={() => setType('smartphone')} />
              <Radio title="Keypad phone" sub="Nila lite. She opens a link from SMS." on={type === 'keypad'} onClick={() => setType('keypad')} />
            </div>
            <Notice kind="info">Do this at her farm. She sends the location of each field from her phone. No phone of her own? She uses a family member's phone. No phone, no account.</Notice>
            {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
            <Primary disabled={!ok || send.isPending} onClick={submit}>Send app link</Primary>
          </Card>
        </>
      )}
    </div>
  );
}
