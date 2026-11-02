// LS cards for the union account and the leaders' contact book (executive decision 1 Nov; node: union_book.py).
//  - Union signers: the union account's signers and threshold, read from the chain through the node; names from the
//    contact book. "Change signers" stays an operator step (scripts/multisig in nila-integrations).
//  - Contact book: make the union key, show it as a QR (face to face only) or scan it; a different key is shown.
//  - Voucher prices: a signer proposes a new price an acre per machine type, part by part (driver, diesel, maintenance,
//    insurance, depreciation, margin: machinery's RateParts, on-chain); every open
//    proposal shows "n of 3 signed" and a Sign button for a signer who has not signed. The third signature sends it.
// PersonalName: G2's personal name and phone for a member's address (the leaders' reference, not the farm name).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { C } from '../shell/tokens';
import CameraView from '../shell/CameraView';
import { Card, CardButton, ConfirmCard, Row, Text, btn } from '../shell/SettingsParts';
import { PARTS, useRates, typeName } from '../machine/hooks';
import { useStellarConfig } from '../stellar/hooks';
import { keyQr, loadKey, parseKeyQr } from './book';
import { useBookActions, useContactBook, useMyKey, useProposalActions, useProposals, useUnionSigners } from './hooks';

const NIN = 10_000_000;
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');
const field = { height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontFamily: 'inherit', fontSize: 14,
  padding: '0 14px', boxSizing: 'border-box', outline: 'none' };
const Err = ({ e }) => (e ? <span style={{ color: C.coral, fontSize: 14 }}>{e.message || String(e)}</span> : null);

export function SignersCard() {
  const signers = useUnionSigners();
  const book = useContactBook();
  const me = useMyKey();
  const d = signers.data;
  return (
    <Card title="Union signers">
      <Text>{d ? `${d.threshold} of ${d.signers.length}` : '3 of 5'} must sign: a new leader, the voucher price list and a change of signers.</Text>
      {signers.isLoading && <Text>…</Text>}
      {(d?.signers || []).map((s) => (
        <Row key={s.key} k={book.data?.names.get(s.key)?.name || short(s.key)} v={s.key === me ? 'You' : ''} />
      ))}
      <Err e={signers.error} />
      <CardButton>Change signers</CardButton>
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
      <Text>Personal names and phone numbers your leaders give members' accounts. They are locked with the union key: share it only face to face.</Text>
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

/** What a set_rate proposal changes, part by part: "Diesel ₹300 → ₹340". */
function partChanges(now, parts) {
  if (!parts) return [];
  return PARTS.map(([k, label]) => {
    const was = now ? Math.round(now.parts[k] || 0) : null;
    const to = Math.round(Number(parts[k] || 0) / NIN);
    return was === to ? null : `${label} ${was === null ? '' : `${inr(was)} → `}${inr(to)}`;
  }).filter(Boolean);
}

/** One proposal: the machine, its new price an acre, the parts that change, its signatures and the Sign button. */
function Proposal({ p, rates, signers, me, act }) {
  const a = p.args || {};
  const now = (rates || []).find((r) => r.type === Number(a.machine_type));
  const total = a.parts ? Object.values(a.parts).reduce((x, y) => x + Number(y), 0) / NIN : 0;
  // A set price shows what it was set to; an open one what it changes from today's price.
  const from = now && p.status !== 'done' ? `${inr(now.total)} → ` : '';
  const what = p.fn === 'set_rate' ? `${typeName(Number(a.machine_type))}: ${from}${inr(total)} /acre`
    : p.fn === 'set_crop_rate' ? `${typeName(Number(a.machine_type))}, crop ${a.crop_family}: ${a.parts ? `${inr(total)} /acre` : 'type price'}`
      : `Prepay share ${(Number(a.driver_bp) / 100).toFixed(0)}% of the driver`;
  const changes = p.fn === 'set_rate' && p.status !== 'done' ? partChanges(now, a.parts) : [];
  const mine = signers?.signers.some((s) => s.key === me);
  const signed = p.signed.includes(me);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0', borderTop: `1px solid ${C.raised}` }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{what}</span>
      {changes.length > 0 && <Text>{changes.join(' · ')}</Text>}
      <Text>{p.status === 'open' || p.status === 'sending' ? `${p.signed.length} of ${signers?.threshold || 3} signed` : p.status === 'done' ? 'Signed and set' : p.status}
        {p.error && p.status === 'open' ? ` · last try failed: ${p.error.slice(0, 80)}` : ''}</Text>
      {p.status === 'open' && mine && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {!signed && <button type="button" onClick={() => act.sign.mutate(p)} disabled={act.sign.isPending}
            style={{ ...btn, flex: 1, background: C.accent, color: C.ink }}>{act.sign.isPending ? 'Signing…' : 'Sign'}</button>}
          {p.proposer === me && <button type="button" onClick={() => act.withdraw.mutate(p)} disabled={act.withdraw.isPending} style={{ ...btn, flex: 1 }}>Withdraw</button>}
        </div>
      )}
    </div>
  );
}

/** One machine type in the editor: its price an acre and, opened, its six parts as fields (whole rupees an acre). */
function TypeEditor({ r, draft, open, onToggle, onPart }) {
  const vals = Object.fromEntries(PARTS.map(([k]) => [k, draft?.[k] ?? String(Math.round(r.parts[k] || 0))]));
  const total = PARTS.reduce((t, [k]) => t + Number(vals[k] || 0), 0);
  const changed = !!draft && PARTS.some(([k]) => Number(vals[k] || 0) !== Math.round(r.parts[k] || 0));
  return (
    <div style={{ borderTop: `1px solid ${C.raised}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        width: '100%', minHeight: 44, border: 0, background: 'none', padding: 0, color: C.text, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ color: C.muted }}>{r.name}</span>
        <span style={{ fontWeight: 700, color: changed ? C.accent : C.text }}>
          {changed ? `${inr(r.total)} → ${inr(total)}` : inr(r.total)} /acre
        </span>
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 0 12px' }}>
          {PARTS.map(([k, label]) => {
            const diff = Number(vals[k] || 0) !== Math.round(r.parts[k] || 0);
            return (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.muted }}>
                <span>{label}{diff ? ` (was ${inr(r.parts[k] || 0)})` : ''}</span>
                <input inputMode="numeric" aria-label={`${r.name}: ${label} an acre`} value={vals[k]}
                  onChange={(e) => onPart(k, e.target.value.replace(/[^\d]/g, ''))}
                  style={{ ...field, width: '100%', textAlign: 'right', boxShadow: diff ? `inset 0 0 0 1px ${C.accent}` : 'none' }} />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VoucherPricesCard() {
  const rates = useRates();
  const signers = useUnionSigners();
  const proposals = useProposals();
  const act = useProposalActions();
  const me = useMyKey();
  const [edit, setEdit] = useState(null);       // type -> { part: whole rupees as text }
  const [openType, setOpenType] = useState(null);
  const isSigner = !!signers.data?.signers.some((s) => s.key === me);
  const open = (proposals.data || []).filter((p) => p.status === 'open' || p.status === 'sending');
  const recent = (proposals.data || []).filter((p) => p.status === 'done').slice(0, 3);
  const partsOf = (r) => Object.fromEntries(PARTS.map(([k]) => [k, Number(edit?.[r.type]?.[k] ?? Math.round(r.parts[k] || 0))]));
  const changed = edit ? (rates.data || []).filter((r) => edit[r.type] && PARTS.some(([k]) => partsOf(r)[k] !== Math.round(r.parts[k] || 0))) : [];
  const valid = changed.every((r) => Object.values(partsOf(r)).reduce((a, b) => a + b, 0) > 0);
  const setPart = (type, k, v) => setEdit({ ...edit, [type]: { ...(edit[type] || {}), [k]: v } });
  const send = async () => {
    for (const r of changed) {
      // A part not typed keeps its exact on-chain value (paise included); a typed part is whole rupees.
      const parts = Object.fromEntries(PARTS.map(([k]) => [k, edit[r.type]?.[k] !== undefined
        ? String(Number(edit[r.type][k] || 0) * NIN) : String(Math.round((r.parts[k] || 0) * NIN))]));
      // eslint-disable-next-line no-await-in-loop
      await act.propose.mutateAsync({ contract: 'machinery', fn: 'set_rate', args: { machine_type: r.type, parts } });
    }
    setEdit(null);
    setOpenType(null);
  };
  return (
    <Card title="Voucher prices">
      <Text>The price of an acre per machine, built from its parts. A new price needs {signers.data?.threshold || 3} signers of the union.</Text>
      <div style={{ height: 1, background: C.raised, margin: '4px 0' }} />
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>Machine prices</span>
      {rates.isLoading && <Text>…</Text>}
      {edit && <Text>Tap a machine to change its parts.</Text>}
      {(rates.data || []).map((r) => (edit ? (
        <TypeEditor key={r.type} r={r} draft={edit[r.type]} open={openType === r.type}
          onToggle={() => setOpenType(openType === r.type ? null : r.type)} onPart={(k, v) => setPart(r.type, k, v)} />
      ) : <Row key={r.type} k={r.name} v={`${inr(r.total)} /acre`} />))}
      {rates.isSuccess && !rates.data.length && <Text>No machine prices set for the union yet.</Text>}
      {edit ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" onClick={() => { setEdit(null); setOpenType(null); }} style={{ ...btn, flex: 1 }}>Cancel</button>
          <button type="button" onClick={send} disabled={!changed.length || !valid || act.propose.isPending}
            style={{ ...btn, flex: 1, background: C.accent, color: C.ink, opacity: changed.length && valid ? 1 : 0.5 }}>
            {act.propose.isPending ? 'Proposing…' : changed.length > 1 ? `Propose ${changed.length} prices` : 'Propose'}
          </button>
        </div>
      ) : (
        <CardButton onClick={isSigner && rates.data?.length ? () => setEdit({}) : undefined}>Propose new prices</CardButton>
      )}
      {!isSigner && signers.isSuccess && <Text>Only a signer of the union can propose or sign.</Text>}
      {open.length > 0 && <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, marginTop: 8 }}>Waiting for signatures</span>}
      {open.map((p) => <Proposal key={p.id} p={p} rates={rates.data} signers={signers.data} me={me} act={act} />)}
      {recent.length > 0 && <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, marginTop: 8 }}>Recently set</span>}
      {recent.map((p) => <Proposal key={p.id} p={p} rates={rates.data} signers={signers.data} me={me} act={act} />)}
      <Err e={act.propose.error || act.sign.error || act.withdraw.error || proposals.error} />
    </Card>
  );
}

/** G2: the personal name (and phone) the leaders gave this member's account, from the contact book; editable. */
export function PersonalName({ address }) {
  const book = useContactBook();
  const { setName } = useBookActions();
  const cur = book.data?.names.get(address) || { name: '', phone: '' };
  const [ed, setEd] = useState(null);
  if (!address || !book.data) return null;
  if (book.data.state !== 'ok') {
    return <Text>Personal name: {book.data.state === 'mismatch' ? 'your union key does not match (Settings → Contact book)' : 'no union key on this phone (Settings → Contact book)'}</Text>;
  }
  if (!ed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, fontSize: 14 }}>
        <span style={{ color: C.muted }}>Personal name</span>
        <button type="button" onClick={() => setEd({ name: cur.name, phone: cur.phone })} style={{ border: 0, background: 'none', padding: 0,
          color: cur.name ? C.text : C.accent, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'right' }}>
          {cur.name ? `${cur.name}${cur.phone ? ` · ${cur.phone}` : ''}` : 'Add'}
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Text>Only the union's leaders can read this. Not the farm name.</Text>
      <input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} placeholder="Personal name" aria-label="Personal name" style={field} />
      <input value={ed.phone} onChange={(e) => setEd({ ...ed, phone: e.target.value })} placeholder="Phone (optional)" aria-label="Phone (optional)"
        inputMode="tel" style={field} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setEd(null)} style={{ ...btn, flex: 1 }}>Cancel</button>
        <button type="button" disabled={setName.isPending} onClick={() => setName.mutate({ address, ...ed }, { onSuccess: () => setEd(null) })}
          style={{ ...btn, flex: 1, background: C.accent, color: C.ink }}>{setName.isPending ? 'Saving…' : 'Save'}</button>
      </div>
      <Err e={setName.error} />
    </div>
  );
}
