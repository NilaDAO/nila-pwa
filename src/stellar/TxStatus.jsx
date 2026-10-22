// N1 / N2 / N3 (boards TxPending, TxConfirmed, TxFailed) and the hook that drives them (design
// useSorobanTx): idle → pending → success | failed. N2 closes itself after 5 s.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, R } from '../shell/tokens';
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

const Screen = ({ children }) => (
  <div style={{ minHeight: '100vh', background: C.ink, color: C.text, fontFamily: FONT, padding: '48px 22px', boxSizing: 'border-box', textAlign: 'center' }}>{children}</div>
);
const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8, textAlign: 'left' }}>
    <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, maxWidth: '60%', overflowWrap: 'anywhere' }}>{v}</span>
  </div>
);
const Button = ({ children, onClick, primary }) => (
  <button type="button" onClick={onClick} style={{ width: '100%', height: 44, borderRadius: R.button, border: 0, marginTop: 8, fontWeight: 700, fontFamily: FONT, background: primary ? C.accent : C.raised, color: primary ? C.ink : C.text }}>{children}</button>
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
  if (tx.status === 'pending') {
    return (
      <Screen>
        <div style={{ height: 12, width: 12, borderRadius: 9999, background: C.accent, margin: '0 auto 24px', animation: 'bounce 1s infinite' }} />
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>Transaction pending</h1>
        <p style={{ color: C.muted }}>{tx.label}</p>
        <p style={{ color: C.muted }}>You can close this screen.</p>
        <Button onClick={onClose}>Close</Button>
      </Screen>
    );
  }
  if (tx.status === 'success') {
    return (
      <Screen>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>Transaction confirmed</h1>
        <p style={{ color: C.accent, fontWeight: 700 }}>Success</p>
        {tx.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        <Row k="When" v={tx.when.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
        <Row k="Network fee" v="Paid by Nila" />
        {tx.hash && <Row k="Transaction" v={`${tx.hash.slice(0, 8)}…${tx.hash.slice(-6)}`} />}
        <p style={{ color: C.muted }}>Closing in {left} sec…</p>
        <Button onClick={onClose}>Close</Button>
      </Screen>
    );
  }
  if (tx.status === 'failed') {
    return (
      <Screen>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>Transaction failed</h1>
        <p style={{ color: C.coral, fontWeight: 700 }}>Not sent</p>
        {tx.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        <Row k="Reason" v={tx.reason} />
        <Button primary onClick={onRetry}>Try again</Button>
        <Button onClick={onClose}>Close</Button>
      </Screen>
    );
  }
  return null;
}
