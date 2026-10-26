// L14 — Add a member (board LeaderAddMember, #sent): the leader at her farm enters her name and number and her phone
// type, and Nila texts her the app link (oracle O17). A keypad phone gets a one-time link to Nila lite (/l/<code>,
// 30 minutes, one use, bound to her number; F9); a smartphone the app's address (she registers herself, R1–R14).
// #sent follows her progress: link sent, opened and agreed, phone set up (no PIN, executive decision 22 Oct). Then the
// leader takes the field points on the leader's own phone (26 Oct, executive decision: the keypad phone takes none;
// R5–R7's screen, tasks/member/<id>/points), which starts the border job; "Match field shapes" opens it (L2). DESIGN GAPs: the leader's own name is not on Stellar, so the
// link names the union's representative (R9's union list); the hooks' names are the design's proposal (Q53).
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { invokeContract, server } from '../stellar/soroban';
import { signerVal } from '../stellar/account';
import { Address, xdr } from '@stellar/stellar-sdk';
import { C, FONT, R } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { Card, CardButton, Row, Text } from '../shell/SettingsParts';
import { useUnionInfo } from '../shell/SettingsParts';
import { Notice, Primary } from '../plan/ui';
import { useInviteLink, useKeypadClient, useKeypadMember } from '../keypad/hooks';
import { PointsStep, clearPoints, readPoints } from '../border/SendLocation';
import { Loading } from '../register/Boot';
import PhoneField, { phoneOk, phoneValue } from '../register/PhoneField';

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

/** The keypad member's smart account (26 Oct): once the phone has its device key, the leader's app creates the account
 *  through the union's factory (anyone may; the node only pays the fee). True once it exists. */
function useKeypadAccount(m) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tried = useRef();
  const deployed = useQuery({
    queryKey: ['stellar', 'deployed', m?.account], enabled: !!cfg && !!m?.account, refetchInterval: (q) => (q.state.data ? false : 5_000),
    queryFn: async () => {
      const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(m.account).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
      return ((await server(cfg).getLedgerEntries(key)).entries || []).length > 0;
    },
  });
  useEffect(() => {
    if (!m?.device || !m?.signer || deployed.data !== false || tried.current === m.account || !s?.ready) return;
    tried.current = m.account;
    invokeContract({ cfg, source: s.senderAddress, signHash: s.signHash, contractName: 'account_factory', fn: 'create',
      args: [signerVal(Uint8Array.from(m.signer.match(/../g).map((x) => parseInt(x, 16))))] })
      .then(() => deployed.refetch()).catch((e) => { console.error('[L14] account not created', e); tried.current = undefined; });
  }, [m, deployed.data, s, cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  return !!deployed.data;
}

/** #sent: her progress, polled while the leader is with her. */
function Sent({ id, go }) {
  const q = useKeypadMember(id);
  const send = useInviteLink();
  const m = q.data;
  const accountMade = useKeypadAccount(m);
  if (!m) return <Text>{q.error ? q.error.message : '…'}</Text>;
  const l = m.link || {};
  const keypad = m.phone_type === 'keypad';
  return (
    <>
      <Card label="Progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 16, lineHeight: 1.3, marginBottom: 6 }}>
          <span style={{ fontWeight: 700 }}>{m.name}</span><span style={{ color: C.muted }}>{phoneText(m.phone)}</span>
        </div>
        {keypad ? (
          <>
            <Step done title="Link sent" sub={`${time(l.sent)} · works once, for 30 minutes`} />
            <Step done={!!m.consent} title="Opened, agreed to SMS and calls" sub={m.consent ? time(m.consent) : (l.live ? 'Waiting for the member' : 'The link no longer works: send it again')} />
            <Step done={!!m.device} title="Phone set up" sub={m.device ? time(m.device) : ''} />
            {m.account && <Step done={accountMade} title="Account made" sub={accountMade ? `${m.account.slice(0, 4)}…${m.account.slice(-4)}` : 'Making it…'} />}
            <Step done={!!m.job} title="Field points taken" sub={m.job ? `${(m.fields || []).length} field${(m.fields || []).length === 1 ? '' : 's'}` : 'On your phone, at the farm'} />
            <Notice kind="info">Pin Nila to the apps menu: on the member's phone, in the browser, Options → Pin to Apps Menu.</Notice>
          </>
        ) : (
          <>
            <Step done title="Link sent" sub={time(l.sent || m.added)} />
            <Step title="The member registers" sub="In the Nila app, with their own number" />
          </>
        )}
        {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
        {/* A keypad member's fields (26 Oct): the leader takes the points on the leader's phone, without waiting for
            the member to open the SMS link; once taken, the borders are checked (L2–L4). */}
        {keypad && !m.job && <CardButton onClick={() => go(`tasks/member/${m.id}/points`)}>Take field points</CardButton>}
        {keypad && m.job && <CardButton onClick={() => go(`tasks/border/${m.job}`)}>Check field borders</CardButton>}
        <CardButton onClick={send.isPending ? undefined : () => send.mutate({ again: m.id })}>Send the link again</CardButton>
      </Card>
    </>
  );
}

export default function AddMember({ id, go }) {
  const union = useUnionInfo();
  const send = useInviteLink();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [type, setType] = useState('keypad');
  const ok = name.trim() && phoneOk(phone);
  const submit = () => send.mutate({ name: name.trim(), phone: phoneValue(phone), phoneType: type, unionName: union.name, leaderName: union.rep },
    { onSuccess: (m) => go(`tasks/member/${m.id}`) });
  return (
    <MapCard style={{ padding: '0 8px 24px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: 'Add a member', onBack: () => go('tasks'), onSettings: () => go('settings') }}>
      {id ? <Sent id={id} go={go} /> : (
        <>
          <Card title="Member">
            <label style={label} htmlFor="l14-name">Name</label>
            <input id="l14-name" style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <label style={label} htmlFor="l14-phone">Phone number</label>
            <PhoneField id="l14-phone" value={phone} onChange={setPhone} />
            <Row k={<b style={{ color: C.text }}>Union</b>} v={union.name || '—'} />
          </Card>
          <Card title="The member's phone">
            <div role="radiogroup" aria-label="The member's phone" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Radio title="Smartphone" sub="Nila app. The member registers." on={type === 'smartphone'} onClick={() => setType('smartphone')} />
              <Radio title="Keypad phone" sub="Nila lite. The member opens a link from SMS." on={type === 'keypad'} onClick={() => setType('keypad')} />
            </div>
            <Notice kind="info">Do this at the farm. A smartphone member sends the location of each field from their phone; for a keypad phone you take them on your phone. No phone of their own? A family member's phone works. No phone, no account.</Notice>
            {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
            <Primary disabled={!ok || send.isPending} onClick={submit}>Send app link</Primary>
          </Card>
        </>
      )}
    </MapCard>
  );
}

/** tasks/member/<id>/points (26 Oct): the leader takes a keypad member's field points on the leader's phone, as R5–R7;
 *  sent together, they start the member's border job and the leader goes on to match the shapes (L2a). */
export function KeypadPoints({ id, go }) {
  const api = useKeypadClient();
  const m = useKeypadMember(id).data;
  const key = `keypad-${id}`;
  const send = useMutation({ mutationFn: () => api.points(id, readPoints(key).points.map(({ lat, lng, acc }) => ({ lat, lng, acc }))) });
  const done = () => send.mutate(undefined, { onSuccess: (r) => { clearPoints(key); go(`tasks/border/${r.job}`); } });
  if (send.isPending) return <Loading />;
  if (send.error) {
    return (
      <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}
        header={{ title: 'Field points', onBack: () => go(`tasks/member/${id}`) }}>
        <Text style={{ color: C.coral }}>{send.error.message}</Text>
        <Primary onClick={done}>Try again</Primary>
      </MapCard>
    );
  }
  return <PointsStep evm={key} forName={m?.name || 'the member'} onDone={done} onBack={() => go(`tasks/member/${id}`)} />;
}
