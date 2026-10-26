// Existing Privy user (LOAN_RULES §5, 20 Oct: Privy decides after the code, not R1's button; src/register/AfterCode.jsx):
// the wallet and its data load, then
//   R9  only without a land title (24 Oct: the union minted her title, so its union is known; was 'always', 20 Oct),
//   R13 when no mode is stored ('nila.mode'),
//   R10 when notifications are not allowed yet.
// R5–R8 and R14 are always skipped. When her union is on the phone, R9 is not shown but its record is written again
// (Init 'union', the leader checked on the Polygon RolesRegistry), so a leader opens the leader start. Then the app:
// StellarGate decides member, leader or the move (M1 for a Polygon wallet).
import { useEffect, useRef, useState } from 'react';
import { useStellarConfig } from '../stellar/hooks';
import { useIsLeader } from '../hooks/useLoadFunds.ts';
import { ModeStep, NotifyStep, UNIONS_ONE, UnionStep, readUnion, saveUnionRecord, unionByPolygon } from './Registration';
import { useNilaSigner } from '../wallet/signer';
import { useLandTitles } from '../plan/hooks';
import { useStellarTitles } from '../stellar/hooks';
import { Loading } from './Boot';

const hasMode = () => { try { return !!localStorage.getItem('nila.mode'); } catch { return false; } };
const notifyAllowed = () => {
  try { if (localStorage.getItem('notificationPermissionOverride') === 'denied') return false; } catch { /* no storage */ }
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
};

export default function RecoverSteps({ evm, onDone }) {
  const { data: cfg } = useStellarConfig();
  const { isLeader } = useIsLeader({ address: evm });
  // isLeader answers undefined until its roles contract is loaded; the no-screen restore asks at once, so it reads the
  // current function through a ref and asks again until there is an answer (else a leader was saved as a member).
  const isLeaderRef = useRef(isLeader);
  isLeaderRef.current = isLeader;
  const [stored] = useState(() => unionByPolygon(readUnion(evm)?.polygon));
  const [rep, setRep] = useState(stored?.rep);
  // Her union is known from her land title (24 Oct): the union minted it, so a title holder skips R9 and her union is
  // written again with no screen ('restore'). Without a title (a leader without land, a title on its way) she picks it
  // on R9. One union today (UNIONS), so a title means that union; with more unions the title's union picks it.
  const s = useNilaSigner();
  const polygonTitles = useLandTitles(evm);
  const stellarTitles = useStellarTitles(s);
  const known = polygonTitles.isFetched && (stellarTitles.isFetched || !s?.stellarAddress);
  const held = (polygonTitles.data || []).length > 0 || (stellarTitles.data || []).length > 0;
  const [step, setStep] = useState();
  useEffect(() => {
    if (step || !known) return;
    if (held) setRestoreUnion(stored || UNIONS_ONE());
    setStep(held ? 'restore' : 'union');
  }, [known, held]); // eslint-disable-line react-hooks/exhaustive-deps
  const [restoreUnion, setRestoreUnion] = useState(stored);
  // Titles that do not load within 8 s: R9 as before, so a recovery never hangs.
  useEffect(() => { const t = setTimeout(() => setStep((v) => v || 'union'), 8000); return () => clearTimeout(t); }, []);

  const after = (from) => {
    const order = ['union', 'notify'];   // no R13 (26 Oct): assist mode until K1 or the Settings toggle
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
    (async () => {
      for (let i = 0; i < 16 && live; i++) {
        const leader = await saveUnionRecord((u, a) => isLeaderRef.current(u, a), restoreUnion, evm);
        if (leader !== undefined) break;
        await new Promise((ok) => setTimeout(ok, 500));
      }
    })().finally(() => { if (live) { setRep(restoreUnion?.rep); after('union'); } });
    return () => { live = false; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step || step === 'restore') return <Loading />;
  if (step === 'union') return <UnionStep union={cfg?.union} evm={evm} onDone={(u) => { setRep(u.rep); after('union'); }} />;
  if (step === 'mode') return <ModeStep rep={rep} onDone={() => after('mode')} />;
  return <NotifyStep evm={evm} onDone={() => after('notify')} />;
}
