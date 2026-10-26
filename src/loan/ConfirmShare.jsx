// N10 (board ConfirmLoan): what she receives and accepts, then her own signature on fund_core.draw_loan. From her
// Ready share after the leader's QR, or a leader's own share from L11 (`own`: no "asks you to confirm" line).
// `hours`: voucher units (centi tractor hours).
import { Primary, inr } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import { Card } from './AssetParts';
import { th } from '../machine/hooks';
import MapCard from '../shell/MapCard';

const kv = (k, v) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
    <span style={{ color: C.muted }}>{k}</span><b style={{ textAlign: 'right' }}>{v}</b>
  </div>
);
const second = { width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700 };

// A map card (map-centred lane, 23 Oct): `map` the property behind it (her own by default).
export default function ConfirmShare({ cash, hours, name, area, own, forMember, ready, onConfirm, onCancel, map }) {
  // forMember (26 Oct, A2): a leader helping a member in a session confirms for the member, with the member there.
  return (
    <MapCard map={map} header={{ title: forMember ? "Use the member's crop share" : 'Confirm your crop share', onBack: onCancel }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!own && !forMember && <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Your union leader asks you to confirm</span>}
      {forMember && <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Read the amounts to the member and confirm together</span>}
      <Card label="Your crop share" style={{ gap: 12 }}>
        {kv('Cash you receive', inr(cash))}
        {hours > 0 && kv('Machine vouchers', `${th(hours)} tractor hours`)}
        {kv('For', `${name} · Area ${area}`)}
        {kv('Repay', '3 weeks after harvest')}
      </Card>
      <Card label="Before you confirm" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}>{own ? 'Only confirm when you take the cash from the union cash box.' : forMember ? 'Only confirm when the member has the cash in hand.' : 'Only confirm when you have the cash in your hand.'}</span>
      </Card>
      <Primary disabled={!ready} onClick={onConfirm}>{forMember ? 'The member received the cash' : hours > 0 ? 'I received the cash · accept the vouchers' : 'I received the cash'}</Primary>
      <button type="button" onClick={onCancel} style={second}>Cancel</button>
    </MapCard>
  );
}
