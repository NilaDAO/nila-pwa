// Recover (nila-design notes reg-recover): after R1 'Recover wallet' → R2 → R3 the wallet and its data load, and only
// what is missing is asked, in the order of a new registration:
//   R9  when this phone holds no union for this wallet (a new phone, or after Reset account),
//   R13 when no mode is stored ('nila.mode'),
//   R10 when notifications are not allowed yet.
// R5–R8 and R14 are always skipped. When her union is on the phone, R9 is not shown but its record is written again
// (Init 'union', the leader checked on the Polygon RolesRegistry), so a leader opens the leader start. Then the app:
// StellarGate decides member, leader or the move (M1 for a Polygon wallet).
import { useEffect, useState } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { useIsLeader } from '../hooks/useLoadFunds.ts';
import { ModeStep, NotifyStep, UnionStep, readUnion, saveUnionRecord, unionByPolygon } from './Registration';
import { RegLoading } from './Boot';

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
  const [step, setStep] = useState(() => (stored ? 'restore' : 'union'));

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

  if (step === 'restore') return <RegLoading />;
  if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(u) => { setRep(u.rep); after('union'); }} />;
  if (step === 'mode') return <ModeStep rep={rep} onDone={() => after('mode')} />;
  return <NotifyStep evm={evm} onDone={() => after('notify')} />;
}
