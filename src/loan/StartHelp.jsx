// The leader scans a member's QR: an assist-mode member's help QR (executive decision 26 Oct) starts the
// 5-minute session on the member's account (nila-account start_session, the member's signed QR as its authorization).
// `member`: when the leader is on that member already (G2, L11), a QR of anyone else is refused. `onStarted(member)`.
// `onDesk(text)` (Tasks, 4 Nov): a machine owner's signed nIN cash-out QR (NILA:N) goes there instead.
import { useState } from 'react';
import CameraView from '../shell/CameraView';
import { readSessionQr, setSession } from '../stellar/session';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { C } from '../shell/tokens';
import DeskCard from '../shell/DeskCard';
import { muted } from '../plan/ui';
import { isDeskCode } from './deskCode';
import { ensureKeypadAccount, useStellarConfig } from '../stellar/hooks';
import { useNilaSigner } from '../wallet/signer';

export default function StartHelp({ member, label, onBack, onStarted, onDesk }) {
  const tx = useSorobanTx();
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState();
  const [tries, setTries] = useState(0);
  const read = async (t) => {
    // His signed nIN cash-out QR (NILA:N, executive decision 4 Nov): no session; HandOver (CashOut.jsx) reads it.
    if (onDesk && isDeskCode(t)) { console.log('[scan] Scan a member QR: a signed cash QR → Hand over'); onDesk(t); return; }
    // A self-mode member shows the plain account address (31 Oct): it opens the member (invest, repay: the leader signs
    // alone); a task that needs the member's consent is done on the member's own phone.
    const plain = (t || '').trim().replace(/^.*?([GC][A-Z2-7]{55}).*$/s, '$1');
    if (/^[GC][A-Z2-7]{55}$/.test(plain) && !/^NILA:/i.test((t || '').trim())) {
      if (member && plain !== member) { console.warn('[scan] another member\'s account QR, not', member); setError("This is another member's QR."); setTries((x) => x + 1); return; }
      if (member) { console.warn('[scan] a self-mode member\'s account QR: no session; she does this task on her own phone'); setError('This member uses the app in self mode: the member does this on their own phone.'); setTries((x) => x + 1); return; }
      console.log('[scan] plain account → opens the member', plain);
      onStarted(plain);
      return;
    }
    let q;
    try { q = readSessionQr(t); } catch (e) { console.warn('[scan] help QR not accepted:', e.message); setError(e.message); setTries((x) => x + 1); return; }
    console.log('[scan] help QR for', q.member, q.join ? '(account not made or not joined yet: making and joining it first)' : '');
    if (member && q.member !== member) { setError("This is another member's QR."); setTries((x) => x + 1); return; }
    setError(undefined);
    if (q.join) {
      // A keypad whose account names no union yet (kind 4, 3 Nov), or a smartphone's (kind 5, 4 Nov): this app makes her
      // account and submits her signed set_union from the QR itself (this leader's own XLM pays the fee), so it needs no
      // node.
      setJoining(true);
      try { await ensureKeypadAccount(cfg, s, { account: q.member, first_signer: q.join.signer, set_union: q.join }); }
      catch (e) { console.error('[help] account not made or union not set', e); setError('Could not join her account to the union. Try again.'); setTries((x) => x + 1); return; }
      finally { setJoining(false); }
    }
    const out = await tx.run({ label: `Act for ${label || 'the member'}`, rows: [['For', '5 minutes']], contractName: q.member, fn: 'start_session',
      args: q.args, auth: [q.entry], invalidate: [] });
    if (out) { console.log('[scan] session started for', q.member); setSession(q.member, Number(out.result || 0) || Math.floor(Date.now() / 1000) + 300); tx.reset(); onStarted(q.member); }
    else console.warn('[scan] start_session not sent (see the transaction screen for the reason)');
  };
  if (joining) return <DeskCard title="Joining her account to the union…" onBack={onBack}><p style={muted}>One moment.</p></DeskCard>;
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  return (
    <DeskCard title={label ? `Scan the QR · ${label}` : "Scan the member's QR"} onBack={onBack}>
      <CameraView key={tries} mode="qr" onText={read} />
      <p style={muted}>Scan the QR on the member's phone. With a help QR you can then act for the member for 5 minutes.</p>
      {error && <p style={{ color: C.coral }}>{error}</p>}
    </DeskCard>
  );
}
