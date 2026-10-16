// The move M1–M4 (P3, design boards MoveStart, MoveOffline, MoveBusy, MoveDone, MoveFailed).
// Full screen, no tabs, no skip. Copy from the boards; where 16 Oct decisions changed the flow
// (no reset, crop shares not moved, an open loan blocks the move) the copy is marked DESIGN GAP.
import { useEffect, useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useDataContext } from '../utils/NavigationContext';
import { useMoveWallet, useOpenPolygonLoans } from './hooks';

const T = { ink: '#121212', raised: '#1f2733', text: '#f1f5f9', muted: '#94a3b8', accent: '#d4cf5a', gold: '#d4a634', ground: '#8a9a2e' };

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

function Frame({ children, note }) {
  return (
    <div className="min-h-screen flex flex-col pb-2" style={{ background: T.ground, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="text-center font-bold text-lg pt-10" style={{ color: '#fff' }}>nila</div>
      <div className="flex justify-center py-8"><img src="/bw.svg" alt="" width="120" height="118" style={{ filter: 'invert(1)' }} /></div>
      <div className="flex-1" />
      <div className="mx-2 rounded-3xl p-5" style={{ background: T.ink, color: T.text }}>{children}</div>
      {note && (
        <div className="mx-2 mt-4 mb-2 rounded-3xl p-5 text-sm flex gap-3" style={{ background: T.ink, color: T.muted }}>
          <span aria-hidden>ⓘ</span><span>{note}</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center rounded-xl px-4 h-11 mb-2" style={{ background: T.raised }}>
      <span className="font-semibold text-sm">{label}</span><span className="text-sm" style={{ color: T.muted }}>{value}</span>
    </div>
  );
}

function Primary({ children, disabled, onClick }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="w-full h-11 rounded-xl font-semibold text-sm mt-4"
      style={{ background: T.accent, color: T.ink, opacity: disabled ? 0.5 : 1 }}>{children}</button>
  );
}

export default function MoveFlow({ onMoved, onRepay }) {
  const signer = useNilaSigner();
  const online = useOnline();
  const { db } = useDataContext();
  const loans = useOpenPolygonLoans(signer?.evmAddress, db?.union?.address);
  const { run, busy, progress, legacy } = useMoveWallet(loans);
  const l = legacy.data;

  if (progress.done) {
    // M3. DESIGN GAP: no reset (16 Oct), so no "Recover wallet" and no new code.
    return (
      <Frame note="Your nIN reaches the new network after your union confirms your land title.">
        <div className="text-center font-bold text-lg mb-2">Your wallet has moved</div>
        <p className="text-center text-sm mb-2" style={{ color: T.muted }}>Your land title and nIN are waiting.</p>
        <Primary onClick={onMoved}>Continue</Primary>
      </Frame>
    );
  }
  if (busy) {
    // M2
    return (
      <Frame>
        <div className="text-center font-bold text-lg mb-2">Moving your wallet</div>
        <p className="text-center text-sm" style={{ color: T.muted }}>Keep the app open. This takes about a minute.</p>
        <div className="flex justify-center mt-4"><div className="h-3 w-3 rounded-full animate-bounce" style={{ background: T.accent }} /></div>
      </Frame>
    );
  }
  if (!loans.known) {
    // DESIGN GAP: her Polygon loans are read before the start choice; a failed read never opens the
    // move, but repaying in today's app is always possible.
    return (
      <Frame>
        <p className="text-center text-sm" style={{ color: T.muted }}>
          {loans.error ? 'Could not check your loans. Check your internet and open the app again.' : 'Checking your loans…'}
        </p>
        <Primary onClick={onRepay}>Repay my loan</Primary>
      </Frame>
    );
  }
  if (loans.open.length > 0) {
    // DESIGN GAP: the start choice for a member with an open Polygon loan (16 Oct): she repays in
    // today's app first; this screen comes back at every start until the loan is closed.
    return (
      <Frame note="When your loan is repaid, you can move your wallet.">
        <div className="text-center font-bold text-lg mb-2">Nila has moved to a new network</div>
        <p className="text-center text-sm mb-4" style={{ color: T.muted }}>Repay your loan first. Then you can move your wallet.</p>
        <Primary onClick={onRepay}>Repay my loan</Primary>
      </Frame>
    );
  }
  if (progress.error) {
    // M4
    return (
      <Frame note="Still not working? Ask your union leader.">
        <div className="flex justify-center mb-3"><div className="h-14 w-14 rounded-full flex items-center justify-center text-2xl" style={{ background: '#e8907f', color: T.ink }}>✕</div></div>
        <div className="text-center font-bold text-lg mb-2">The move did not finish</div>
        <p className="text-center text-sm" style={{ color: T.muted }}>Nothing is lost. Your wallet stays on the old network until the move is done.</p>
        <Primary disabled={!online || !signer?.ready} onClick={run}>Try again</Primary>
      </Frame>
    );
  }
  // M1 / M1b. DESIGN GAP: crop shares are not moved (15 Oct).
  return (
    <Frame note={!online ? 'You are offline. Connect to the internet to move your wallet.'
      : undefined /* DESIGN GAP: no reset, so no "open your wallet again" note */}>
      <div className="text-center font-bold text-lg mb-2">Nila has moved to a new network</div>
      <p className="text-center text-sm mb-4" style={{ color: T.muted }}>Move your wallet to keep what you own. It is free.</p>
      <Row label="Land title" value={l ? l.titles : '…'} />
      <Row label="nIN" value={l ? Math.floor(l.nin) : '…'} />
      <Primary disabled={!online || !signer?.ready || !l} onClick={run}>Move my wallet</Primary>
      <span hidden data-testid="m1-ready">{String(!(!online || !signer?.ready || !l))}</span>
    </Frame>
  );
}
