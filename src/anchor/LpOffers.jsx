// An LP's cash offers as cards on A1's slider (executive decision 31 Oct: no Cash offers screen, no confirm sheet, no
// trust page). One card per union offer the LP can answer: what moves, and Accept. Once accepted the same card shows
// the LP's code as the standard QR (QrCircle) for the leader to scan; after the scan the card is gone and the wallet's
// USDC row shows the locked part.
// LP positions: every position is USDC locked until the LP's opposite offer ends it. Take (Collect) first ends a Bring
// position (the union pays its rupees plus the 2% fee; that USDC goes back), the rest locks the LP's own USDC with the
// union. Bring first ends a Collect position (the LP hands over its rupees less the fee and gets that USDC back), the
// rest brings the union's USDC to the LP's wallet, locked. Open ended; past a 5% rate move anyone settles.
// Accept = SEP-38 firm quote → SEP-24 at the trust's anchor, which records it and signs the accept without a page of
// its own → fx_pool.accept, fee-bumped by the node. Never says sell, buy or swap.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { inr } from '../plan/ui';
import { Title, card, small } from '../shell/MessageSlider';
import { KV, QrCircle } from '../loan/AssetParts';
import { UsdcTile } from '../shell/icons';
import { C, FONT, R } from '../shell/tokens';
import { CODE_TTL, saveSwap, signedCode, useAnchorInfo, useLpQuote, useLpStatus, useSep10Token, useUnionOffers } from './hooks';
import { BRING, firmQuote, openSwap } from './sep';

const by = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hexBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const button = { height: 44, borderRadius: R.button, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontFamily: FONT,
  fontSize: 14, cursor: 'pointer' };

/** The LP's code for the leader, made again before it runs out (10 min), so only the LP who accepted can show it. */
function OfferQr({ id }) {
  const s = useNilaSigner();
  const [img, setImg] = useState();
  const code = useQuery({ queryKey: ['anchor', 'code', id], enabled: !!s?.signHash, staleTime: (CODE_TTL - 60) * 1000,
    refetchInterval: (CODE_TTL - 60) * 1000, queryFn: () => signedCode(id, s.signHash) });
  useEffect(() => { if (code.data) QRCode.toDataURL(code.data, { width: 400, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [code.data]);
  // The code also sits on the wrapper (it is the QR's content anyway), for the leader's typed fallback and the demo check.
  return <div data-lp-code={code.data || ''}><QrCircle img={img} alt="Your LP code" /></div>;
}

function OfferCard({ o }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const lp = useLpStatus();
  const info = useAnchorInfo();
  const getToken = useSep10Token();
  const tx = useSorobanTx();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const me = s?.stellarAddress;
  const mine = o.state === 1 && o.lp === me;
  const bring = o.kind === BRING;
  const q = useLpQuote(o.kind, o.inr, !mine).data;
  const short = !bring && q && lp.data && lp.data.free < q.open;
  const accept = async () => {
    setBusy(true); setError(undefined);
    try {
      const t = await getToken();
      const quote = await firmQuote(info.data, t, `stellar:${cfg.usdc_asset}`, o.kind, o.inr);
      // SEP-24 names the LP's SEP-10 key (G…); the anchor signs the accept for the account (C…), which accept() names.
      const signed = await openSwap(info.data, t, cfg.usdc_asset, s.senderAddress || me, o.kind, o.id, quote);
      saveSwap({ offer: o.id, sep24: signed.id, quote: quote.id, kind: o.kind, inr: o.inr, expires: o.expires, lp: me });
      const out = await tx.run({
        label: bring ? `Bring ${inr(o.inr)}` : `Take ${inr(o.inr)}`,
        rows: [['USDC', `${(Number(signed.usdc) / 1e7).toFixed(2)} USDC`], ['By', by(o.expires)]],
        contractName: 'fx_pool', fn: 'accept',
        args: [sv.address(me), sv.u64(o.id), sv.string(signed.id), sv.string(quote.id), sv.i128(signed.usdc), sv.u64(signed.validUntil), sv.bytes(hexBytes(signed.sig))],
        invalidate: [['stellar', 'offers']],
      });
      if (out) tx.reset();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  if (tx.status !== 'idle') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, overflowY: 'auto', background: C.ink }}>
        <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={() => tx.retry()} />
      </div>
    );
  }
  const title = bring ? `Bring ${inr(o.inr)} to the office` : `Take ${inr(o.inr)} at the office`;
  if (mine) {
    return (
      <section aria-label="Cash offer" style={card}>
        <Title Icon={UsdcTile}>{title}</Title>
        <OfferQr id={o.id} />
        <span style={{ ...small, color: C.muted, textAlign: 'center' }}>
          {bring ? 'Hand over the cash, then let your leader scan this.' : 'Let your leader scan this, then take the cash.'} By {by(o.expires)}.
        </span>
      </section>
    );
  }
  const fee = q?.fee || 0;
  return (
    <section aria-label="Cash offer" style={card}>
      <Title Icon={UsdcTile}>{title}</Title>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q && fee > 0 && <KV k={bring ? 'You hand over (less your 2% fee)' : 'Of which your 2% fee'} v={inr(bring ? o.inr - fee : fee)} />}
        {q && q.close > 0 && <KV k={bring ? 'USDC back to you' : 'Your locked USDC back to the union'} v={q.close.toFixed(2)} />}
        {q && q.open > 0 && <KV k={bring ? 'USDC to your wallet, locked' : 'Your USDC locked with the union'} v={q.open.toFixed(2)} />}
        <KV k="By" v={by(o.expires)} />
      </div>
      {short && <span style={{ ...small, color: C.coral }}>You have {lp.data.free.toFixed(2)} USDC free: not enough.</span>}
      {error && <span style={{ ...small, color: C.coral }}>{error}</span>}
      <button type="button" disabled={busy || !tx.ready || !info.data || !q || short} onClick={accept}
        style={{ ...button, opacity: busy || !tx.ready || !q || short ? 0.5 : 1 }}>{busy ? '…' : 'Accept'}</button>
    </section>
  );
}

/** A1's slider cards for an LP: the LP's accepted offer first, then the offers it can answer (one accepted at a time). */
export function useLpSlides({ on = true } = {}) {
  const offers = useUnionOffers({ on }).data || [];
  const me = useNilaSigner()?.stellarAddress;
  const qc = useQueryClient();
  const now = Date.now() / 1000;
  const live = offers.filter((o) => o.expires > now + 60);
  const mine = live.filter((o) => o.state === 1 && o.lp === me);
  // The leader scanned (the LP's accepted offer is gone): the wallet's USDC and its locked part read again.
  const ids = mine.map((o) => o.id).join(',');
  const [seen, setSeen] = useState(ids);
  useEffect(() => {
    if (seen && seen !== ids) qc.invalidateQueries({ queryKey: ['stellar', 'lp'] });
    setSeen(ids);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on) return [];
  const list = mine.length ? mine : live.filter((o) => o.state === 0);
  return list.map((o) => <OfferCard key={`lpme-${o.id}`} o={o} />);
}
