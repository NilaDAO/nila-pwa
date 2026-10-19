// L11 #short (board LeaderRedeem #short): the gap goes to the union's LPs as a Bring (fx_pool.post_offer).
// The board shows the note only; the button that posts the offer is added here (DESIGN GAP: no board for it).
import { TxScreens } from '../stellar/TxStatus';
import { inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { usePost } from './LeaderLp';
import { BRING } from './sep';

export default function PostBring({ gap }) {
  const { tx, post } = usePost();
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  return (
    <>
      <p style={muted}>Your LPs get an offer to bring {inr(gap)}. The USDC of the union pays the LP when you scan the code.</p>
      <button type="button" disabled={!tx.ready} onClick={() => post(BRING, gap)} style={{
        width: '100%', height: 44, borderRadius: R.button, border: `2px solid ${C.accent}`, background: 'none', color: C.accent, fontWeight: 700,
      }}>Ask LPs to bring {inr(gap)}</button>
    </>
  );
}
