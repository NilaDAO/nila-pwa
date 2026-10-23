// N10 (board ConfirmLoan): what she receives and accepts, then her own signature on fund_core.draw_loan. From her
// Ready share after the leader's QR, or a leader's own share from L11 (`own`: no "asks you to confirm" line).
// `hours`: voucher units (centi tractor hours).
import { Primary, inr } from '../plan/ui';
import { C, FONT } from '../shell/tokens';
import { ScreenHeader } from '../shell/ListRow';
import { Card } from './AssetParts';
import { th } from '../machine/hooks';

const kv = (k, v) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
    <span style={{ color: C.muted }}>{k}</span><b style={{ textAlign: 'right' }}>{v}</b>
  </div>
);
const second = { width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700 };

export default function ConfirmShare({ cash, hours, name, area, own, ready, onConfirm, onCancel }) {
  return (
    <div style={{ padding: '0 8px', fontFamily: FONT, color: C.text, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ScreenHeader title="Confirm your crop share" onBack={onCancel} />
      {!own && <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Your union leader asks you to confirm</span>}
      <Card label="Your crop share" style={{ gap: 12 }}>
        {kv('Cash you receive', inr(cash))}
        {hours > 0 && kv('Machine vouchers', `${th(hours)} tractor hours`)}
        {kv('For', `${name} · Area ${area}`)}
        {kv('Repay', '3 weeks after harvest')}
      </Card>
      <Card label="Before you confirm" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}>{own ? 'Only confirm when you take the cash from the union cash box.' : 'Only confirm when you have the cash in your hand.'}</span>
      </Card>
      <Primary disabled={!ready} onClick={onConfirm}>{hours > 0 ? 'I received the cash · accept the vouchers' : 'I received the cash'}</Primary>
      <button type="button" onClick={onCancel} style={second}>Cancel</button>
    </div>
  );
}
