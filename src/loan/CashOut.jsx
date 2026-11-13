// A7 nIN (board MemberAssetNin; a leader, and a member who holds nIN: a machine owner's income) → Collect (executive
// decision 24 Oct, LOAN_RULES "Two withdrawals"): her phone shows a QR with her signed authorization to burn X nIN
// (fx_pool.cash_out_signed, deskCode.js); at the union office the leader hands over the cash, scans it (Tasks → Scan
// a member QR, 4 Nov: the only way a machine owner takes nIN income as cash) and submits; her nIN is burned and the rupees leave cash at hand. Nothing moves until the leader scans;
// an unused QR simply expires (~48 h). No Send, no escrow, no code.
// The code cash-out from before 24 Oct (request_cash_out / reclaim_cash_out, `nila:cash:` codes) was removed
// (executive decision 4 Nov).
import DeskCard from '../shell/DeskCard';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, server, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Primary, inr, muted } from '../plan/ui';
import { C } from '../shell/tokens';
import { Loading } from '../register/Boot';
import { useFxRate } from '../shell/UsdcAsset';
import AssetSwapLayout, { AssetForm, SwapTarget, money } from '../shell/AssetSwapLayout';
import { useBringRoom, useLpStatus } from '../anchor/hooks';
import { usePost } from '../anchor/LeaderLp';
import { BRING } from '../anchor/sep';
import { AssetScreen, Card, CardTitle, KV, MarkCircle, QrCircle, Secondary, Stepper, useOnline, when } from './AssetParts';
import { deskClaim, readDeskCode, signDeskCode } from './deskCode';
import { ta } from '../machine/hooks';

const NIN = 10_000_000n;
const fmt = (n) => Math.floor(n).toLocaleString('en-IN');

/** His signed nIN cash-out QR for the leader (NILA:N, 4 Nov). */
export function DeskQr({ title, rows, qr, until, onBack }) {
  const [img, setImg] = useState();
  useEffect(() => { if (qr) QRCode.toDataURL(qr, { width: 400, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [qr]);
  return (
    <AssetScreen title={title} onBack={onBack} note="Go to the union office and ask for the cash.">
      <Card label="Your cash QR">
        <QrCircle img={img} alt="Your cash QR" />
        <p style={{ ...muted, textAlign: 'center', color: C.gold, margin: 0 }}>Let your leader scan this only after you have received the cash.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}
          <KV k="Valid until" v={when(until)} />
        </div>
        <Secondary onClick={onBack}>Done</Secondary>
      </Card>
    </AssetScreen>
  );
}

const SWITCH = [['cash', 'Cash out'], ['swap', 'Swap']];

export default function CashOut({ onBack, kycOnly }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const online = useOnline();
  const me = s?.stellarAddress;
  const maxScan = useQuery({ queryKey: ['stellar', 'maxScan'], enabled: !!cfg,
    queryFn: () => readContract(cfg, 'fx_pool', 'max_scan', []) });
  const nin = Math.floor(s?.stellarAccount?.nin?.balance ?? 0);
  const max = maxScan.data != null ? Math.min(nin, Number(BigInt(maxScan.data) / NIN)) : 0;
  const [amount, setAmount] = useState(1000);
  const lp = useLpStatus().data;
  // The swap (G2, executive decision 4 Nov): a leader, or a member (self mode) whose identity is checked and who holds
  // a title in the union; fx_pool takes her smart account as `leader` and the union her account names.
  const canSwap = !!lp?.idChecked && !!lp?.trustline && (!kycOnly || lp.member);
  const union = s?.stellarAccount?.union || cfg?.union;
  const [mode, setPick] = useState('cash');
  const [swapAmt, setSwapAmt] = useState(0);
  const rate = useFxRate().data;
  // N4 (executive decision 4 Nov): fx_pool caps a swap at max_scan (nIN, per swap) and pays USDC only from the union's
  // leader-swap bucket (leader_swap_usdc, USDC), so the swap is capped at the lower of the two, in nIN at today's rate.
  const bucket = useQuery({ queryKey: ['stellar', 'leaderSwapUsdc', union], enabled: !!cfg && canSwap && !!union,
    queryFn: () => readContract(cfg, 'fx_pool', 'leader_swap_usdc', [sv.address(union)]) });
  const bucketNin = bucket.data != null && rate ? Math.floor((Number(BigInt(bucket.data)) / Number(NIN)) * rate) : null;
  const swapLimit = maxScan.data != null && bucketNin != null ? Math.min(Number(BigInt(maxScan.data) / NIN), bucketNin) : null;
  const swapMax = swapLimit != null ? Math.max(0, Math.min(nin, swapLimit)) : 0;
  const pick = canSwap ? mode : 'cash';
  const [desk, setDesk] = useState();      // her signed QR on screen: { qr, until, amount }
  const [error, setError] = useState();

  const collect = async (amt) => {
    setError(undefined);
    // His own signed QR (NILA:N, 4 Nov): only an ID-checked self-mode member holds nIN, so no help QR and no session;
    // the leader's Scan a member QR reads it and pays out (HandOver). His account goes in the QR (not derived from the
    // key: after a recovery it no longer follows from it).
    try { setDesk({ ...(await signDeskCode({ cfg, account: me, signer: s.senderAddress, signHash: s.signHash, amount: BigInt(amt) * NIN })), amount: amt }); } catch (e) { setError(e.message); }
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />;
  if (!s?.stellarAccount || !cfg) return <Loading />;
  // A member without the anchor's identity check does not handle nIN (24 Oct): nothing to show here.
  if (kycOnly && lp && !lp.idChecked) {
    return (
      <AssetScreen title="nIN" onBack={onBack} note="nIN needs an identity check first. Ask your leader.">
        <Card label="nIN"><p style={{ ...muted, margin: 0 }}>Your identity is not checked yet, so nIN is not available to you.</p></Card>
      </AssetScreen>
    );
  }
  if (desk) return <DeskQr title={`${inr(desk.amount)} in cash`} rows={[['You get', `₹${fmt(desk.amount)} in cash`], ['nIN', `${fmt(desk.amount)} burned when paid`]]} qr={desk.qr} until={desk.until} onBack={() => setDesk(undefined)} />;

  const a = max < 1 ? 0 : Math.max(1, Math.min(amount, max));   // nothing to cash out: 0, and the button is off
  const sa = Math.max(0, Math.min(swapAmt, swapMax));
  const swap = () => tx.run({
    label: `Swap ${sa} nIN to USDC`, rows: [['You give', `${sa} nIN`], ['You get about', `${money(rate ? sa / rate : 0)} USDC`]],
    contractName: 'fx_pool', fn: 'swap_nin_to_usdc',
    args: [sv.address(me), sv.address(union), sv.i128(BigInt(sa) * NIN)],
    invalidate: [['stellar', 'account'], ['stellar', 'lp']],
  });
  // The same layout as A9 (22 Oct): asset card, then one card with Cash out | Swap (the swap for a leader, or a member
  // since 4 Nov, whose identity is checked and who has a USDC account), then the note.
  const form = pick === 'swap' ? (
    <AssetForm to={<SwapTarget title="Nila swap · your USDC" rate={rate ? `1 USDC = ${money(rate)} nIN` : 'Rate not available now'} />}
      amount={<Stepper value={sa} set={setSwapAmt} step={100} min={0} max={swapMax} unit="nIN" label="nIN to swap" />}
      rows={[['Limit', swapLimit == null ? '…' : bucketNin < 1 ? 'No swap possible now: the union holds no USDC for it' : `Up to ₹${fmt(swapLimit)} today`],
        ['You get about', rate && sa ? `${money(sa / rate)} USDC` : '—'], ['Fee', 'None'], ['Left after', `${fmt(nin - sa)} nIN`]]}
      button={<Primary disabled={!tx.ready || !rate || sa < 1} onClick={swap}>{sa < 1 ? 'Enter an amount' : 'Swap to USDC'}</Primary>} />
  ) : (
    <AssetForm
      amount={<Stepper value={a} set={setAmount} min={max < 1 ? 0 : 1} max={max} unit="nIN" label="nIN to cash out" />}
      rows={[['You get', `₹${fmt(a)} in cash`, C.accent], ['Where', 'Union office']]}
      button={online
        ? <Primary disabled={!s?.ready || maxScan.data == null || max < 1} onClick={() => collect(a)}>Collect</Primary>
        : <Secondary disabled>Collecting needs a connection</Secondary>} />
  );
  return (
    <AssetSwapLayout onBack={onBack} icon={<MarkCircle />} name="nIN" sub="Worth ₹1 each" amount={`${fmt(nin)} nIN`} value={`₹${fmt(nin)}`}
      switchLabel="Cash out or swap" options={canSwap ? SWITCH : null} tab={pick} onTab={setPick}
      note={online ? (error || 'Collect it in cash at the union office. Your leader scans your QR, and the same nIN is burned.')
        : `You are offline. Balance from today, ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`}>
      {!canSwap && <CardTitle>Cash out</CardTitle>}
      {form}
    </AssetSwapLayout>
  );
}

/** Leader: Tasks → Scan a member QR (executive decision 4 Nov): his signed nIN cash-out QR (NILA:N, deskCode.js) or,
 *  from a self-mode member (G9, 4 Nov), her signed withdrawal (NILA:W, fund_core.claim_junior_cash) or crop agreement
 *  (NILA:L, fund_core.draw_loan with her amounts),
 *  read by StartHelp, opens "Hand over ₹X to <name>"; one confirm submits fx_pool.cash_out_signed with this leader as
 *  the source (own XLM) and his signed entry for the account in the QR. A payout is booked against the office's cash
 *  at hand (25 Oct), so a short office cannot pay: the gap goes to the union's LPs as a Bring, once per QR (fx_pool
 *  adds it to an open Bring no LP has accepted), at most what the union's USDC can serve (useBringRoom). */
export function HandOver({ text, nameOf, onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [got, setGot] = useState();        // { kind, member, inr, amount | token, cash, hours, exp, entry }
  const [error, setError] = useState();
  const desk = useQuery({ queryKey: ['stellar', 'deskRoom', 'payout', cfg?.union, got?.member, got?.exp], enabled: !!cfg && !!got,
    staleTime: 10_000, refetchInterval: 15_000,
    queryFn: async () => Number(BigInt(await readContract(cfg, 'fx_pool', 'cash_at_hand', [sv.address(cfg.union)]) || 0n) / BigInt(NIN)) });
  const bringRoom = useBringRoom().data || 0;
  const gap = got && desk.data != null && got.inr > desk.data ? Math.min(Math.ceil(got.inr - desk.data), bringRoom) : 0;
  const bring = usePost();
  const asking = useRef('');
  useEffect(() => {
    if (!gap || !cfg?.anchor_url || !bring.tx.ready) return;
    const k = `nila.bring.payout.${got.member}.${got.exp}`;
    let asked = 0;
    try { asked = Number(localStorage.getItem(k) || 0); } catch { /* private mode */ }
    if (gap <= asked || asking.current === k) return;
    asking.current = k;
    bring.post(BRING, gap - asked).then((out) => {
      if (out) { try { localStorage.setItem(k, String(gap)); } catch { /* private mode */ } bring.tx.reset(); }
      asking.current = '';
    });
  }, [gap, cfg?.anchor_url, bring.tx.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        const c = readDeskCode(cfg, text);
        if ((await server(cfg).getLatestLedger()).sequence >= c.exp) throw new Error('This QR has expired. The member makes a new one.');
        if (c.kind === 'W') {
          const claim = await deskClaim(cfg, c.member);
          if (claim.shares <= 0n) {
            throw new Error(claim.pendingFrom ? `The withdrawal is ready from about ${new Date(claim.pendingFrom * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Do not pay it yet.`
              : 'No withdrawal to collect. The member asks for one on their phone (Union investment → Withdraw).');
          }
          setGot({ ...c, inr: Math.floor(claim.inr) });
        } else setGot({ ...c, inr: Number((c.kind === 'L' ? c.cash : c.amount) / NIN) });
      } catch (e) { setError(e.message); }
    })();
  }, [cfg, text]);
  const who = got ? nameOf?.(got.member) || `${got.member.slice(0, 4)}…${got.member.slice(-4)}` : '';
  const rows = got ? [['Hand over', `${inr(got.inr)} in cash`], ...(got.kind === 'L' && got.hours ? [['Machine vouchers', `${ta(got.hours)} tractor acres`]] : []), ['To', who]] : [];
  const pay = () => tx.run({ label: `Hand over ${inr(got.inr)} to ${who}`, rows, auth: [got.entry],
    ...(got.kind === 'N' ? { contractName: 'fx_pool', fn: 'cash_out_signed',
      args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.address(got.member), sv.i128(got.amount)] }
      : got.kind === 'W' ? { contractName: 'fund_core', fn: 'claim_junior_cash',
        args: [sv.address(cfg.union), sv.address(got.member), sv.address(s.stellarAddress), sv.i128(0n)] }
        : { contractName: 'fund_core', fn: 'draw_loan',
          args: [sv.address(cfg.union), sv.address(got.member), sv.bytes32(got.token), sv.i128(got.cash), sv.u32(got.hours)] }),
    invalidate: [['stellar', 'account'], ['stellar', 'unionCash'], ['stellar', 'investment'], ['oracle', 'shares'], ['stellar', 'unionChecks']] });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  if (bring.tx.status === 'pending' || bring.tx.status === 'failed') return <TxScreens tx={bring.tx} onClose={() => bring.tx.reset()} onRetry={() => bring.tx.retry()} />;
  if (!cfg || (!got && !error)) return <Loading />;
  return (
    <DeskCard title="Pay out cash" onBack={onBack}>
      {got ? (
        <>
          <p style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '8px 0' }}>{`Hand over ${inr(got.inr)} to ${who}`}</p>
          <p style={{ ...muted, textAlign: 'center' }}>{got.kind === 'N' ? 'Their nIN, burned when you confirm' : got.kind === 'W' ? 'Their union investment withdrawal'
            : `Their crop agreement${got.hours ? `, with ${ta(got.hours)} tractor acres of machine vouchers` : ''}`}</p>
          {gap > 0 ? (
            <p style={{ color: C.coral, textAlign: 'center' }}>
              {`Not enough cash at the office: ${inr(gap)} short. ${cfg.anchor_url ? `Your LPs are asked to bring ${inr(gap)}; pay out once it is here.` : 'Pay out once it is here.'}`}
            </p>
          ) : <p style={{ color: C.gold, textAlign: 'center' }}>Confirm only once you have handed over the cash.</p>}
          <Primary disabled={!tx.ready || gap > 0 || desk.data == null} onClick={pay}>Cash handed over</Primary>
        </>
      ) : <p style={{ color: C.coral }}>{error}</p>}
    </DeskCard>
  );
}
