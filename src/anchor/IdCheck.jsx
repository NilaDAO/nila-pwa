// K1 identity check for an LP (board IdCheck #lp: -needs, -checking, -accepted). SEP-12 at the trust's anchor;
// reviewed by hand by a trust operator for Nov 7 on testnet (LOAN_RULES §5, 19 Oct). Fields as SEP-9 names
// (nila-anchor k1.py). When accepted: her USDC trustline (sponsored by the node, R11), then the offers.
// DESIGN GAPs: "We send ₹1 to your bank account" is left out (no penny-drop vendor yet); "Accepted on <date>"
// has no date (the SEP-12 answer carries none); the leader variant (#leader) is not built in P9.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Primary, Sheet, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { useAnchorInfo, useLpStatus, useSep10Token, useUsdcTrustline } from './hooks';
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

export default function IdCheck({ onBack, onOffers }) {
  const info = useAnchorInfo();
  const getToken = useSep10Token();
  const lp = useLpStatus();
  const trust = useUsdcTrustline();
  const [signedIn, setSignedIn] = useState(false);
  const [vals, setVals] = useState({});
  const [selfie, setSelfie] = useState();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  // Her K1 at the anchor; read after she signed in (one SEP-10 signature), refreshed while it is checked.
  const k1 = useQuery({
    queryKey: ['anchor', 'k1'], enabled: signedIn && !!info.data, retry: 1,
    refetchInterval: (q) => (q.state.data?.status === 'PROCESSING' ? 30_000 : false),
    queryFn: async () => getCustomer(info.data, await getToken()),
  });
  useEffect(() => {
    if (k1.data?.status === 'ACCEPTED') lp.refetch();
  }, [k1.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = k1.data?.status;
  const needs = status === 'NEEDS_INFO' && Object.values(k1.data.provided_fields || {}).some((f) => f.error);
  const asked = needs ? Object.keys(k1.data.fields || {}) : [...FIELDS.map(([k]) => k), 'proof_of_liveness'];
  const send = async () => {
    setBusy(true); setError(undefined);
    try {
      const t = await getToken();
      if (!needs) await putConsent(info.data, t);
      const fields = Object.fromEntries(Object.entries(vals).filter(([k, v]) => asked.includes(k) && v));
      await putCustomer(info.data, t, fields, asked.includes('proof_of_liveness') ? selfie?.blob : null);
      await k1.refetch();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  let body;
  if (!info.data) {
    body = <p style={muted}>{info.isError ? 'The anchor is not reachable. Try again later.' : '…'}</p>;
  } else if (!signedIn || k1.isLoading) {
    body = (
      <>
        <p style={muted}>Needed to become an LP.</p>
        {k1.isError && <p style={{ color: C.coral }}>{k1.error.message}</p>}
        <Primary onClick={() => setSignedIn(true)}>{signedIn ? '…' : 'Start'}</Primary>
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
  } else if (status === 'ACCEPTED') {
    const ready = lp.data?.lp && lp.data?.trustline;
    body = (
      <>
        <h2 style={{ fontSize: 16 }}>Identity checked</h2>
        <p style={muted}>Accepted. You can now bring or collect cash at the union office for USDC.</p>
        {trust.isError && <p style={{ color: C.coral }}>{trust.error.message}</p>}
        <Primary disabled={trust.isPending || !lp.data?.lp} onClick={async () => {
          if (!lp.data.trustline) await trust.mutateAsync().catch(() => null);
          if ((await lp.refetch()).data?.trustline) onOffers();
        }}>{trust.isPending ? 'Opening your USDC account…' : ready ? 'Get cash offers' : 'Get cash offers'}</Primary>
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
        ) : <p style={muted}>Needed to become an LP.</p>}
        <h2 style={{ fontSize: 14, marginTop: 16 }}>Your details</h2>
        {FIELDS.filter(([k]) => asked.includes(k)).map(([k, label, type]) => (
          <label key={k} style={{ display: 'block' }}>
            <span style={{ ...muted, display: 'block', marginBottom: 4 }}>{label}</span>
            <input aria-label={label} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'numeric' ? 'numeric' : undefined}
              autoCapitalize={k === 'first_name' ? 'words' : 'characters'} value={vals[k] || ''}
              onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} style={input} />
          </label>
        ))}
        {asked.includes('proof_of_liveness') && (
          <label style={{ display: 'block', background: C.raised, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>{selfie ? 'Selfie taken' : 'Take a selfie'}</span>
            <span style={{ ...muted, display: 'block' }}>We check it is really you, live.</span>
            {selfie && <img src={selfie.url} alt="Your selfie" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: R.round, marginTop: 8 }} />}
            <input aria-label="Take a selfie" type="file" accept="image/*" capture="user" style={{ display: 'none' }}
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const blob = await selfieBlob(f); setSelfie({ blob, url: URL.createObjectURL(blob) }); } }} />
          </label>
        )}
        {!needs && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, margin: '8px 0' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-label="I agree to the check" />
            <span>I agree that Nila checks my phone and location during this check.</span>
          </label>
        )}
        <p style={muted}>Nila keeps this data for 5 years, as the law requires. Members of your union do not see it.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={busy || (!needs && !consent) || asked.some((k) => (k === 'proof_of_liveness' ? !selfie : !vals[k]))}
          onClick={send}>{busy ? '…' : needs ? 'Fix it' : 'Send for checking'}</Primary>
      </>
    );
  }
  return <Sheet landName="Nila" title="Identity check" onBack={onBack}>{body}</Sheet>;
}
