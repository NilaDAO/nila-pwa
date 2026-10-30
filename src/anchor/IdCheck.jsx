// K1 identity check for an LP (board IdCheck #lp: -needs, -checking, -accepted). SEP-12 at the trust's anchor;
// reviewed by hand by a trust operator for Nov 7 on testnet (LOAN_RULES §5, 19 Oct). Fields as SEP-9 names
// (nila-anchor k1.py). When accepted: her USDC trustline (sponsored by the node, R11; none for a smart account, which
// holds USDC in the USDC contract), then the offers.
// LP pledge (executive decision 30 Oct): only name as on PAN, PAN and date of birth; no bank account, IFSC, selfie or
// phone and location consent (an LP's USDC never changes owner, so no VDA rule binds the flow). PAN is asked for tax,
// in case the union ever claims locked USDC.
// DESIGN GAPs: "Accepted on <date>"
// has no date (the SEP-12 answer carries none); "Get offers from <union>" is "Get cash offers" (no union
// names on the node); a "Start" step before the form (her SEP-10 signature) and the REJECTED and
// "Waiting for the network" states have no board. #leader (22 Oct): the same form and store (SEP-12 type leader);
// accepted = fx_pool.id_checked on-chain, which opens her USDC (A9); no result screen, straight back to her assets.
import { Loading } from '../register/Boot';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Primary, muted } from '../plan/ui';
import MapCard from '../shell/MapCard';
import { C, FONT } from '../shell/tokens';
import { useAnchorInfo, useLpStatus, useSep10Token, useUsdcTrustline } from './hooks';
import { getCustomer, putCustomer } from './sep';

const MAX_SIDE = 1280;
const FIELDS = [
  ['first_name', 'Name as on your PAN card', 'text'],
  ['tax_id', 'PAN', 'text'],
  ['birth_date', 'Date of birth', 'date'],
];

// The anchor's own field rules (nila-anchor k1.py), checked before sending (29 Oct): the Anchor Platform passes the
// anchor's 400 on without its reason, so a wrong field only showed as "K1: 400".
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
function fieldError(k, raw) {
  const v = String(raw || '').trim();
  if (!v) return 'Fill this in.';
  if (k === 'first_name' && (v.length < 2 || v.length > 100)) return 'The name as on your PAN card.';
  if (k === 'tax_id' && !PAN.test(v.toUpperCase().replace(/\s/g, ''))) return 'A PAN looks like ABCDE1234F.';
  if (k === 'birth_date') {
    const d = new Date(`${v}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'Pick your date of birth.';
    const t = new Date(); const age = t.getFullYear() - d.getFullYear() - ((t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) ? 1 : 0);
    if (age < 18) return 'You must be 18 or older.';
  }
  return null;
}

const input = { width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box', fontSize: 15, marginBottom: 10 };

export default function IdCheck({ kind = 'lp', onBack, onOffers, onAccepted }) {
  const leader = kind === 'leader';
  const info = useAnchorInfo();
  const getToken = useSep10Token();
  const lp = useLpStatus();
  const trust = useUsdcTrustline();
  const [vals, setVals] = useState({});
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

  const status = k1.data?.status;
  const needs = status === 'NEEDS_INFO' && Object.values(k1.data.provided_fields || {}).some((f) => f.error);
  const asked = needs ? Object.keys(k1.data.fields || {}) : FIELDS.map(([k]) => k);
  const [fieldErrors, setFieldErrors] = useState({});
  const send = async () => {
    const errs = Object.fromEntries(FIELDS.filter(([k]) => asked.includes(k)).map(([k]) => [k, fieldError(k, vals[k])]).filter(([, e]) => e));
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setError('Check the fields marked above.'); return; }
    setBusy(true); setError(undefined);
    try {
      const t = await getToken();
      const fields = Object.fromEntries(Object.entries(vals).filter(([k, v]) => asked.includes(k) && v));
      await putCustomer(info.data, t, fields, null, kind);
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
        <p style={muted}>Accepted. You can now take the union's cash against your locked USDC, and bring it back.</p>
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
              onChange={(e) => { setVals((v) => ({ ...v, [k]: e.target.value })); setFieldErrors((f) => ({ ...f, [k]: undefined })); }} style={input} />
            {fieldErrors[k] && <span style={{ color: C.coral, fontSize: 14, display: 'block', marginTop: 4 }}>{fieldErrors[k]}</span>}
          </label>
        ))}
        <p style={muted}>Your PAN is asked for tax: if the union ever has to claim your locked USDC, it deducts tax under your PAN. Nila keeps this data for 5 years. Members of your union do not see it.</p>
        {error && <p style={{ color: C.coral }}>{error}</p>}
        <Primary disabled={busy || asked.some((k) => !vals[k])}
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
