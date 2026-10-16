// A3 Union investment (board StNinWithdraw): invested, locked (what she owes), free, earned; withdraw =
// fund_core.request_unbond_junior (her free part, as shares), claimable 14 days later (the contract; the
// spec's "3 weeks" is replaced, 16 Oct) with claim_junior. Investing is done at the office (leader's Cash).
// DESIGN GAPs: no rate arrow (Q5), no "In a year" line, no Photo count / Cash teller on her side.
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useInvestment, useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import { C } from '../shell/tokens';

const RAY = 10n ** 27n;
const n = (v) => Number(BigInt(v ?? 0)) / 1e7;
const DAYS_14 = 14 * 86400;

export default function Investment({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const inv = useInvestment(s?.stellarAddress);
  const market = useQuery({ queryKey: ['stellar', 'fund', cfg?.union], enabled: !!cfg,
    queryFn: () => readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)]) });
  const tx = useSorobanTx();
  const p = inv.data;
  const now = Date.now() / 1000;
  const claimAt = p?.request_ts ? Number(p.request_ts) + DAYS_14 : 0;
  const run = async (fn, args, label) => tx.run({ label, rows: [['Amount', label]], contractName: 'fund_core', fn, args,
    invalidate: [['stellar', 'investment'], ['stellar', 'account'], ['stellar', 'fund']] });
  const withdraw = () => {
    const free = BigInt(p.free);
    const shares = (free * RAY) / BigInt(market.data.index);
    return run('request_unbond_junior', [sv.address(cfg.union), sv.address(s.stellarAddress), sv.i128(shares)], `Withdraw ${inr(n(p.free))}`);
  };
  const claim = () => run('claim_junior', [sv.address(cfg.union), sv.address(s.stellarAddress), sv.i128(p.claimable_shares)], 'Your withdrawal');
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); }} onRetry={() => {}} />;
  return (
    <Sheet landName="Nila" title="Union investment" onBack={onBack}>
      {!p && <p style={muted}>…</p>}
      {p && (
        <>
          <div style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
            <b>nIN invested</b>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{inr(n(p.invested))}</div>
            <div style={muted}>Earned {inr(n(p.earned))}</div>
            <div style={muted}>Locked · what you owe {inr(n(p.locked))}</div>
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Bring cash to the office</h2>
          <p style={muted}>Bring cash to your union leader at the union office. Your leader adds it to your union investment.</p>
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Withdraw</h2>
          {BigInt(p.claimable_shares) > 0n ? (
            <Primary disabled={!tx.ready} onClick={claim}>Get your withdrawal</Primary>
          ) : BigInt(p.pending_shares) > 0n ? (
            <p style={muted}>Your withdrawal is on its way: it arrives in your wallet by about {new Date(claimAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{claimAt <= now ? ' — open this page again' : ''}.</p>
          ) : (
            <>
              <p style={muted}>You can withdraw {Math.floor(n(p.free))} nIN. It arrives in your wallet in 14 days.</p>
              <Primary disabled={!tx.ready || BigInt(p.free) <= 0n || !market.data} onClick={withdraw}>Withdraw to nIN</Primary>
            </>
          )}
          <p style={muted}>What you owe stays locked in your investment. It frees up as you repay.</p>
        </>
      )}
    </Sheet>
  );
}
