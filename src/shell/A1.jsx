// A1 Assets / A1L (nila-design boards/MemberAssets-ley3; A1L = the same board with the leader flag).
// P1 shows what has a hook today: total balance (nIN), wallet chip, land title (Polygon, her titles stay
// there), nIN. Rows whose hooks come later (investment, vouchers, crop shares, union fund, cash) are
// left out until those hooks exist (design rule 3), not drawn with made-up numbers. P6 adds Machinery (her
// vouchers, A8) and Your machine (owner, A13). P9 adds USDC for an LP (lp-open/2: her USDC row). P10 (A1L): for a
// leader, the cash and LP slides and the Union rows (treasury, cash). P11: a member with no land title registers
// first (src/register/Registration.jsx, from the Shell), so A1 always shows her title row.
import { useEffect } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useTitleCount } from '../register/titles';
import { useInvestment } from '../stellar/hooks';
import { ShareRows, useMyShares } from '../loan/MyShares';
import { loadVoucherCode, typeName, useMyMachine, useVouchers } from '../machine/hooks';
import { useLpStatus } from '../anchor/hooks';
import { useFxRate } from './UsdcAsset';
import { UnionRows, useLeaderSlides } from '../leader/UnionCards';
import { C, FONT, R, SHADOW } from './tokens';
import { CashTile, ChevronIcon, HistoryIcon, InvestedTile, LandIcon, MachineryTile, MyMachineTile, NinTile, QrIcon, RefreshIcon, TreasuryTile, UsdcTile } from './icons';
import RoundButton, { SettingsButton } from './RoundButton';
import { StickyTop } from './ListRow';
import MessageSlider, { Title, card, memberSlides, small } from './MessageSlider';
import { Sheet } from '../plan/ui';
import { useStage } from './stageCtx';
import { homeTop, useHomeMap } from './MapStage';
import { MEMBER_TODO_ROWS, useLeaderTaskCount } from './taskCount';

// Where A1's card was left (map-central trial, 22 Oct): back from any asset screen it returns at the same scroll position
// and raised or lowered as it was. Kept for the session in memory only. A tap on the bottom bar starts it over (22 Oct).
const memory = { y: 0, low: false };
export const resetA1Scroll = () => { memory.y = 0; memory.low = false; window.scrollTo(0, 0); };

const inr = (n) => `₹${Math.floor(n).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');

// The board's tile per asset row (MemberAssets-ley3); rows drawn by other modules (UnionRows) get theirs by label.
const TILE = { 'Open union treasury': <TreasuryTile />, 'Open cash': <CashTile /> };

function Row({ icon, title, sub, value, valueSub, onClick, label, warn }) {
  icon = TILE[label] || icon;
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={!!warn} style={{
      display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: 12,
      padding: '12px 16px', minHeight: 48, width: '100%', border: 0, color: C.text, textAlign: 'left',
      fontSize: 14, lineHeight: 1.5, fontFamily: FONT, cursor: onClick ? 'pointer' : 'default',
    }}>
      {icon}
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 700 }}>{title}</span>
        {sub && <span style={{ color: C.muted }}>{sub}</span>}
        {warn && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.gold }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
            {warn}
          </span>
        )}
      </span>
      {warn ? null : value !== undefined
        ? <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontWeight: 700 }}>{value}</span>
          {valueSub !== undefined && <span style={{ color: C.muted }}>{valueSub}</span>}
        </span>
        : <ChevronIcon color={C.text} />}
    </button>
  );
}

// Section labels in the Assets card (board: 14 px, bold, muted).
const label = { fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: C.muted };

// The "All tasks" pill with its count (board: 196 px wide, the white badge inside on the right; hidden at 0).
export function TasksButton({ n, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={n ? `All tasks, ${n} to do` : 'All tasks'} style={{
      position: 'relative', width: 196, height: 40, padding: '0 40px', borderRadius: R.round, background: C.raised, border: 0, boxSizing: 'border-box',
      color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      All tasks
      {n > 0 && <span style={{ position: 'absolute', right: 8, top: 8, minWidth: 24, height: 24, padding: '0 6px', boxSizing: 'border-box', borderRadius: R.round,
        background: C.text, color: C.ink, fontSize: 14, lineHeight: '24px', textAlign: 'center' }}>{n}</span>}
    </button>
  );
}
export function LeaderTasksButton({ onClick }) { return <TasksButton n={useLeaderTaskCount()} onClick={onClick} />; }

const NinIcon = () => (
  <span aria-hidden="true" style={{
    width: 32, height: 32, flexShrink: 0, borderRadius: R.round, background: C.accent, color: C.ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
  }}>₹</span>
);

export default function A1({ leader, onTasks, onSettings, onHistory, onWalletQr, onLand, moveNote, onNin, onInvested, onShare, onMachinery, onMachine, onOffers, onUsdc, onTreasury, onSettle, onScanLp, onRegisterMachine }) {
  const s = useNilaSigner();
  const qc = useQueryClient();
  // A member never holds nIN (LOAN_RULES §5, desk only, 22 Oct): no nIN row and none in her total; leaders keep theirs.
  const nin = leader ? (s?.stellarAccount?.nin?.balance ?? 0) : 0;
  const titles = useTitleCount(s?.evmAddress, s?.stellarAddress).count;   // Polygon or Stellar (src/register/titles.js)
  const inv = useInvestment(s?.stellarAddress);
  const invested = inv.data ? Number(inv.data.invested) / 1e7 : undefined;
  const vouchers = useVouchers(s?.stellarAddress);
  const vHours = (vouchers.data || []).reduce((a, v) => a + v.left, 0);
  // Her voucher code is kept on her phone (A8a, 23 Oct): open while unused and not expired.
  const vCode = loadVoucherCode();
  const vOpen = vCode && vCode.until > Date.now() / 1000 && (vouchers.data || []).some((v) => v.token === vCode.token && v.used === vCode.used) ? vCode : null;
  const machine = useMyMachine(s?.stellarAddress).data;
  const lp = useLpStatus().data;
  // A leader's USDC in rupees at fx_pool's current rate (22 Oct); an expired rate leaves it out of the total.
  const rate = useFxRate().data;
  const usdcInr = leader && lp?.idChecked && rate ? (lp.usdc || 0) * rate : 0;
  const shares = useMyShares().data || [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ['stellar'] }); qc.invalidateQueries({ queryKey: ['oracle', 'myShares'] }); };
  const fetching = useIsFetching({ queryKey: ['stellar'] }) > 0;
  // Her open loans for the repay card (fund_core food_token loans, 7 decimals).
  const loans = shares.filter((x) => x.drawn && x.ft?.loan).map((x) => {
    const n = (v) => Number(v || 0) / 1e7;
    const l = x.ft.loan;
    return { id: x.token_id, label: x.crop, principal: n(l.principal), interest: n(l.interest_accrued) + n(l.interest_paid),
      paid: n(l.principal_paid) + n(l.interest_paid), due: Number(l.maturity_ts || 0) ? Number(l.maturity_ts) + 21 * 86400 : null };
  });
  // One slider for member and leader (22 Oct): the leader's cash and LP cards first, then her own.
  const leaderSlides = useLeaderSlides({ on: !!leader, onSettle, onScanLp, onMachine: onRegisterMachine });
  // Her machine waits for her confirmation (23 Oct): first in the slider, straight to Your machine.
  const confirmSlide = machine && !machine.confirmed ? [(
    <section key="confirm-machine" aria-label="Confirm your machine" style={card}>
      <Title Icon={MyMachineTile}>Confirm your machine</Title>
      <span style={{ ...small, color: C.muted }}>{typeName(machine.machine_type)}, registered by your union leader. Members can hire it once you confirm.</span>
      <button type="button" onClick={() => onMachine(machine.id)} style={{ height: 44, borderRadius: 12, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Confirm your machine</button>
    </section>
  )] : [];
  const slides = [...confirmSlide, ...leaderSlides, ...memberSlides({ position: inv.data, positionKnown: !!s?.stellarAddress && (inv.isSuccess || inv.isError), loans })];

  // DEVIATION (executive decision 21 Oct, map-central trial): in the map-central shell A1 is a card over the map of her
  // land (drag line, rounded top), opening high with a strip of map; History, All tasks and Settings are the card's
  // sticky header under the drag line.
  const stage = useStage();
  const top = homeTop();
  useEffect(() => {
    if (!stage) return undefined;
    const back = memory.y;
    // Her rows come in as their data loads: the position is set again once the page is long enough.
    const put = () => { if (!memory.low && back > 0) window.scrollTo(0, back); };
    put(); const t1 = setTimeout(put, 300); const t2 = setTimeout(put, 900);
    const on = () => { memory.y = window.scrollY; };
    const arm = setTimeout(() => window.addEventListener('scroll', on, { passive: true }), 950);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(arm); window.removeEventListener('scroll', on); };
  }, [stage]);
  const home = useHomeMap(onShare, window.innerHeight - top + 32);
  const buttons = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <RoundButton label="History" onClick={onHistory}><HistoryIcon color={C.text} /></RoundButton>
      {leader ? <LeaderTasksButton onClick={onTasks} /> : <TasksButton n={MEMBER_TODO_ROWS} onClick={onTasks} />}
      <SettingsButton onClick={onSettings} />
    </div>
  );
  // In the card the sections lose their own card look (they sit on the card).
  const card = stage ? { background: 'transparent', boxShadow: 'none', padding: 0, borderRadius: 0 } : {};
  const content = (
    <>
      <section aria-label="Total balance" style={{ textAlign: 'center', margin: '12px 0 16px', padding: '18px 22px', background: C.ink, borderRadius: R.card, boxShadow: SHADOW, ...card, ...(stage ? { margin: '0 0 16px' } : {}) }}>
        <div style={{ color: C.muted, fontSize: 14, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
          Total balance
          {/* The board: a 44 px hit area around the 16 px icon; it turns while the balances load. */}
          <button type="button" aria-label="Refresh balance" onClick={refresh} aria-busy={fetching}
            style={{ width: 44, height: 44, margin: -14, background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ display: 'flex', animation: fetching ? 'nila-spin 900ms linear infinite' : 'none' }}><RefreshIcon color={C.muted} /></span>
          </button>
          <style>{'@keyframes nila-spin{to{transform:rotate(360deg)}}'}</style>
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, margin: '4px 0 12px' }} data-testid="total-balance">{inr(nin + (invested || 0) + usdcInr)}/-</div>
        <button type="button" aria-label="Show wallet QR code" onClick={onWalletQr} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
          borderRadius: R.button, background: C.raised, border: 0, color: C.text, fontWeight: 700,
          fontSize: 14, fontFamily: FONT, cursor: 'pointer',
        }}><QrIcon color={C.text} />{short(s?.stellarAddress)}</button>
      </section>

      <MessageSlider slides={slides} />

      <section aria-label="Assets" style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: 22, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.5, ...card, ...(stage ? { marginTop: 16 } : {}) }}>
        <h2 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, lineHeight: 1.3, margin: 0, padding: '8px 0' }}>Assets</h2>
        {leader && <UnionRows Row={Row} Icon={NinIcon} onTreasury={onTreasury} onSettle={onSettle} />}
        {leader && <span style={label}>Yours</span>}
        <Row label="Open land title" icon={<LandIcon />} title="Land title" sub="Digital twin of your farm"
          value={titles ?? '…'} valueSub="—" onClick={onLand} />
        {leader && <Row label="Open nIN" icon={<NinTile />} title="nIN" value={Math.floor(nin)} valueSub={inr(nin)} onClick={onNin} />}
        {invested !== undefined && (
          <Row label="Open nIN invested" icon={<InvestedTile />} title="nIN invested" sub={inv.data.locked > 0 ? `Locked ${inr(Number(inv.data.locked) / 1e7)} · what you owe` : 'Union investment'}
            value={Math.floor(invested)} valueSub={inr(invested)} onClick={onInvested} />
        )}
        {/* Her own crop shares, also for a leader (a leader is also a member; A1L 'Yours'). */}
        <ShareRows onOpen={onShare} />
        {vouchers.data?.length > 0 && (
          <Row label="Open machinery" icon={<MachineryTile />} title="Machinery" sub={vOpen ? `1 open code · ${Math.max(0, Math.floor((vOpen.until - Date.now() / 1000) / 3600))} h left` : 'Voucher · in machine hours'}
            value={`${vHours} h`} valueSub="" onClick={onMachinery} />
        )}
        {/* One row per machine she owns (23 Oct), named by its type. */}
        {machine?.all.map((x) => (
          <Row key={x.id} label={`Open ${typeName(x.machine_type)}`} icon={<MyMachineTile />} title={typeName(x.machine_type)}
            sub={!x.confirmed ? 'Confirm it' : x.on_hold ? 'On hold' : 'Available'} onClick={() => onMachine(x.id)} />
        ))}
        {/* A9 (22 Oct): every leader sees the USDC row; it opens only once the anchor marked her identity checked
            (fx_pool.id_checked, K1 #leader from LS) and is locked with a warning until then. A member LP keeps her row
            to the cash offers. */}
        {leader ? (
          lp?.idChecked
            ? <Row label="Open USDC" icon={<UsdcTile />} title="USDC" sub="Digital US dollar" value={(lp.usdc || 0).toFixed(2)} valueSub={rate ? `≈ ${inr(usdcInr)}` : ""} onClick={onUsdc} />
            : <Row label="USDC, identity check needed" icon={<UsdcTile />} title="USDC" warn="Identity check (KYC) needed" />
        ) : lp?.trustline && (
          <Row label="Open USDC" icon={<UsdcTile />} title="USDC" sub="For cash offers as an LP" value={lp.usdc.toFixed(2)} valueSub="" onClick={onOffers} />
        )}
        {moveNote && <p style={{ color: C.muted, fontSize: 14, margin: '4px 0 0' }} role="note">{moveNote}</p>}
      </section>
    </>
  );
  if (stage) {
    // Her map comes with the card; before her record is read the card stands on the map stage alone.
    return <Sheet map={home.map || <span />} head={buttons} top={top} startLow={memory.low} onLowered={(v) => { memory.low = v; }}>{content}</Sheet>;
  }
  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: '8px 8px 0' }}>
      <StickyTop>{buttons}</StickyTop>
      {content}
    </div>
  );
}
