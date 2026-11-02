// LS cards for the union account and the leaders' contact book (executive decision 1 Nov; node: union_book.py).
//  - Union signers: the union account's signers and threshold, read from the chain through the node; names from the
//    contact book. "Change signers" stays an operator step (scripts/multisig in nila-integrations).
//  - Contact book: make the union key, show it as a QR (face to face only) or scan it; a different key is shown.
//  - Voucher prices: a slider, one card per machine type (A1's MessageSlider); a tap shows the price's build-up (driver,
//    diesel, maintenance, insurance, depreciation, margin: machinery's RateParts, on-chain). A signer proposes a change
//    part by part; a card with an open proposal comes first, with Sign. Recently set: a list that opens on a tap. Every open
//    proposal shows "n of 3 signed" and a Sign button for a signer who has not signed. The third signature sends it.
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
import { MAX_UNION_TYPES, PARTS, TYPES, useRates, typeName } from '../machine/hooks';
import { useStellarConfig } from '../stellar/hooks';
import { keyQr, loadKey, parseKeyQr } from './book';
import { useBookActions, useContactBook, useMyKey, useProposalActions, useProposals, useUnionSigners } from './hooks';

const NIN = 10_000_000;
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');
const field = { height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontFamily: 'inherit', fontSize: 14,
  padding: '0 14px', boxSizing: 'border-box', outline: 'none' };
const Err = ({ e }) => (e ? <span style={{ color: C.coral, fontSize: 14 }}>{e.message || String(e)}</span> : null);

const plus = <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>;
/** + as the Cash tab's ↓/↑ control (C3, Segmented icon): selected while the fields are open; a second tap closes them. */
const AddToggle = ({ on, onToggle, label }) => (
  <Segmented icon width="hug" label={label} value={on ? 'add' : null} onChange={onToggle} options={[['add', plus, label]]} />
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
function SignerRow({ s, me, book, onLock, note }) {
  const cur = book?.names.get(s.key) || { name: '', phone: '' };
  const [ed, setEd] = useState(null);
  const ok = book?.state === 'ok';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, fontSize: 14 }}>
        <button type="button" onClick={onLock} aria-label="Who can read the names" aria-pressed={note} style={{ display: 'flex', alignItems: 'center', gap: 6,
          border: 0, background: 'none', padding: 0, color: cur.name ? C.text : C.muted, fontFamily: 'inherit', fontSize: 14, fontWeight: cur.name ? 700 : 400, cursor: 'pointer' }}>
          <LockIcon size={14} color={note ? C.text : C.muted} />{cur.name || short(s.key)}
        </button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {s.key === me && <span style={{ fontWeight: 700 }}>You</span>}
          {ok && <AddToggle on={!!ed} label={cur.name ? 'Change the full name' : 'Add a full name'}
            onToggle={() => setEd(ed ? null : { name: cur.name, phone: cur.phone })} />}
        </span>
      </div>
      {ed && <NameFields address={s.key} ed={ed} setEd={setEd} />}
    </div>
  );
}

export function SignersCard() {
  const signers = useUnionSigners();
  const book = useContactBook();
  const me = useMyKey();
  const [note, setNote] = useState(false);
  const d = signers.data;
  return (
    <Card title="Union signers">
      <Text>{d ? `${d.threshold} of ${d.signers.length}` : '3 of 5'} must sign: a new leader, the voucher price list and a change of signers.</Text>
      {signers.isLoading && <Text>…</Text>}
      <div style={{ display: 'flex', flexDirection: 'column', margin: '8px 0' }}>
        {(d?.signers || []).map((s) => <SignerRow key={s.key} s={s} me={me} book={book.data} note={note} onLock={() => setNote(!note)} />)}
      </div>
      <Err e={signers.error} />
      <CardButton>Change signers</CardButton>
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
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {(st === 'none' || st === 'unsent') ? (
          <button type="button" onClick={() => useKey.mutate(st === 'unsent' ? loadKey(cfg.union) : undefined)} disabled={useKey.isPending} style={{ ...btn, flex: 1 }}>
            {useKey.isPending ? 'Making…' : 'Make the union key'}
          </button>
        ) : (
          <button type="button" onClick={() => (show ? setShow(false) : setAsk(true))} disabled={st !== 'ok'}
            style={{ ...btn, flex: 1, opacity: st === 'ok' ? 1 : 0.5 }}>{show ? 'Hide key' : 'Show key'}</button>
        )}
        <button type="button" onClick={() => { setScan(!scan); setShow(false); setMsg(''); }} style={{ ...btn, flex: 1 }}>{scan ? 'Stop scanning' : 'Scan a key'}</button>
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
 *  With an open proposal the card comes first and shows the new price, the parts that change (old grey, new white), "n of 3 signed" and Sign. A signer
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
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {newTotal !== null && newTotal !== r.total && r.total > 0
            ? <><span style={{ ...slideBig, color: C.muted, textDecoration: 'line-through', fontSize: 20 }}>{inr(r.total)}</span><span style={slideBig}>{inr(newTotal)}</span></>
            : <span style={slideBig}>{inr(newTotal ?? r.total)}</span>}
          <span style={{ fontSize: 14, color: C.muted }}>an acre</span>
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
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ color: C.muted, textDecoration: 'line-through' }}>{inr(was)}</span><span style={{ fontWeight: 700 }}>{inr(to)}</span>
            </span>
          ) : inr(to)} />;
        })}
      </div>
      {p && (
        <>
          <Text>{p.status === 'sending' ? 'Sending…' : `${p.signed.length} of ${signers?.threshold || 3} signed`}
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
 *  options under it, a pick closes it. */
function TypePicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, border: 0, background: 'none',
    padding: '0 14px', boxSizing: 'border-box', color: C.text, fontFamily: 'inherit', fontSize: 14, textAlign: 'left', cursor: 'pointer' };
  return (
    <div style={{ background: C.raised, borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Machine type" style={{ ...row, fontWeight: 700, color: value ? C.text : C.muted }}>
        <span>{value ? typeName(Number(value)) : 'Choose a machine'}</span>
        <span style={{ display: 'flex', transform: open ? 'rotate(-90deg)' : 'rotate(90deg)' }}><ChevronIcon color={C.muted} /></span>
      </button>
      {open && (
        <div role="listbox" aria-label="Machine types" style={{ maxHeight: 264, overflowY: 'auto', borderTop: `1px solid ${C.ink}` }}>
          {options.map((t) => (
            <button key={t} type="button" role="option" aria-selected={String(t) === String(value)} onClick={() => { onChange(String(t)); setOpen(false); }}
              style={{ ...row, fontWeight: String(t) === String(value) ? 700 : 400 }}>{typeName(t)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The slider's last card (2 Nov): a signer adds a machine type from the standard range (TYPE_NAMES) with its six
 *  parts; its first price adds the type for the union (machinery.set_rate, 3 of 5). At most 16 types a union. */
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
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={slideBig}>{inr(total)}</span><span style={{ fontSize: 14, color: C.muted }}>an acre</span>
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
  const list = [...(rates.data || [])].sort((x, y) => {
    const px = openOf(x.type); const py = openOf(y.type);
    if (!!px !== !!py) return px ? -1 : 1;
    return px ? py.created_at - px.created_at : x.type - y.type;
  });
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px 0' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>Voucher prices</h2>
        <Text>The price of an acre per machine, built from its parts. A change needs {signers.data?.threshold || 3} signers of the union.</Text>
        {rates.isLoading && <Text>…</Text>}
                <Err e={proposals.error} />
      </div>
      <MessageSlider slides={[
        // A new machine waiting for signatures has no price yet: its card shows the proposal as a price of 0.
        ...pendingNew.map((t) => <MachineSlide key={`new-${t}`} r={{ type: t, name: typeName(t), parts: {}, total: 0 }} p={openOf(t)} signers={signers.data} me={me} act={act} />),
        ...list.map((r) => <MachineSlide key={r.type} r={r} p={openOf(r.type)} signers={signers.data} me={me} act={act} />),
        ...(rates.isSuccess ? [<AddMachineSlide key="add" priced={(rates.data || []).map((r) => r.type)} pending={pendingNew} signers={signers.data} me={me} act={act} />] : []),
      ]} plusLast={rates.isSuccess} />
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
  const [note, setNote] = useState(false);
  if (!address || !book.data) return null;
  const locked = book.data.state !== 'ok';
  // The lock explains itself in the note bar (A1's NoteBar) on a tap; a second tap hides it.
  const label = (
    <button type="button" onClick={() => setNote(!note)} aria-label="Who can read the full name" aria-pressed={note}
      style={{ display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'none', padding: 0, color: C.muted, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>
      <LockIcon size={14} color={note ? C.text : C.muted} />Full name
    </button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, fontSize: 14 }}>
        {label}
        {locked ? (
          <span style={{ color: C.muted, textAlign: 'right' }}>{book.data.state === 'mismatch' ? 'Union key does not match' : 'No union key on this phone'}</span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {cur.name && <span style={{ fontWeight: 700, textAlign: 'right' }}>{`${cur.name}${cur.phone ? ` · ${cur.phone}` : ''}`}</span>}
            <AddToggle on={!!ed} label={cur.name ? 'Change the full name' : 'Add a full name'}
              onToggle={() => setEd(ed ? null : { name: cur.name, phone: cur.phone || knownPhone || '' })} />
          </span>
        )}
      </div>
      {ed && <NameFields address={address} ed={ed} setEd={setEd} />}
      {note && <NoteBar>{NOTE}</NoteBar>}
    </div>
  );
}
