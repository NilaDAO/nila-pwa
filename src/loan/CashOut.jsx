// A7 cash out → A7b her code (boards MemberAssetNin, MemberAssetTractorScrolled-h3n0 #sent/#paid):
// fx_pool.request_cash_out escrows her nIN under the hash of a one-time code (7 days); she shows the
// code as QR and digits; the leader's pay_out (Cash → Pay out a cash-out) hands over the rupees and burns
// it; after 7 days anyone may reclaim it back to her. The code stays on her phone (localStorage).
// DESIGN GAPs: "Where: Union office · <leader>" without a name; no reclaim button yet (after expiry).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { sv } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';

const DAYS_7 = 7 * 86400;
const KEY = 'nila.cashout';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const save = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* private */ } };
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

export default function CashOut({ onBack }) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const nin = s?.stellarAccount?.nin?.balance ?? 0;
  const [amount, setAmount] = useState(Math.min(50, Math.floor(nin)));
  const [open, setOpen] = useState(read);
  const [img, setImg] = useState();
  useEffect(() => { if (open?.code) QRCode.toDataURL(`nila:cash:${open.code}`, { width: 260, margin: 1 }).then(setImg); }, [open]);

  const send = async () => {
    const code = String(Math.floor(100000000 + Math.random() * 900000000));   // 9 digits, one time
    const expires = Math.floor(Date.now() / 1000) + DAYS_7;
    const out = await tx.run({
      label: `Cash out ${inr(amount)}`, rows: [['Amount', `${amount} nIN`], ['Where', 'Union office']],
      contractName: 'fx_pool', fn: 'request_cash_out',
      args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.i128(BigInt(amount) * 10_000_000n), sv.bytes(await sha(code)), sv.u64(expires)],
      invalidate: [['stellar', 'account']],
    });
    if (out) { const v = { code, amount, expires }; save(v); setOpen(v); }
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => tx.reset()} onRetry={send} />;
  if (open) {
    return (
      <Sheet landName="Nila" title={`${inr(open.amount)} in cash`} onBack={onBack}>
        {img && <img src={img} alt="Your cash-out code" style={{ display: 'block', margin: '0 auto', width: 260, height: 260, background: '#fff', borderRadius: 12 }} />}
        <p style={{ textAlign: 'center', fontWeight: 700, letterSpacing: 2, fontSize: 20 }}>{open.code.replace(/(\d{3})(?=\d)/g, '$1 ')}</p>
        <p style={muted}>Where: Union office · valid until {new Date(open.expires * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
        <p style={muted}>Go to the union's office and ask for cash. Show this to your leader.</p>
        <Primary onClick={() => { save(null); setOpen(null); onBack(); }}>Done</Primary>
      </Sheet>
    );
  }
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <Sheet landName="Nila" title="Cash out" onBack={onBack}>
      <p style={{ ...muted, textAlign: 'center' }}>nIN · Nila digital rupee · worth ₹1 each · you have {Math.floor(nin)}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '12px 0' }}>
        <button type="button" aria-label="Less" style={b} onClick={() => setAmount((a) => Math.max(1, a - 10))}>−</button>
        <span style={{ minWidth: 90, textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{amount} nIN</span>
        <button type="button" aria-label="More" style={b} onClick={() => setAmount((a) => Math.min(Math.floor(nin), a + 10))}>+</button>
      </div>
      <p style={{ ...muted, textAlign: 'center' }}>You get {inr(amount)} in cash · Where: Union office</p>
      <Primary disabled={!tx.ready || amount < 1 || amount > nin} onClick={send}>Cash out</Primary>
    </Sheet>
  );
}

/** Leader: Cash → Pay out a cash-out (scan or type her code) → fx_pool.pay_out (sponsored, O12). */
export function PayOut({ onBack }) {
  const s = useNilaSigner();
  const tx = useSorobanTx();
  const [code, setCode] = useState('');
  const clean = code.replace(/^nila:cash:/, '').replace(/\D/g, '');
  const pay = () => tx.run({ label: 'Pay out a cash-out', rows: [['Code', clean]], contractName: 'fx_pool', fn: 'pay_out',
    args: [sv.address(s.stellarAddress), sv.bytes(new TextEncoder().encode(clean))], invalidate: [['stellar', 'account']] });
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={pay} />;
  return (
    <Sheet landName="Cash" title="Pay out a cash-out" onBack={onBack}>
      <p style={muted}>Type the code on her phone, then hand over the cash.</p>
      <input aria-label="Her code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
        style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box', fontSize: 18, letterSpacing: 2 }} />
      <Primary disabled={clean.length < 6 || !tx.ready} onClick={pay}>Pay out</Primary>
    </Sheet>
  );
}
