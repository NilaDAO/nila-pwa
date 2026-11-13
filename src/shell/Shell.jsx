// The new app shell (P1): the bottom tab bar instead of the cards. Shown in Stellar mode (a moved wallet)
// and to leaders who chose "New Nila". Today's cards stay for Polygon wallets (StellarGate).
// Tabs are kept in the URL hash (#/assets …) so the phone's back button works.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
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
import { LpCodeScreen, LpTaskRows } from '../anchor/LpOffers';
import MapStage from './MapStage';
import { ShellLookCtx } from './stageCtx';
import { firstTab, screenToOpen } from './start';
import { HarvestGroup, HarvestList } from '../leader/Harvests';
import MapCard from './MapCard';
import { SlideBar } from '../plan/PlanResult';
import CropShare from '../loan/CropShare';
import IdCheck from '../anchor/IdCheck';
import { useLpStatus } from '../anchor/hooks';
import LeaderSettings from '../leader/LeaderSettings';
import Settings from './Settings';
import LeaderTasks, { HandBackFor, PlanFor } from '../leader/LeaderTasks';
import Members from '../leader/Members';
import MemberStatus from '../leader/MemberStatus';
import AddMember, { KeypadPoints, LeaderOwnPoints, SmartphonePoints } from '../leader/AddMember';
import { KeypadAccounts } from '../keypad/hooks';
import LeaderBorder from '../border/LeaderBorder';
import Registration, { onboarded } from '../register/Registration';
import { BootLoading } from '../register/Boot';
import RegFrame from '../register/RegFrame';
import { useTitleCount } from '../register/titles';
import { demoNew } from '../register/AfterCode';
import History from '../history/History';
import BottomTabBar, { ASSISTED_TABS, LEADER_TABS, MEMBER_TABS } from './BottomTabBar';
import { C, FONT, GRADIENT, TAB_BAR_HEIGHT, loadInter } from './tokens';
import ListRow, { ListSection } from './ListRow';
import { CropIcon } from './icons';
import { assisted } from '../loan/MyShares';
import { usePlanClient } from '../plan/hooks';
import { useUnionMembers } from '../leader/unionMembers';

const readTab = () => (window.location.hash.match(/^#\/(\w+)/) || [])[1];
const readArg = () => (window.location.hash.match(/^#\/\w+\/(\w+)/) || [])[1];

// Screens built in later steps (P4 crop plan, P5 scan and loans, leader screens). DESIGN GAP: interim.
function Later({ title, step }) {
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center', color: C.muted, fontFamily: FONT }}>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
      Coming in {step}.
    </div>
  );
}


// tasks/border/<job id>[/<field>]: L2a–L4 for a leader.
const readBorder = () => window.location.hash.match(/^#\/tasks\/border\/([\w-]+)(?:\/(\d+|add))?/) || [];
// tasks/member[/<id>]: L14 Add a member and its #sent progress (P8).
const readMember = () => window.location.hash.match(/^#\/tasks\/member(?:\/([\w-]+))?(\/points)?$/);

/** A member's crop plan, made by the leader with the member (assist mode, 26 Oct): #/memberplan/<route>. */
function MemberPlan({ route }) {
  const api = usePlanClient();
  const s = useNilaSigner();
  const m = (useUnionMembers(api).data || []).find((x) => x.route === route);
  if (!m) return <BootLoading />;
  // The leader's own land, opened from the member list (12 Nov): their own plan, accepted by themselves, no member QR.
  const mine = (s?.stellarAddress && m.address === s.stellarAddress) || (s?.evmAddress && m.polygon && m.polygon.toLowerCase() === s.evmAddress.toLowerCase());
  if (mine) return <CropPlanFlow self />;
  // Close (a notice that cannot be finished now): back where the leader came from (Tasks or the member's G2).
  const onClose = () => { if (window.history.length > 1) window.history.back(); else window.location.hash = '#/tasks'; };
  return <CropPlanFlow forLand={{ landId: Number(m.titleId || m.lands[0]), recordHash: m.recordHash, evm: m.polygon, account: m.address, label: m.label, onClose }} />;
}

function TasksView({ leader, go }) {
  const shares = useMyShares().data;
  const [, borderId, field] = readBorder();
  if (leader && borderId) return <LeaderBorder key={`${borderId}/${field || ''}`} id={borderId} field={field} go={go} />;
  if (leader && window.location.hash.startsWith('#/tasks/planfor')) return <PlanFor go={go} />;
  if (leader && window.location.hash.startsWith('#/tasks/handback')) return <HandBackFor go={go} />;
  const member = readMember();
  if (leader && member && member[1] === 'qr' && member[2]) return <SmartphonePoints go={go} />;
  if (leader && member && member[2]) return <KeypadPoints key={member[1]} id={member[1]} go={go} />;
  if (leader && member) return <AddMember key={member[1] || 'new'} id={member[1]} go={go} />;
  if (leader) return <LeaderTasks go={go} />;
  // A2 (board Tasks): "To do" (an LP's cash offers are cards on A1 since 31 Oct). DESIGN GAP: the board's to-do rows (use machine hours,
  // plant, invest, register trees, repay) need her plan's task list, not built yet; her crop plan row stands in.
  const ready = (shares || []).some((x) => x.ready);
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: 'Tasks', onBack: () => go('assets'), onSettings: () => go('settings') }}>
      <LpTaskRows go={go} />
      <ListSection title="To do">
        <ReadyShareRows go={go} />
        <ListRow first={!ready} icon={CropIcon} title="Your crop plan" sub="Make, check or follow your plan" onClick={() => go('crop')} />
      </ListSection>
    </MapCard>
  );
}

// DEVIATION (executive decision 21 Oct, map-central trial): the land title and her crop agreements open in the Assets card
// over the map, with a ‹ asset › bar on top that steps land title → crop agreements by season and area (a swipe on the card
// does the same). The hash still says which (#/land, #/cropshare/<id>): the phone's back button and links work, and a
// step replaces the entry, so back returns to the list rather than through every step.
function AssetStep({ view, children }) {
  const shares = useMyShares().data;
  const items = useMemo(() => [{ key: 'land', label: 'Land title' },
    ...[...(shares || [])].sort((a, b) => String(a.share?.from_date || '').localeCompare(String(b.share?.from_date || '')) || a.area - b.area)
      .map((x) => ({ key: `cropshare/${x.token_id}`, label: `${rowOf(x)?.name || x.crop.replace(/_/g, ' ')} · ${x.area}` }))], [shares]);
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
    console.warn('[start] still waiting for the titles:', {
      polygon: titleCount.polygon === undefined ? (titleCount.legacy?.fetchStatus === 'idle' ? 'not started (no Polygon connection or wallet)' : 'reading') : 'done',
      stellar: titleCount.stellar === undefined ? 'not done (Stellar settings or title read)' : 'done',
      evm: !!s?.evmAddress, stellarAddress: !!s?.stellarAddress,
    });
  }, [late]); // eslint-disable-line react-hooks/exhaustive-deps
  // Names the step that stalled (8 Nov), as the console line above.
  const what = titleCount.stellar === undefined ? 'your land title' : 'your land title on Polygon';
  return late ? <RegFrame><p style={{ margin: 0, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Still waiting for: {what}. Check your internet and open the app again.</p></RegFrame>
    : <BootLoading />;
}

export default function Shell({ leader }) {
  const s = useNilaSigner();
  // What the open screens ask of the shell under them (useShellLook): no bottom padding, no gradient, taps through.
  const [looks, setLooks] = useState(() => new Map());
  const lookApi = useMemo(() => ({
    add: (id, l) => setLooks((m) => new Map(m).set(id, l)),
    remove: (id) => setLooks((m) => { const n = new Map(m); n.delete(id); return n; }),
  }), []);
  const look = [...looks.values()].reduce((a, l) => ({ flush: a.flush || l.flush, clear: a.clear || l.clear, through: a.through || l.through }), {});
  useEffect(loadInter, []);
  // The page behind the app is the gradient's top colour, so a scroll past either end never shows a white bar.
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const was = els.map((e) => e.style.background);
    els.forEach((e) => { e.style.background = '#121212'; });
    return () => els.forEach((e, i) => { e.style.background = was[i]; });
  }, []);
  // Self mode from the identity check (G3, executive decision 4 Nov; was 26 Oct, only with no mode stored): once
  // fx_pool.id_checked is true for her account she is switched to self, once per account ('nila.mode.k1.<address>'),
  // so the Settings toggle back to assist still holds afterwards.
  const idCheck = useLpStatus();
  const me = s?.stellarAddress;
  useEffect(() => {
    if (leader || !me || !idCheck.data?.idChecked) return;
    try {
      const k = `nila.mode.k1.${me}`;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, '1');
      if (localStorage.getItem('nila.mode') !== 'self') { localStorage.setItem('nila.mode', 'self'); window.location.reload(); }
    } catch { /* private mode: stays in assist mode */ }
  }, [leader, me, idCheck.data?.idChecked]);
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
  // Her land title on Polygon or on Stellar (src/register/titles.js) decides registration.
  const titleCount = useTitleCount(s?.evmAddress, s?.stellarAddress);
  // No land title (28 Oct): the app opens on the Crop plan, where the title is minted; a link to another tab stays.
  useEffect(() => {
    if (!readTab() && firstTab({ titles: titleCount }) === 'crop') window.location.hash = '#/crop';
  }, [titleCount.loading, titleCount.count]); // eslint-disable-line react-hooks/exhaustive-deps
  // The start steps end without a reload (28 Oct): the shell reads onboarded() again.
  const [, setStarted] = useState(0);

  // Until her titles are known she sees the registration ground, not a flash of the tab bar.
  // Which screen: shell/start.js (titles loading, the start steps R9 + R10 once per wallet, a tab).
  const screen = screenToOpen({ titles: titleCount, onboarded: onboarded(s?.evmAddress), demoNew: demoNew(s?.evmAddress),
    privyNew: s?.privyNew, tab: view, arg: readArg(), leader });
  if (screen === 'titleWait') return <TitleWait titleCount={titleCount} s={s} />;
  if (screen === 'start') {
    const onStarted = () => { go('crop'); setStarted((n) => n + 1); };
    return <div style={{ minHeight: '100vh', background: C.ground }} data-testid="registration"><Registration onStarted={onStarted} /></div>;
  }
  // A member never gets the field-point steps (4 Nov, G15): #/crop/register falls through to her crop plan below.

  let body;
  if (view === 'assets') {
    body = <A1 leader={leader} onTasks={() => go('tasks')} onSettings={() => go('settings')}
      onHistory={() => go('history')} onWalletQr={() => go('wallet')} onLand={() => go('land')}
      onNin={() => go('cashout')} onInvested={() => go('invested')} onShare={(t) => go(`cropshare/${t}`)}
      onMachinery={() => go('machinery')} onMachine={(id) => go(id ? `machine/${id}` : 'machine')} onOffers={() => go('assets')} onUsdc={() => go('usdc')}
      onTreasury={() => go('cash')} onSettle={() => go('cash/settle')} onScanLp={() => go('cash/lpscan')} onRegisterMachine={() => go('cash/machine')} />;
  } else if (view === 'settings') {
    body = leader
      ? <LeaderSettings onBack={() => go('assets')} onIdCheck={() => go('idcheck')} onIdLeader={() => go('idleader')} onOffers={() => go('assets')} />
      : <Settings onBack={() => go('assets')} onIdCheck={() => go('idcheck')} onOffers={() => go('assets')} />;
  }
  else if (view === 'history') body = <History onBack={() => go('assets')} />;
  else if (view === 'idcheck') body = <IdCheck onBack={() => go('settings')} onOffers={() => go('assets')} />;
  else if (view === 'idleader' && leader) body = <IdCheck kind="leader" onBack={() => go('settings')} onAccepted={() => go('assets')} />;
  // The leader app is the member app, extended (notes leader-missing): her Crop plan tab is her own plan (CP13 with
  // the leader tab bar); the union's plans to approve (L12) open from L1's To do.
  else if (view === 'crop' && leader && readArg() === 'register') body = <LeaderOwnPoints go={go} />;
  else if (view === 'crop') body = <CropPlanFlow self={leader} />;   // a leader makes their own plan (never assist)
  else if (view === 'approvals' && leader) body = <LeaderPlans key={readArg() || 'one'} planId={readArg()} onBack={() => go('tasks')} />;
  else if (view === 'scan') body = <MemberScan onDone={() => go('assets')} />;
  else if (view === 'loan') body = <LeaderLoan key={readArg()} initial={readArg()} />;
  else if (view === 'cash' && leader) body = <CashDesk key={window.location.hash} initial={readArg()} />;
  else if (view === 'wallet') body = <WalletQr onBack={() => go('assets')} leader={leader} />;
  else if (view === 'usdc') body = <UsdcAsset leader={leader} onBack={() => go('assets')} />;
  else if (view === 'lpcode') body = <LpCodeScreen key={readArg()} id={readArg()} onBack={() => go('assets')} />;
  else if (view === 'land') body = <AssetStep view={view}>{(p) => <LandTitle onBack={() => go('assets')} {...p} />}</AssetStep>;
  else if (view === 'invested') body = <Investment leader={leader} onBack={() => go('assets')} onPhotoCount={() => go(`cash/invest/${s?.stellarAddress}`)} />;
  // A member holds no nIN (22 Oct, desk only): A7 and its cash-out are a leader's only.
  // nIN for a leader, or a member whose identity the anchor checked (K1, 24 Oct); A7 then collects it in cash.
  else if (view === 'cashout') body = <CashOut onBack={() => go('assets')} kycOnly={!leader} />;
  else if (view === 'machinery') body = <Machinery onBack={() => go('assets')} />;
  else if (view === 'machine') body = <MyMachine key={readArg()} pick={Number(readArg()) || undefined} onBack={() => go('assets')} />;
  else if (view === 'share') body = <TakeUp key={readArg()} token={readArg()} leader={leader} onBack={() => go(`cropshare/${readArg()}`)} />;
  // A4 / A4a: her crop agreement, from its A1 row.
  else if (view === 'cropshare') {
    body = <AssetStep view={view}>{(p) => <CropShare key={readArg()} token={readArg()} onBack={() => go('assets')} onTakeUp={(t) => go(`share/${t}`)} {...p} />}</AssetStep>;
  }
  // A2 Tasks: the other task rows come in a later step.
  else if (view === 'tasks') body = <TasksView leader={leader} go={go} />;
  else if (view === 'members' && leader) body = readArg() ? <MemberStatus key={readArg()} id={readArg()} go={go} /> : <Members go={go} />;
  else if (view === 'memberplan' && leader) body = <MemberPlan route={readArg()} />;
  // H1 / H2 (25 Oct): the Harvests tab, and one harvest group on the map.
  else if (view === 'harvests' && leader) body = readArg() ? <HarvestGroup key={readArg()} id={readArg()} go={go} /> : <HarvestList go={go} />;
  else body = <Later title={view[0].toUpperCase() + view.slice(1)} step="a later step" />;

  // No tab is active on task, settings, history and wallet screens; a crop agreement (A4/A4a, and taking it up) belongs to
  // the Crop plan tab (21 Oct).
  // nIN and nIN invested (A7, A3) are Assets screens (boards MemberAssetNin, StNinWithdraw).
  const tabOf = view === 'cropshare' || view === 'share' ? 'crop' : view === 'cashout' || view === 'invested' || view === 'usdc' || view === 'lpcode' ? 'assets' : view;
  const active = tabs.some(([id]) => id === tabOf) ? tabOf : undefined;
  return (
    // Every non-map screen sits on the boards' gradient (executive decision 21 Oct); map screens cover it with their map.
    // The map stage lies under the shell (map-central trial): a map sheet makes the shell see-through while it is open.
    <ShellLookCtx.Provider value={lookApi}>
    <MapStage>
      <div style={{ minHeight: '100vh', background: look.clear ? 'transparent' : GRADIENT, paddingBottom: look.flush ? 0 : TAB_BAR_HEIGHT + 16,
        pointerEvents: look.through ? 'none' : undefined, position: 'relative', zIndex: 1 }} data-testid="shell">
        {/* One card per screen (24 Oct): a new screen gets a fresh card, so a header button (Tasks, Settings, History)
            opens it raised; only a bottom-bar tab keeps a lowered card down (keepLowOnTab). */}
        <Fragment key={view}>{body}</Fragment>
        {leader && <KeypadAccounts />}
        <BottomTabBar tabs={tabs} active={active} onSelect={(v) => { keepLowOnTab(); resetA1Scroll(); go(v); }} />
      </div>
    </MapStage>
    </ShellLookCtx.Provider>
  );
}
