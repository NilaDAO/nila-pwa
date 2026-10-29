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
import { useLeader, writeLeaderFlag } from '../shell/leader';
import { UNIONS_ONE, saveUnionRecord } from '../register/Registration';
import { useDataContext } from '../utils/NavigationContext';
import { useNilaSigner } from '../wallet/signer';
import MoveFlow, { LeaderStart } from './MoveFlow';
import Shell from '../shell/Shell';
import RegFrame from '../register/RegFrame';
import { BootLoading } from '../register/Boot';
import { appToOpen } from '../shell/start';

// This start only, per wallet: 'old' (today's app) or 'new' (Stellar, leaders).
const modeKey = (addr) => `nila.start:${(addr || '').toLowerCase()}`;
const readMode = (addr) => { try { return sessionStorage.getItem(modeKey(addr)); } catch { return null; } };

/** A moved wallet waits for its signer; after 20 s it says what to do. */
function Holding() {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 20_000); return () => clearTimeout(t); }, []);
  // On the registration ground, so R3 → R5 stays one flow. DESIGN GAP: the late line has no board.
  return late ? <RegFrame><p style={{ margin: 0, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Check your internet and open the app again.</p></RegFrame>
    : <BootLoading />;
}

export default function StellarGate({ children }) {
  const { db } = useDataContext();
  const signer = useNilaSigner();
  const addr = db?.address;
  const [mode, setMode] = useState(() => readMode(addr));
  useEffect(() => { setMode(readMode(addr)); }, [addr]);
  const choose = (m) => { try { sessionStorage.setItem(modeKey(addr), m); } catch { /* private mode */ } setMode(m); };

  // The leader flag: shell/leader.js (the RolesRegistry; the Init record only while it has not answered). A yes the
  // record lacks is written back with the union (as R9), a no corrects a record that says leader.
  const record = db?.union;
  const saveRecord = (l) => (record ? writeLeaderFlag(record)(l) : l ? saveUnionRecord(async () => true, UNIONS_ONE(), addr) : Promise.resolve());
  const { leader } = useLeader(record?.address || UNIONS_ONE().polygon, addr, record?.leader, saveRecord);

  // Which app: shell/start.js.
  const open = appToOpen({ chain: db?.chain, signer: !!signer, leader, mode });
  if (open === 'holding') return <Holding />;
  if (open === 'old') return children;
  if (open === 'app') return <Shell leader={leader} />;
  if (open === 'leaderStart') return <LeaderStart onOld={() => choose('old')} onNew={() => { signer.stellarSetup?.run(); choose('new'); }} />;
  return <MoveFlow onMoved={() => window.location.reload()} onRepay={() => choose('old')} />;
}
