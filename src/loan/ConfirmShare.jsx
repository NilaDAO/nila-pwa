// N10 (board ConfirmLoan): what she receives and accepts, then her own signature on fund_core.draw_loan. From her
// Ready share after the leader's QR, or a leader's own share from L11 (`own`: no "asks you to confirm" line).
// `hours`: voucher units (centi tractor hours).
import { inr } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import { Card } from './AssetParts';
import { ta } from '../machine/hooks';
import MapCard from '../shell/MapCard';
import { InfoFooter } from '../plan/ActivePlan';

const kv = (k, v) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
    <span style={{ color: C.muted }}>{k}</span><b style={{ textAlign: 'right' }}>{v}</b>
  </div>
);
const second = { width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700 };

// A map card (map-centred lane, 23 Oct): `map` the property behind it (her own by default).
export default function ConfirmShare({ cash, hours, name, area, own, forMember, more, ready, onConfirm, onCancel, map }) {
  // more (27 Oct): machine hours added to a crop agreement already taken up; no cash changes hands.
  // forMember (26 Oct, A2): a leader helping a member in a session confirms for the member, with the member there.
  return (
    <MapCard map={map} header={{ title: more ? 'Add machine work' : forMember ? 'Confirm cash handover' : 'Confirm your crop agreement', onBack: onCancel }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!own && !forMember && <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Your union leader asks you to confirm</span>}
      {/* 20 Nov: one card, as the take-up's: the amounts, then Cancel | the confirm side by side. */}
      <Card label="Your crop agreement" style={{ gap: 12 }}>
        {!more && kv('Cash you receive', inr(cash))}
        {hours > 0 && kv('Machine vouchers', `${ta(hours)} tractor acres`)}
        {kv('For', `${name} · ${area}`)}
        {kv('Repay', '3 weeks after harvest')}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...second, flex: 1, width: 'auto' }}>Cancel</button>
          <button type="button" disabled={!ready} onClick={onConfirm} style={{ ...second, flex: 1, width: 'auto', background: C.accent, color: C.ink, opacity: ready ? 1 : 0.5,
            cursor: ready ? 'pointer' : 'default' }}>
            {more ? (forMember ? 'The member accepts the machine work' : 'Accept the vouchers') : forMember ? 'Hand out cash' : hours > 0 ? 'I received the cash · accept the vouchers' : 'I received the cash'}
          </button>
        </div>
      </Card>
      {/* 20 Nov: the reminder in the info panel above the bottom bar, as the take-up's notes. */}
      {!more && <InfoFooter text={own ? 'Only confirm when you take the cash from the union cash box.' : forMember ? 'Only confirm when the member has the cash in hand.' : 'Only confirm when you have the cash in your hand.'} />}
    </MapCard>
  );
}
