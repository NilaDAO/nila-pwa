// N1 / N2 / N3 (boards TxPending, TxConfirmed, TxFailed) and the hook that drives them (design
// useSorobanTx): idle → pending → success | failed. N2 closes itself after 5 s.
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { C, FONT, R } from '../shell/tokens';
import { useStellarConfig } from './hooks';
import { invokeContract } from './soroban';

export function useSorobanTx() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const qc = useQueryClient();
  const [tx, setTx] = useState({ status: 'idle' });
  const run = useCallback(async ({ label, rows = [], contractName, fn, args, invalidate = [] }) => {
    setTx({ status: 'pending', label, rows });
    try {
      const out = await invokeContract({ cfg, source: s.stellarAddress, signHash: s.signHash, contractName, fn, args,
        onSent: (hash) => setTx((t) => ({ ...t, hash })) });
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setTx({ status: 'success', label, rows, hash: out.hash, when: new Date(), result: out.result });
      return out;
    } catch (e) {
      console.error('[tx]', fn, e);
      setTx({ status: 'failed', label, rows, hash: e.hash, reason: e.message });
      return null;
    }
  }, [cfg, s, qc]);
  const reset = useCallback(() => setTx({ status: 'idle' }), []);
  return { ...tx, run, reset, ready: !!cfg && !!s?.ready };
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
  useEffect(() => {
    if (tx.status !== 'success') return undefined;
    setLeft(5);
    const t = setInterval(() => setLeft((n) => { if (n <= 1) { clearInterval(t); onClose?.(); } return n - 1; }), 1000);
    return () => clearInterval(t);
  }, [tx.status, onClose]);
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
