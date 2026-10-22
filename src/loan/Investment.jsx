// A3 Union investment (board StNinWithdraw; member and leader alike, the leader with her tab bar): invested, earned,
// locked (what she owes); Invest = bring cash to the office (A7b #invest: her wallet QR for the leader, who counts the
// cash on C6 and records it with fx_pool.cash_scan_mint); a leader invests her own cash with Photo count (Cash → Invest,
// L5 → C6). Withdraw = fund_core.request_unbond_junior (an amount of her free part, as shares), claimable 14 days later
// (the contract; the spec's "3 weeks" is replaced, 16 Oct). A member collects it in cash at the office (22 Oct, desk only:
// fund_core.claim_junior_cash, the leader's "Pay out investment" task, she confirms by scanning the leader's code); a
// leader claims her own to her wallet with claim_junior. Assisted mode: both cards are messages. An Invest | Withdraw segmented control (component book) at the top of
// the card shows one of the two at a time (22 Oct).
// DESIGN GAPs: no union name, no rate arrow and so no "In a year" line (Q5); no "Your loan · Fully backed" row (the tree
// discount is not in Nov 7, LOAN_RULES); no leader name ("Rosalie"); Cash teller is shown as soon.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useInvestment, useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Primary, inr } from '../plan/ui';
import { C } from '../shell/tokens';
import { Loading } from '../register/Boot';
import { assisted } from './MyShares';
import Segmented from '../shell/Segmented';
import { AssetScreen, Card, KV, Line, MarkCircle, QrCircle, Secondary, Stepper } from './AssetParts';

const RAY = 10n ** 27n;
const n = (v) => Number(BigInt(v ?? 0)) / 1e7;
const DAYS_14 = 14 * 86400;
const ONE_NIN = 10_000_000n;
const fmt = (x) => Math.floor(x).toLocaleString('en-IN');
const SWITCH = [['invest', 'Invest'], ['withdraw', 'Withdraw']];
const NOTE = 'What you owe stays locked in your investment. It frees up as you repay.';
const muted = { color: C.muted, fontSize: 14, lineHeight: 1.5, margin: 0 };
const dateOf = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const ico = (d) => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const CameraIcon = () => ico(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></>);
const TellerIcon = () => ico(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4M7 10h10" /></>);

/** A7b #invest: her wallet QR for the leader, the amount she brings and her investment after it. */
function BringCash({ amount, after, address, onBack }) {
  const [img, setImg] = useState();
  useEffect(() => { if (address) QRCode.toDataURL(address, { width: 400, margin: 0 }).then(setImg); }, [address]);
  return (
    <AssetScreen title={`${inr(amount)} to invest`} onBack={onBack} note="Bring the cash to your leader. When she scans this and counts it, your investment goes up.">
      <Card label="Your wallet QR code">
        <QrCircle img={img} alt="Your wallet address QR code" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KV k="Where" v="Union office" />
          <KV k="Invested after" v={`${fmt(after)} nIN`} />
        </div>
        <Secondary onClick={onBack}>Cancel</Secondary>
      </Card>
    </AssetScreen>
  );
}

export default function Investment({ onBack, leader, onPhotoCount, onScan }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const inv = useInvestment(s?.stellarAddress);
  const market = useQuery({ queryKey: ['stellar', 'fund', cfg?.union], enabled: !!cfg,
    queryFn: () => readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)]) });
  const tx = useSorobanTx();
  const [bring, setBring] = useState(1000);
  const [out, setOut] = useState(100);
  const [showQr, setShowQr] = useState(false);
  const [pick, setPick] = useState();
  const p = inv.data;
  const now = Date.now() / 1000;
  const claimAt = p?.request_ts ? Number(p.request_ts) + DAYS_14 : 0;
  const run = async (fn, args, label) => tx.run({ label, rows: [['Amount', label]], contractName: 'fund_core', fn, args,
    invalidate: [['stellar', 'investment'], ['stellar', 'account'], ['stellar', 'fund']] });
  // Her free part moves every second while she owes (interest), so position and index are read
  // again just before the call, with a margin of 1 nIN while a loan is open (else BadShares).
  const withdraw = async (amt) => {
    const u = [sv.address(cfg.union), sv.address(s.stellarAddress)];
    const [pos, m] = await Promise.all([
      readContract(cfg, 'fund_core', 'position', u),
      readContract(cfg, 'fund_core', 'get_junior_market', [sv.address(cfg.union)]),
    ]);
    const freeNow = BigInt(pos.free) - (BigInt(pos.locked) > 0n ? ONE_NIN : 0n);
    const want = BigInt(amt) * ONE_NIN;
    const take = want < freeNow ? want : freeNow;
    if (take <= 0n) return;
    const shares = (take * RAY) / BigInt(m.index);
    return run('request_unbond_junior', [...u, sv.i128(shares)], `Withdraw ${inr(n(take))}`);
  };
  // claim_junior itself moves the pending shares to claimable after 14 days; 0 = all of them.
  const claim = () => run('claim_junior', [sv.address(cfg.union), sv.address(s.stellarAddress), sv.i128(0n)], 'Your withdrawal');
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); }} onRetry={() => tx.retry()} />;
  if (!p) return <Loading />;

  const invested = n(p.invested);
  const free = Math.max(0, Math.floor(n(p.free) - (BigInt(p.locked) > 0n ? 1 : 0)));
  const o = Math.min(out, free);
  const pending = BigInt(p?.pending_shares ?? 0) > 0n;
  const canClaim = BigInt(p?.claimable_shares ?? 0) > 0n || (pending && claimAt <= now);
  const helped = assisted() && !leader;
  const index = BigInt(market.data?.index ?? 0);
  const toCollect = n(((BigInt(p?.claimable_shares ?? 0) + (claimAt && claimAt <= now ? BigInt(p?.pending_shares ?? 0) : 0n)) * index) / RAY);
  // A withdrawal on its way or ready opens on Withdraw; otherwise Invest.
  const mode = pick ?? (pending || canClaim ? 'withdraw' : 'invest');
  if (showQr) return <BringCash amount={bring} after={invested + bring} address={s?.stellarAddress} onBack={() => setShowQr(false)} />;
  return (
    <AssetScreen title="Union investment" onBack={onBack} note={NOTE}>
      <Card label="nIN invested">
        <MarkCircle size={72} bg={C.gold} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>nIN invested</span>
            <span style={{ ...muted }}>Your union</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{fmt(invested)}</span>
            <span style={{ ...muted }}>{inr(invested)}</span>
          </span>
        </div>
        <KV k="Earned" v={`${fmt(n(p.earned))} nIN`} color={C.accent} />
        <KV k="Locked · what you owe" v={`${fmt(n(p.locked))} nIN`} />
      </Card>

      {mode === 'invest' && <Card label="Invest">
        <Segmented label="Invest or withdraw" options={SWITCH} value={mode} onChange={setPick} />
        {helped ? (
          <p style={{ ...muted, textAlign: 'center', padding: '12px 0' }}>Bring cash to your leader at the union office. She adds it to your union investment.</p>
        ) : (
          <>
            <p style={muted}>Bring cash to the office</p>
            <Stepper value={bring} set={setBring} min={0} max={10000} unit="₹" label="Rupees to invest" />
            <Line />
            <KV k="After" v={`${fmt(invested + bring)} nIN`} />
            {leader ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Secondary icon={<CameraIcon />} onClick={onPhotoCount}>Photo count</Secondary>
                <Secondary icon={<TellerIcon />} disabled>Cash teller · soon</Secondary>
              </div>
            ) : (
              <Secondary disabled={bring < 1} onClick={() => setShowQr(true)}>Bring and invest</Secondary>
            )}
          </>
        )}
      </Card>}

      {mode === 'withdraw' && <Card label="Withdraw">
        <Segmented label="Invest or withdraw" options={SWITCH} value={mode} onChange={setPick} />
        {helped ? (
          <p style={{ ...muted, textAlign: 'center', padding: '24px 0' }}>Ask your leader at the union office: you get your investment in cash.</p>
        ) : canClaim && leader ? (
          <Primary disabled={!tx.ready} onClick={claim}>Get your withdrawal</Primary>
        ) : canClaim ? (
          <>
            <KV k="Ready to collect" v={`${inr(Math.floor(toCollect))} in cash`} color={C.accent} />
            <p style={muted}>Collect it at the union office: your leader shows a code, you scan it and confirm.</p>
            {onScan && <Secondary onClick={onScan}>Scan your leader's code</Secondary>}
          </>
        ) : pending ? (
          <p style={muted}>{leader ? `Your withdrawal is on its way: it arrives in your wallet by about ${dateOf(claimAt)}.`
            : `Your withdrawal is on its way: collect it in cash at the union office from about ${dateOf(claimAt)}.`}</p>
        ) : (
          <>
            <p style={muted}>You can withdraw {fmt(free)} nIN</p>
            <Stepper value={o} set={setOut} step={25} min={0} max={free} unit="nIN" label="nIN to withdraw" />
            <KV k="You get about" v={leader ? `${fmt(o)} nIN` : `₹${fmt(o)} in cash`} />
            <p style={muted}>{leader ? `Arrives in your wallet by about ${dateOf(now + DAYS_14)}` : `Collect it in cash at the union office from about ${dateOf(now + DAYS_14)}`}</p>
            <Secondary disabled={!tx.ready || o < 1 || !market.data} onClick={() => withdraw(o)}>Withdraw</Secondary>
          </>
        )}
      </Card>}
    </AssetScreen>
  );
}
