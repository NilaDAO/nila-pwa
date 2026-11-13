// LS cards for the union account and the leaders' contact book (executive decision 1 Nov; node: union_book.py).
//  - Union signers: the union account's signers, read from the chain through the node; names from the contact book.
//    Change signers (2 Nov): pick who leaves, scan the new signer's account QR, propose; the others sign (high threshold).
//  - Contact book: make the union key, show it as a QR (face to face only) or scan it; a different key is shown.
//  - Voucher prices: a slider, one card per machine type (A1's MessageSlider); a tap shows the price's build-up (driver,
//    diesel, maintenance, insurance, depreciation, margin: machinery's RateParts, on-chain). A signer proposes a change
//    part by part; a card with an open proposal comes first, with Sign. Recently set: a list that opens on a tap. Every open
//    proposal shows "n of 2 signed" and a Sign button for a signer who has not signed. The second signature sends it
//    (2-of-3 since 6 Nov, executive decision; was 3-of-5).
// PersonalName: G2's full name and phone for a member's address (the leaders' reference, not the farm name).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { C } from '../shell/tokens';
import CameraView from '../shell/CameraView';
import MessageSlider, { big as slideBig, card as slideCard, head as slideHead } from '../shell/MessageSlider';
import { ChevronIcon, LockIcon, MachineryTile } from '../shell/icons';
import Segmented from '../shell/Segmented';
import { NoteBar } from '../loan/AssetParts';
import { Card, CardButton, ConfirmCard, Row, Text, btn } from '../shell/SettingsParts';
import { MAX_UNION_TYPES, PARTS, TYPES, VOUCHER_CATEGORIES, useMachines, useRates, typeName } from '../machine/hooks';
import { useStellarConfig } from '../stellar/hooks';
import { keyQr, loadKey, parseKeyQr } from './book';
import { addressFromQr } from '../leader/unionMembers';
import { useBookActions, useContactBook, useMyKey, useProposalActions, useProposals, useUnionSigners } from './hooks';

const NIN = 10_000_000;
// The union account: 3 signers, thresholds 2 (executive decision 6 Nov, was 3-of-5; node: union_sign.UNION_SIGNERS).
const UNION_SIGNERS = 3;
const UNION_THRESHOLD = 2;
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');
const field = { height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontFamily: 'inherit', fontSize: 14,
  padding: '0 14px', boxSizing: 'border-box', outline: 'none' };
const Err = ({ e }) => (e ? <span style={{ color: C.coral, fontSize: 14 }}>{e.message || String(e)}</span> : null);

const plus = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
/** + as the Cash tab's ↓/↑ control (C3, Segmented icon); while the fields are open it is selected and shows ×, a tap closes them. */
const cross = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const AddToggle = ({ on, onToggle, label }) => (
  <Segmented icon width="hug" label={on ? 'Close' : label} value={on ? 'add' : null} onChange={onToggle} options={[['add', on ? cross : plus, on ? 'Close' : label]]} />
);
const NOTE = "Only your union's leaders can read the full name and phone. They are locked with the union key. The farm name is public.";

/** The name fields under a row: full name, optional phone and a secondary Save (the contact book entry for `address`). */
function NameFields({ address, ed, setEd }) {
  const { setName } = useBookActions();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0 8px' }}>
      <input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} placeholder="Full name" aria-label="Full name" style={field} />
      <input value={ed.phone} onChange={(e) => setEd({ ...ed, phone: e.target.value })} placeholder="Phone (optional)" aria-label="Phone (optional)"
        inputMode="tel" style={field} />
      <button type="button" disabled={setName.isPending} onClick={() => setName.mutate({ address, ...ed }, { onSuccess: () => setEd(null) })}
        style={{ ...btn, marginTop: 4 }}>{setName.isPending ? 'Saving…' : 'Save'}</button>
      <Err e={setName.error} />
    </div>
  );
}

/** One signer: the lock and the leader's full name from the contact book (else the short key), "You" for this phone's
 *  key, and + to give the key a name (Close while the fields are open). */
// The signer marked to leave: very dark grey, struck through.
const GONE = '#374151';
const pencil = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
/** The red × of Change signers (the Segmented square, coral cross; filled coral once marked): marks the signer who
 *  leaves; a second tap unmarks. */
const LeaveToggle = ({ on, onToggle }) => (
  <div style={{ display: 'flex', padding: 2, borderRadius: 12, background: C.ink, boxShadow: `inset 0 0 0 1px ${C.raised}` }}>
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? 'Keep this signer' : 'This signer leaves'}
      style={{ width: 40, height: 40, border: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        background: on ? C.coral : 'transparent', color: on ? C.ink : C.coral }}>{cross}</button>
  </div>
);

/** One signer: the lock (a tap shows who can read names), the leader's full name from the contact book (else the
 *  short key) and "(you)". No name yet: + adds one. A name: a tap on it shows the edit icon. While changing signers
 *  every row has the red × instead; the one marked leaves (struck through). */
function SignerRow({ s, me, book, onLock, note, replacing, leaving, onLeave }) {
  const cur = book?.names.get(s.key) || { name: '', phone: '' };
  const [ed, setEd] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const ok = book?.state === 'ok';
  const plain = { border: 0, background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, fontSize: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <button type="button" onClick={onLock} aria-label="Who can read the names" aria-pressed={note} style={plain}>
            <LockIcon size={14} color={leaving ? GONE : note ? C.text : C.muted} />
          </button>
          <button type="button" onClick={() => !replacing && cur.name && ok && setShowEdit(!showEdit)} style={{ ...plain, gap: 6,
            color: leaving ? GONE : !cur.name ? C.muted : C.text, fontWeight: cur.name ? 700 : 400, textDecoration: leaving ? 'line-through' : 'none', cursor: cur.name && !replacing ? 'pointer' : 'default' }}>
            {cur.name || short(s.key)}
            {s.key === me && <span style={{ color: leaving ? GONE : C.muted, fontWeight: 400 }}>(you)</span>}
          </button>
        </span>
        {replacing ? <LeaveToggle on={leaving} onToggle={onLeave} />
          : ok && (!cur.name || showEdit || ed) && (
            <Segmented icon width="hug" label={ed ? 'Close' : cur.name ? 'Change the full name' : 'Add a full name'} value={ed ? 'x' : null}
              onChange={() => { setEd(ed ? null : { name: cur.name, phone: cur.phone }); if (ed) setShowEdit(false); }}
              options={[['x', ed ? cross : cur.name ? pencil : plus, ed ? 'Close' : 'Add a full name']]} />
          )}
      </div>
      {ed && <NameFields address={s.key} ed={ed} setEd={(v) => { setEd(v); if (!v) setShowEdit(false); }} />}
    </div>
  );
}

/** A key with its name from the contact book, else short. */
const nameOf = (book, key) => book?.names.get(key)?.name || short(key);

/** The waiting change of signers: who leaves, who comes in, n of 2 signed, Sign / Withdraw. */
function SignersChange({ p, signers, book, me, act }) {
  const isSigner = !!signers?.signers.some((s) => s.key === me);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0', padding: '12px 0', borderTop: `1px solid ${C.raised}`, borderBottom: `1px solid ${C.raised}` }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.args.remove ? 'Change of signers' : 'New signer'}</span>
      {p.args.remove && <Row k="Leaves" v={<span style={{ color: C.muted, textDecoration: 'line-through' }}>{nameOf(book, p.args.remove)}</span>} />}
      <Row k="Comes in" v={nameOf(book, p.args.add)} />
      {p.args.activates && <Text>{`With this third signer the union account needs ${UNION_THRESHOLD} of ${UNION_SIGNERS} from now on.`}</Text>}
      <Text>{p.status === 'sending' ? 'Sending…' : `${p.signed.length} of ${signers?.high || UNION_THRESHOLD} signed`}{signers?.members < UNION_SIGNERS ? ' · the union account signs it (your operator)' : ''}
        {p.error && p.status === 'open' ? ` · last try failed: ${p.error.slice(0, 80)}` : ''}</Text>
      {p.status === 'open' && isSigner && (
        <div style={{ display: 'flex', gap: 8 }}>
          {!p.signed.includes(me) && <button type="button" onClick={() => act.sign.mutate(p)} disabled={act.sign.isPending}
            style={{ ...btn, flex: 1, background: C.accent, color: C.ink }}>{act.sign.isPending ? 'Signing…' : 'Sign'}</button>}
          {p.proposer === me && <button type="button" onClick={() => act.withdraw.mutate(p)} disabled={act.withdraw.isPending} style={{ ...btn, flex: 1 }}>Withdraw</button>}
        </div>
      )}
    </div>
  );
}

/** Change signers, under the rows: once a signer is marked with the red × (replace) or Add a signer is open, scan the
 *  new signer's account QR (a leader's app shows it), then Propose. The proposer signs at once; the others in their apps. */
function ChangeSigners({ book, act, onDone, leave, addOnly = false, isSigner = true }) {
  const [add, setAdd] = useState('');
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState('');
  const onQr = (text) => {
    setScan(false);
    const a = addressFromQr(text);
    if (!a) { setMsg('This QR has no account.'); return; }
    setMsg('');
    setAdd(a);
  };
  const ready = (addOnly || leave) && add;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
      {!addOnly && !leave && <Text>Tap × on the signer who leaves.</Text>}
      {(addOnly || leave) && (add ? (
        <Row k="New signer" v={nameOf(book, add)} />
      ) : (
        <button type="button" onClick={() => setScan(!scan)} style={btn}>{scan ? 'Stop scanning' : "Scan the new signer's QR"}</button>
      ))}
      {scan && <CameraView mode="qr" onText={onQr} hint="The new signer shows the account QR in the Nila app." />}
      {msg && <Text style={{ color: C.coral }}>{msg}</Text>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onDone} style={{ ...btn, flex: 1 }}>Cancel</button>
        <button type="button" disabled={!ready || act.proposeSigners.isPending} onClick={() => act.proposeSigners.mutate({ remove: addOnly ? '' : leave, add, sign: isSigner }, { onSuccess: onDone })}
          style={{ ...btn, flex: 1, background: C.accent, color: C.ink, opacity: ready ? 1 : 0.5 }}>{act.proposeSigners.isPending ? 'Proposing…' : 'Propose'}</button>
      </div>
      <Err e={act.proposeSigners.error} />
    </div>
  );
}

export function SignersCard() {
  const signers = useUnionSigners();
  const book = useContactBook();
  const proposals = useProposals();
  const act = useProposalActions();
  const me = useMyKey();
  const [note, setNote] = useState(false);
  const [changing, setChanging] = useState(null);     // 'replace' | 'add'
  const [leave, setLeave] = useState(null);           // the signer marked with the red × (replace)
  const stop = () => { setChanging(null); setLeave(null); };
  // The union account's own key (master) is not a signer of the union: shown nowhere, counted apart.
  const list = (signers.data?.signers || []).filter((s) => s.key !== signers.data?.union);
  const d = signers.data && { ...signers.data, list, members: list.length };
  const isSigner = list.some((s) => s.key === me);
  const waiting = (proposals.data || []).find((p) => p.fn === 'set_signers' && (p.status === 'open' || p.status === 'sending'));
  const canAdd = list.length < UNION_SIGNERS && (isSigner || list.length === 0);   // a new union: any leader adds the first
  return (
    <Card title="Union signers">
      {signers.isLoading && <Text>…</Text>}
      <div style={{ display: 'flex', flexDirection: 'column', margin: '8px 0' }}>
        {list.map((s) => <SignerRow key={s.key} s={s} me={me} book={book.data} note={note} onLock={() => setNote(!note)}
          replacing={changing === 'replace'} leaving={leave === s.key} onLeave={() => setLeave(leave === s.key ? null : s.key)} />)}
        {/* Until there are three (2 Nov; 6 Nov 2-of-3): one Add a signer row; the third makes the union account 2 of 3. */}
        {d && list.length < UNION_SIGNERS && !waiting && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, fontSize: 14 }}>
            <span style={{ color: C.muted }}>Add a signer ({list.length} of {UNION_SIGNERS})</span>
            {canAdd && <AddToggle on={changing === 'add'} label="Add a signer" onToggle={() => (changing === 'add' ? stop() : setChanging('add'))} />}
          </div>
        )}
      </div>
      {waiting && <SignersChange p={waiting} signers={d} book={book.data} me={me} act={act} />}
      {changing && !waiting && <ChangeSigners book={book.data} act={act} leave={leave} addOnly={changing === 'add'} isSigner={isSigner} onDone={stop} />}
      <Err e={signers.error || act.sign.error || act.withdraw.error} />
      {!changing && !waiting && list.length === UNION_SIGNERS && <CardButton onClick={isSigner ? () => setChanging('replace') : undefined}>Change signers</CardButton>}
      {note && <NoteBar>{NOTE}</NoteBar>}
    </Card>
  );
}

export function ContactBookCard() {
  const { data: cfg } = useStellarConfig();
  const book = useContactBook();
  const { useKey } = useBookActions();
  const [ask, setAsk] = useState(false);
  const [show, setShow] = useState(false);
  const [scan, setScan] = useState(false);
  const [img, setImg] = useState();
  const [msg, setMsg] = useState('');
  const st = book.data?.state;
  useEffect(() => {
    const key = cfg?.union && loadKey(cfg.union);
    if (show && key) QRCode.toDataURL(keyQr(cfg.union, key), { width: 400, margin: 0, errorCorrectionLevel: 'M' }).then(setImg);
    else setImg(undefined);
  }, [show, cfg?.union, st]);
  const onQr = (text) => {
    setScan(false);
    const k = parseKeyQr(text);
    if (!k) { setMsg('This is not a union key.'); return; }
    if (k.union !== cfg?.union) { setMsg('This key is for another union.'); return; }
    setMsg('');
    useKey.mutate(k.key);
  };
  const label = { none: 'Not made yet', unsent: 'On this phone, not sent', scan: 'Scan it from another leader', mismatch: 'Different from the union\'s',
    ok: `Set · ${book.data?.names.size || 0} name${book.data?.names.size === 1 ? '' : 's'}` }[st] || '…';
  return (
    <Card title="Contact book">
      <Text>Members' full names and phone numbers, given by your leaders. They are locked with the union key: share it only face to face.</Text>
      <Row k="Union key" v={<span style={{ fontWeight: 700, color: st === 'mismatch' ? C.coral : C.text }}>{label}</span>} />
      {st === 'mismatch' && <Text style={{ color: C.coral }}>Your key is not the union's: you cannot read or add names. Scan the key from another leader.</Text>}
      {/* One button for where the phone stands (2 Nov): no key anywhere → make it; the union has one this phone lacks
          or differs from → scan it; the key is set → show it to another leader. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {(st === 'none' || st === 'unsent') && (
          <button type="button" onClick={() => useKey.mutate(st === 'unsent' ? loadKey(cfg.union) : undefined)} disabled={useKey.isPending} style={{ ...btn, flex: 1 }}>
            {useKey.isPending ? 'Making…' : 'Make the union key'}
          </button>
        )}
        {st === 'ok' && (
          <button type="button" onClick={() => (show ? setShow(false) : setAsk(true))} style={{ ...btn, flex: 1 }}>{show ? 'Hide key' : 'Show key'}</button>
        )}
        {(st === 'scan' || st === 'mismatch') && (
          <button type="button" onClick={() => { setScan(!scan); setShow(false); setMsg(''); }} style={{ ...btn, flex: 1 }}>{scan ? 'Stop scanning' : 'Scan a key'}</button>
        )}
      </div>
      {img && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {/* The standard QR (A1a, WalletQr): a white circle, the code at 62% inside it. */}
          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 9999, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={img} alt="Union key QR code" style={{ width: '62%', height: '62%', imageRendering: 'pixelated' }} />
          </div>
          <Text>Let only another leader of your union scan this.</Text>
        </div>
      )}
      {scan && <CameraView mode="qr" onText={onQr} hint="Scan the union key on another leader's phone." />}
      {msg && <Text style={{ color: C.coral }}>{msg}</Text>}
      <Err e={useKey.error} />
      {ask && (
        <ConfirmCard title="Show the union key" ok="Show" onCancel={() => setAsk(false)} onOk={() => { setAsk(false); setScan(false); setShow(true); }}
          warn="Anyone who scans this key can read every name in the contact book. Show it only to another leader of your union, face to face." />
      )}
    </Card>
  );
}

const rupees = (p, k) => Math.round(Number(p?.[k] || 0) / NIN);    // a proposal's part (7 decimals) in whole rupees
const sumOf = (parts) => PARTS.reduce((t, [k]) => t + Number(parts?.[k] || 0), 0) / NIN;

/** One machine type's card in the slider: the machinery voucher icon, its price an acre and its build-up (six parts).
 *  With an open proposal the card comes first and shows the new price, the parts that change (old grey, new white), "n of 2 signed" and Sign. A signer
 *  without an open proposal may propose a change: the six parts become fields (whole rupees an acre). */
function MachineSlide({ r, p, signers, me, act }) {
  const [draft, setDraft] = useState(null);
  const isSigner = !!signers?.signers.some((s) => s.key === me);
  const val = (k) => (draft ? Number(draft[k] ?? Math.round(r.parts[k] || 0)) : Math.round(r.parts[k] || 0));
  const newTotal = p ? sumOf(p.args.parts) : draft ? PARTS.reduce((t, [k]) => t + val(k), 0) : null;
  const dirty = !!draft && PARTS.some(([k]) => draft[k] !== undefined && Number(draft[k] || 0) !== Math.round(r.parts[k] || 0));
  const propose = () => {
    // A part not typed keeps its exact on-chain value (paise included); a typed part is whole rupees.
    const parts = Object.fromEntries(PARTS.map(([k]) => [k, draft[k] !== undefined ? String(Number(draft[k] || 0) * NIN) : String(Math.round((r.parts[k] || 0) * NIN))]));
    act.propose.mutate({ contract: 'machinery', fn: 'set_rate', args: { machine_type: r.type, parts } }, { onSuccess: () => setDraft(null) });
  };
  return (
    <section aria-label={r.name} style={{ ...slideCard, gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><MachineryTile /><span style={slideHead}>{r.name}</span></span>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {newTotal !== null && newTotal !== r.total && r.total > 0
            ? <><span style={{ ...slideBig, color: C.muted, textDecoration: 'line-through', fontSize: 20 }}>{inr(r.total)}</span><span style={slideBig}>{inr(newTotal)}</span></>
            : <span style={slideBig}>{inr(newTotal ?? r.total)}</span>}
        </span>
      </div>
      <div style={{ display: draft ? 'grid' : 'flex', gridTemplateColumns: '1fr 1fr', flexDirection: 'column', gap: draft ? 8 : 0 }}>
        {PARTS.map(([k, label]) => {
          const was = Math.round(r.parts[k] || 0);
          if (draft) {
            const diff = val(k) !== was;
            return (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted }}>
                <span>{label}{diff ? ` (was ${inr(was)})` : ''}</span>
                <input inputMode="numeric" aria-label={`${r.name}: ${label} an acre`} value={draft[k] ?? String(was)}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^\d]/g, '') })}
                  style={{ ...field, width: '100%', textAlign: 'right', boxShadow: diff ? `inset 0 0 0 1px ${C.text}` : 'none' }} />
              </label>
            );
          }
          const to = p ? rupees(p.args.parts, k) : was;
          // A proposed part as the total: the old price grey and struck through, the new one white.
          return <Row key={k} k={label} v={to !== was && r.total > 0 ? (
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8 }}>
              <span style={{ color: C.muted, textDecoration: 'line-through' }}>{inr(was)}</span><span style={{ fontWeight: 700 }}>{inr(to)}</span>
            </span>
          ) : inr(to)} />;
        })}
      </div>
      <span style={{ fontSize: 12, color: C.muted, textAlign: 'right' }}>All prices per acre</span>
      {p && (
        <>
          <Text>{p.status === 'sending' ? 'Sending…' : `${p.signed.length} of ${signers?.threshold || UNION_THRESHOLD} signed`}
            {p.error && p.status === 'open' ? ` · last try failed: ${p.error.slice(0, 80)}` : ''}</Text>
          {p.status === 'open' && isSigner && (
            <div style={{ display: 'flex', gap: 8 }}>
              {!p.signed.includes(me) && <button type="button" onClick={() => act.sign.mutate(p)} disabled={act.sign.isPending}
                style={{ ...btn, flex: 1, background: C.accent, color: C.ink }}>{act.sign.isPending ? 'Signing…' : 'Sign'}</button>}
              {p.proposer === me && <button type="button" onClick={() => act.withdraw.mutate(p)} disabled={act.withdraw.isPending} style={{ ...btn, flex: 1 }}>Withdraw</button>}
              {p.signed.includes(me) && p.proposer !== me && <Text>You signed. Waiting for the others.</Text>}
            </div>
          )}
        </>
      )}
      {!p && isSigner && (draft ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setDraft(null)} style={{ ...btn, flex: 1 }}>Cancel</button>
          <button type="button" onClick={propose} disabled={!dirty || act.propose.isPending}
            style={{ ...btn, flex: 1, background: C.accent, color: C.ink, opacity: dirty ? 1 : 0.5 }}>{act.propose.isPending ? 'Proposing…' : 'Propose'}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setDraft({})} style={btn}>Propose a change</button>
      ))}
      <Err e={act.propose.error || act.sign.error || act.withdraw.error} />
    </section>
  );
}

/** A drop-down that opens inside the card (not the browser's own pop-up): the choice and a chevron; a tap lists the
 *  voucher categories under it (VOUCHER_CATEGORIES: Mechanisation's free machine types to pick; the other categories as
 *  samples, greyed, not on-chain yet), a pick closes it. */
function TypePicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, border: 0, background: 'none',
    padding: '0 14px', boxSizing: 'border-box', color: C.text, fontFamily: 'inherit', fontSize: 14, textAlign: 'left', cursor: 'pointer' };
  return (
    <div style={{ background: C.raised, borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Voucher type" style={{ ...row, fontWeight: 700, color: value ? C.text : C.muted }}>
        <span>{value ? typeName(Number(value)) : 'Choose a voucher'}</span>
        <span style={{ display: 'flex', transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }}><ChevronIcon color={C.muted} /></span>
      </button>
      {open && (
        <div role="listbox" aria-label="Voucher types" style={{ maxHeight: 320, overflowY: 'auto', borderTop: `1px solid ${C.ink}` }}>
          {VOUCHER_CATEGORIES.map((cat) => (
            <div key={cat.name} role="group" aria-label={cat.name}>
              <div style={{ ...row, cursor: 'default', minHeight: 32, fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>{cat.name}</span>{!cat.onChain && <span style={{ textTransform: 'none', fontWeight: 400 }}>not on-chain yet</span>}
              </div>
              {cat.onChain
                ? options.map((t) => (
                  <button key={t} type="button" role="option" aria-selected={String(t) === String(value)} onClick={() => { onChange(String(t)); setOpen(false); }}
                    style={{ ...row, fontWeight: String(t) === String(value) ? 700 : 400 }}>{typeName(t)}</button>
                ))
                : cat.items.map((x) => (
                  <div key={x} role="option" aria-disabled="true" aria-selected="false" style={{ ...row, cursor: 'default', color: '#475569' }}>{x}</div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The slider's last card (2 Nov): a signer adds a machine type from the standard range (TYPE_NAMES) with its six
 *  parts; its first price adds the type for the union (machinery.set_rate, 2 of 3). At most 16 types a union. */
function AddMachineSlide({ priced, pending, signers, me, act }) {
  const free = TYPES.filter((t) => !priced.includes(t) && !pending.includes(t));
  const [type, setType] = useState('');
  const [parts, setParts] = useState({});
  const isSigner = !!signers?.signers.some((s) => s.key === me);
  const full = priced.length + pending.length >= MAX_UNION_TYPES;
  const total = PARTS.reduce((t, [k]) => t + Number(parts[k] || 0), 0);
  const propose = () => {
    const args = { machine_type: Number(type), parts: Object.fromEntries(PARTS.map(([k]) => [k, String(Number(parts[k] || 0) * NIN)])) };
    act.propose.mutate({ contract: 'machinery', fn: 'set_rate', args }, { onSuccess: () => { setType(''); setParts({}); } });
  };
  return (
    <section aria-label="Add a voucher" style={{ ...slideCard, gap: 12 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><MachineryTile /><span style={slideHead}>Add a voucher</span></span>
      {full ? <Text>Your union has {MAX_UNION_TYPES} machine types, the most it can have.</Text>
        : !isSigner ? <Text>Only a signer of the union can add a voucher.</Text>
          : (
            <>
              <TypePicker value={type} options={free} onChange={setType} />
              {type && (
                <>
                  <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8 }}>
                    <span style={slideBig}>{inr(total)}</span>
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {PARTS.map(([k, label]) => (
                      <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted }}>
                        <span>{label}</span>
                        <input inputMode="numeric" aria-label={`New machine: ${label} an acre`} value={parts[k] ?? ''} placeholder="0"
                          onChange={(e) => setParts({ ...parts, [k]: e.target.value.replace(/[^\d]/g, '') })} style={{ ...field, width: '100%', textAlign: 'right' }} />
                      </label>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: C.muted, textAlign: 'right' }}>All prices per acre</span>
                  <button type="button" onClick={propose} disabled={total <= 0 || act.propose.isPending}
                    style={{ ...btn, background: C.accent, color: C.ink, opacity: total > 0 ? 1 : 0.5 }}>{act.propose.isPending ? 'Proposing…' : 'Propose'}</button>
                </>
              )}
              <Err e={act.propose.error} />
            </>
          )}
    </section>
  );
}

/** "Recently set": the union's price changes that went through, as a list that opens on a tap. */
function RecentlySet({ done }) {
  const [open, setOpen] = useState(false);
  if (!done.length) return null;
  return (
    <Card label="Recently set">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: 0, background: 'none', padding: 0, color: C.text, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
        <span>Recently set ({done.length})</span>
        <span style={{ display: 'flex', transform: open ? 'rotate(90deg)' : 'none' }}><ChevronIcon color={C.muted} /></span>
      </button>
      {open && done.map((p) => {
        const a = p.args || {};
        const when = new Date(p.created_at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return <Row key={p.id} k={`${typeName(Number(a.machine_type))} · ${when}`} v={a.parts ? `${inr(sumOf(a.parts))} /acre` : '—'} />;
      })}
    </Card>
  );
}

/** Voucher prices (LS): a heading, the slider of machine cards (open proposals first, newest first) and Recently set. */
export function VoucherPrices() {
  const rates = useRates();
  const signers = useUnionSigners();
  const proposals = useProposals();
  const act = useProposalActions();
  const me = useMyKey();
  const all = (proposals.data || []).filter((p) => p.fn === 'set_rate');
  const openOf = (t) => all.find((p) => (p.status === 'open' || p.status === 'sending') && Number(p.args.machine_type) === t);
  // A proposal for a type the union has no price for yet: a new machine (its card leads, like any proposal).
  const pendingNew = [...new Set(all.filter((p) => (p.status === 'open' || p.status === 'sending')
    && !(rates.data || []).some((r) => r.type === Number(p.args.machine_type))).map((p) => Number(p.args.machine_type)))];
  // Settings shows only the priced types with a registered machine in the union (7 Nov), or with a proposal open;
  // registering a machine (RegisterMachine) still lists every priced type, and Add a voucher every standard one.
  const machines = useMachines();
  const registered = machines.data ? new Set(machines.data.map((m) => m.machine_type)) : null;
  const list = [...(rates.data || [])].filter((r) => !registered || registered.has(r.type) || openOf(r.type)).sort((x, y) => {
    const px = openOf(x.type); const py = openOf(y.type);
    if (!!px !== !!py) return px ? -1 : 1;
    return px ? py.created_at - px.created_at : x.type - y.type;
  });
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px 0' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Voucher prices</h2>
        <Text>The price of an acre per machine, built from its parts. A change needs {signers.data?.threshold || UNION_THRESHOLD} signers of the union.</Text>
        {rates.isLoading && <Text>…</Text>}
                <Err e={proposals.error} />
      </div>
      <MessageSlider slides={[
        // A new machine waiting for signatures has no price yet: its card shows the proposal as a price of 0.
        ...pendingNew.map((t) => <MachineSlide key={`new-${t}`} r={{ type: t, name: typeName(t), parts: {}, total: 0 }} p={openOf(t)} signers={signers.data} me={me} act={act} />),
        ...list.map((r) => <MachineSlide key={r.type} r={r} p={openOf(r.type)} signers={signers.data} me={me} act={act} />),
        ...(rates.isSuccess ? [<AddMachineSlide key="add" priced={(rates.data || []).map((r) => r.type)} pending={pendingNew} signers={signers.data} me={me} act={act} />] : []),
      ]} plusLast={rates.isSuccess} dot={C.coral} />
      <RecentlySet done={all.filter((p) => p.status === 'done')} />
    </>
  );
}

/** G2: the member's full name (and phone) from the leaders' contact book, behind a lock: only the union's leaders
 *  can read it (not the farm name). + opens the two fields and a secondary Save, and turns into Close; a tap on the lock shows the note bar. The phone
 *  starts from the number the union already has for the member (L14 or a keypad link), if any; a member who registered
 *  alone logged in with an SMS code, but that number stays with the login (Cognito) and is not known to the union. */
export function PersonalName({ address, phone: knownPhone }) {
  const book = useContactBook();
  const cur = book.data?.names.get(address) || { name: '', phone: '' };
  const [ed, setEd] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [note, setNote] = useState(false);
  if (!address || !book.data) return null;
  const locked = book.data.state !== 'ok';
  // The lock explains itself in the note bar (A1's NoteBar) on a tap; a second tap hides it.
  const label = (
    <button type="button" onClick={() => setNote(!note)} aria-label="Who can read the full name" aria-pressed={note}
      style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'none', padding: 0, color: C.muted, fontFamily: 'inherit', fontSize: 14,
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 'inherit' }}>
      {/* Lock after the label (13 Nov): the row reads as Property and Fields, the icon only a hint. */}
      Full name<LockIcon size={12} color={note ? C.text : C.muted} />
    </button>
  );
  return (
    // No margin or min height (13 Nov): one more row in G2's Property / Fields group, same spacing.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
        {label}
        {locked ? (
          <span style={{ color: C.muted, textAlign: 'right' }}>{book.data.state === 'mismatch' ? 'Union key does not match' : 'No union key on this phone'}</span>
        ) : (
          // One line, the name only (the phone is in the fields); a name shows no +: a tap on it brings the edit icon (as
          // the signer rows).
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {cur.name && (
              <button type="button" onClick={() => !ed && setShowEdit(!showEdit)} style={{ border: 0, background: 'none', padding: 0, color: C.text,
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {cur.name}
              </button>
            )}
            {(!cur.name || showEdit || ed) && (
              <Segmented icon width="hug" label={ed ? 'Close' : cur.name ? 'Change the full name' : 'Add a full name'} value={ed ? 'x' : null}
                onChange={() => { setEd(ed ? null : { name: cur.name, phone: cur.phone || knownPhone || '' }); if (ed) setShowEdit(false); }}
                options={[['x', ed ? cross : cur.name ? pencil : plus, ed ? 'Close' : 'Add a full name']]} />
            )}
          </span>
        )}
      </div>
      {ed && <NameFields address={address} ed={ed} setEd={(v) => { setEd(v); if (!v) setShowEdit(false); }} />}
      {note && <NoteBar>{NOTE}</NoteBar>}
    </div>
  );
}
