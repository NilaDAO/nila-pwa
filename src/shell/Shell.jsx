// The new app shell (P1): the bottom tab bar instead of the cards. Shown in Stellar mode (a moved wallet)
// and to leaders who chose "New Nila". Today's cards stay for Polygon wallets (StellarGate).
// Tabs are kept in the URL hash (#/assets …) so the phone's back button works.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { getMoveStatus, requestMoveNin } from '../move/api';
import { useLegacyBalances } from '../move/hooks';
import { useStellarConfig } from '../stellar/hooks';
import { deleteAllItems } from '../utils/db';
import A1 from './A1';
import CropPlanFlow from '../plan/CropPlanFlow';
import LeaderPlans from '../plan/LeaderApprove';
import { LeaderLoan, MemberScan } from '../loan/LoanScreens';
import CashDesk from '../loan/CashDesk';
import WalletQr from './WalletQr';
import Investment from '../loan/Investment';
import CashOut from '../loan/CashOut';
import Machinery from '../machine/Machinery';
import MyMachine from '../machine/MyMachine';
import { TakeUp } from '../loan/MyShares';
import IdCheck from '../anchor/IdCheck';
import LpOffers from '../anchor/LpOffers';
import { useLpStatus } from '../anchor/hooks';
import LeaderSettings from '../leader/LeaderSettings';
import LeaderTasks from '../leader/LeaderTasks';
import LeaderBorder from '../border/LeaderBorder';
import Registration from '../register/Registration';
import History from '../history/History';
import BottomTabBar, { ASSISTED_TABS, LEADER_TABS, MEMBER_TABS } from './BottomTabBar';
import { C, FONT, R, TAB_BAR_HEIGHT, loadInter } from './tokens';

const MOVE = {
  waiting: 'Your nIN from the old network arrives after your union confirms your land title.',
  pending: 'Your nIN from the old network is on its way.', burned: 'Your nIN from the old network is on its way.',
  stuck: 'Your nIN from the old network is delayed.', partial: 'Part of your nIN from the old network arrived.',
  failed: 'Your nIN from the old network did not arrive.',
};

const readTab = () => (window.location.hash.match(/^#\/(\w+)/) || [])[1];
const readArg = () => (window.location.hash.match(/^#\/\w+\/(\w+)/) || [])[1];
const assisted = () => { try { return localStorage.getItem('nila.mode') === 'assist'; } catch { return false; } };

// Screens built in later steps (P4 crop plan, P5 scan and loans, leader screens). DESIGN GAP: interim.
function Later({ title, step }) {
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center', color: C.muted, fontFamily: FONT }}>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
      Coming in {step}.
    </div>
  );
}

function Settings({ onBack, onIdCheck, onOffers }) {
  const logout = async () => { await deleteAllItems(); window.location.reload(); };
  const lp = useLpStatus();
  const { data: cfg } = useStellarConfig();
  return (
    <div style={{ padding: 16, fontFamily: FONT, color: C.text }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0 }}>← Back</button>
      <h1 style={{ fontSize: 16, fontWeight: 700 }}>Settings</h1>
      {/* A11 (board Settings): only for a member with a land title in the union, and only with an anchor. */}
      {cfg?.anchor_url && lp.data?.member && (
        <section aria-label="Become an LP" style={{ background: C.raised, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{lp.data.lp ? 'You are an LP' : 'Become an LP'}</h2>
          <p style={{ color: C.muted, fontSize: 14, margin: '0 0 12px' }}>Bring or collect cash at the union office for USDC. You earn 1% on each swap.</p>
          <button type="button" onClick={lp.data.lp && lp.data.trustline ? onOffers : onIdCheck} style={{
            width: '100%', height: 44, borderRadius: R.button, background: C.accent, color: C.ink, border: 0, fontWeight: 700, fontFamily: FONT,
          }}>{lp.data.lp && lp.data.trustline ? 'Cash offers' : 'Check my identity'}</button>
        </section>
      )}
      <button type="button" onClick={logout} style={{
        width: '100%', height: 44, borderRadius: R.button, background: C.raised, color: C.text, border: 0,
        fontWeight: 700, fontFamily: FONT,
      }}>Log out</button>
    </div>
  );
}

// tasks/border/<job id>[/<field>]: L2a–L4 for a leader.
const readBorder = () => window.location.hash.match(/^#\/tasks\/border\/([\w-]+)(?:\/(\d+))?/) || [];

function TasksView({ leader, go }) {
  const lp = useLpStatus();
  const [, borderId, field] = readBorder();
  if (leader && borderId) return <LeaderBorder key={`${borderId}/${field || ''}`} id={borderId} field={field} go={go} />;
  if (leader) return <LeaderTasks go={go} />;
  if (!leader && lp.data?.lp && lp.data?.trustline) return <LpOffers onBack={() => { window.location.hash = '#/assets'; }} />;
  return <Later title="Tasks" step={leader ? 'the leader steps' : 'a later step'} />;
}

export default function Shell({ leader }) {
  const s = useNilaSigner();
  useEffect(loadInter, []);
  const tabs = leader ? LEADER_TABS : assisted() ? ASSISTED_TABS : MEMBER_TABS;
  const [view, setView] = useState(() => readTab() || 'assets');
  const [, setHash] = useState(window.location.hash);
  useEffect(() => {
    // The full hash too, so moving inside a tab (tasks → tasks/border/<id>/<field>) renders again.
    const on = () => { setView(readTab() || 'assets'); setHash(window.location.hash); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (v) => { window.location.hash = `#/${v}`; };
  const move = useQuery({ queryKey: ['stellar', 'move', s?.evmAddress], enabled: !!s?.evmAddress && !leader,
    queryFn: () => getMoveStatus(s.evmAddress), refetchInterval: 30_000 });

  // Her nIN move was refused before anything was burned: she can ask again (moved from StellarHome).
  const { data: cfg } = useStellarConfig();
  const legacy = useLegacyBalances(s?.evmAddress);
  const qc = useQueryClient();
  const [retry, setRetry] = useState();
  const again = async () => {
    setRetry('…');
    try {
      const wei = (await legacy.refetch()).data?.ninWei ?? 0n;
      if (wei > 0n) await requestMoveNin({ network: cfg.network, stellar: s.stellarAddress,
        evmAddress: s.evmAddress, amountWei: wei, signEvmMessage: s.signEvmMessage });
      setRetry(undefined); move.refetch();
    } catch (e) { setRetry(e.message); }
  };
  const state = move.data?.state;
  const moveNote = MOVE[state] && (
    <>
      {MOVE[state]}
      {(state === 'failed' || state === 'partial') && (
        <> <button type="button" onClick={again} disabled={retry === '…'}
          style={{ background: 'none', border: 0, padding: 0, color: C.accent, fontWeight: 700 }}>Try again</button></>
      )}
      {retry && retry !== '…' && <span style={{ color: C.coral }}> {retry}</span>}
    </>
  );

  // Registration (R5–R14, notes reg-recover): a member whose wallet holds no land title on Polygon registers her
  // fields first, without the tab bar; R14 ends once her title is there (r14-title-check) → the crop plan (CP1).
  if (!leader && legacy.data && legacy.data.titles === 0) {
    const onTitle = () => { qc.invalidateQueries({ queryKey: ['polygon', 'legacy'] }); go('crop'); };
    return <div style={{ minHeight: '100vh', background: C.ground }} data-testid="registration"><Registration onTitle={onTitle} /></div>;
  }

  let body;
  if (view === 'assets') {
    body = <A1 leader={leader} onTasks={() => go('tasks')} onSettings={() => go('settings')}
      onHistory={() => go('history')} onWalletQr={() => go('wallet')} moveNote={moveNote}
      onNin={() => go('cashout')} onInvested={() => go('invested')} onShare={(t) => go(`share/${t}`)}
      onMachinery={() => go('machinery')} onMachine={() => go('machine')} onOffers={() => go('offers')}
      onTreasury={() => go('cash')} onSettle={() => go('cash/settle')} onScanLp={() => go('cash/lpscan')} />;
  } else if (view === 'settings') {
    body = leader
      ? <LeaderSettings onBack={() => go('assets')} onIdCheck={() => go('idcheck')} onOffers={() => go('offers')} />
      : <Settings onBack={() => go('assets')} onIdCheck={() => go('idcheck')} onOffers={() => go('offers')} />;
  }
  else if (view === 'history') body = <History onBack={() => go('assets')} />;
  else if (view === 'idcheck') body = <IdCheck onBack={() => go('settings')} onOffers={() => go('offers')} />;
  else if (view === 'offers') body = <LpOffers onBack={() => go('assets')} />;
  else if (view === 'crop') body = leader ? <LeaderPlans /> : <CropPlanFlow />;
  else if (view === 'scan') body = <MemberScan onDone={() => go('assets')} />;
  else if (view === 'loan') body = <LeaderLoan />;
  else if (view === 'cash' && leader) body = <CashDesk key={readArg() || 'menu'} initial={readArg()} />;
  else if (view === 'wallet') body = <WalletQr onBack={() => go('assets')} />;
  else if (view === 'invested') body = <Investment onBack={() => go('assets')} />;
  else if (view === 'cashout') body = <CashOut onBack={() => go('assets')} />;
  else if (view === 'machinery') body = <Machinery onBack={() => go('assets')} />;
  else if (view === 'machine') body = <MyMachine onBack={() => go('assets')} />;
  else if (view === 'share') body = <TakeUp token={readArg()} onBack={() => go('assets')} />;
  // A2 Tasks: for an LP the board's "Cash offers" section; the other task rows come in a later step.
  else if (view === 'tasks') body = <TasksView leader={leader} go={go} />;
  else body = <Later title={view[0].toUpperCase() + view.slice(1)} step="a later step" />;

  // No tab is active on task, settings, history and wallet screens.
  const active = tabs.some(([id]) => id === view) ? view : undefined;
  return (
    <div style={{ minHeight: '100vh', background: C.ground, paddingBottom: TAB_BAR_HEIGHT + 16 }} data-testid="shell">
      {body}
      <BottomTabBar tabs={tabs} active={active} onSelect={go} />
    </div>
  );
}
