// L14 — Add a member (board LeaderAddMember, #sent): the leader at her farm enters her name and number, and Nila texts
// her one SMS with the app link and a code (plan 054: no phone type to pick; JoinCard below: her QR or the code).
// Before plan 054 the leader picked her phone type and Nila texted her the app link (oracle O17). A keypad phone gets a one-time link to Nila lite (/l/<code>,
// 30 minutes, one use, bound to her number; F9); a smartphone the app's address (she registers herself, R1–R14).
// #sent follows her progress: link sent, opened and agreed, phone set up (no PIN, executive decision 22 Oct). Then the
// leader takes the field points on the leader's own phone (26 Oct, executive decision: the keypad phone takes none;
// R5–R7's screen, tasks/member/<id>/points), which starts the border job; "Match field shapes" opens it (L2).
// A smartphone member (sign later, plan 050, 15 Nov; was 29 Oct: her help QR first): name and number as for a keypad
// phone, the app link by SMS, then the field points on the leader's phone (tasks/member/qr/points); the node mints her
// title to a holding address, and her account joins at a later scan of her QR on G2. DESIGN GAPs: the leader's own name is not on Stellar, so the
// link names the union's representative (R9's union list); the hooks' names are the design's proposal (Q53).
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { ensureKeypadAccount, ensureMemberAccount, readAccountUnion, useStellarConfig } from '../stellar/hooks';
import { isDeployed } from '../stellar/soroban';
import { C, FONT, R } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import { Card, CardButton, Row, Text } from '../shell/SettingsParts';
import { useUnionInfo } from '../shell/SettingsParts';
import { Notice, Primary } from '../plan/ui';
import { useInviteLink, useKeypadClient, useKeypadMember } from '../keypad/hooks';
import { useBorderClient, useSendFieldPoints } from '../border/hooks';
import { PointsStep, clearPoints, readPoints } from '../border/SendLocation';
import { addLocalMember, addressFromQr } from './unionMembers';
import { Loading } from '../register/Boot';
import PhoneField, { phoneOk, phoneValue } from '../register/PhoneField';
import { useBookActions } from '../union/hooks';
import { memberOfQr, oneTimeJoin } from '../stellar/session';
import CameraView from '../shell/CameraView';
import { NoteBar } from '../loan/AssetParts';
import StartHelp from '../loan/StartHelp';
import { JOIN_TEXTS as T } from './joinTexts';

const field = { height: 48, borderRadius: R.button, border: 0, background: C.raised, color: C.text, padding: '0 16px', boxSizing: 'border-box',
  width: '100%', fontFamily: FONT, fontSize: 14, fontWeight: 700, outline: 'none' };
const label = { fontSize: 14, lineHeight: 1.5, color: C.muted, marginTop: 4 };
const time = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const phoneText = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p; };

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
 *  through the account deployer (anyone may; the node only pays the fee) and submits the member's own signed
 *  `set_union` that the phone sent at F9 (member-owned accounts, 3 Nov). { made, union }: made once it exists, union
 *  once it names its union (needed for the help QR session and recovery). */
function useKeypadAccount(m) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tried = useRef();
  const state = useQuery({
    queryKey: ['stellar', 'keypad-account', m?.account], enabled: !!cfg && !!m?.account,
    refetchInterval: (q) => (q.state.data?.union ? false : 5_000),
    queryFn: async () => {
      const made = await isDeployed(cfg, m.account);
      return { made, union: made ? await readAccountUnion(cfg, m.account).catch(() => null) : null };
    },
  });
  const d = state.data;
  // Again when the phone's set_union signature arrives after the account was made.
  const key = `${m?.account}|${d?.made}|${!!m?.set_union?.sig}`;
  useEffect(() => {
    if (!m?.device || !m?.signer || !d || d.union || tried.current === key || !s?.ready) return;
    if (d.made && !m.set_union?.sig) return;          // nothing to send yet: waits for the phone's signature
    tried.current = key;
    ensureKeypadAccount(cfg, s, m).then(() => state.refetch())
      .catch((e) => { console.error('[L14] account not made or union not set', e); tried.current = undefined; });
  }, [m, d, s, cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  return { made: !!d?.made, union: d?.union || null };
}

/** #sent: her progress, polled while the leader is with her. */
function Sent({ id, go }) {
  const q = useKeypadMember(id);
  const send = useInviteLink();
  const m = q.data;
  useKeypadAccount(m);   // a keypad phone's account is made as soon as the phone sent its key
  // Plan 054: the code was checked but the account not made (a failed try): the SMS-only screen makes it.
  const smsLeft = m?.phone_type === 'sms' && !m.account;
  useEffect(() => { if (smsLeft) go(`tasks/member/${id}/sms`); }, [smsLeft, id, go]);
  if (!m) return <Text>{q.error ? q.error.message : '…'}</Text>;
  const l = m.link || {};
  const keypad = m.phone_type === 'keypad';
  // 26 Nov (simplified): name and number, when the SMS went (Send again), Join (QR or code) until joined, then the
  // field points. The keypad's own steps (opened, set up) are left out; the account is still made by useKeypadAccount.
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 16, lineHeight: 1.3 }}>
        <span style={{ fontWeight: 700 }}>{m.name}</span><span style={{ color: C.muted }}>{phoneText(m.phone)}</span>
      </div>
      <Text>{T.sent} {time(l.sent || m.added)} · <button type="button" onClick={send.isPending ? undefined : () => send.mutate({ again: m.id })}
        style={{ background: 'none', border: 0, padding: 0, color: C.text, textDecoration: 'underline', font: 'inherit', cursor: 'pointer' }}>{T.again}</button></Text>
      {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
      {m.account ? <Text style={{ fontWeight: 700 }}>{T.joined}</Text> : <JoinCard m={m} go={go} />}
      {/* 26 Nov: no field points here while joining; after the join this screen goes on to the points. */}
      {m.account && keypad && !m.job && !m.held && <CardButton onClick={() => go(`tasks/member/${m.id}/points`)}>Take field points</CardButton>}
      {m.account && keypad && m.job && <CardButton onClick={() => go(`tasks/border/${m.job}`)}>Check field borders</CardButton>}
    </Card>
  );
}

export default function AddMember({ id, go }) {
  const union = useUnionInfo();
  const send = useInviteLink();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const ok = name.trim() && phoneOk(phone);
  const qc = useQueryClient();
  // 26 Nov: a member who shows a QR (a self-mode sign-up, or a smartphone member) is added from it, as from the
  // Members scan: the QR says which kind it is.
  const [scan, setScan] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const onQr = (text) => {
    const n = memberOfQr(text);
    if (n) { scannedNewMember(n); go('tasks/member/qr'); return; }
    // 26 Nov: a joined member's plain account (a self-mode member after the join, no title yet) who is not in the list:
    // the same name, number and field points, for her account.
    const g = addressFromQr(text);
    const known = g && (qc.getQueriesData({ queryKey: ['stellar', 'unionMembers'] })
      .some(([, list]) => Array.isArray(list) && list.some((x) => x.address === g && (x.lands?.length || x.job))));
    if (g && /^C/.test(g) && !known) { scannedNewMember({ account: g, polygon: '', join: null }); go('tasks/member/qr'); return; }
    setScan(false);
    setScanMsg(g ? T.qrKnown : T.qrOther);
  };
  // Plan 054: no phone type to pick. The node sends one SMS (link and code); the progress screen offers the QR scan or
  // the code, and the field points (before or after the join: sign later, plan 050).
  const submit = () => send.mutate({ name: name.trim(), phone: phoneValue(phone), unionName: union.name, leaderName: union.rep },
    { onSuccess: (m) => go(`tasks/member/${m.id}`) });
  // 26 Nov: the camera on its own screen, as every other scan; Cancel (or back) returns to the form.
  if (scan && !id) {
    return (
      <MapCard style={{ padding: '0 8px 24px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}
        header={{ title: T.scanQr, onBack: () => setScan(false), onSettings: () => go('settings') }}>
        <CameraView mode="qr" onText={onQr} />
        <CardButton onClick={() => setScan(false)}>{T.cancel}</CardButton>
      </MapCard>
    );
  }
  return (
    <MapCard style={{ padding: '0 8px 24px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: 'Add a member', onBack: () => go('tasks'), onSettings: () => go('settings') }}>
      {id === 'qr' ? <NewSmartphone go={go} /> : id ? <Sent id={id} go={go} /> : (
        <>
          <Card title="Member">
            <label style={label} htmlFor="l14-name">Name</label>
            <input id="l14-name" style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <label style={label} htmlFor="l14-phone">Phone number</label>
            <PhoneField id="l14-phone" value={phone} onChange={setPhone} />
            <Row k={<b style={{ color: C.text }}>Union</b>} v={union.name || '—'} />
            {send.error && <Text style={{ color: C.coral }}>{send.error.message}</Text>}
            <Primary disabled={!ok || send.isPending} onClick={submit}>{T.send}</Primary>
            <CardButton onClick={() => { setScan(true); setScanMsg(''); }}>{T.scanQr}</CardButton>
            {scanMsg && <Text style={{ color: C.coral }}>{scanMsg}</Text>}
          </Card>
          {/* 25 Nov: the farm note in the info bar above the tab bar, not in the card. */}
          <div aria-hidden="true" style={{ height: 96 }} />
          <NoteBar>Do this at the farm, to take the field points. A family member's phone works too.</NoteBar>
        </>
      )}
    </MapCard>
  );
}

/** Plan 054: after the one SMS. A smartphone opened the link and shows its QR (tasks/member/<id>/scan), or the member
 *  reads out the code: this app then makes the account with a one-time key and joins it, as for an SMS-only member.
 *  Either way the node gives the account the titles held for the member (sign later). */
function JoinCard({ m, go }) {
  const api = useKeypadClient();
  const qc = useQueryClient();
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const [open, setOpen] = useState(false);   // 26 Nov: two buttons first; the code entry only after "No phone with internet"
  const join = async () => {
    setBusy(true); setError(undefined);
    try {
      await api.smsConfirm(m.id, code);
      const j = await oneTimeJoin(cfg);
      await ensureKeypadAccount(cfg, s, j);
      await api.smsAccount(m.id, j.account);
      addLocalMember(qc, { ...m, account: j.account });   // 26 Nov: joined, in this phone's list at once
      go(m.held || m.job ? 'members' : `tasks/member/${m.id}/points`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, paddingTop: 8 }}>{T.title}</div>
      {!open ? (
        <>
          <CardButton onClick={() => go(`tasks/member/${m.id}/scan`)}>{T.scanQr}</CardButton>
          <CardButton onClick={() => setOpen(true)}>{T.noInternet}</CardButton>
        </>
      ) : (
        <>
          <label style={label} htmlFor="l14-code">{T.code}</label>
          <input id="l14-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...field, fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
          <Primary disabled={busy || code.length !== 6 || !cfg} onClick={join}>{busy ? 'One moment…' : T.check}</Primary>
          <CardButton onClick={busy ? undefined : () => { setOpen(false); setCode(''); setError(undefined); }}>{T.cancel}</CardButton>
          <NoteBar>{T.codeNote}</NoteBar>
        </>
      )}
      {error && <Text style={{ color: C.coral }}>{error}</Text>}
    </>
  );
}

/** tasks/member/<id>/scan (plan 054): the existing scan of a help QR (kind 4 from a phone key, kind 5 from a Privy
 *  key): this app makes and joins the account, then the node gives it the titles held for the member. */
export function JoinScan({ id, go }) {
  const api = useKeypadClient();
  const qc = useQueryClient();
  const m = useKeypadMember(id).data;
  // 26 Nov: Cancel under the scanner goes back to the two buttons.
  return (
    <>
      <StartHelp label={m?.name} title={T.title} qrOnly onBack={() => go(`tasks/member/${id}`)}
        onPair={(account) => api.smsAccount(id, account).then((r) => { addLocalMember(qc, { ...m, account }); return r; })}
        onStarted={() => go(m?.held || m?.job ? 'members' : `tasks/member/${id}/points`)} />
      <div style={{ padding: '0 8px' }}><CardButton onClick={() => go(`tasks/member/${id}`)}>{T.cancel}</CardButton></div>
    </>
  );
}

/** tasks/member/<id>/sms (SMS-only member, executive decision 25 Nov, option A): the code the member reads out checks
 *  the number; then this app makes the member's account with a one-time key, joins it to the union and forgets the
 *  key; the node keeps the account on the member's row; then the field points. */
export function SmsMember({ id, go }) {
  const api = useKeypadClient();
  const qc = useQueryClient();
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const union = useUnionInfo();
  const m = useKeypadMember(id).data;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const run = async (f) => { setBusy(true); setError(undefined); try { await f(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const makeAccount = async () => {
    const j = await oneTimeJoin(cfg);
    await ensureKeypadAccount(cfg, s, j);
    await api.smsAccount(id, j.account);
    addLocalMember(qc, { ...m, account: j.account });
    go(m.held || m.job ? 'members' : `tasks/member/${id}/points`);   // plan 054: a member with a title needs no points
  };
  const confirm = () => run(async () => { await api.smsConfirm(id, code); await makeAccount(); });
  if (!m) return <Loading />;
  const last4 = String(m.phone || '').slice(-4);
  return (
    <MapCard style={{ padding: '0 8px 24px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: 'Add a member', onBack: () => go('tasks') }}>
      <Card title="Code from the member">
        {m.device ? (
          <>
            <Text>The number is checked. Make the member's account to go on.</Text>
            <Primary disabled={busy || !cfg} onClick={() => run(makeAccount)}>{busy ? 'One moment…' : "Make the member's account"}</Primary>
          </>
        ) : (
          <>
            <Text>Nila sent a 6-digit code to the number ending {last4}.</Text>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} aria-label="Code"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...field, fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
            <Primary disabled={busy || code.length !== 6 || !cfg} onClick={confirm}>{busy ? 'One moment…' : 'Check the code'}</Primary>
            <button type="button" disabled={busy} onClick={() => run(() => api.smsResend(id, union.rep))}
              style={{ minHeight: 44, border: 0, background: 'none', color: C.muted, fontSize: 14, textDecoration: 'underline' }}>Send a new code</button>
          </>
        )}
        {error && <Text style={{ color: C.coral }}>{error}</Text>}
      </Card>
    </MapCard>
  );
}

/** tasks/member/<id>/points (26 Oct): the leader takes a keypad member's field points on the leader's phone, as R5–R7;
 *  sent together, they start the member's border job and the leader goes on to match the shapes (L2a). */
export function KeypadPoints({ id, go }) {
  const api = useKeypadClient();
  const m = useKeypadMember(id).data;
  const key = `keypad-${id}`;
  const send = useMutation({ mutationFn: () => api.points(id, readPoints(key).points.map(({ lat, lng, acc, name }) => ({ lat, lng, acc, ...(name ? { name } : {}) }))) });
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

const SCANNED = 'nila.l14.scanned';
const readScanned = () => { try { return JSON.parse(sessionStorage.getItem(SCANNED) || 'null'); } catch { return null; } };
const writeScanned = (m) => { try { sessionStorage.setItem(SCANNED, JSON.stringify(m)); } catch { /* this tab only */ } };

/** A smartphone member's help QR was scanned (L14 or the Members scan, 29 Oct): { account, polygon, join }. */
export const scannedNewMember = (m) => writeScanned({ account: m.account, polygon: m.polygon, join: m.join || null });
/** A member whose land title was removed (15 Nov): her account, Polygon address, name and phone are known, so a new
 *  title starts at her name and number (tasks/member/qr), with no QR scan. */
export const formerMember = (m) => writeScanned({ account: m.address, polygon: m.formerPolygon, join: null, name: m.name || '', phone: m.phone || '', former: true });

/** A scanned smartphone member's account (4 Nov): she holds no XLM, so this leader's app makes it and sends her signed
 *  set_union from her QR (kind 5), the leader's own XLM paying the fee. 'idle' with no join (already made and joined),
 *  then 'busy' → 'done' | 'failed' (L4 asks for her QR again before the mint). */
function useScannedAccount(m) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const [state, setState] = useState('idle');
  const tried = useRef();
  useEffect(() => {
    if (!m?.join || !cfg || !s?.ready || tried.current === m.account) return;
    tried.current = m.account;
    setState('busy');
    ensureMemberAccount(cfg, s, m.account, m.join).then((r) => setState(r.union ? 'done' : 'failed'))
      .catch((e) => { console.error('[L14] account not made or union not set', e); setState('failed'); });
  }, [m, cfg, s]);
  return state;
}

/** tasks/member/qr (29 Oct): the scanned member's name and phone number, typed by the leader (nothing else knows
 *  them: no SMS, no node link), then the field points. */
function NewSmartphone({ go }) {
  const [m] = useState(readScanned);
  const [name, setName] = useState(m?.name || '');
  const [phone, setPhone] = useState(m?.phone || '+91');
  const acct = useScannedAccount(m);
  const qc = useQueryClient();
  const { setName: tag } = useBookActions();
  // 26 Nov: in the member list as soon as the scan has joined her account (her name and number follow at Take field points).
  useEffect(() => { if ((acct === 'done' || (acct === 'idle' && !m?.join)) && m?.account && !m.former) addLocalMember(qc, { account: m.account }); }, [acct]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!m) go('tasks/member'); }, [m, go]);
  if (!m) return null;
  const ok = name.trim() && phoneOk(phone);
  const next = () => {
    writeScanned({ ...m, name: name.trim(), phone: phoneValue(phone) });
    // 26 Nov: joined from her QR: in this phone's member list at once (other leaders: from the node, as before).
    if (m.account && !m.former) addLocalMember(qc, { account: m.account, name: name.trim(), phone: phoneValue(phone) });
    // 16 Nov: an existing member's name and number, as the leader verified them, go to the union's contact book, so
    // the next new land title for her finds them filled in. Best effort: a phone without the union key skips it.
    if (m.former && m.account) tag.mutate({ address: m.account, name: name.trim(), phone: phoneValue(phone) }, { onError: () => {} });
    go('tasks/member/qr/points');
  };
  return (
    // An existing member (15 Nov: a new title after a removal): the leader checks what is known, not a new member.
    <Card title={m.former ? 'Verify the record' : 'New member'}>
      <label style={label} htmlFor="l14-name">Name</label>
      <input id="l14-name" style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <label style={label} htmlFor="l14-phone">Phone number</label>
      <PhoneField id="l14-phone" value={phone} onChange={setPhone} />
      {m.account && <Row k={<b style={{ color: C.text }}>Account</b>} v={`${m.account.slice(0, 4)}…${m.account.slice(-4)}`} />}
      {acct !== 'idle' && <Step done={acct === 'done'} title="Account made and joined the union"
        sub={acct === 'busy' ? 'Making it…' : acct === 'failed' ? 'Not done: you scan the member\'s QR again before the mint' : ''} />}
      <Notice kind="info">Do this at the farm: next you take the field points on your phone.</Notice>
      <Primary disabled={!ok} onClick={next}>Take field points</Primary>
    </Card>
  );
}

/** tasks/member/qr/points (29 Oct): a smartphone member scanned on L14; the leader takes the field points on the
 *  leader's phone (R5–R7) and they start the member's border job for the QR's account and Polygon address. */
export function SmartphonePoints({ go }) {
  const api = useBorderClient();
  const [m] = useState(readScanned);
  const key = m ? `smart-${m.account || m.phone}` : 'smart-none';
  useEffect(() => { if (!m) go('tasks/member'); }, [m, go]);
  const send = useMutation({ mutationFn: () => {
    const q = readPoints(key);
    return api.leaderPoints({ account: m.account, polygon: m.polygon, name: m.name, phone: m.phone, farm: (q.farm || '').trim(),
      points: q.points.map(({ lat, lng, acc, name }) => ({ lat, lng, acc, ...(name ? { name } : {}) })) });
  } });
  const done = () => send.mutate(undefined, { onSuccess: (job) => {
    clearPoints(key);
    try { sessionStorage.removeItem(SCANNED); } catch { /* gone with the tab */ }
    go(`tasks/border/${job.id}`);
  } });
  if (!m) return null;
  if (send.isPending) return <Loading />;
  if (send.error) {
    return (
      <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}
        header={{ title: 'Field points', onBack: () => go('tasks/member/qr') }}>
        <Text style={{ color: C.coral }}>{send.error.message}</Text>
        <Primary onClick={done}>Try again</Primary>
      </MapCard>
    );
  }
  return <PointsStep evm={key} forName={m.name || 'the member'} onDone={done} onBack={() => go('tasks/member/qr')} />;
}

/** The leader's own land title (28 Oct, executive decision): one flow on the leader's phone, as for a keypad member —
 *  the field points (R5–R7), then straight to the borders and the mint (L2a–L4) of the job they start. */
export function LeaderOwnPoints({ go }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const evm = s?.evmAddress;
  const send = useSendFieldPoints();
  const done = () => send.mutate({ points: readPoints(evm).points, farm: (readPoints(evm).farm || '').trim(), union: cfg?.union },
    { onSuccess: (job) => { clearPoints(evm); go(`tasks/border/${job.id}`); } });
  if (send.isPending) return <Loading />;
  if (send.error) {
    return (
      <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}
        header={{ title: 'Field points', onBack: () => go('crop') }}>
        <Text style={{ color: C.coral }}>{send.error.message}</Text>
        <Primary onClick={done}>Try again</Primary>
      </MapCard>
    );
  }
  return <PointsStep evm={evm} onDone={done} onBack={() => go('crop')} />;
}
