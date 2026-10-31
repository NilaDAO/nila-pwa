// A2 cash offers and A7b her code, as LP positions (executive decision 31 Oct): every position is USDC locked until
// the LP's opposite offer closes it. Take (Collect): it first ends a Bring position (the union pays its rupees plus the
// 2% fee; that USDC goes back), the rest locks her own USDC with the union. Bring: it first ends a Collect position
// (she hands over its rupees less the fee and gets that USDC back), the rest brings the union's USDC to her wallet,
// locked. Open ended; past a 5% rate move anyone settles. The only change on her wallet: the locked part (A1).
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
import { CODE_TTL, U, loadSwaps, saveSwap, signedCode, useAnchorInfo, useLpQuote, useLpStatus, useSep10Token, useUnionOffers, usdcOf } from './hooks';
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

/** What an accept moves for her, in words (lp_quote): USDC back or locked, on her side. */
function moves(bring, q) {
  if (!q) return '…';
  const p = [];
  if (bring) {
    if (q.close) p.push(`${q.close.toFixed(2)} USDC back`);
    if (q.open) p.push(`${q.open.toFixed(2)} USDC to your wallet, locked`);
  } else {
    if (q.close) p.push(`${q.close.toFixed(2)} locked USDC back to the union`);
    if (q.open) p.push(`${q.open.toFixed(2)} USDC locked with the union`);
  }
  return p.join(' · ') || '—';
}

function OfferRow({ o, onOpen }) {
  const bring = o.kind === BRING;
  const q = useLpQuote(o.kind, o.inr);
  return <Choice sub={`${moves(bring, q.data)} · ${until(o.expires)}`} onClick={onOpen}>{bring ? `Bring ${inr(o.inr)}` : `Take ${inr(o.inr)}`}</Choice>;
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
    <Sheet landName="Nila" title={bring ? `Bring ${inr(swap.inr)}` : `Take ${inr(swap.inr)}`} onBack={onBack}>
      {done ? (
        <>
          <p style={{ textAlign: 'center', fontWeight: 700 }}>{bring ? `${swap.usdc} USDC came to your wallet.` : `You took the cash. ${swap.usdc} USDC moved for it.`}</p>
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
          <Row k="USDC that moves" v={`${swap.usdc} USDC`} />
          <Row k="Where" v="Union office" />
          <Row k={bring ? 'Bring it by' : 'Take it by'} v={by(swap.expires)} />
          <p style={muted}>{bring ? 'Show this to your leader when you hand over the cash. The USDC moves when your leader scans it.'
            : 'Show this to your leader. Your leader scans it and hands you the cash; the USDC moves then.'}</p>
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
  const q = useLpQuote(open?.kind, open?.inr || 0, !!open);
  const mine = (offers.data || []).filter((o) => o.state === 1 && o.lp === me);
  // Any LP may answer any offer (31 Oct); one accepted offer at a time (the contract).
  const free = mine.length ? [] : (offers.data || []).filter((o) => o.state === 0 && o.expires > Date.now() / 1000 + 60);

  const accept = async (o) => {
    setBusy(true); setError(undefined);
    try {
      const t = await getToken();
      const quote = await firmQuote(info.data, t, `stellar:${cfg.usdc_asset}`, o.kind, o.inr);
      // SEP-24 names her SEP-10 key (G…); the anchor signs the accept for her account (C…), which accept() names.
      const signed = await openSwap(info.data, t, cfg.usdc_asset, s.senderAddress || me, o.kind, o.id, quote);
      const sep24 = signed.id;
      const usdc = o.kind === BRING ? quote.buy_amount : quote.sell_amount;
      const hand = o.kind === BRING && q.data ? o.inr - q.data.fee : null;
      const swap = { offer: o.id, sep24, quote: quote.id, kind: o.kind, inr: o.inr, usdc: Number(usdc).toFixed(2), hand, expires: o.expires, lp: me };
      saveSwap(swap);
      setPending(swap);
      const out = await tx.run({
        label: o.kind === BRING ? `Bring ${inr(o.inr)}` : `Take ${inr(o.inr)}`,
        rows: [['USDC that moves', `${swap.usdc} USDC`], ['By', by(o.expires)]],
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
    const d = q.data;
    const fee = d ? d.fee : 0;
    const short = !bring && d && lp.data && lp.data.free < d.open;
    return (
      <Sheet landName="Nila" title={bring ? `Bring ${inr(open.inr)} to the union office` : `Take ${inr(open.inr)} at the union office`} onBack={() => setOpen(undefined)}>
        {bring ? <Row k="Cash you bring" v={inr(open.inr)} /> : <Row k="You take" v={inr(open.inr)} />}
        {d && fee > 0 && (bring
          ? <><Row k="Your fee (2%)" v={`−${inr(fee)}`} /><Row k="You hand over" v={inr(open.inr - fee)} /></>
          : <Row k="Of which your fee (2%)" v={inr(fee)} />)}
        {d && d.close > 0 && <Row k={bring ? 'Comes back to you, free' : 'Locked USDC back to the union'} v={`${d.close.toFixed(2)} USDC`} />}
        {d && d.open > 0 && <Row k={bring ? 'Comes to your wallet, locked' : 'Your USDC locked with the union'} v={`${d.open.toFixed(2)} USDC`} />}
        <Row k={bring ? 'Bring it by' : 'Take it by'} v={by(open.expires)} />
        {q.isSuccess && !d && <p style={{ color: C.coral }}>This offer cannot be taken by you now (the rate fix, or the union's USDC).</p>}
        <p style={muted}>{bring ? 'Locked USDC stays locked until you take the union\'s cash again, or the rate moves more than 5%.'
          : 'USDC locked with the union comes back when you bring cash again, or stays with the union if the rate moves more than 5%.'}</p>
        {short && <p style={{ color: C.coral }}>You have {lp.data.free.toFixed(2)} USDC free: not enough to lock {d.open.toFixed(2)} USDC.</p>}
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setOpen(undefined)} style={{ flex: 1, height: 44, marginTop: 16, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontWeight: 700 }}>Not now</button>
          <div style={{ flex: 1 }}>
            <Primary disabled={busy || !tx.ready || !info.data || !d || short} onClick={() => accept(open)}>{busy ? '…' : 'Accept'}</Primary>
          </div>
        </div>
      </Sheet>
    );
  }
  const saved = loadSwaps().filter((x) => x.lp === me);
  return (
    <Sheet landName="Nila" title="Cash offers" onBack={onBack}>
      {lp.data && lp.data.trustline && <p style={{ ...muted, textAlign: 'center' }}>Your USDC: {lp.data.free.toFixed(2)} free{lp.data.locked ? ` · ${lp.data.locked.toFixed(2)} locked` : ''}</p>}
      {mine.map((o) => {
        const sw = saved.find((x) => x.offer === o.id) || { offer: o.id, kind: o.kind, inr: o.inr, usdc: usdcOf(o.usdc), expires: o.expires };
        return <Choice key={o.id} sub={`Accepted · show your code ${until(o.expires)}`} onClick={() => setCode(sw)}>{o.kind === BRING ? `Bring ${inr(o.inr)}` : `Take ${inr(o.inr)}`}</Choice>;
      })}
      {offers.isLoading && <p style={muted}>…</p>}
      {offers.isError && <p style={{ color: C.coral }}>Could not read the offers. Try again.</p>}
      {offers.isSuccess && !free.length && !mine.length && <p style={muted}>No cash offers from your union right now.</p>}
      {free.map((o) => <OfferRow key={o.id} o={o} onOpen={() => setOpen(o)} />)}
    </Sheet>
  );
}
