/**
 * Full history of all actions related to farmer 0x33D8D0
 * and their loan 0x...05ab81 (escrow #12 origin).
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FARMER = '0x33D8D0B5550BF1B144A16501103b00F2078eF59A';
const LOAN_ID = '0x000000000000000000000000000000000000000000000000000000000005ab81';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const VIEWER_ADDR = '0x435A12c4fD4B5a2D1D2ae6AB19D431D62084AdDA';
const NIN_TOKEN = '0x3221749c0C37958375EE92332E5ba7d73eC45865';

const provider = new ethers.JsonRpcProvider(RPC);
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const viewerAbi = JSON.parse(readFileSync('src/components/ABI/genericFundViewer.json', 'utf8'));
const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);
const viewer = new ethers.Contract(VIEWER_ADDR, viewerAbi.abi ?? viewerAbi, provider);

const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);
const fmt = (wei) => Math.round(Number(ethers.formatEther(wei)));

async function main() {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - 4500000; // ~90 days

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  COMPLETE HISTORY — Farmer ${FARMER}`);
  console.log(`  Loan ${LOAN_ID}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── 1. Current loan state ────────────────────────────────────────
  console.log('── CURRENT STATE ──');
  const loan = await core.loans(UNION, LOAN_ID);
  const raw = loan.toArray ? loan.toArray() : loan;
  const info = await viewer.getBorrowerInfo(UNION, LOAN_ID);
  console.log(`  Borrower:         ${raw[0]}`);
  console.log(`  Principal:        ₹${fmtExact(raw[2])}`);
  console.log(`  Rate:             ${raw[3]} BP (${(Number(raw[3])/100).toFixed(1)}% annual)`);
  console.log(`  Created:          ${new Date(Number(raw[4]) * 1000).toISOString()}`);
  console.log(`  Drawdown:         ${new Date(Number(raw[5]) * 1000).toISOString()}`);
  console.log(`  Maturity:         ${new Date(Number(raw[6]) * 1000).toISOString()}`);
  console.log(`  Principal Repaid: ₹${fmtExact(raw[7])}`);
  console.log(`  Interest Paid:    ₹${fmtExact(raw[8])}`);
  console.log(`  Outstanding:      ₹${fmtExact(BigInt(info[8].toString()))}`);
  console.log(`  Closed:           ${raw[12]}`);
  console.log(`  Status:           ${raw[13]}`);

  const ninBal = await new ethers.Contract(NIN_TOKEN, ['function balanceOf(address) view returns (uint256)'], provider).balanceOf(FARMER);
  console.log(`  Farmer nIN bal:   ${fmtExact(ninBal)} nIN`);

  // ─── 2. LoanAccepted event ────────────────────────────────────────
  console.log('\n── LOAN ACCEPTED ──');
  const accepted = await core.queryFilter(core.filters.LoanAccepted(UNION, LOAN_ID), fromBlock, latestBlock);
  for (const ev of accepted) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    console.log(`  [${ts}] Block ${ev.blockNumber}`);
    console.log(`    Amount: ₹${fmtExact(ev.args.amount)}`);
    console.log(`    Borrower: ${ev.args.borrower}`);
    console.log(`    Tx: ${ev.transactionHash}`);
  }
  if (accepted.length === 0) console.log('  (no LoanAccepted event in 90-day window — loan accepted earlier)');

  // ─── 3. LoanRepaid events ─────────────────────────────────────────
  console.log('\n── LOAN REPAID EVENTS ──');
  const repaid = await core.queryFilter(core.filters.LoanRepaid(UNION, LOAN_ID), fromBlock, latestBlock);
  for (const ev of repaid) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    console.log(`  [${ts}] Block ${ev.blockNumber}`);
    console.log(`    Interest: ₹${fmtExact(ev.args.interestPaid)}`);
    console.log(`    Principal: ₹${fmtExact(ev.args.principalPaid)}`);
    console.log(`    Tx: ${ev.transactionHash}`);
  }
  if (repaid.length === 0) console.log('  (no LoanRepaid event — repayment via internal cashScanMint path)');

  // ─── 4. CashScanMint events for this loan ────────────────────────
  console.log('\n── CASH SCAN MINT EVENTS (for this loan) ──');
  const allScans = await fxPool.queryFilter(fxPool.filters.CashScanMint(), fromBlock, latestBlock);
  for (const ev of allScans) {
    if (ev.args.union.toLowerCase() !== UNION.toLowerCase()) continue;
    const tx = await provider.getTransaction(ev.transactionHash);
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      const decodedLoanId = decoded.args[5]?.toString();
      const decodedMember = decoded.args[6]?.toString();
      // Match either by loan ID or by member address
      if (decodedLoanId !== LOAN_ID && decodedMember?.toLowerCase() !== FARMER.toLowerCase()) continue;

      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
      console.log(`  [${ts}] Block ${ev.blockNumber}`);
      console.log(`    nIN minted: ${fmtExact(ev.args.ninAmount)}`);
      console.log(`    Purpose: ${purposeMap[Number(decoded.args[4])]}`);
      console.log(`    LoanId: ${decodedLoanId}`);
      console.log(`    Member: ${decodedMember}`);
      console.log(`    Caller: ${tx.from}`);
      console.log(`    Tx: ${ev.transactionHash}`);
    } catch {}
  }

  // ─── 5. CashScanMint events where MEMBER is this farmer ──────────
  console.log('\n── CASH SCAN MINT EVENTS (member = this farmer) ──');
  for (const ev of allScans) {
    if (ev.args.union.toLowerCase() !== UNION.toLowerCase()) continue;
    const tx = await provider.getTransaction(ev.transactionHash);
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      const decodedMember = decoded.args[6]?.toString();
      const decodedLoanId = decoded.args[5]?.toString();
      if (decodedMember?.toLowerCase() !== FARMER.toLowerCase()) continue;
      if (decodedLoanId === LOAN_ID) continue; // already shown above

      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
      console.log(`  [${ts}] nIN: ${fmtExact(ev.args.ninAmount)} | Purpose: ${purposeMap[Number(decoded.args[4])]}`);
      console.log(`    Different loanId: ${decodedLoanId}`);
      console.log(`    Tx: ${ev.transactionHash}`);
    } catch {}
  }

  // ─── 6. nIN transfers TO/FROM this farmer ────────────────────────
  console.log('\n── nIN TRANSFERS (to/from farmer) ──');
  const nin = new ethers.Contract(NIN_TOKEN, [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ], provider);

  const incoming = await nin.queryFilter(nin.filters.Transfer(null, FARMER), fromBlock, latestBlock);
  for (const ev of incoming) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    console.log(`  [${ts}] ${ev.args.from.slice(0,10)}... → Farmer: ${fmtExact(ev.args.value)} nIN`);
    console.log(`    Tx: ${ev.transactionHash}`);
  }

  const outgoing = await nin.queryFilter(nin.filters.Transfer(FARMER, null), fromBlock, latestBlock);
  for (const ev of outgoing) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const toLabel = ev.args.to === ethers.ZeroAddress ? 'BURN' : ev.args.to.slice(0,10) + '...';
    console.log(`  [${ts}] Farmer → ${toLabel}: ${fmtExact(ev.args.value)} nIN`);
    console.log(`    Tx: ${ev.transactionHash}`);
  }

  // ─── 7. FarmerNinBurned events for this farmer ───────────────────
  console.log('\n── FARMER NIN BURNED EVENTS ──');
  const burns = await fxPool.queryFilter(fxPool.filters.FarmerNinBurned(null, FARMER), fromBlock, latestBlock);
  for (const ev of burns) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    console.log(`  [${ts}] Burned: ${fmtExact(ev.args.amount)} nIN`);
    console.log(`    Union: ${ev.args.union}`);
    console.log(`    Tx: ${ev.transactionHash}`);
  }
  if (burns.length === 0) console.log('  (no FarmerNinBurned events for this farmer)');

  // ─── 8. Escrow #12 details ────────────────────────────────────────
  console.log('\n── ESCROW #12 (origin from this scan) ──');
  const escrow = await fxPool.getEscrow(12n);
  console.log(`  union:      ${escrow[0] || escrow.union}`);
  console.log(`  fundAddr:   ${escrow[1] || escrow.fundAddr}`);
  console.log(`  ninAmount:  ${fmtExact(escrow[2] || escrow.ninAmount)}`);
  console.log(`  inrValue:   ${escrow[3] || escrow.inrValue}`);
  console.log(`  member:     ${escrow[4] || escrow.member}`);
  console.log(`  deadline:   ${new Date(Number(escrow[5] || escrow.deadline) * 1000).toISOString()}`);
  console.log(`  status:     ${escrow[6] || escrow.status} (0=ACTIVE, 1=CASH, 2=USDT, 3=BURNED)`);

  // ─── 9. All other active loans for this farmer ────────────────────
  console.log('\n── ALL ACTIVE LOANS FOR THIS FARMER ──');
  const allLoans = await viewer.getLoansByBorrower(UNION, FARMER);
  console.log(`  Total active loans: ${allLoans.length}`);
  for (const lid of allLoans) {
    const linfo = await viewer.getBorrowerInfo(UNION, lid);
    console.log(`\n  Loan ${lid}`);
    console.log(`    Principal:      ₹${fmtExact(linfo[2])}`);
    console.log(`    Repaid:         ₹${fmtExact(linfo[3])}`);
    console.log(`    Outstanding:    ₹${fmtExact(BigInt(linfo[8].toString()))}`);
    console.log(`    Rate:           ${linfo[4]} BP`);
    console.log(`    Closed:         ${linfo[6]}`);
    console.log(`    Drawdown:       ${linfo[12] ? new Date(Number(linfo[12]) * 1000).toISOString() : 'pending'}`);
  }
}

main().catch(console.error);
