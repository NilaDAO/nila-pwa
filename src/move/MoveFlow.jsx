// The start for a member still on Polygon (chain '137'). The self-move M1–M4 is gone (executive decision 1 Nov, as
// 24 Oct): the operator prepares the account, so a member with an open Polygon loan repays in today's app and any
// other waits for the union. Full screen, no tabs, no skip.
import { useNilaSigner } from '../wallet/signer';
import { useDataContext } from '../utils/NavigationContext';
import { useOpenPolygonLoans } from './hooks';
import FieldScene from '../register/FieldScene';

const T = { ink: '#121212', raised: '#1f2733', text: '#f1f5f9', muted: '#94a3b8', accent: '#d4cf5a', gold: '#d4a634', ground: '#8a9a2e' };

function Frame({ children, note }) {
  return (
    <div className="min-h-screen flex flex-col pb-2" style={{ background: T.ground, fontFamily: "'Inter', system-ui, sans-serif", position: 'relative', overflow: 'hidden' }}>
      <FieldScene />
      <div className="relative text-center font-bold text-lg pt-10" style={{ color: '#fff' }}>nila</div>
      <div className="relative flex justify-center py-8"><img src="/bw.svg" alt="" width="120" height="118" style={{ filter: 'invert(1)' }} /></div>
      <div className="flex-1" />
      <div className="relative mx-2 rounded-3xl p-5" style={{ background: T.ink, color: T.text }}>{children}</div>
      {note && (
        <div className="relative mx-2 mt-4 mb-2 rounded-3xl p-5 text-sm flex gap-3" style={{ background: T.ink, color: T.muted }}>
          <span aria-hidden>ⓘ</span><span>{note}</span>
        </div>
      )}
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

export default function MoveFlow({ onRepay }) {
  const signer = useNilaSigner();
  const { db } = useDataContext();
  const loans = useOpenPolygonLoans(signer?.evmAddress, db?.union?.address);

  if (!loans.known) {
    // DESIGN GAP: her Polygon loans are read before the start choice; repaying in today's app is always possible.
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
    // The start choice for a member with an open Polygon loan (16 Oct): repay in today's app first; this screen comes
    // back at every start until the loan is closed.
    return (
      <Frame note="When your loan is repaid, your union moves your wallet.">
        <div className="text-center font-bold text-lg mb-2">Nila has moved to a new network</div>
        <p className="text-center text-sm mb-4" style={{ color: T.muted }}>Repay your loan first.</p>
        <Primary onClick={onRepay}>Repay my loan</Primary>
      </Frame>
    );
  }
  // No self-move (executive decision 1 Nov, as 24 Oct): the operator prepares the account and sets the chain to
  // Stellar; the member then logs in as usual. Until then this screen says so. DESIGN GAP: no board.
  return (
    <Frame note="Questions? Ask your union leader.">
      <div className="text-center font-bold text-lg mb-2">Nila has moved to a new network</div>
      <p className="text-center text-sm" style={{ color: T.muted }}>Your union is moving your wallet. Open the app again later.</p>
    </Frame>
  );
}

/**
 * A union leader's start (executive decision, 16 Oct): while the union still has open Polygon loans,
 * every start offers today's app (the Polygon cash desk where members repay old loans) or the new Nila
 * on Stellar. The leader's chain stays Polygon; the leader's Stellar account is made on first use.
 * The leaders' own move comes once the union's old loans are closed (not offered in this version).
 * DESIGN GAP: no board.
 */
export function LeaderStart({ onOld, onNew }) {
  return (
    <Frame note="Members still repay their old loans in today's app.">
      <div className="text-center font-bold text-lg mb-2">Nila has moved to a new network</div>
      <p className="text-center text-sm mb-2" style={{ color: T.muted }}>Which do you want to open?</p>
      <Primary onClick={onNew}>New Nila</Primary>
      <button type="button" onClick={onOld} className="w-full h-11 rounded-xl font-semibold text-sm mt-2"
        style={{ background: T.raised, color: T.text }}>Old loans (today's app)</button>
    </Frame>
  );
}
