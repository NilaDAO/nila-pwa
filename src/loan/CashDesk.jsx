// The leader's Cash tab (P5b; boards LeaderCash C1, LeaderInvest L10, LeaderPhotoCount C6): crop share
// request (L11), invest (her cash into her union investment) and repay (her cash against a loan). The
// leader records the cash with fx_pool.cash_scan_mint (leader signs; the node sponsors the fee, 16 Oct).
// The cash is counted on C6 (photo count, /inr/scan-bulk); the receipt hash (scan_hash) is sha256 of the
// stored photo keys. DESIGN GAP: no N11 board (the tx screens N1/N2 show the result).
import DeskCard from '../shell/DeskCard';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv, tokenHex } from '../stellar/soroban';
import { TxScreens, useSorobanTx } from '../stellar/TxStatus';
import { usePlanClient } from '../plan/hooks';
import { Choice, Primary, inr, muted } from '../plan/ui';
import { C, R } from '../shell/tokens';
import { PayOut } from './CashOut';
import { deskClaim } from './desk';
import { FLAG_DRAWN, opensOf } from './MyShares';
import { NIN } from './request';
import PhotoCount from './PhotoCount';
import RegisterMachine from '../machine/RegisterMachine';
import { ScanLp } from '../anchor/LeaderLp';
import CashBoard from '../leader/CashBoard';
import CameraView from '../shell/CameraView';
import { addressFromQr, useUnionMembers } from '../leader/unionMembers';
import { overRoom, useDeskRoom } from './deskRoom';
import { Secondary } from './AssetParts';
import { loanOf, owedOf } from './owed';
import StartHelp from './StartHelp';

const PURPOSE = { invest: 0, repay: 1 };
const sha = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Records counted cash for her (fx_pool.cash_scan_mint; the leader signs, the node pays the fee). The receipt is the
 *  stored photos of this count (one scan per receipt, ScanUsed on reuse). Returns false when no photo was stored. */
export async function recordCash({ tx, leader, cfg, purpose, who, total, s3Keys, token }) {
  if (!s3Keys?.length) return false;
  const amt = BigInt(Math.round(total)) * NIN;
  const scanHash = await sha(`${s3Keys.join('|')}|${who}|${purpose}|${amt}`);
  // A repay counted above what is owed (24 Oct): the contract takes what is owed and burns the rest, so the leader
  // hands the difference back in cash; read fresh so the change is right to the rupee.
  let change = 0;
  if (purpose === 'repay' && token) {
    const [loan, vb] = await Promise.all([
      readContract(cfg, 'fund_core', 'food_token', [sv.address(cfg.union), sv.bytes32(token)]).then(loanOf).catch(() => null),
      readContract(cfg, 'fund_core', 'voucher_book', [sv.address(cfg.union), sv.bytes32(token)]).catch(() => null),
    ]);
    if (loan) {
      const owed = owedOf(loan, vb);
      if (amt > owed) change = Number((amt - owed) / NIN);
    }
  }
  await tx.run({
    label: purpose === 'invest' ? `Invest ${inr(total)}` : `Repay ${inr(total)}`,
    rows: [...(change > 0 ? [['Hand back', `${inr(change)} in change`], ['Counted', inr(total)], ['Repaid', inr(total - change)]] : [['Amount', inr(total)]]),
      ['From', `${who.slice(0, 4)}…${who.slice(-4)}`]],
    hold: change > 0,
    contractName: 'fx_pool', fn: 'cash_scan_mint',
    args: [sv.address(leader), sv.address(cfg.union), sv.u32(PURPOSE[purpose]), sv.address(who), sv.i128(amt), sv.bytes(scanHash),
      purpose === 'repay' ? sv.bytes32(token) : sv.none()],
    invalidate: [['stellar', 'loans'], ['stellar', 'investment']],
  });
  return true;
}
const isG = (a) => /^[GC][A-Z2-7]{55}$/.test(a || '');

function Amount({ value, set, max = Infinity }) {
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

function Scan({ purpose, onBack, initialMember = '', initialToken }) {
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
  // her plan is replaced). The members are the one typed here, else the borrowers in the members list kept on the
  // phone (25 Oct: no mint list per plan). Owed = cash part with interest + the voucher part (owners' dues and the
  // senior prepay).
  const typed = isG(member.trim()) ? member.trim() : null;
  const union = useUnionMembers(api);
  const loans = useQuery({
    queryKey: ['stellar', 'loans', 'open', typed, union.dataUpdatedAt], enabled: purpose === 'repay' && !!api && !!cfg && !!union.data,
    queryFn: async () => {
      const crops = {};
      for (const m of union.data) for (const x of m.shareList || []) crops[x.token] = { crop: x.name, land: m.lands[0] };
      const members = typed ? [typed] : union.data.filter((m) => m.address && m.loans.length).map((m) => m.address);
      const per = await Promise.all(members.map(async (who) => {
        const ids = await readContract(cfg, 'fund_core', 'loans_of', [sv.address(cfg.union), sv.address(who)]).catch(() => []);
        return Promise.all((ids || []).map(async (id) => {
          const h = Buffer.from(id).toString('hex');
          const [loan, vb] = await Promise.all([
            readContract(cfg, 'fund_core', 'food_token', [sv.address(cfg.union), sv.bytes32(h)]).then(loanOf),
            readContract(cfg, 'fund_core', 'voucher_book', [sv.address(cfg.union), sv.bytes32(h)]).catch(() => null),
          ]);
          return loan && !loan.closed ? { token: h, ...(crops[h] || { crop: 'Crop share' }), loan, vb } : null;
        }));
      }));
      return per.flat().filter(Boolean);
    },
  });
  // Cash and the voucher's value, with interest, and the treasury's 5% of handed-back hours (26 Oct).
  const owed = (l) => Math.ceil(Number(owedOf(l.loan, l.vb)) / Number(NIN));
  // From her G2 with one open loan, or her crop share QR (24 Oct): that loan is picked for her.
  useEffect(() => {
    if (!fixed || token || !loans.data) return;
    const l = loans.data.find((x) => x.token === initialToken) || (loans.data.length === 1 ? loans.data[0] : null);
    if (l) { setToken(l.token); setAmount(owed(l)); }
  }, [loans.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // What the office may still take in (30 Oct): said before counting, and checked again on the count.
  const desk = useDeskRoom();
  const over = desk.data && amount > desk.data.room;
  const sel = loans.data?.find((l) => l.token === token);
  const who = purpose === 'repay' ? sel?.loan?.borrower : member.trim();
  const record = async ({ total, s3Keys }) => {
    setAmount(total);
    // Without stored photos there is no unique scan, so nothing is recorded.
    if (!(await recordCash({ tx, leader: s.stellarAddress, cfg, purpose, who, total, s3Keys, token: sel?.token }))) setNoPhotos(true);
  };
  if (tx.status !== 'idle') return <TxScreens tx={tx} onClose={() => { tx.reset(); onBack(); }} onRetry={() => tx.retry()} />;
  if (counting) {
    return <PhotoCount name={purpose === 'invest' ? 'Invest' : `Repay · ${sel?.crop || ''}`} target={amount} verb={purpose === 'invest' ? 'Invest' : 'Repay'} desk={desk.data}
      onBack={() => setCounting(false)} onDone={(c) => { setCounting(false); record(c); }} />;
  }
  return (
    <DeskCard title={purpose === 'invest' ? 'Invest' : 'Repay'} onBack={onBack}>
      {fixed ? <p style={muted}>For {member.slice(0, 4)}…{member.slice(-4)}</p> : (
        <>
          <p style={muted}>{purpose === 'invest' ? 'Member wallet (scan their wallet QR, or paste it)' : 'Member wallet (optional: only their loans)'}</p>
          <input aria-label="Member wallet" value={member} onChange={(e) => setMember(e.target.value)} placeholder="G…"
            style={{ width: '100%', height: 44, borderRadius: 12, border: 0, background: C.raised, color: C.text, padding: '0 12px', boxSizing: 'border-box' }} />
        </>
      )}
      {purpose === 'repay' && (
        <>
          {loans.isLoading && <p style={muted}>…</p>}
          {loans.isError && <p style={{ color: C.coral }}>Could not read the loans. Try again.</p>}
          {loans.isSuccess && !loans.data.length && <p style={muted}>No open loans.</p>}
          {loans.data?.map((l) => (
            <Choice key={l.token} on={token === l.token} sub={`${l.land ? `Land ${l.land} · ` : ''}owes about ${inr(owed(l))}`} onClick={() => { setToken(l.token); setAmount(owed(l)); }}>{l.crop}</Choice>
          ))}
        </>
      )}
      <p style={{ ...muted, textAlign: 'center' }}>{purpose === 'invest' ? 'The member brings' : 'The member repays'}</p>
      <Amount value={amount} set={setAmount} />
      {over && <p style={{ color: C.coral, margin: 0 }}>{overRoom(desk.data, amount)}</p>}
      {noPhotos && <p style={{ color: C.coral }}>The photos were not saved, so the cash was not recorded. Count again.</p>}
      <Primary disabled={!amount || !isG(who) || !tx.ready || !desk.data || over} onClick={() => { setNoPhotos(false); setCounting(true); }}>Photo count</Primary>
      <Secondary disabled>Cash teller · soon</Secondary>
    </DeskCard>
  );
}

/** A task from the Tasks tab (24 Oct, as Pay out cash): the leader scans her QR first. Her wallet QR gives her
 *  account; her crop share QR (`nila:share:<plan>_<token>:<her G>`) gives her account and that share. */
function ScanHer({ title, note, shareOnly, onFound, onBack }) {
  const [error, setError] = useState();
  const read = (text) => {
    const t = String(text || '').trim();
    const share = /^nila:share:(\w+?)_(\w+):([GC][A-Z2-7]{55})$/.exec(t);
    if (share) { onFound({ who: share[3], plan: share[1], token: share[2] }); return; }
    if (shareOnly) { setError('Scan the crop share QR (a Ready crop share in Assets).'); return; }
    const g = addressFromQr(t);
    if (g) onFound({ who: g }); else setError('This is not a member QR.');
  };
  return (
    <DeskCard title={title} onBack={onBack}>
      <CameraView mode="qr" onText={read} />
      <p style={muted}>{note}</p>
      {error && <p style={{ color: C.coral }}>{error}</p>}
    </DeskCard>
  );
}

const FLAG_CLOSED = 4;
const dayOf = (ts) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Tasks → Scan her QR (executive decision 26 Oct: one QR at the office, every mode): the member's help QR starts the
 *  session and opens the member's G2, where the leader invests, repays, uses a crop share or pays out. */
function ScanAny({ onBack }) {
  const api = usePlanClient();
  const union = useUnionMembers(api);
  return <StartHelp onBack={onBack} onStarted={(who) => {
    const m = (union.data || []).find((x) => x.address === who);
    window.location.replace(m ? `#/members/${m.route}` : '#/members');
  }} />;
}

// An old #/cash/invest|withdraw/<her> link: her G2 does these in place now.
function ToMembersFrom({ member }) {
  useEffect(() => { window.location.replace(`#/members/${member}`); }, [member]);
  return null;
}

// #/cash/<arg>: L1's tasks and A1L's slides open a flow directly; settle opens the board's Cash card.
// Her own actions start from her QR (executive decision 24 Oct, as Pay out cash): a task without her scans her wallet or
// crop share QR first, then the count. From her G2 they come as #/cash/<action>/<her Stellar address>.
const OPEN = { lpscan: 'lpscan', invest: 'invest', repay: 'repay', payout: 'payout', machine: 'machine', withdraw: 'withdraw', share: 'share', scan: 'scan' };
const MEMBER_ACTIONS = ['invest', 'repay', 'withdraw'];   // invest and withdraw run in place on her G2 (22 Oct)
const herFromHash = () => (window.location.hash.match(/^#\/cash\/\w+\/([GC][A-Z2-7]{55})/) || [])[1];

export default function CashDesk({ initial }) {
  const [view, setView] = useState(OPEN[initial]);
  const [member, setMember] = useState(herFromHash);   // from her G2; L13 takes the owner's wallet itself (no L5 pick, 22 Oct)
  const back = useMemo(() => () => {
    if (MEMBER_ACTIONS.includes(view)) { window.history.back(); return; }   // back to her G2
    setView(undefined); setMember(undefined);
  }, [view]);
  // From the Tasks tab (24 Oct): no member yet, so the leader scans her QR first, then counts (as Pay out cash).
  const [found, setFound] = useState();
  const toTasks = () => window.location.replace('#/tasks');
  if (view === 'scan') return <ScanAny onBack={toTasks} />;
  if (!member && !found && (view === 'invest' || view === 'repay')) {
    return <ScanHer title={view === 'invest' ? 'Invest' : 'Repay'} onBack={toTasks} onFound={setFound}
      note={view === 'invest' ? 'Scan the member\'s wallet QR, then count the cash.' : 'Scan the member\'s wallet QR or the crop share QR of the loan, then count the cash.'} />;
  }
  if (!member && view === 'share') {
    return <ScanHer title="Use a crop share" shareOnly onBack={toTasks} note="Scan the crop share QR (a Ready crop share in Assets)."
      onFound={(f) => window.location.replace(`#/loan/${f.plan}_${f.token}`)} />;
  }
  if (found) return <Scan purpose={view} onBack={toTasks} initialMember={found.who} initialToken={found.token && tokenHex(found.token)} />;
  if (!member && view === 'withdraw') return <PayOut onBack={toTasks} />;
  if (view === 'invest' || view === 'withdraw') return <ToMembersFrom member={member} />;
  if (view === 'repay') return <Scan purpose={view} onBack={back} initialMember={member} />;
  if (view === 'payout') return <PayOut onBack={back} />;
  if (view === 'machine') return <RegisterMachine onBack={back} initialOwner={member || ''} />;
  if (view === 'lpscan') return <ScanLp onBack={back} />;
  // The Cash tab is the C1–C4 board (P10): the union's money only; the cash tasks are on the Tasks tab (L1).
  return <CashBoard settle={initial === 'settle'} onScanLp={() => setView('lpscan')} />;
}
