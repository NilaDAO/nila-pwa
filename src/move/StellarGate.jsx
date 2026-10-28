// Stellar mode (P3): both apps ship in one build, and the start decides (16 Oct).
// - A member's Polygon wallet ('137') with an open Polygon loan: "Repay my loan" opens today's app;
//   the choice comes back at every start until the loan is closed.
// - A member's Polygon wallet without one: only the move (M1–M4), no skip.
// - A union leader ('137'): at every start, today's app (the Polygon cash desk for old loans) or the
//   new Nila on Stellar; the leader's chain stays Polygon until the union's old loans are closed.
// - A moved wallet ('stellar'): Stellar mode (never today's Polygon app).
// "Every start" is a cold start: sessionStorage clears when the app is closed from the task switcher.
// Loaded only with Privy on; otherwise the app is unchanged.
import { useEffect, useRef, useState } from 'react';
import { useIsLeader } from '../hooks/useLoadFunds.ts';
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

  // The leader role from the chain too (28 Oct): the Init record R9 wrote is missing after a reset or a login that
  // skips R9, which opened a leader in the member app. Asked until the roles contract answers; a yes is written back.
  const { isLeader } = useIsLeader({ address: addr });
  const isLeaderRef = useRef(isLeader);
  isLeaderRef.current = isLeader;
  const [chainLeader, setChainLeader] = useState(false);
  useEffect(() => {
    if (!addr || db?.union?.leader) return undefined;
    let live = true;
    (async () => {
      for (let i = 0; i < 20 && live; i++) {
        let r;
        try { r = await isLeaderRef.current(UNIONS_ONE().polygon, addr); } catch { r = undefined; }
        if (r !== undefined) {
          if (r && live) { setChainLeader(true); await saveUnionRecord(async () => true, UNIONS_ONE(), addr).catch(() => {}); }
          return;
        }
        await new Promise((ok) => setTimeout(ok, 500));
      }
    })();
    return () => { live = false; };
  }, [addr, db?.union?.leader]);

  // Which app: shell/start.js. A Stellar wallet's leader app: Init union.leader (R9) or the RolesRegistry now.
  const open = appToOpen({ chain: db?.chain, signer: !!signer, leader: Boolean(db?.union?.leader), mode });
  if (open === 'holding') return <Holding />;
  if (open === 'old') return children;
  if (open === 'app') return <Shell leader={Boolean(db?.union?.leader) || chainLeader} />;
  if (open === 'leaderStart') return <LeaderStart onOld={() => choose('old')} onNew={() => { signer.stellarSetup?.run(); choose('new'); }} />;
  return <MoveFlow onMoved={() => window.location.reload()} onRepay={() => choose('old')} />;
}
