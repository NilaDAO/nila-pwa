// LS — leader settings (board LeaderSettings, P10b). The union card (address, identity check), the union's signers
// note, the voucher prices (machinery.rate per type, read-only: the union account sets them, 3 of 5), the LP section,
// and the account rows. DESIGN GAPs: no on-chain list of the union's signers (roles only checks one address) — the
// names and "Change signers" are not built; the contact-book union key (show / scan / mismatch) needs the union-key
// encryption that does not exist yet (Q17) — not built; "Propose new factors" and seed prices (no source) not built;
// notifications and theme rows not built; the leader identity check (K1 #leader) is not built (K1 is LP only).
import { useState } from 'react';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { useLpStatus } from '../anchor/hooks';
import { useRates } from '../machine/hooks';
import { deleteAllItems } from '../utils/db';
import { C, FONT, R } from '../shell/tokens';

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '…');
const card = { background: C.ink, borderRadius: R.card, padding: '18px 22px', marginBottom: 12 };
const h2 = { fontSize: 14, fontWeight: 700, margin: '0 0 10px' };
const muted = { color: C.muted, fontSize: 14 };

function Row({ k, v, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 0, color: C.text, fontFamily: FONT, fontSize: 14, padding: '8px 0', textAlign: 'left' }}>
      <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
    </button>
  );
}

export default function LeaderSettings({ onBack, onIdCheck, onOffers }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const rates = useRates();
  const lp = useLpStatus();
  const [copied, setCopied] = useState();
  const [reset, setReset] = useState(false);
  const copy = async (what, v) => { try { await navigator.clipboard.writeText(v); setCopied(what); setTimeout(() => setCopied(undefined), 1500); } catch { /* no clipboard */ } };
  return (
    <div style={{ padding: 16, fontFamily: FONT, color: C.text }}>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 0, color: C.muted, padding: 0 }}>← Back</button>
      <h1 style={{ fontSize: 16, fontWeight: 700 }}>Settings</h1>

      <section style={card} aria-label="Your credit union">
        <h2 style={h2}>Your credit union</h2>
        <Row k="Union address" v={copied === 'union' ? 'Copied' : short(cfg?.union)} onClick={() => copy('union', cfg?.union)} />
        <Row k="Network" v={cfg ? (cfg.network === 'mainnet' ? 'Stellar' : `Stellar ${cfg.network}`) : '…'} />
      </section>

      <section style={card} aria-label="Union signers">
        <h2 style={h2}>Union signers</h2>
        <p style={muted}>3 of 5 must sign: a new leader, the voucher price list and a change of signers.</p>
      </section>

      <section style={card} aria-label="Voucher prices">
        <h2 style={h2}>Voucher prices</h2>
        <p style={muted}>Machine hours, as the union set them. New prices need the signers.</p>
        {rates.isLoading && <p style={muted}>…</p>}
        {(rates.data || []).map((r) => <Row key={r.type} k={r.name} v={`${inr(r.total)} /h`} />)}
        {rates.isSuccess && !rates.data.length && <p style={muted}>No machine prices set for the union yet.</p>}
      </section>

      {cfg?.anchor_url && lp.data?.member && (
        <section style={card} aria-label="Liquidity provider">
          <h2 style={h2}>Liquidity provider</h2>
          <p style={muted}>Bring or collect cash at the union office for USDC. You earn 1% on each swap.</p>
          <Row k={lp.data.lp ? 'You are an LP' : 'Become an LP'} v={lp.data.lp && lp.data.trustline ? 'Cash offers ›' : 'Check my identity ›'}
            onClick={lp.data.lp && lp.data.trustline ? onOffers : onIdCheck} />
        </section>
      )}

      <section style={card} aria-label="Account">
        <h2 style={h2}>Account</h2>
        <Row k="Wallet address" v={copied === 'wallet' ? 'Copied' : short(s?.stellarAddress)} onClick={() => copy('wallet', s?.stellarAddress)} />
        <Row k="Version" v={process.env.REACT_APP_VERSION || '—'} />
        {!reset ? <Row k="Reset account" v="Removes your account from this phone ›" onClick={() => setReset(true)} /> : (
          <div>
            <p style={muted}>Remove your account from this phone? Your assets and your signer role stay with your wallet. To open it again you need your phone number.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setReset(false)} style={{ flex: 1, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontWeight: 700 }}>Cancel</button>
              <button type="button" onClick={async () => { await deleteAllItems(); window.location.reload(); }} style={{ flex: 1, height: 44, borderRadius: R.button, border: 0, background: C.coral, color: C.ink, fontWeight: 700 }}>Reset</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
