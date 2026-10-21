// After the code (R3/R4) — LOAN_RULES §5, 20 Oct "New or existing after the code (R4)": R1's two buttons are UX
// only; Privy decides. The silent Privy login (wallet/PrivyRoot.jsx) reports whether it made her user:
//   new user      → registration R5 → R8 → R9 → R13 → R10 → R14 (onNew; Shell shows Registration)
//   existing user → R9, then only what is missing of R13 / R10, then the app (onExisting; RecoverSteps)
// A new Privy user whose Polygon wallet already holds a land title cannot map fields again (one title per wallet, the
// mint refuses it), so she goes the existing way: R9, then the app (StellarGate: the move M1 for a Polygon wallet).
// While Privy has not answered, the registration ground stays (no S1 flash).
import { useEffect, useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useTitleCount } from './titles';
import RegFrame from './RegFrame';
import { DEMO_COGNITO } from '../utils/demoMode';

// Demo only: the stand-in's "new" mark for a pooled wallet (src/register/Start.jsx), never in a real build.
export const demoNew = (evm) => { if (!DEMO_COGNITO || !evm) return false; try { return sessionStorage.getItem(`nila.demoNew.${evm.toLowerCase()}`) === '1'; } catch { return false; } };
import { RegLoading } from './Boot';

export default function AfterCode({ onNew, onExisting }) {
  const s = useNilaSigner();
  const evm = s?.evmAddress;
  const titleCount = useTitleCount(evm, s?.stellarAddress);   // Polygon or Stellar
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 30_000); return () => clearTimeout(t); }, []);

  const titles = titleCount.count;
  const known = s?.privyNew !== undefined && !!evm && titles !== undefined;
  useEffect(() => {
    if (!known) return;
    if ((s.privyNew || demoNew(evm)) && titles === 0) onNew(evm);
    else onExisting(evm);
  }, [known]); // eslint-disable-line react-hooks/exhaustive-deps

  if (late && !known) {
    // DESIGN GAP: no board for a login that does not finish (as StellarGate's Holding).
    return (
      <RegFrame>
        <p style={{ margin: 0, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
          {s?.error ? `${s.error} ` : ''}Check your internet and open the app again.
        </p>
      </RegFrame>
    );
  }
  return <RegLoading />;
}
