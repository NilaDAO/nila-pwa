// The leader's Cash tab (P5b; boards LeaderCash C1, LeaderInvest L10, LeaderPhotoCount C6): crop share
// request (L11), invest (her cash into her union investment) and repay (her cash against a loan). The
// leader records the cash with fx_pool.cash_scan_mint (leader signs; the node sponsors the fee, 16 Oct).
// The cash is counted on C6 (photo count, /inr/scan-bulk); the receipt hash (scan_hash) is sha256 of the
// stored photo keys. DESIGN GAP: no N11 board (the tx screens N1/N2 show the result).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Choice, Primary, Sheet, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { LeaderLoan } from './LoanScreens';
import { PayOut } from './CashOut';
import { NIN } from './request';
import PhotoCount from './PhotoCount';

const PURPOSE = { invest: 0, repay: 1 };
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const isG = (a) => /^G[A-Z2-7]{55}$/.test(a || '');

function Amount({ value, set, max = 10000 }) {
  const b = { width: 44, height: 44, borderRadius: R.button, border: 0, background: C.raised, color: C.text, fontSize: 20, fontWeight: 700 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '12px 0' }}>
      <button type="button" aria-label="Less" style={b} onClick={() => set(Math.max(0, value - 100))}>−</button>
      <input aria-label="Amount in rupees" inputMode="numeric" value={value} onChange={(e) => set(Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0))}
        style={{ width: 120, height: 44, textAlign: 'center', borderRadius: 12, border: 0, background: C.raised, color: C.text, fontWeight: 700, fontSize: 18 }} />
      <button type="button" aria-label="More" style={b} onClick={() => set(Math.min(max, value + 100))}>+</button>
    </div>
  );
}

function Scan({ purpose, onBack }) {
  const s = useNilaSigner();
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [member, setMember] = useState('');
  const [amount, setAmount] = useState(purpose === 'invest' ? 600 : 0);
  const [token, setToken] = useState();
  const [counting, setCounting] = useState(false);
  // Repay: the loans drawn on approved plans (her token id and what she owes).
  const loans = useQuery({
    queryKey: ['stellar', 'loans', 'approved'], enabled: purpose === 'repay' && !!api && !!cfg,
    queryFn: async () => {
      const out = [];
      for (const p of (await api.approvedPlans()).plans) {
        const { mints } = await api.mintList(p.id).catch(() => ({ mints: [] }));
        for (const m of mints.filter((x) => x.token_id)) {
          const loan = await readContract(cfg, 'fund_core', 'get_loan', [sv.address(cfg.union), sv.bytes32(tokenHex(m.token_id))]).catch(() => null);
          if (loan && !loan.closed) out.push({ ...m, land: p.land_id, loan });
        }
      }
      return out;
    },
  });
  const owed = (l) => Number((BigInt(l.principal) - BigInt(l.principal_paid) + BigInt(l.interest_accrued) - BigInt(l.interest_paid)) / NIN);
  const sel = loans.data?.find((l) => l.token_id === token);
  const who = purpose === 'repay' ? sel?.loan?.borrower : member.trim();
  const record = async ({ total, s3Keys }) => {
    setAmount(total);
    const amt = BigInt(Math.round(total)) * NIN;
    // The receipt: the stored photos of this count (one scan per receipt, ScanUsed on reuse).
    const scanHash = await sha(`${s3Keys.join('|')}|${who}|${purpose}|${amt}`);
    await tx.run({
      label: purpose === 'invest' ? `Invest ${inr(total)}` : `Repay ${inr(total)}`,
      rows: [['Amount', inr(total)], ['From', `${who.slice(0, 4)}…${who.slice(-4)}`]],
      contractName: 'fx_pool', fn: 'cash_scan_mint',
      args: [sv.address(s.stellarAddress), sv.address(cfg.union), sv.u32(PURPOSE[purpose]), sv.address(who), sv.i128(amt), sv.bytes(scanHash),
        purpose === 'repay' ? sv.bytes32(tokenHex(sel.token_id)) : sv.none()],
      invalidate: [['stellar', 'loans'], ['stellar', 'investment']],
    });
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => { tx.reset(); setCounting(true); }} />;
  if (counting) {
    return <PhotoCount name={purpose === 'invest' ? 'Invest' : `Repay · ${sel?.crop || ''}`} target={amount} verb={purpose === 'invest' ? 'Invest' : 'Repay'}
      onBack={() => setCounting(false)} onDone={(c) => { setCounting(false); record(c); }} />;
  }
  return (
    <Sheet landName="Cash" title={purpose === 'invest' ? 'Invest' : 'Repay'} onBack={onBack}>
      {purpose === 'invest' && (
        <>
          <p style={muted}>Her wallet (scan her wallet QR, or paste it)</p>
          <input aria-label="Her wallet" value={member} onChange={(e) => setMember(e.target.value)} placeholder="G…"
            style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box' }} />
        </>
      )}
      {purpose === 'repay' && (
        <>
          {loans.isLoading && <p style={muted}>…</p>}
          {!loans.isLoading && !loans.data?.length && <p style={muted}>No open loans.</p>}
          {loans.data?.map((l) => (
            <Choice key={l.token_id} on={token === l.token_id} sub={`Land ${l.land} · owes about ${inr(owed(l.loan))}`} onClick={() => { setToken(l.token_id); setAmount(Math.min(10000, owed(l.loan))); }}>{l.crop}</Choice>
          ))}
        </>
      )}
      <p style={{ ...muted, textAlign: 'center' }}>{purpose === 'invest' ? 'She brings' : 'She repays'}</p>
      <Amount value={amount} set={setAmount} />
      <Primary disabled={!amount || !isG(who) || !tx.ready} onClick={() => setCounting(true)}>Photo count</Primary>
    </Sheet>
  );
}

export default function CashDesk() {
  const [view, setView] = useState();
  const back = useMemo(() => () => setView(undefined), []);
  if (view === 'loan') return <LeaderLoan />;
  if (view === 'invest' || view === 'repay') return <Scan purpose={view} onBack={back} />;
  if (view === 'payout') return <PayOut onBack={back} />;
  return (
    <Sheet landName="Cash" title="Start a task">
      <Choice sub="For a crop plan the member accepted" onClick={() => setView('loan')}>Crop share request</Choice>
      <Choice sub="Cash in: she invests in the union" onClick={() => setView('invest')}>Invest</Choice>
      <Choice sub="Cash in: the member repays her crop share" onClick={() => setView('repay')}>Repay</Choice>
      <Choice sub="Scan her code, pay cash, burn her nIN" onClick={() => setView('payout')}>Pay out a cash-out</Choice>
    </Sheet>
  );
}
