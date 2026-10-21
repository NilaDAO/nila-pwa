// Existing Privy user (LOAN_RULES §5, 20 Oct: Privy decides after the code, not R1's button; src/register/AfterCode.jsx):
// the wallet and its data load, then
//   R9  always (executive decision 20 Oct, "exists → R9"; replaces notes reg-recover's 'R9 only without a stored union'),
//   R13 when no mode is stored ('nila.mode'),
//   R10 when notifications are not allowed yet.
// R5–R8 and R14 are always skipped. When her union is on the phone, R9 is not shown but its record is written again
// (Init 'union', the leader checked on the Polygon RolesRegistry), so a leader opens the leader start. Then the app:
// StellarGate decides member, leader or the move (M1 for a Polygon wallet).
import { useEffect, useState } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { useIsLeader } from '../hooks/useLoadFunds.ts';
import { ModeStep, NotifyStep, UnionStep, readUnion, saveUnionRecord, unionByPolygon } from './Registration';
import { Loading } from './Boot';

const hasMode = () => { try { return !!localStorage.getItem('nila.mode'); } catch { return false; } };
const notifyAllowed = () => {
  try { if (localStorage.getItem('notificationPermissionOverride') === 'denied') return false; } catch { /* no storage */ }
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
};

export default function RecoverSteps({ evm, onDone }) {
  const { data: cfg } = useStellarConfig();
  const { isLeader } = useIsLeader({ address: evm });
  const [stored] = useState(() => unionByPolygon(readUnion(evm)?.polygon));
  const [rep, setRep] = useState(stored?.rep);
  // An existing Privy user always goes to R9 (LOAN_RULES §5, 20 Oct "New or existing after the code"); the stored
  // union is preselected there.
  const [step, setStep] = useState('union');

  const after = (from) => {
    const order = ['union', 'mode', 'notify'];
    for (const s of order.slice(order.indexOf(from) + 1)) {
      if (s === 'mode' && !hasMode()) return setStep('mode');
      if (s === 'notify' && !notifyAllowed()) return setStep('notify');
    }
    return onDone();
  };

  // Her union is on this phone: write its record again (leader checked now), no screen.
  useEffect(() => {
    if (step !== 'restore') return;
    let live = true;
    saveUnionRecord(isLeader, stored, evm).finally(() => { if (live) after('union'); });
    return () => { live = false; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === 'restore') return <Loading />;
  if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(u) => { setRep(u.rep); after('union'); }} />;
  if (step === 'mode') return <ModeStep rep={rep} onDone={() => after('mode')} />;
  return <NotifyStep evm={evm} onDone={() => after('notify')} />;
}
