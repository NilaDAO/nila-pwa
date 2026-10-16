// The new app shell (P1): the bottom tab bar instead of the cards. Shown in Stellar mode (a moved wallet)
// and to leaders who chose "New Nila". Today's cards stay for Polygon wallets (StellarGate).
// Tabs are kept in the URL hash (#/assets …) so the phone's back button works.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { getMoveStatus, requestMoveNin } from '../move/api';
import { useLegacyBalances } from '../move/hooks';
import { useStellarConfig } from '../stellar/hooks';
import { deleteAllItems } from '../utils/db';
import A1 from './A1';
import CropPlanFlow from '../plan/CropPlanFlow';
import BottomTabBar, { ASSISTED_TABS, LEADER_TABS, MEMBER_TABS } from './BottomTabBar';
import { C, FONT, R, TAB_BAR_HEIGHT, loadInter } from './tokens';

const MOVE = {
  waiting: 'Your nIN from the old network arrives after your union confirms your land title.',
  pending: 'Your nIN from the old network is on its way.', burned: 'Your nIN from the old network is on its way.',
  stuck: 'Your nIN from the old network is delayed.', partial: 'Part of your nIN from the old network arrived.',
  failed: 'Your nIN from the old network did not arrive.',
};

const readTab = () => (window.location.hash.match(/^#\/(\w+)/) || [])[1];
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

function Settings({ onBack }) {
  const logout = async () => { await deleteAllItems(); window.location.reload(); };
  return (
    <div style={{ padding: 16, fontFamily: FONT, color: C.text }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0 }}>← Back</button>
      <h1 style={{ fontSize: 16, fontWeight: 700 }}>Settings</h1>
      <button type="button" onClick={logout} style={{
        width: '100%', height: 44, borderRadius: R.button, background: C.raised, color: C.text, border: 0,
        fontWeight: 700, fontFamily: FONT,
      }}>Log out</button>
    </div>
  );
}

export default function Shell({ leader }) {
  const s = useNilaSigner();
  useEffect(loadInter, []);
  const tabs = leader ? LEADER_TABS : assisted() ? ASSISTED_TABS : MEMBER_TABS;
  const [view, setView] = useState(() => readTab() || 'assets');
  useEffect(() => {
    const on = () => setView(readTab() || 'assets');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (v) => { window.location.hash = `#/${v}`; };
  const move = useQuery({ queryKey: ['stellar', 'move', s?.evmAddress], enabled: !!s?.evmAddress && !leader,
    queryFn: () => getMoveStatus(s.evmAddress), refetchInterval: 30_000 });

  // Her nIN move was refused before anything was burned: she can ask again (moved from StellarHome).
  const { data: cfg } = useStellarConfig();
  const legacy = useLegacyBalances(s?.evmAddress);
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

  let body;
  if (view === 'assets') {
    body = <A1 leader={leader} onTasks={() => go('tasks')} onSettings={() => go('settings')}
      onHistory={() => go('history')} onWalletQr={() => go('wallet')} moveNote={moveNote} />;
  } else if (view === 'settings') body = <Settings onBack={() => go('assets')} />;
  else if (view === 'crop') body = <CropPlanFlow />;
  else if (view === 'scan') body = <Later title="Scan" step="P5" />;
  else if (view === 'tasks') body = <Later title="Tasks" step={leader ? 'the leader steps' : 'P5'} />;
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
