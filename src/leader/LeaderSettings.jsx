// LS — leader settings (board LeaderSettings; no assisted mode). Your credit union (with the leader's identity
// check), union signers, contact book, voucher prices (machinery.rate per type, read-only: the union account sets
// them, 3 of 5), liquidity provider, notifications, account and reset — the parts shared with A11 in
// shell/SettingsParts.
// DESIGN GAPs, shown disabled: the leader identity check (K1 #leader; K1 is LP only); no on-chain list of the union's
// signers (roles only checks one address), so no names and no "Change signers"; the contact-book union key (show / scan
// / mismatch) needs the union-key encryption that does not exist yet (Q17); voucher factors need a market price (none):
// the rates show as set, "Propose new factors" and the seed prices (no source) are not built.
import MapCard from '../shell/MapCard';
import { useStellarConfig } from '../stellar/hooks';
import { useLpStatus } from '../anchor/hooks';
import { useRates } from '../machine/hooks';
import { C, FONT, R } from '../shell/tokens';
import { ChevronIcon } from '../shell/icons';
import { AccountCard, Card, CardButton, NotificationsCard, ResetCard, Row, SwitchRow, Text, UnionCard, btn } from '../shell/SettingsParts';

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;

/** The board's identity-check row inside the union card: K1 #leader is not built, so it is shown disabled. */
function IdentityRow() {
  return (
    <div aria-disabled="true" style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.raised, borderRadius: 12, padding: '12px 16px', marginTop: 4, opacity: 0.5 }}>
      <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', fontSize: 14, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700 }}>Identity check</span><span style={{ color: C.muted }}>Needed for union leaders</span>
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, background: 'rgba(212,166,52,0.15)', borderRadius: R.round, padding: '2px 8px' }}>To do</span>
      <ChevronIcon color={C.muted} />
    </div>
  );
}

export default function LeaderSettings({ onBack, onIdCheck, onOffers }) {
  const { data: cfg } = useStellarConfig();
  const rates = useRates();
  const lp = useLpStatus();
  const isLp = !!lp.data?.lp;
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }} header={{ title: 'Settings', onBack, settings: false }}>
      <UnionCard extra={<IdentityRow />} />

      <Card title="Union signers">
        <Text>3 of 5 must sign: a new leader, the voucher price list and a change of signers.</Text>
        <CardButton>Change signers</CardButton>
      </Card>

      <Card title="Contact book">
        <Text>Members' names and phone numbers are locked with the union key. Share it only face to face.</Text>
        <Row k="Union key" v="Not made yet" />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" disabled style={{ ...btn, flex: 1, opacity: 0.5, cursor: 'default' }}>Show key</button>
          <button type="button" disabled style={{ ...btn, flex: 1, opacity: 0.5, cursor: 'default' }}>Scan a key</button>
        </div>
      </Card>

      <Card title="Voucher prices">
        <Text>Each category follows the market price. The union sets a factor per item. New factors need the signers.</Text>
        <div style={{ height: 1, background: C.raised, margin: '4px 0' }} />
        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>Machine hours</span>
        {rates.isLoading && <Text>…</Text>}
        {(rates.data || []).map((r) => <Row key={r.type} k={r.name} v={`${inr(r.total)} /h`} />)}
        {rates.isSuccess && !rates.data.length && <Text>No machine prices set for the union yet.</Text>}
        <CardButton>Propose new factors</CardButton>
      </Card>

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
