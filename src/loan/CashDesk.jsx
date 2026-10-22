// The leader's Cash tab (P5b; boards LeaderCash C1, LeaderInvest L10, LeaderPhotoCount C6): crop share
// request (L11), invest (her cash into her union investment) and repay (her cash against a loan). The
// leader records the cash with fx_pool.cash_scan_mint (leader signs; the node sponsors the fee, 16 Oct).
// The cash is counted on C6 (photo count, /inr/scan-bulk); the receipt hash (scan_hash) is sha256 of the
// stored photo keys. DESIGN GAP: no N11 board (the tx screens N1/N2 show the result).
import { useEffect, useMemo, useState } from 'react';
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
import RegisterMachine from '../machine/RegisterMachine';
import { ScanLp } from '../anchor/LeaderLp';
import CashBoard from '../leader/CashBoard';
import { PickMember } from '../leader/LeaderTasks';
import { Secondary } from './AssetParts';

const PURPOSE = { invest: 0, repay: 1 };
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Records counted cash for her (fx_pool.cash_scan_mint; the leader signs, the node pays the fee). The receipt is the
 *  stored photos of this count (one scan per receipt, ScanUsed on reuse). Returns false when no photo was stored. */
export async function recordCash({ tx, leader, cfg, purpose, who, total, s3Keys, token }) {
  if (!s3Keys?.length) return false;
  const amt = BigInt(Math.round(total)) * NIN;
  const scanHash = await sha(`${s3Keys.join('|')}|${who}|${purpose}|${amt}`);
  await tx.run({
    label: purpose === 'invest' ? `Invest ${inr(total)}` : `Repay ${inr(total)}`,
    rows: [['Amount', inr(total)], ['From', `${who.slice(0, 4)}…${who.slice(-4)}`]],
    contractName: 'fx_pool', fn: 'cash_scan_mint',
    args: [sv.address(leader), sv.address(cfg.union), sv.u32(PURPOSE[purpose]), sv.address(who), sv.i128(amt), sv.bytes(scanHash),
      purpose === 'repay' ? sv.bytes32(token) : sv.none()],
    invalidate: [['stellar', 'loans'], ['stellar', 'investment']],
  });
  return true;
}
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

function Scan({ purpose, onBack, initialMember = '' }) {
  const fixed = isG(initialMember);
  const s = useNilaSigner();
  const api = usePlanClient();
  const { data: cfg } = useStellarConfig();
  const tx = useSorobanTx();
  const [member, setMember] = useState(initialMember);
  const [amount, setAmount] = useState(purpose === 'invest' ? 600 : 0);
  const [token, setToken] = useState();
  const [counting, setCounting] = useState(false);
  const [noPhotos, setNoPhotos] = useState(false);
  // Repay: her open loans from fund_core.loans_of (the contract's list, so a loan never drops out when
  // her plan is replaced). The members are the one typed here, else the holders of the approved plans'
  // tokens. Owed = cash part with interest + the voucher part (owners' dues and the senior prepay).
  const typed = isG(member.trim()) ? member.trim() : null;
  const loans = useQuery({
    queryKey: ['stellar', 'loans', 'open', typed], enabled: purpose === 'repay' && !!api && !!cfg,
    queryFn: async () => {
      const crops = {};
      const members = new Set(typed ? [typed] : []);
      for (const p of (await api.approvedPlans()).plans) {
        const { mints } = await api.mintList(p.id).catch(() => ({ mints: [] }));
        for (const m of mints.filter((x) => x.token_id)) {
          crops[tokenHex(m.token_id)] = { crop: m.crop, land: p.land_id };
          if (!typed) {
            const ft = await readContract(cfg, 'fund_core', 'food_token', [sv.address(cfg.union), sv.bytes32(tokenHex(m.token_id))]).catch(() => null);
            if (ft?.member) members.add(ft.member);
          }
        }
      }
      const out = [];
      for (const who of members) {
        const ids = await readContract(cfg, 'fund_core', 'loans_of', [sv.address(cfg.union), sv.address(who)]);
        for (const id of ids || []) {
          const h = Buffer.from(id).toString('hex');
          const [loan, vb] = await Promise.all([
            readContract(cfg, 'fund_core', 'get_loan', [sv.address(cfg.union), sv.bytes32(h)]),
            readContract(cfg, 'fund_core', 'voucher_book', [sv.address(cfg.union), sv.bytes32(h)]).catch(() => null),
          ]);
          if (loan && !loan.closed) out.push({ token: h, ...(crops[h] || { crop: 'Crop share' }), loan, vb });
        }
      }
      return out;
    },
  });
  const owed = (l) => {
    const cash = BigInt(l.loan.principal) - BigInt(l.loan.principal_paid) + BigInt(l.loan.interest_accrued) - BigInt(l.loan.interest_paid);
    const voucher = l.vb ? BigInt(l.vb.senior_out) + (l.vb.dues || []).reduce((t, d) => t + BigInt(d.amount), 0n) : 0n;
    return Math.ceil(Number(cash + voucher) / Number(NIN));
  };
  // From her G2 with one open loan: that loan is picked for her.
  useEffect(() => { if (fixed && !token && loans.data?.length === 1) { setToken(loans.data[0].token); setAmount(Math.min(10000, owed(loans.data[0]))); } }, [loans.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = loans.data?.find((l) => l.token === token);
  const who = purpose === 'repay' ? sel?.loan?.borrower : member.trim();
  const record = async ({ total, s3Keys }) => {
    setAmount(total);
    // Without stored photos there is no unique scan, so nothing is recorded.
    if (!(await recordCash({ tx, leader: s.stellarAddress, cfg, purpose, who, total, s3Keys, token: sel?.token }))) setNoPhotos(true);
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  if (counting) {
    return <PhotoCount name={purpose === 'invest' ? 'Invest' : `Repay · ${sel?.crop || ''}`} target={amount} verb={purpose === 'invest' ? 'Invest' : 'Repay'}
      onBack={() => setCounting(false)} onDone={(c) => { setCounting(false); record(c); }} />;
  }
  return (
    <Sheet landName="Cash" title={purpose === 'invest' ? 'Invest' : 'Repay'} onBack={onBack}>
      {fixed ? <p style={muted}>For {member.slice(0, 4)}…{member.slice(-4)}</p> : (
        <>
          <p style={muted}>{purpose === 'invest' ? 'Her wallet (scan her wallet QR, or paste it)' : 'Her wallet (optional: only her loans)'}</p>
          <input aria-label="Her wallet" value={member} onChange={(e) => setMember(e.target.value)} placeholder="G…"
            style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box' }} />
        </>
      )}
      {purpose === 'repay' && (
        <>
          {loans.isLoading && <p style={muted}>…</p>}
          {loans.isError && <p style={{ color: C.coral }}>Could not read the loans. Try again.</p>}
          {loans.isSuccess && !loans.data.length && <p style={muted}>No open loans.</p>}
          {loans.data?.map((l) => (
            <Choice key={l.token} on={token === l.token} sub={`${l.land ? `Land ${l.land} · ` : ''}owes about ${inr(owed(l))}`} onClick={() => { setToken(l.token); setAmount(Math.min(10000, owed(l))); }}>{l.crop}</Choice>
          ))}
        </>
      )}
      <p style={{ ...muted, textAlign: 'center' }}>{purpose === 'invest' ? 'She brings' : 'She repays'}</p>
      <Amount value={amount} set={setAmount} />
      {noPhotos && <p style={{ color: C.coral }}>The photos were not saved, so the cash was not recorded. Count again.</p>}
      <Primary disabled={!amount || !isG(who) || !tx.ready} onClick={() => { setNoPhotos(false); setCounting(true); }}>Photo count</Primary>
      <Secondary disabled>Cash teller · soon</Secondary>
    </Sheet>
  );
}

// An old #/cash/invest|withdraw/<her> link: her G2 does these in place now.
function ToMembersFrom({ member }) {
  useEffect(() => { window.location.replace(`#/members/${member}`); }, [member]);
  return null;
}

// #/cash/<arg>: L1's tasks and A1L's slides open a flow directly; settle opens the board's Cash card.
// Her own actions (invest, repay, withdraw) start only from her G2 (executive decision 22 Oct: Members → G2 → action):
// #/cash/<action>/<her Stellar address>. Without her the leader is sent to Members (G1) to find her.
const OPEN = { lpscan: 'lpscan', loan: 'loan', invest: 'invest', repay: 'repay', payout: 'payout', machine: 'machine', withdraw: 'withdraw' };
const MEMBER_ACTIONS = ['invest', 'repay', 'withdraw'];   // invest and withdraw run in place on her G2 (22 Oct)
const herFromHash = () => (window.location.hash.match(/^#\/cash\/\w+\/(G[A-Z2-7]{55})/) || [])[1];

export default function CashDesk({ initial }) {
  const [view, setView] = useState(OPEN[initial]);
  const [member, setMember] = useState(herFromHash);   // from her G2; the machine flow picks on L5
  const back = useMemo(() => () => {
    if (MEMBER_ACTIONS.includes(view)) { window.history.back(); return; }   // back to her G2
    setView(undefined); setMember(undefined);
  }, [view]);
  const toMembers = MEMBER_ACTIONS.includes(view) && !member;
  useEffect(() => { if (toMembers) window.location.replace('#/members'); }, [toMembers]);
  if (toMembers) return null;
  if (view === 'invest' || view === 'withdraw') return <ToMembersFrom member={member} />;
  if (view === 'repay') return <Scan purpose={view} onBack={back} initialMember={member} />;
  // L5 first for a machine: the members the app knows, or scan her wallet.
  if (view === 'machine' && member === undefined) {
    return <PickMember title="Register a machine" onBack={back} onPick={setMember} onScan={() => setMember('')} />;
  }
  if (view === 'loan') return <LeaderLoan />;
  if (view === 'payout') return <PayOut onBack={back} />;
  if (view === 'machine') return <RegisterMachine onBack={back} initialOwner={member} />;
  if (view === 'lpscan') return <ScanLp onBack={back} />;
  // The Cash tab is the C1–C4 board (P10): the union's money only; the cash tasks are on the Tasks tab (L1).
  return <CashBoard settle={initial === 'settle'} onScanLp={() => setView('lpscan')} />;
}
