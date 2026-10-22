// N1 / N2 / N3 (boards TxPending, TxConfirmed, TxFailed) and the hook that drives them (design
// useSorobanTx): idle → pending → success | failed. N2 closes itself after 5 s; See history opens A12.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, GRADIENT, R } from '../shell/tokens';
import { Bouncing } from '../register/RegFrame';
import { useStellarConfig } from './hooks';
import { invokeContract, txStatus } from './soroban';

export function useSorobanTx() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const qc = useQueryClient();
  const [tx, setTx] = useState({ status: 'idle' });
  const last = useRef(null);
  const run = useCallback(async (params) => {
    const { label, rows = [], contractName, fn, args, auth, invalidate = [] } = params;
    last.current = { params, hash: null, sentAt: 0 };
    setTx({ status: 'pending', label, rows });
    try {
      const out = await invokeContract({ cfg, source: s.stellarAddress, signHash: s.signHash, contractName, fn, args, auth,
        onSent: (hash) => { last.current = { params, hash, sentAt: Date.now() }; setTx((t) => ({ ...t, hash })); } });
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setTx({ status: 'success', label, rows, hash: out.hash, when: new Date(), result: out.result });
      return out;
    } catch (e) {
      console.error('[tx]', fn, e);
      setTx({ status: 'failed', label, rows, hash: e.hash, reason: e.message });
      return null;
    }
  }, [cfg, s, qc]);
  // Try again: a call that was sent may still land (its 300 s window), so it is checked first and never
  // sent twice (a cash scan or a cash-out must not be recorded twice).
  const retry = useCallback(async () => {
    const l = last.current;
    if (!l) return null;
    const { label, rows = [], invalidate = [] } = l.params;
    if (l.hash) {
      const st = await txStatus(cfg, l.hash);
      if (st === 'SUCCESS') {
        invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
        setTx({ status: 'success', label, rows, hash: l.hash, when: new Date() });
        return { hash: l.hash };
      }
      if (st !== 'FAILED' && Date.now() - l.sentAt < 330_000) {
        setTx({ status: 'failed', label, rows, hash: l.hash, reason: 'Still waiting for the network. Try again in a minute.' });
        return null;
      }
    }
    return run(l.params);
  }, [cfg, qc, run]);
  const reset = useCallback(() => setTx({ status: 'idle' }), []);
  return { ...tx, run, retry, reset, ready: !!cfg && !!s?.ready };
}

// Boards TxPending / TxConfirmed / TxFailed (22 Oct): the whole screen on the gradient (fixed over cards and the tab
// bar, as S1), centred; the logo bounces on N1, a round mark on N2 / N3, the details in one ink card (Comp12) with
// label / value rows (Comp10); primary and secondary buttons per Comp01.
const Screen = ({ children }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 40, overflowY: 'auto', background: GRADIENT, color: C.text, fontFamily: FONT,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 24px', boxSizing: 'border-box', textAlign: 'center' }}>
    <div style={{ width: '100%', maxWidth: 342, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>{children}</div>
  </div>
);
const title = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, margin: '8px 0 0' };
const sub = { fontSize: 14, lineHeight: 1.5, color: C.muted, margin: 0 };
const Mark = ({ bg, stroke, children }) => (
  <span aria-hidden="true" style={{ width: 72, height: 72, borderRadius: R.round, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  </span>
);
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, lineHeight: 1.5, minHeight: 33 }}>
    <span style={{ color: C.muted, textAlign: 'left' }}>{k}</span><span style={{ fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
  </div>
);
const Card = ({ children }) => (
  <div style={{ background: C.ink, borderRadius: R.card, padding: '16px 22px', margin: '16px 0 8px', textAlign: 'left' }}>{children}</div>
);
function HashChip({ hash }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(hash).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); };
  return (
    <button type="button" onClick={copy} aria-label="Copy the transaction id"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>
      {done ? 'Copied' : `${hash.slice(0, 4)}…${hash.slice(-4)}`}
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
    </button>
  );
}
const Button = ({ children, onClick, primary }) => (
  <button type="button" onClick={onClick} style={{ width: '100%', height: 44, borderRadius: R.button, border: 0, fontSize: 14, fontWeight: 700, fontFamily: FONT,
    background: primary ? C.accent : C.raised, color: primary ? C.ink : C.text, cursor: 'pointer' }}>{children}</button>
);

/** Shows N1/N2/N3 for a running tx; renders nothing while idle. */
export function TxScreens({ tx, onClose, onRetry }) {
  const [left, setLeft] = useState(5);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (tx.status !== 'success') return undefined;
    setLeft(5);
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [tx.status]);
  useEffect(() => { if (tx.status === 'success' && left === 0) close.current?.(); }, [tx.status, left]);
  const [first] = tx.rows || [];
  if (tx.status === 'pending') {
    return (
      <Screen>
        <Bouncing pad={0} top={0} bottom={8} size={48} label="Sending" />
        <h1 style={title}>{tx.label}</h1>
        {first && <p style={sub}>{first[0]} {first[1]}</p>}
        <p style={{ ...sub, margin: '8px 0 16px' }}>You can close this screen.</p>
        <Button onClick={onClose}>Close</Button>
      </Screen>
    );
  }
  if (tx.status === 'success') {
    return (
      <Screen>
        <Mark bg={C.ink} stroke={C.text}><path d="M20 6 9 17l-5-5" /></Mark>
        <h1 style={title}>Success</h1>
        <Card>
          {tx.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
          <Row k="When" v={tx.when.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·')} />
          <Row k="Network fee" v="Paid by Nila" />
          {tx.hash && <Row k="Transaction" v={<HashChip hash={tx.hash} />} />}
        </Card>
        <Button primary onClick={onClose}>Closing in {left} sec…</Button>
        <Button onClick={() => { window.location.hash = '#/history'; }}>See history</Button>
      </Screen>
    );
  }
  if (tx.status === 'failed') {
    return (
      <Screen>
        <Mark bg={C.coral} stroke={C.ink}><path d="M18 6 6 18M6 6l12 12" /></Mark>
        <h1 style={title}>Not sent</h1>
        <p style={sub}>The Stellar network did not accept this transaction. Nothing left your wallet.</p>
        <Card>
          {tx.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
          <Row k="Reason" v={tx.reason} />
        </Card>
        <Button primary onClick={onRetry}>Try again</Button>
        <Button onClick={onClose}>Close</Button>
      </Screen>
    );
  }
  return null;
}
