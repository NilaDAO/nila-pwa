// Leader: Tasks → Pay out investment → L5 (who) → here (22 Oct, desk only). Her claim is read on chain; the leader's
// app signs the leader's part of fund_core.claim_junior_cash and shows it as a QR (L9 direction); she scans it in
// Scan, sees what she collects, confirms; the leader hands over the cash when her phone shows it done. The screen
// reads her claim again and says when it is paid. TODO(reverse QR): product/specs/Keypad_Reverse_QR_Consent.md.
// DESIGN GAP: no board of its own (L9 layout).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { Primary, inr } from '../plan/ui';
import { C } from '../shell/tokens';
import { Loading } from '../register/Boot';
import { AssetScreen, Card, CardTitle, KV, QrCircle, Secondary } from './AssetParts';
import { deskClaim, makeDeskRequest } from './desk';

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const dateOf = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const muted = { color: C.muted, fontSize: 14, lineHeight: 1.5, margin: 0 };

/** auto: make her code at once (G2, after the photo count of the notes). */
export default function DeskWithdraw({ member, onBack, auto }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const [qr, setQr] = useState();
  const [img, setImg] = useState();
  const [error, setError] = useState();
  const [busy, setBusy] = useState(false);
  const claim = useQuery({ queryKey: ['stellar', 'deskClaim', member], enabled: !!cfg && !!member,
    queryFn: () => deskClaim(cfg, member), refetchInterval: qr ? 5000 : false });
  const [first, setFirst] = useState();
  useEffect(() => { if (claim.data && first === undefined) setFirst(claim.data.inr); }, [claim.data, first]);
  useEffect(() => { if (qr) QRCode.toDataURL(qr, { width: 400, margin: 2, errorCorrectionLevel: 'L' }).then(setImg); }, [qr]);
  // G2 after the photo count: her code is made at once (no "Make her code" step).
  useEffect(() => {
    if (!auto || qr || busy || error || !s?.ready || !(claim.data?.shares > 0n)) return;
    setBusy(true);
    makeDeskRequest(cfg, { leader: s.stellarAddress, member, signHash: s.signHash }).then(setQr, (e) => setError(e.message)).finally(() => setBusy(false));
  }, [auto, claim.data, s?.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg || claim.isLoading) return <Loading />;
  const c = claim.data;
  const paid = qr && c && c.shares <= 0n;

  const make = async () => {
    setBusy(true); setError(undefined);
    try { setQr(await makeDeskRequest(cfg, { leader: s.stellarAddress, member, signHash: s.signHash })); } catch (e) { setError(e.message); }
    setBusy(false);
  };

  if (paid) {
    return (
      <AssetScreen title="Pay out investment" onBack={onBack}>
        <Card label="Paid">
          <CardTitle>Collected</CardTitle>
          <KV k="Member" v={short(member)} />
          <KV k="Hand over" v={`${inr(Math.floor(first || 0))} in cash`} color={C.accent} />
          <Secondary onClick={onBack}>Done</Secondary>
        </Card>
      </AssetScreen>
    );
  }
  if (qr) {
    return (
      <AssetScreen title={`${inr(Math.floor(c?.inr || 0))} to pay out`} onBack={onBack} note="She scans this in Scan and confirms. Hand over the cash when her phone shows it done.">
        <Card label="Her code to scan">
          <QrCircle img={img} alt="Pay out investment code" />
          <KV k="Member" v={short(member)} />
          <KV k="Valid" v="about 1 hour" />
          <Secondary onClick={onBack}>Cancel</Secondary>
        </Card>
      </AssetScreen>
    );
  }
  return (
    <AssetScreen title="Pay out investment" onBack={onBack}>
      <Card label="Her withdrawal">
        <CardTitle>Her withdrawal</CardTitle>
        <KV k="Member" v={short(member)} />
        {c?.shares > 0n ? (
          <>
            <KV k="Ready to collect" v={`${inr(Math.floor(c.inr))} in cash`} color={C.accent} />
            <p style={muted}>The cash goes from the union's cash at hand.</p>
            <div style={{ marginTop: -8 }}><Primary disabled={busy || !s?.ready} onClick={make}>Make her code</Primary></div>
          </>
        ) : (
          <p style={muted}>{c?.pendingFrom ? `Her withdrawal is ready from about ${dateOf(c.pendingFrom)}.` : 'She has no withdrawal to collect. She asks for one on her phone (Union investment → Withdraw).'}</p>
        )}
        {error && <p style={{ ...muted, color: C.coral }}>{error}</p>}
      </Card>
    </AssetScreen>
  );
}
