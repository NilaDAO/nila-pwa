// The new app shell (P1): the bottom tab bar instead of the cards. Shown in Stellar mode (a moved wallet)
// and to leaders who chose "New Nila". Today's cards stay for Polygon wallets (StellarGate).
// Tabs are kept in the URL hash (#/assets …) so the phone's back button works.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { getMoveStatus, requestMoveNin } from '../move/api';
import { useLegacyBalances } from '../move/hooks';
import { useStellarConfig } from '../stellar/hooks';
import A1, { resetA1Scroll } from './A1';
import { keepLowOnTab } from './useSheetDrag';
import CropPlanFlow from '../plan/CropPlanFlow';
import LeaderPlans from '../plan/LeaderApprove';
import { LeaderLoan, MemberScan } from '../loan/LoanScreens';
import CashDesk from '../loan/CashDesk';
import WalletQr from './WalletQr';
import UsdcAsset from './UsdcAsset';
import LandTitle from './LandTitle';
import Investment from '../loan/Investment';
import CashOut from '../loan/CashOut';
import Machinery from '../machine/Machinery';
import MyMachine from '../machine/MyMachine';
import { ReadyShareRows, TakeUp, rowOf, useMyShares } from '../loan/MyShares';
import MapStage from './MapStage';
import { useLeaderMap } from '../leader/unionMap';
import MapCard from './MapCard';
import { SlideBar } from '../plan/PlanResult';
import CropShare from '../loan/CropShare';
import IdCheck from '../anchor/IdCheck';
import LpOffers from '../anchor/LpOffers';
import { useLpStatus } from '../anchor/hooks';
import LeaderSettings from '../leader/LeaderSettings';
import Settings from './Settings';
import LeaderTasks from '../leader/LeaderTasks';
import Members from '../leader/Members';
import MemberStatus from '../leader/MemberStatus';
import AddMember from '../leader/AddMember';
import LeaderBorder from '../border/LeaderBorder';
import Registration, { pointsSent } from '../register/Registration';
import { BootLoading } from '../register/Boot';
import RegFrame from '../register/RegFrame';
import { TITLE_KEYS, useTitleCount } from '../register/titles';
import { demoNew } from '../register/AfterCode';
import History from '../history/History';
import BottomTabBar, { ASSISTED_TABS, LEADER_TABS, MEMBER_TABS } from './BottomTabBar';
import { C, FONT, GRADIENT, TAB_BAR_HEIGHT, loadInter } from './tokens';
import ListRow, { ListSection } from './ListRow';
import { BanknoteIcon, CropIcon } from './icons';

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

/** The leader's Harvests tab (map-centred lane, 23 Oct): the union map, Harvests filter; the tab's screens come later. */
function HarvestsMap({ go }) {
  const { map } = useLeaderMap('harvests');
  return (
    <MapCard map={map} header={{ title: 'Harvests', onBack: () => go('assets'), onSettings: () => go('settings') }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      <Later title="Harvests" step="a later step" />
    </MapCard>
  );
}

// tasks/border/<job id>[/<field>]: L2a–L4 for a leader.
const readBorder = () => window.location.hash.match(/^#\/tasks\/border\/([\w-]+)(?:\/(\d+))?/) || [];
// tasks/member[/<id>]: L14 Add a member and its #sent progress (P8).
const readMember = () => window.location.hash.match(/^#\/tasks\/member(?:\/([\w-]+))?$/);

function TasksView({ leader, go }) {
  const lp = useLpStatus();
  const shares = useMyShares().data;
  const [, borderId, field] = readBorder();
  if (leader && borderId) return <LeaderBorder key={`${borderId}/${field || ''}`} id={borderId} field={field} go={go} />;
  const member = readMember();
  if (leader && member) return <AddMember key={member[1] || 'new'} id={member[1]} go={go} />;
  if (leader) return <LeaderTasks go={go} />;
  // A2 (board Tasks): "Cash offers" for an LP, then "To do". DESIGN GAP: the board's to-do rows (use machine hours,
  // plant, invest, register trees, repay) need her plan's task list, not built yet; her crop plan row stands in.
  const isLp = lp.data?.lp && lp.data?.trustline;
  const ready = (shares || []).some((x) => x.ready);
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: 'Tasks', onBack: () => go('assets'), onSettings: () => go('settings') }}>
      {isLp && (
        <ListSection title="Cash offers">
          <ListRow first icon={BanknoteIcon} tone="new" title="Cash offers" sub="Bring or collect cash for USDC" onClick={() => go('offers')} />
        </ListSection>
      )}
      <ListSection title="To do">
        <ReadyShareRows go={go} />
        <ListRow first={!ready} icon={CropIcon} title="Your crop plan" sub="Make, check or follow your plan" onClick={() => go('crop')} />
      </ListSection>
    </MapCard>
  );
}

// DEVIATION (executive decision 21 Oct, map-central trial): the land title and her crop shares open in the Assets card
// over the map, with a ‹ asset › bar on top that steps land title → crop shares by season and area (a swipe on the card
// does the same). The hash still says which (#/land, #/cropshare/<id>): the phone's back button and links work, and a
// step replaces the entry, so back returns to the list rather than through every step.
function AssetStep({ view, children }) {
  const shares = useMyShares().data;
  const items = useMemo(() => [{ key: 'land', label: 'Land title' },
    ...[...(shares || [])].sort((a, b) => String(a.share?.from_date || '').localeCompare(String(b.share?.from_date || '')) || a.area - b.area)
      .map((x) => ({ key: `cropshare/${x.token_id}`, label: `${rowOf(x)?.name || x.crop.replace(/_/g, ' ')} · Area ${x.area}` }))], [shares]);
  const cur = view === 'land' ? 'land' : `cropshare/${readArg()}`;
  const i = items.findIndex((it) => it.key === cur);
  const step = (d) => { if (i < 0) return; window.location.replace(`#/${items[(i + d + items.length) % items.length].key}`); };
  const bar = items.length > 1 && i >= 0
    ? <SlideBar label={items[i].label} prevLabel="Previous asset" nextLabel="Next asset" onPrev={() => step(-1)} onNext={() => step(1)} />
    : undefined;
  return children({ bar, onSwipe: bar ? step : undefined });
}

/** S1 while her titles are read (22 Oct): a read that never starts (no Polygon connection or no Stellar settings) made
 *  the loader wait forever with no request open. After 20 s the console names what is missing and she is told to
 *  open the app again. */
function TitleWait({ titleCount, s }) {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 20_000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!late) return;
    console.warn('[start] still waiting for her titles:', {
      polygon: titleCount.polygon === undefined ? (titleCount.legacy?.fetchStatus === 'idle' ? 'not started (no Polygon connection or wallet)' : 'reading') : 'done',
      stellar: titleCount.stellar === undefined ? 'not done (Stellar settings or title read)' : 'done',
      evm: !!s?.evmAddress, stellarAddress: !!s?.stellarAddress,
    });
  }, [late]); // eslint-disable-line react-hooks/exhaustive-deps
  return late ? <RegFrame><p style={{ margin: 0, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Check your internet and open the app again.</p></RegFrame>
    : <BootLoading />;
}

export default function Shell({ leader }) {
  const s = useNilaSigner();
  useEffect(loadInter, []);
  // The page behind the app is the gradient's top colour, so a scroll past either end never shows a white bar.
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const was = els.map((e) => e.style.background);
    els.forEach((e) => { e.style.background = '#121212'; });
    return () => els.forEach((e, i) => { e.style.background = was[i]; });
  }, []);
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
  // Her land title on Polygon or on Stellar (src/register/titles.js) decides registration.
  const titleCount = useTitleCount(s?.evmAddress, s?.stellarAddress);
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
  // A leader is also a member (notes leader-missing): the same gate applies to her; with a title she never sees it.
  // Until her titles are known she sees the registration ground, not a flash of the tab bar.
  if (titleCount.loading) return <TitleWait titleCount={titleCount} s={s} />;
  // Registration only for a new Privy user (AfterCode, LOAN_RULES §5 20 Oct); an existing one without a title gets the app.
  // A leader who has sent her field points works in the leader app while her title waits (no R14 loop).
  if (!(leader && pointsSent(s?.evmAddress)) && (demoNew(s?.evmAddress) || (titleCount.count === 0 && s?.privyNew === true))) {
    const onTitle = () => { TITLE_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey })); go('crop'); };
    return <div style={{ minHeight: '100vh', background: C.ground }} data-testid="registration"><Registration onTitle={onTitle} /></div>;
  }

  let body;
  if (view === 'assets') {
    body = <A1 leader={leader} onTasks={() => go('tasks')} onSettings={() => go('settings')}
      onHistory={() => go('history')} onWalletQr={() => go('wallet')} onLand={() => go('land')} moveNote={moveNote}
      onNin={() => go('cashout')} onInvested={() => go('invested')} onShare={(t) => go(`cropshare/${t}`)}
      onMachinery={() => go('machinery')} onMachine={(id) => go(id ? `machine/${id}` : 'machine')} onOffers={() => go('offers')} onUsdc={() => go('usdc')}
      onTreasury={() => go('cash')} onSettle={() => go('cash/settle')} onScanLp={() => go('cash/lpscan')} onRegisterMachine={() => go('cash/machine')} />;
  } else if (view === 'settings') {
    body = leader
      ? <LeaderSettings onBack={() => go('assets')} onIdCheck={() => go('idcheck')} onIdLeader={() => go('idleader')} onOffers={() => go('offers')} />
      : <Settings onBack={() => go('assets')} onIdCheck={() => go('idcheck')} onOffers={() => go('offers')} />;
  }
  else if (view === 'history') body = <History onBack={() => go('assets')} />;
  else if (view === 'idcheck') body = <IdCheck onBack={() => go('settings')} onOffers={() => go('offers')} />;
  else if (view === 'idleader' && leader) body = <IdCheck kind="leader" onBack={() => go('settings')} onAccepted={() => go('assets')} />;
  else if (view === 'offers') body = <LpOffers onBack={() => go('assets')} />;
  // The leader app is the member app, extended (notes leader-missing): her Crop plan tab is her own plan (CP13 with
  // the leader tab bar); the union's plans to approve (L12) open from L1's To do.
  else if (view === 'crop') body = <CropPlanFlow />;
  else if (view === 'approvals' && leader) body = <LeaderPlans key={readArg() || 'one'} planId={readArg()} onBack={() => go('tasks')} />;
  else if (view === 'scan') body = <MemberScan onDone={() => go('assets')} />;
  else if (view === 'loan') body = <LeaderLoan key={readArg()} initial={readArg()} />;
  else if (view === 'cash' && leader) body = <CashDesk key={window.location.hash} initial={readArg()} />;
  else if (view === 'wallet') body = <WalletQr onBack={() => go('assets')} />;
  else if (view === 'usdc' && leader) body = <UsdcAsset onBack={() => go('assets')} />;
  else if (view === 'land') body = <AssetStep view={view}>{(p) => <LandTitle onBack={() => go('assets')} {...p} />}</AssetStep>;
  else if (view === 'invested') body = <Investment leader={leader} onBack={() => go('assets')} onPhotoCount={() => go(`cash/invest/${s?.stellarAddress}`)} onScan={() => go('scan')} />;
  // A member holds no nIN (22 Oct, desk only): A7 and its cash-out are a leader's only.
  else if (view === 'cashout' && leader) body = <CashOut onBack={() => go('assets')} />;
  else if (view === 'machinery') body = <Machinery onBack={() => go('assets')} />;
  else if (view === 'machine') body = <MyMachine key={readArg()} pick={Number(readArg()) || undefined} onBack={() => go('assets')} />;
  else if (view === 'share') body = <TakeUp key={readArg()} token={readArg()} leader={leader} onBack={() => go(`cropshare/${readArg()}`)} />;
  // A4 / A4a: her crop share, from its A1 row.
  else if (view === 'cropshare') {
    body = <AssetStep view={view}>{(p) => <CropShare key={readArg()} token={readArg()} onBack={() => go('assets')} onTakeUp={(t) => go(`share/${t}`)} {...p} />}</AssetStep>;
  }
  // A2 Tasks: for an LP the board's "Cash offers" section; the other task rows come in a later step.
  else if (view === 'tasks') body = <TasksView leader={leader} go={go} />;
  else if (view === 'members' && leader) body = readArg() ? <MemberStatus key={readArg()} id={readArg()} go={go} /> : <Members go={go} />;
  else if (view === 'harvests' && leader) body = <HarvestsMap go={go} />;
  else body = <Later title={view[0].toUpperCase() + view.slice(1)} step="a later step" />;

  // No tab is active on task, settings, history and wallet screens; a crop share (A4/A4a, and taking it up) belongs to
  // the Crop plan tab (21 Oct).
  // nIN and nIN invested (A7, A3) are Assets screens (boards MemberAssetNin, StNinWithdraw).
  const tabOf = view === 'cropshare' || view === 'share' ? 'crop' : view === 'cashout' || view === 'invested' || view === 'usdc' ? 'assets' : view;
  const active = tabs.some(([id]) => id === tabOf) ? tabOf : undefined;
  return (
    // Every non-map screen sits on the boards' gradient (executive decision 21 Oct); map screens cover it with their map.
    // The map stage lies under the shell (map-central trial): a map sheet makes the shell see-through while it is open.
    <MapStage>
      <div style={{ minHeight: '100vh', background: GRADIENT, paddingBottom: TAB_BAR_HEIGHT + 16, position: 'relative', zIndex: 1 }} data-testid="shell">
        {body}
        <BottomTabBar tabs={tabs} active={active} onSelect={(v) => { keepLowOnTab(); resetA1Scroll(); go(v); }} />
      </div>
    </MapStage>
  );
}
