// A9 (board MemberAssetUsdc #leader): the leader's USDC, read only. The top card as the board (USDC tile, Digital US
// dollar, her balance, Receive → her wallet QR); opened from A1L's USDC row, which is locked until her identity check.
// DESIGN GAP: the board's Send / Swap card (contacts, amount, FX quote) is not built: Stellar has no leader swap
// (fx_pool swaps only through LP offers) and the union contact list has no source yet; no rupee rate either.
import MapCard from './MapCard';
import { useLpStatus, useUsdcTrustline } from '../anchor/hooks';
import { Notice, Primary } from '../plan/ui';
import { UsdcTile } from './icons';
import { C, FONT, R, SHADOW, TAB_BAR_HEIGHT } from './tokens';

const card = { background: C.ink, borderRadius: 24, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box' };

export default function UsdcAsset({ onBack, onReceive }) {
  const lp = useLpStatus().data;
  const trust = useUsdcTrustline();
  const usdc = lp ? (lp.usdc || 0).toFixed(2) : '…';
  // Her identity is checked (K1), so the node sponsors her USDC trustline; until it exists she holds no USDC.
  const noLine = lp && lp.idChecked && !lp.trustline;
  return (
    <MapCard style={{ padding: '0 8px', fontFamily: FONT, color: C.text, minHeight: `calc(100dvh - ${TAB_BAR_HEIGHT + 16}px)`, display: 'flex', flexDirection: 'column', gap: 24 }}
      header={{ title: '', onBack, onSettings: () => { window.location.hash = '#/settings'; } }}>
      <section aria-label="USDC" style={card}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 24px', transform: 'scale(2.2)', transformOrigin: 'center' }}><UsdcTile /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 28 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>USDC</span>
            <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>Digital US dollar</span>
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{usdc}</span>
        </div>
        {noLine && (
          <>
            <Primary disabled={trust.isPending} onClick={() => trust.mutate()}>{trust.isPending ? 'Opening your USDC account…' : 'Open your USDC account'}</Primary>
            {trust.isError && <p style={{ color: C.coral, fontSize: 14 }}>{trust.error.message}</p>}
          </>
        )}
        <button type="button" onClick={onReceive} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 44,
          marginTop: 16, border: 0, borderRadius: R.button, background: 'none', color: C.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
          Receive
        </button>
      </section>
      <section style={{ ...card, paddingTop: 10, paddingBottom: 10 }}>
        <Notice kind="info">Worth US dollars, so its rupee value moves with the exchange rate.</Notice>
        <Notice kind="info" title="Send and swap come later">Sending USDC and swapping it to nIN are not on Stellar yet.</Notice>
      </section>
    </MapCard>
  );
}
