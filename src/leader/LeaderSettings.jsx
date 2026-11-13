// LS — leader settings (board LeaderSettings; no assisted mode). Your credit union (with the leader's identity
// check), union signers, contact book, voucher prices (machinery.rate per type; a signer proposes,
// 2 of 3 sign in the app), liquidity provider, notifications, account and reset — the parts shared with A11 in
// shell/SettingsParts.
// The identity-check row opens K1 #leader (22 Oct; checked = fx_pool.id_checked).
// Union signers, contact book and voucher prices (1 Nov): src/union/UnionCards.jsx. Still disabled: "Change signers"
// (an operator step); voucher factors against a market price (none: a signer proposes a price an acre instead).
import MapCard from '../shell/MapCard';
import { useStellarConfig } from '../stellar/hooks';
import { useLpStatus } from '../anchor/hooks';
import { ContactBookCard, SignersCard, VoucherPrices } from '../union/UnionCards';
import { C, FONT, R } from '../shell/tokens';
import { ChevronIcon } from '../shell/icons';
import { AccountCard, Card, CardButton, NotificationsCard, ResetCard, SwitchRow, UnionCard } from '../shell/SettingsParts';

/** The board's identity-check row inside the union card: K1 #leader; "Checked" once fx_pool.id_checked. */
// title / todo (4 Nov): the same row for her land title's Land check ("Waiting" while a sheet is pending).
export function IdentityRow({ checked, onClick, sub = 'Needed for union leaders', title = 'Identity check', todo = 'To do' }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: C.raised, borderRadius: 12,
      padding: '12px 16px', marginTop: 4, border: 0, color: C.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', fontSize: 14, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700 }}>{title}</span><span style={{ color: C.muted }}>{sub}</span>
      </span>
      {checked
        ? <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Checked</span>
        // The chip (13 Nov): on one line, with room above and below its text.
        : <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, background: 'rgba(212,166,52,0.15)', borderRadius: R.round, padding: '6px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>{todo}</span>}
      <ChevronIcon color={C.muted} />
    </button>
  );
}

export default function LeaderSettings({ onBack, onIdCheck, onIdLeader, onOffers }) {
  const { data: cfg } = useStellarConfig();
  const lp = useLpStatus();
  const isLp = !!lp.data?.lp;
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }} header={{ title: 'Settings', onBack, settings: false }}>
      <UnionCard extra={<IdentityRow checked={!!lp.data?.idChecked} onClick={onIdLeader} />} />

      <SignersCard />
      <ContactBookCard />
      <VoucherPrices />

      {cfg?.anchor_url && lp.data?.member && (
        <Card title="Liquidity provider">
          <SwitchRow title="I am also an LP" on={isLp} onClick={isLp ? undefined : onIdCheck} disabled={isLp} />
          {isLp && lp.data.trustline && <CardButton onClick={onOffers}>Cash offers</CardButton>}
        </Card>
      )}

      <NotificationsCard />
      <AccountCard />
      <ResetCard leader />
    </MapCard>
  );
}
