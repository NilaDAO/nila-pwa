// Stellar mode (P3): both apps ship in one build, and the start decides (16 Oct).
// - A member's Polygon wallet ('137') with an open Polygon loan: "Repay my loan" opens today's app;
//   the choice comes back at every start until the loan is closed.
// - A member's Polygon wallet without one: only the move (M1–M4), no skip.
// - A union leader ('137'): at every start, today's app (the Polygon cash desk for old loans) or the
//   new Nila on Stellar; the leader's chain stays Polygon until the union's old loans are closed.
// - A moved wallet ('stellar'): Stellar mode (never today's Polygon app).
// "Every start" is a cold start: sessionStorage clears when the app is closed from the task switcher.
// Loaded only with Privy on; otherwise the app is unchanged.
import { useState } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import { useNilaSigner } from '../wallet/signer';
import MoveFlow, { LeaderStart } from './MoveFlow';
import StellarHome from './StellarHome';
import { STELLAR_CHAIN } from './hooks';

const MODE = 'nila.start'; // this start only: 'old' (today's app) or 'new' (Stellar, leaders)
const readMode = () => { try { return sessionStorage.getItem(MODE); } catch { return null; } };

export default function StellarGate({ children }) {
  const { db } = useDataContext();
  const signer = useNilaSigner();
  const [mode, setMode] = useState(readMode);
  const choose = (m) => { try { sessionStorage.setItem(MODE, m); } catch { /* private mode */ } setMode(m); };

  if (db?.chain === STELLAR_CHAIN) return signer ? <StellarHome /> : <div className="p-4 text-sm">…</div>;
  if (!signer || db?.chain !== '137') return children;
  if (mode === 'old') return children;
  if (db?.union?.leader) {
    if (mode === 'new') return <StellarHome leader />;
    return <LeaderStart onOld={() => choose('old')} onNew={() => { signer.stellarSetup?.run(); choose('new'); }} />;
  }
  return <MoveFlow onMoved={() => window.location.reload()} onRepay={() => choose('old')} />;
}
