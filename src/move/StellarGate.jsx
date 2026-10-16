// Stellar mode (P3): both apps ship in one build, and the start decides (16 Oct).
// - A Polygon wallet ('137') with an open Polygon loan: "Repay my loan" opens today's app; the
//   choice comes back at every start until the loan is closed.
// - A Polygon wallet without one: only the move (M1–M4), no skip.
// - A moved wallet ('stellar'): Stellar mode (never today's Polygon app).
// "Every start" is a cold start: sessionStorage clears when the app is closed from the task switcher.
// Loaded only with Privy on; otherwise the app is unchanged.
import { useState } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import { useNilaSigner } from '../wallet/signer';
import MoveFlow from './MoveFlow';
import StellarHome from './StellarHome';
import { STELLAR_CHAIN } from './hooks';

const REPAYING = 'nila.move.repaying'; // this start only: she chose to repay in today's app

export default function StellarGate({ children }) {
  const { db } = useDataContext();
  const signer = useNilaSigner();
  const [repaying, setRepaying] = useState(() => {
    try { return sessionStorage.getItem(REPAYING) === '1'; } catch { return false; }
  });
  if (db?.chain === STELLAR_CHAIN) return signer ? <StellarHome /> : <div className="p-4 text-sm">…</div>;
  if (!signer) return children;
  if (db?.chain === '137') {
    if (repaying) return children;
    const repay = () => {
      try { sessionStorage.setItem(REPAYING, '1'); } catch { /* private mode */ }
      setRepaying(true);
    };
    return <MoveFlow onMoved={() => window.location.reload()} onRepay={repay} />;
  }
  return children;
}
