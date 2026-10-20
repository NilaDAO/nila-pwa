// Stellar mode (P3): both apps ship in one build, and the start decides (16 Oct).
// - A member's Polygon wallet ('137') with an open Polygon loan: "Repay my loan" opens today's app;
//   the choice comes back at every start until the loan is closed.
// - A member's Polygon wallet without one: only the move (M1–M4), no skip.
// - A union leader ('137'): at every start, today's app (the Polygon cash desk for old loans) or the
//   new Nila on Stellar; the leader's chain stays Polygon until the union's old loans are closed.
// - A moved wallet ('stellar'): Stellar mode (never today's Polygon app).
// "Every start" is a cold start: sessionStorage clears when the app is closed from the task switcher.
// Loaded only with Privy on; otherwise the app is unchanged.
import { useEffect, useState } from 'react';
import { useDataContext } from '../utils/NavigationContext';
import { useNilaSigner } from '../wallet/signer';
import MoveFlow, { LeaderStart } from './MoveFlow';
import Shell from '../shell/Shell';
import { STELLAR_CHAIN } from './hooks';

// This start only, per wallet: 'old' (today's app) or 'new' (Stellar, leaders).
const modeKey = (addr) => `nila.start:${(addr || '').toLowerCase()}`;
const readMode = (addr) => { try { return sessionStorage.getItem(modeKey(addr)); } catch { return null; } };

/** A moved wallet waits for its signer; after 20 s it says what to do. */
function Holding() {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 20_000); return () => clearTimeout(t); }, []);
  return <div className="p-4 text-sm">{late ? 'Check your internet and open the app again.' : '…'}</div>;
}

export default function StellarGate({ children }) {
  const { db } = useDataContext();
  const signer = useNilaSigner();
  const addr = db?.address;
  const [mode, setMode] = useState(() => readMode(addr));
  useEffect(() => { setMode(readMode(addr)); }, [addr]);
  const choose = (m) => { try { sessionStorage.setItem(modeKey(addr), m); } catch { /* private mode */ } setMode(m); };

  // A Stellar wallet: a union leader (Init union.leader, set at R9 from the Polygon RolesRegistry) gets the leader app.
  if (db?.chain === STELLAR_CHAIN) return signer ? <Shell leader={Boolean(db?.union?.leader)} /> : <Holding />;
  if (!signer || db?.chain !== '137') return children;
  if (mode === 'old') return children;
  if (db?.union?.leader) {
    if (mode === 'new') return <Shell leader />;
    return <LeaderStart onOld={() => choose('old')} onNew={() => { signer.stellarSetup?.run(); choose('new'); }} />;
  }
  return <MoveFlow onMoved={() => window.location.reload()} onRepay={() => choose('old')} />;
}
