// K1 identity check for an LP (board IdCheck #lp: -needs, -checking, -accepted). SEP-12 at the trust's anchor;
// reviewed by hand by a trust operator for Nov 7 on testnet (LOAN_RULES §5, 19 Oct). Fields as SEP-9 names
// (nila-anchor k1.py). When accepted: her USDC trustline (sponsored by the node, R11), then the offers.
// DESIGN GAPs: "We send ₹1 to your bank account" is left out (no penny-drop vendor yet); "Accepted on <date>"
// has no date (the SEP-12 answer carries none); "Get offers from <union>" is "Get cash offers" (no union
// names on the node); a "Start" step before the form (her SEP-10 signature) and the REJECTED and
// "Waiting for the network" states have no board. #leader (22 Oct): the same form and store (SEP-12 type leader);
// accepted = fx_pool.id_checked on-chain, which opens her USDC (A9); no result screen, straight back to her assets.
import { Loading } from '../register/Boot';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckRow, Primary, muted } from '../plan/ui';
import MapCard from '../shell/MapCard';
import { C, FONT, R } from '../shell/tokens';
import { useAnchorInfo, useLpStatus, useSep10Token, useUsdcTrustline } from './hooks';
import CameraView from '../shell/CameraView';
import { getCustomer, putConsent, putCustomer } from './sep';

const MAX_SIDE = 1280;
const FIELDS = [
  ['first_name', 'Name as on your PAN card', 'text'],
  ['tax_id', 'PAN', 'text'],
  ['birth_date', 'Date of birth', 'date'],
  ['bank_account_number', 'Bank account number', 'numeric'],
  ['bank_branch_number', 'IFSC', 'text'],
];

async function selfieBlob(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
}

const input = { width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box', fontSize: 15, marginBottom: 10 };

export default function IdCheck({ kind = 'lp', onBack, onOffers, onAccepted }) {
  const leader = kind === 'leader';
  const info = useAnchorInfo();
  const getToken = useSep10Token();
  const lp = useLpStatus();
  const trust = useUsdcTrustline();
  const [vals, setVals] = useState({});
  const [selfie, setSelfie] = useState();
  const [shooting, setShooting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  // Her K1 at the anchor, read as soon as the screen opens (26 Oct: no Start step; the SEP-10 signature is silent),
  // refreshed while it is checked.
  const k1 = useQuery({
    queryKey: ['anchor', 'k1', kind], enabled: !!info.data, retry: 1,
    refetchInterval: (q) => (q.state.data?.status === 'PROCESSING' ? 30_000 : false),
    queryFn: async () => getCustomer(info.data, await getToken(), kind),
  });
  // Accepted at the anchor: wait until set_lp (a leader: set_id_checked) is on-chain too (it lands a little later).
  const lpNow = leader ? lp.data?.idChecked : lp.data?.lp;
  useEffect(() => {
    if (k1.data?.status !== 'ACCEPTED' || lpNow) return undefined;
    const t = setInterval(() => lp.refetch(), 10_000);
    return () => clearInterval(t);
  }, [k1.data?.status, lpNow]); // eslint-disable-line react-hooks/exhaustive-deps
  // A leader accepted (22 Oct): no result screen; once her flag is on-chain she goes straight back to her assets,
  // where the USDC row is now open.
  useEffect(() => {
    if (leader && k1.data?.status === 'ACCEPTED' && lpNow) onAccepted?.();
  }, [leader, k1.data?.status, lpNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selfieError, setSelfieError] = useState();

  const status = k1.data?.status;
  const needs = status === 'NEEDS_INFO' && Object.values(k1.data.provided_fields || {}).some((f) => f.error);
  const asked = needs ? Object.keys(k1.data.fields || {}) : [...FIELDS.map(([k]) => k), 'proof_of_liveness'];
  const send = async () => {
    setBusy(true); setError(undefined);
    try {
      const t = await getToken();
      if (!needs) await putConsent(info.data, t, kind);
      const fields = Object.fromEntries(Object.entries(vals).filter(([k, v]) => asked.includes(k) && v));
      await putCustomer(info.data, t, fields, asked.includes('proof_of_liveness') ? selfie?.blob : null, kind);
      await k1.refetch();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  // Reaching the anchor and reading the member's check: the app's standard loading view, not a bare "…".
  if ((!info.data && !info.isError) || k1.isLoading) return <Loading />;
  let body;
  if (!info.data) {
    body = <p style={muted}>The anchor is not reachable. Try again later.</p>;
  } else if (k1.isError) {
    body = (
      <>
        <p style={{ color: C.coral }}>{k1.error.message}</p>
        <Primary onClick={() => k1.refetch()}>Try again</Primary>
      </>
    );
  } else if (status === 'PROCESSING') {
    body = (
      <>
        <h2 style={{ fontSize: 16 }}>We are checking</h2>
        <p style={muted}>This takes up to 2 days.</p>
        <Primary onClick={onBack}>Done</Primary>
      </>
    );
  } else if (status === 'ACCEPTED' && leader) {
    return <Loading />;   // until set_id_checked lands, then back to the assets (above)
  } else if (status === 'ACCEPTED') {
    body = (
      <>
        <h2 style={{ fontSize: 16 }}>Identity checked</h2>
        <p style={muted}>Accepted. You can now bring or collect cash at the union office for USDC.</p>
        {trust.isError && <p style={{ color: C.coral }}>{trust.error.message}</p>}
        <Primary disabled={trust.isPending || !lp.data?.lp} onClick={async () => {
          if (!lp.data.trustline) await trust.mutateAsync().catch(() => null);
          if ((await lp.refetch()).data?.trustline) onOffers();
        }}>{trust.isPending ? 'Opening your USDC account…' : 'Get cash offers'}</Primary>
        {!lp.data?.lp && <p style={muted}>Waiting for the network…</p>}
      </>
    );
  } else if (status === 'REJECTED') {
    body = <p style={muted}>{k1.data.message || 'Your identity check was not accepted.'}</p>;
  } else {
    body = (
      <>
        {needs ? (
          <>
            <h2 style={{ fontSize: 16 }}>We need one more thing</h2>
            {Object.values(k1.data.provided_fields).filter((f) => f.error).map((f) => <p key={f.description} style={{ color: C.coral }}>{f.error}</p>)}
          </>
        ) : !leader && <p style={muted}>Needed to become an LP.</p>}
        <h2 style={{ fontSize: 14, marginTop: 16 }}>Your details</h2>
        {FIELDS.filter(([k]) => asked.includes(k)).map(([k, label, type]) => (
          <label key={k} style={{ display: 'block' }}>
            <span style={{ ...muted, display: 'block', marginBottom: 4 }}>{label}</span>
            <input aria-label={label} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'numeric' ? 'numeric' : undefined}
              autoCapitalize={k === 'first_name' ? 'words' : 'characters'} value={vals[k] || ''}
              onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} style={input} />
          </label>
        ))}
        {asked.includes('proof_of_liveness') && <h2 style={{ fontSize: 14, marginTop: 8 }}>Selfie</h2>}
        {asked.includes('proof_of_liveness') && (
          // The app's own camera, front facing (27 Oct): a file input opens the file picker on a computer.
          shooting ? (
            <div style={{ background: C.raised, borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <CameraView mode="photo" facing="user" title="Take a selfie" hint="Look into the camera." onPhoto={async (blob) => {
                setShooting(false);
                try {
                  const b = await selfieBlob(blob);
                  if (selfie?.url) URL.revokeObjectURL(selfie.url);
                  setSelfie({ blob: b, url: URL.createObjectURL(b) }); setSelfieError(undefined);
                } catch { setSelfieError('That photo could not be read. Take it again.'); }
              }} />
              <button type="button" onClick={() => setShooting(false)} style={{ display: 'block', margin: '4px auto 0', border: 0, background: 'transparent',
                color: C.muted, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setShooting(true)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, color: C.text,
              fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', background: C.raised, borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <span style={{ fontWeight: 700 }}>{selfie ? 'Selfie taken · take it again' : 'Take a selfie'}</span>
              <span style={{ ...muted, display: 'block' }}>We check it is really you, live.</span>
              {selfie && <img src={selfie.url} alt="Your selfie" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: R.round, marginTop: 8 }} />}
            </button>
          )
        )}
        {selfieError && <p style={{ color: C.coral }}>{selfieError}</p>}
        {!needs && (
          <CheckRow on={consent} onClick={() => setConsent((v) => !v)} style={{ margin: '8px 0' }}>
            I agree that Nila checks my phone and location during this check.
          </CheckRow>
        )}
        <p style={muted}>Nila keeps this data for 5 years, as the law requires. Members of your union do not see it.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={busy || (!needs && !consent) || asked.some((k) => (k === 'proof_of_liveness' ? !selfie : !vals[k]))}
          onClick={send}>{busy ? '…' : needs ? 'Fix it' : 'Send for checking'}</Primary>
      </>
    );
  }
  // The map-view standard (26 Oct, as the help QR): a full-height card with the drag line, the title in its header,
  // no "Nila" heading over it.
  return (
    <MapCard header={{ title: 'Identity check', onBack }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      {body}
    </MapCard>
  );
}
