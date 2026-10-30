// A2 cash offers and A7b her code, as the LP pledge (executive decision 30 Oct, replaces the swap): an LP takes the
// union's cash for a while (Collect) and her own account locks USDC worth 110% of it; she brings it back (Bring, only
// what she holds) and the USDC unlocks pro rata; her 1% fee comes off the cash she brings back. Her USDC never leaves
// her account, unless the union claims it after asking for the cash back and 7 days' notice.
// Accept = SEP-38 firm quote → SEP-24 at the trust's anchor (its own page in a frame, A3) → fx_pool.accept, fee-bumped
// by the node. The leader scans her code (A1b, Cash → Scan an LP code). Never says sell, buy or swap.
// DESIGN GAPs: "Where: Union office · <leader>" without a name (the node has no names); the board's
// "Cancel" on A7b only goes back (an LP cannot cancel an accepted offer on-chain; it lapses at expiry).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { CALL_NOTICE, CODE_TTL, U, loadSwaps, saveSwap, signedCode, useAnchorInfo, useBringUnlock, useLpStatus, useOfferQuote, useSep10Token, useUnionOffers, usdcOf } from './hooks';
import { BRING, firmQuote, openSwap, swapStatus } from './sep';

const until = (ts) => {
  const s = ts - Date.now() / 1000;
  if (s < 86400) return `within ${Math.max(1, Math.round(s / 3600))} h`;
  return `within ${Math.round(s / 86400)} days`;
};
const by = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hexBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
      <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function OfferRow({ o, onOpen }) {
  const bring = o.kind === BRING;
  const q = useOfferQuote(o.kind, o.inr);
  const un = useBringUnlock(o.inr, bring);
  const usdc = bring ? (un.data != null ? un.data.toFixed(2) : '…') : (q.data ? usdcOf(q.data.usdc) : '…');
  const sub = bring ? `Unlocks ${usdc} USDC · ${until(o.expires)}` : `Locks ${usdc} USDC · ${until(o.expires)}`;
  return <Choice sub={sub} onClick={onOpen}>{bring ? `Bring ${inr(o.inr)} back` : `Take ${inr(o.inr)}`}</Choice>;
}

/** The union's cash she holds: owed, locked, since when, and the date to bring it back by once a leader asked. */
function HeldCard({ p }) {
  const since = new Date(p.opened * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div style={{ background: C.raised, borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Union cash with you</div>
      <Row k="Cash" v={inr(p.owed)} />
      <Row k="Locked in your account" v={`${p.locked.toFixed(2)} USDC`} />
      <Row k="Since" v={since} />
      {p.calledAt != null && <p style={{ color: C.coral, margin: '4px 0 0' }}>Your leader asked for it back: bring it by {by(p.calledAt + CALL_NOTICE)}, or the union may claim your locked USDC.</p>}
    </div>
  );
}

/** A7b: her code for the leader to scan, and how far the swap is. */
export function LpCode({ swap, onBack }) {
  const s = useNilaSigner();
  const info = useAnchorInfo();
  const getToken = useSep10Token();
  const { data: cfg } = useStellarConfig();
  const [img, setImg] = useState();
  // Her code is signed with her Stellar key (offer id + time) and made again before it runs out (10 min),
  // so only the LP who accepted can show it (the offer id is public).
  const code = useQuery({ queryKey: ['anchor', 'code', swap.offer], enabled: !!s?.signHash, staleTime: (CODE_TTL - 60) * 1000,
    refetchInterval: (CODE_TTL - 60) * 1000, queryFn: () => signedCode(swap.offer, s.signHash) });
  useEffect(() => { if (code.data) QRCode.toDataURL(code.data, { width: 260, margin: 1 }).then(setImg); }, [code.data]);
  const chain = useQuery({ queryKey: ['stellar', 'offer', swap.offer], enabled: !!cfg, refetchInterval: 10_000,
    queryFn: () => readContract(cfg, 'fx_pool', 'offer', [sv.u64(swap.offer)]) });
  const sep24 = swap.sep24 || chain.data?.sep24_id;
  const st = useQuery({ queryKey: ['anchor', 'sep24', sep24], enabled: !!info.data && !!sep24 && Number(chain.data?.state) === 2,
    refetchInterval: (q) => (q.state.data?.status === 'completed' ? false : 10_000),
    queryFn: async () => swapStatus(info.data, await getToken(), sep24) });
  const state = Number(chain.data?.state);
  const bring = swap.kind === BRING;
  const done = state === 2;
  return (
    <Sheet landName="Nila" title={bring ? `Bring ${inr(swap.inr)} back` : `Take ${inr(swap.inr)}`} onBack={onBack}>
      {done ? (
        <>
          <p style={{ textAlign: 'center', fontWeight: 700 }}>{bring ? `${swap.usdc} USDC unlocked in your wallet.` : `You took the cash. ${swap.usdc} USDC stays locked in your wallet.`}</p>
          <p style={{ ...muted, textAlign: 'center' }}>{st.data?.status === 'completed' ? 'Recorded by the anchor.' : 'The anchor is recording it…'}</p>
        </>
      ) : state === 3 || state === 4 ? (
        <p style={muted}>This offer {state === 3 ? 'was cancelled by the union' : 'expired'}. Nothing moved.</p>
      ) : (
        <>
          {code.isError && <p style={{ color: C.coral }}>Your code could not be made. Go back and open it again.</p>}
          {img && <img src={img} alt="Your LP code" style={{ display: 'block', margin: '0 auto', width: 260, height: 260, background: '#fff', borderRadius: 12 }} />}
          {code.data && (
            <details style={{ margin: '8px 0', fontSize: 13 }}>
              <summary style={{ color: C.accent, fontWeight: 700 }}>No camera? Type this</summary>
              <p style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{code.data}</p>
            </details>
          )}
          {bring && swap.hand != null && <Row k="You hand over" v={inr(swap.hand)} />}
          <Row k={bring ? 'Unlocks in your account' : 'Locked in your account'} v={`${swap.usdc} USDC`} />
          <Row k="Where" v="Union office" />
          <Row k={bring ? 'Bring it by' : 'Take it by'} v={by(swap.expires)} />
          <p style={muted}>{bring ? 'Show this to your leader when you hand over the cash. Your USDC unlocks when your leader scans it.'
            : 'Show this to your leader. Your leader scans it and hands you the cash; your USDC stays in your wallet, locked until you bring the cash back.'}</p>
        </>
      )}
      <Primary onClick={onBack}>Done</Primary>
    </Sheet>
  );
}

/** A2: the union's cash offers for an LP; Accept confirms on the trust's page and accepts on-chain. */
export default function LpOffers({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const lp = useLpStatus();
  const offers = useUnionOffers();
  const info = useAnchorInfo();
  const getToken = useSep10Token();
  const tx = useSorobanTx();
  const [open, setOpen] = useState();
  const [code, setCode] = useState();
  const [error, setError] = useState();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState();   // the swap being accepted, for the code after a retry
  const me = s?.stellarAddress;
  const q = useOfferQuote(open?.kind, open?.inr || 0);
  const unlock = useBringUnlock(open?.inr || 0, open?.kind === BRING);
  const mine = (offers.data || []).filter((o) => o.state === 1 && o.lp === me);
  const owed = lp.data?.position?.owed || 0;
  // A Bring is only for an LP who holds that much of the union's cash.
  const free = (offers.data || []).filter((o) => o.state === 0 && o.expires > Date.now() / 1000 + 60 && (o.kind !== BRING || o.inr <= owed));

  const accept = async (o) => {
    setBusy(true); setError(undefined);
    try {
      const t = await getToken();
      const quote = await firmQuote(info.data, t, `stellar:${cfg.usdc_asset}`, o.kind, o.inr);
      // SEP-24 names her SEP-10 key (G…); the anchor signs the accept for her account (C…), which accept() names.
      const signed = await openSwap(info.data, t, cfg.usdc_asset, s.senderAddress || me, o.kind, o.id, quote);
      const sep24 = signed.id;
      const usdc = o.kind === BRING ? quote.buy_amount : quote.sell_amount;
      const hand = o.kind === BRING && q.data ? o.inr - Number(BigInt(q.data.fee_inr) / BigInt(U)) : null;
      const swap = { offer: o.id, sep24, quote: quote.id, kind: o.kind, inr: o.inr, usdc: Number(usdc).toFixed(2), hand, expires: o.expires, lp: me };
      saveSwap(swap);
      setPending(swap);
      const out = await tx.run({
        label: o.kind === BRING ? `Bring ${inr(o.inr)} back` : `Take ${inr(o.inr)}`,
        rows: [[o.kind === BRING ? 'Unlocks' : 'Locks', `${swap.usdc} USDC`], ['By', by(o.expires)]],
        contractName: 'fx_pool', fn: 'accept',
        args: [sv.address(me), sv.u64(o.id), sv.string(sep24), sv.string(quote.id), sv.i128(signed.usdc), sv.u64(signed.validUntil), sv.bytes(hexBytes(signed.sig))],
        invalidate: [['stellar', 'offers']],
      });
      if (out) { tx.reset(); setOpen(undefined); setCode(swap); setPending(undefined); }
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  if (tx.status !== 'idle') {
    // After "Try again" lands, Close goes to her code, not back to the offer.
    const close = () => { const ok = tx.status === 'success'; tx.reset(); if (ok && pending) { setOpen(undefined); setCode(pending); setPending(undefined); } };
    return <TxScreens tx={tx} onClose={close} onRetry={() => tx.retry()} />;
  }
  if (code) return <LpCode swap={code} onBack={() => setCode(undefined)} />;
  if (open) {
    const bring = open.kind === BRING;
    const usdc = bring ? (unlock.data != null ? unlock.data.toFixed(2) : '…') : (q.data ? usdcOf(q.data.usdc) : '…');
    const fee = bring && q.data ? Number(BigInt(q.data.fee_inr) / BigInt(U)) : 0;
    const short = !bring && lp.data && lp.data.free < Number(usdc);
    return (
      <Sheet landName="Nila" title={bring ? `Bring ${inr(open.inr)} back to the union office` : `Take ${inr(open.inr)} at the union office`} onBack={() => setOpen(undefined)}>
        {bring ? (
          <>
            <Row k="Union cash you bring back" v={inr(open.inr)} />
            <Row k={`Your fee (${q.data ? q.data.fee_bp / 100 : 1}%)`} v={q.data ? `−${inr(fee)}` : '…'} />
            <Row k="You hand over" v={q.data ? inr(open.inr - fee) : '…'} />
            <Row k="Unlocks in your account" v={`${usdc} USDC`} />
            <Row k="Bring it by" v={by(open.expires)} />
            <p style={muted}>Your leader scans your code when the cash is there. The USDC was always yours; it unlocks then.</p>
          </>
        ) : (
          <>
            <Row k="You take" v={inr(open.inr)} />
            <Row k="Locked in your account" v={`${usdc} USDC`} />
            <Row k="Take it by" v={by(open.expires)} />
            <p style={muted}>{usdc} USDC stays in your wallet, locked until you bring the cash back. If your leader asks for the cash back and it is not back within 7 days, the union may claim it.</p>
          </>
        )}
        {short && <p style={{ color: C.coral }}>You have {lp.data.free.toFixed(2)} USDC free: not enough to lock {usdc} USDC.</p>}
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setOpen(undefined)} style={{ flex: 1, height: 44, marginTop: 16, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontWeight: 700 }}>Not now</button>
          <div style={{ flex: 1 }}>
            <Primary disabled={busy || !tx.ready || !info.data || !q.data || (bring && unlock.data == null) || short} onClick={() => accept(open)}>{busy ? '…' : 'Accept'}</Primary>
          </div>
        </div>
      </Sheet>
    );
  }
  const saved = loadSwaps().filter((x) => x.lp === me);
  return (
    <Sheet landName="Nila" title="Cash offers" onBack={onBack}>
      {lp.data?.position && <HeldCard p={lp.data.position} />}
      {lp.data && lp.data.trustline && <p style={{ ...muted, textAlign: 'center' }}>Your USDC: {lp.data.free.toFixed(2)} free{lp.data.locked ? ` · ${lp.data.locked.toFixed(2)} locked` : ''}</p>}
      {mine.map((o) => {
        const sw = saved.find((x) => x.offer === o.id) || { offer: o.id, kind: o.kind, inr: o.inr, usdc: usdcOf(o.usdc), expires: o.expires };
        return <Choice key={o.id} sub={`Accepted · show your code ${until(o.expires)}`} onClick={() => setCode(sw)}>{o.kind === BRING ? `Bring ${inr(o.inr)} back` : `Take ${inr(o.inr)}`}</Choice>;
      })}
      {offers.isLoading && <p style={muted}>…</p>}
      {offers.isError && <p style={{ color: C.coral }}>Could not read the offers. Try again.</p>}
      {offers.isSuccess && !free.length && !mine.length && <p style={muted}>No cash offers from your union right now.</p>}
      {free.map((o) => <OfferRow key={o.id} o={o} onOpen={() => setOpen(o)} />)}
    </Sheet>
  );
}
