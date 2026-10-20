// A1 Assets / A1L (nila-design boards/MemberAssets-ley3; A1L = the same board with the leader flag).
// P1 shows what has a hook today: total balance (nIN), wallet chip, land title (Polygon, her titles stay
// there), nIN. Rows whose hooks come later (investment, vouchers, crop shares, union fund, cash) are
// left out until those hooks exist (design rule 3), not drawn with made-up numbers. P6 adds Machinery (her
// vouchers, A8) and Your machine (owner, A13). P9 adds USDC for an LP (lp-open/2: her USDC row). P10 (A1L): for a
// leader, the cash and LP slides and the Union rows (treasury, cash).
import { useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useLegacyBalances } from '../move/hooks';
import { useInvestment } from '../stellar/hooks';
import { ShareRows } from '../loan/MyShares';
import { typeName, useMyMachine, useVouchers } from '../machine/hooks';
import { useLpStatus } from '../anchor/hooks';
import { LeaderSlides, UnionRows } from '../leader/UnionCards';
import { C, FONT, R } from './tokens';
import { ChevronIcon, HistoryIcon, LandIcon, QrIcon, RefreshIcon, SettingsIcon } from './icons';

const inr = (n) => `₹${Math.floor(n).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');

function RoundButton({ label, onClick, children }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{
      width: 40, height: 40, borderRadius: R.round, background: C.raised, border: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text,
    }}>{children}</button>
  );
}

function Row({ icon, title, sub, value, valueSub, onClick, label }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, background: C.raised, borderRadius: 12,
      padding: '12px 16px', minHeight: 48, width: '100%', border: 0, color: C.text, textAlign: 'left',
      fontSize: 14, lineHeight: 1.5, fontFamily: FONT, cursor: onClick ? 'pointer' : 'default',
    }}>
      {icon}
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 700 }}>{title}</span>
        {sub && <span style={{ color: C.muted }}>{sub}</span>}
      </span>
      {value !== undefined
        ? <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontWeight: 700 }}>{value}</span>
          {valueSub !== undefined && <span style={{ color: C.muted }}>{valueSub}</span>}
        </span>
        : <ChevronIcon color={C.text} />}
    </button>
  );
}

const NinIcon = () => (
  <span aria-hidden="true" style={{
    width: 32, height: 32, flexShrink: 0, borderRadius: R.round, background: C.accent, color: C.ink,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
  }}>₹</span>
);

export default function A1({ leader, onTasks, onSettings, onHistory, onWalletQr, moveNote, onNin, onInvested, onShare, onMachinery, onMachine, onOffers, onTreasury, onSettle, onScanLp }) {
  const s = useNilaSigner();
  const qc = useQueryClient();
  const legacy = useLegacyBalances(s?.evmAddress);
  const nin = s?.stellarAccount?.nin?.balance ?? 0;
  const titles = legacy.data?.titles;
  const inv = useInvestment(s?.stellarAddress);
  const invested = inv.data ? Number(inv.data.invested) / 1e7 : undefined;
  const vouchers = useVouchers(s?.stellarAddress);
  const vHours = (vouchers.data || []).reduce((a, v) => a + v.left, 0);
  const vOpen = (vouchers.data || []).find((v) => v.code?.open);
  const machine = useMyMachine(s?.stellarAddress).data;
  const lp = useLpStatus().data;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['stellar', 'account'] }); qc.invalidateQueries({ queryKey: ['stellar', 'lp'] }); };

  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: '20px 8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton label="History" onClick={onHistory}><HistoryIcon color={C.text} /></RoundButton>
        <button type="button" onClick={onTasks} style={{
          height: 40, padding: '0 24px', borderRadius: R.round, background: C.raised, border: 0,
          color: C.text, fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer',
        }}>All tasks</button>
        <RoundButton label="Settings" onClick={onSettings}><SettingsIcon /></RoundButton>
      </div>

      <section style={{ textAlign: 'center', padding: '24px 0 16px' }} aria-label="Total balance">
        <div style={{ color: C.muted, fontSize: 14, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
          Total balance
          <button type="button" aria-label="Refresh balance" onClick={refresh}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex' }}><RefreshIcon color={C.muted} /></button>
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, margin: '4px 0 12px' }} data-testid="total-balance">{inr(nin + (invested || 0))}/-</div>
        <button type="button" aria-label="Show wallet QR code" onClick={onWalletQr} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px',
          borderRadius: R.button, background: C.raised, border: 0, color: C.text, fontWeight: 700,
          fontSize: 14, fontFamily: FONT, cursor: 'pointer',
        }}><QrIcon color={C.text} />{short(s?.stellarAddress)}</button>
      </section>

      {leader && <LeaderSlides onSettle={onSettle} onScanLp={onScanLp} />}

      <section aria-label="Assets" style={{ background: C.ink, borderRadius: R.card, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Assets</h2>
        {leader && <UnionRows Row={Row} Icon={NinIcon} onTreasury={onTreasury} onSettle={onSettle} />}
        {leader && <span style={{ fontWeight: 700, color: C.muted }}>Yours</span>}
        <Row label="Open land title" icon={<LandIcon />} title="Land title" sub="Digital twin of your farm"
          value={titles ?? '…'} valueSub="—" />
        <Row label="Open nIN" icon={<NinIcon />} title="nIN" value={Math.floor(nin)} valueSub={inr(nin)} onClick={onNin} />
        {invested !== undefined && (
          <Row label="Open nIN invested" icon={<NinIcon />} title="nIN invested" sub={inv.data.locked > 0 ? `Locked ${inr(Number(inv.data.locked) / 1e7)} · what you owe` : 'Union investment'}
            value={Math.floor(invested)} valueSub={inr(invested)} onClick={onInvested} />
        )}
        {!leader && <ShareRows onOpen={onShare} />}
        {vouchers.data?.length > 0 && (
          <Row label="Open machinery" icon={<NinIcon />} title="Machinery" sub={vOpen ? `1 open code · ${Math.max(0, Math.floor((vOpen.code.expires - Date.now() / 1000) / 3600))} h left` : 'Voucher · in machine hours'}
            value={`${vHours} h`} valueSub="" onClick={onMachinery} />
        )}
        {machine && (
          <Row label="Open your machine" icon={<NinIcon />} title="Your machine" sub={`${typeName(machine.machine_type)} · ${!machine.confirmed ? 'confirm it' : machine.on_hold ? 'on hold' : 'available'}`} onClick={onMachine} />
        )}
        {lp?.trustline && (
          <Row label="Open USDC" icon={<NinIcon />} title="USDC" sub="For cash offers as an LP" value={lp.usdc.toFixed(2)} valueSub="" onClick={onOffers} />
        )}
        {moveNote && <p style={{ color: C.muted, fontSize: 14, margin: '4px 0 0' }} role="note">{moveNote}</p>}
      </section>
    </div>
  );
}
