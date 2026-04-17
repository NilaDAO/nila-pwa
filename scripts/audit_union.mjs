/**
 * On-chain audit script for union 0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070
 * Queries GenericFundCore + NilaFxPool events over last 5 days on Polygon.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR  = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const VIEWER_ADDR = '0x435A12c4fD4B5a2D1D2ae6AB19D431D62084AdDA';
const NIN_TOKEN = '0x3221749c0C37958375EE92332E5ba7d73eC45865';

const provider = new ethers.JsonRpcProvider(RPC);

// Load ABIs
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const viewerAbi = JSON.parse(readFileSync('src/components/ABI/genericFundViewer.json', 'utf8'));

const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);
const viewer = new ethers.Contract(VIEWER_ADDR, viewerAbi.abi ?? viewerAbi, provider);

const fmt = (wei) => {
  const n = Number(ethers.formatEther(wei));
  return Math.round(n);
};

const fmtExact = (wei) => {
  return Number(ethers.formatEther(wei)).toFixed(2);
};

async function main() {
  const latestBlock = await provider.getBlockNumber();
  console.log(`Latest block: ${latestBlock}`);

  // ~2s per block on Polygon, 5 days = 216000 blocks. Use 250000 for safety.
  const fromBlock = latestBlock - 250000;
  console.log(`Scanning from block ${fromBlock} (~5 days ago) to ${latestBlock}`);
  console.log(`Union: ${UNION}\n`);

  // ─── 1. Current on-chain state ─────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CURRENT ON-CHAIN STATE');
  console.log('═══════════════════════════════════════════════════════');

  const [treasury, rainyDay, activeEscrow] = await Promise.all([
    core.unionTreasury(UNION),
    core.unionRainyDay(UNION),
    fxPool.unionActiveEscrowNin(UNION),
  ]);

  console.log(`Treasury (nIN):         ${fmtExact(treasury)} (≈ ₹${fmt(treasury)})`);
  console.log(`Rainy Day Fund (nIN):   ${fmtExact(rainyDay)} (≈ ₹${fmt(rainyDay)})`);
  console.log(`Active Escrow (nIN):    ${fmtExact(activeEscrow)} (≈ ₹${fmt(activeEscrow)})`);
  console.log(`Available (treasury-escrow): ₹${fmt(treasury - activeEscrow)}`);
  console.log();

  // ─── 2. CashScanMint events (FxPool) — all cash scans ─────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CashScanMint EVENTS (FxPool) — Cash Scanned In');
  console.log('═══════════════════════════════════════════════════════');

  const cashScanFilter = fxPool.filters.CashScanMint(UNION);
  const cashScanEvents = await fxPool.queryFilter(cashScanFilter, fromBlock, latestBlock);

  let totalScannedInr = 0n;
  let totalScannedNin = 0n;

  for (const ev of cashScanEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { ninAmount, inrValue, rate, deadline, scanHash } = ev.args;
    totalScannedInr += inrValue;
    totalScannedNin += ninAmount;
    console.log(`  [${ts}] Block ${ev.blockNumber} | Tx: ${ev.transactionHash.slice(0,18)}...`);
    console.log(`    INR scanned: ₹${fmt(inrValue)}  |  nIN minted: ${fmtExact(ninAmount)}  |  Rate: ${rate.toString()}`);
    console.log(`    Deadline: ${new Date(Number(deadline) * 1000).toISOString()}`);
    console.log(`    ScanHash: ${scanHash}`);

    // Get full tx to find purpose from calldata
    const tx = await provider.getTransaction(ev.transactionHash);
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
      const purpose = Number(decoded.args[4] ?? decoded.args.purpose ?? -1);
      const loanId = decoded.args[5] ?? decoded.args.loanId;
      const member = decoded.args[6] ?? decoded.args.member;
      const escrowResolve = decoded.args[7] ?? decoded.args.escrowIdToResolve ?? 0n;
      console.log(`    Purpose: ${purposeMap[purpose] || purpose}  |  LoanId: ${loanId}`);
      console.log(`    Member: ${member}  |  EscrowToResolve: ${escrowResolve.toString()}`);
    } catch (e) {
      console.log(`    (could not decode calldata: ${e.message})`);
    }
    console.log();
  }
  console.log(`  TOTAL SCANNED: ₹${fmt(totalScannedInr)} INR  |  ${fmtExact(totalScannedNin)} nIN`);
  console.log();

  // ─── 3. LoanRepaid events (Core) ──────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  LoanRepaid EVENTS (Core)');
  console.log('═══════════════════════════════════════════════════════');

  const repaidFilter = core.filters.LoanRepaid(UNION);
  const repaidEvents = await core.queryFilter(repaidFilter, fromBlock, latestBlock);

  let totalInterestPaid = 0n;
  let totalPrincipalPaid = 0n;

  for (const ev of repaidEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, interestPaid, principalPaid } = ev.args;
    totalInterestPaid += interestPaid;
    totalPrincipalPaid += principalPaid;
    console.log(`  [${ts}] Block ${ev.blockNumber} | Tx: ${ev.transactionHash.slice(0,18)}...`);
    console.log(`    LoanId: ${loanId}`);
    console.log(`    Interest: ₹${fmtExact(interestPaid)}  |  Principal: ₹${fmtExact(principalPaid)}  |  Total: ₹${fmtExact(interestPaid + principalPaid)}`);
    console.log();
  }
  console.log(`  TOTAL REPAID: Interest ₹${fmt(totalInterestPaid)} + Principal ₹${fmt(totalPrincipalPaid)} = ₹${fmt(totalInterestPaid + totalPrincipalPaid)}`);
  console.log();

  // ─── 4. LoanAccepted events (Core) — loans disbursed ─────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  LoanAccepted EVENTS (Core) — Loans Disbursed');
  console.log('═══════════════════════════════════════════════════════');

  const acceptedFilter = core.filters.LoanAccepted(UNION);
  const acceptedEvents = await core.queryFilter(acceptedFilter, fromBlock, latestBlock);

  let totalDisbursed = 0n;

  for (const ev of acceptedEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, amount, borrower } = ev.args;
    totalDisbursed += amount;
    console.log(`  [${ts}] Block ${ev.blockNumber} | Tx: ${ev.transactionHash.slice(0,18)}...`);
    console.log(`    LoanId: ${loanId}`);
    console.log(`    Amount: ₹${fmtExact(amount)}  |  Borrower: ${borrower}`);
    console.log();
  }
  console.log(`  TOTAL DISBURSED: ₹${fmt(totalDisbursed)}`);
  console.log();

  // ─── 5. EscrowResolved events (FxPool) ────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EscrowResolved EVENTS (FxPool)');
  console.log('═══════════════════════════════════════════════════════');

  // EscrowResolved is indexed by escrowId only, not union.
  // We need to check each resolved escrow's union. Let's scan all and filter.
  const resolvedFilter = fxPool.filters.EscrowResolved();
  const resolvedEvents = await fxPool.queryFilter(resolvedFilter, fromBlock, latestBlock);

  let resolvedForUnion = 0;
  for (const ev of resolvedEvents) {
    const { escrowId, resolution } = ev.args;
    // Check if this escrow belongs to our union
    try {
      const escrow = await fxPool.getEscrow(escrowId);
      const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
      if (escrowUnion !== UNION.toLowerCase()) continue;

      resolvedForUnion++;
      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      const resMap = {0: 'ACTIVE', 1: 'CASH', 2: 'USDT', 3: 'BURNED'};
      console.log(`  [${ts}] EscrowId: ${escrowId.toString()}  |  Resolution: ${resMap[Number(resolution)] || resolution}`);
      console.log(`    nIN: ${fmtExact(escrow.ninAmount ?? escrow[2])}  |  INR: ₹${fmt(escrow.inrValue ?? escrow[3])}`);
      console.log(`    Tx: ${ev.transactionHash.slice(0,18)}...`);
      console.log();
    } catch {}
  }
  if (resolvedForUnion === 0) console.log('  (none found for this union)\n');

  // ─── 6. FarmerNinBurned events (FxPool) ───────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FarmerNinBurned EVENTS (FxPool) — Cash Out Burns');
  console.log('═══════════════════════════════════════════════════════');

  const burnFilter = fxPool.filters.FarmerNinBurned(UNION);
  const burnEvents = await fxPool.queryFilter(burnFilter, fromBlock, latestBlock);

  let totalBurned = 0n;
  for (const ev of burnEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { farmer, amount } = ev.args;
    totalBurned += amount;
    console.log(`  [${ts}] Farmer: ${farmer}  |  Burned: ${fmtExact(amount)} nIN (≈ ₹${fmt(amount)})`);
    console.log(`    Tx: ${ev.transactionHash.slice(0,18)}...`);
    console.log();
  }
  console.log(`  TOTAL BURNED: ₹${fmt(totalBurned)}`);
  console.log();

  // ─── 7. EscrowBurned events (FxPool) ──────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EscrowBurned EVENTS (FxPool) — Expired Escrows');
  console.log('═══════════════════════════════════════════════════════');

  const escrowBurnFilter = fxPool.filters.EscrowBurned();
  const escrowBurnEvents = await fxPool.queryFilter(escrowBurnFilter, fromBlock, latestBlock);

  let totalEscrowBurned = 0n;
  for (const ev of escrowBurnEvents) {
    const { escrowId, ninAmount } = ev.args;
    try {
      const escrow = await fxPool.getEscrow(escrowId);
      const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
      if (escrowUnion !== UNION.toLowerCase()) continue;

      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      totalEscrowBurned += ninAmount;
      console.log(`  [${ts}] EscrowId: ${escrowId.toString()}  |  Burned: ${fmtExact(ninAmount)} nIN`);
      console.log(`    Tx: ${ev.transactionHash.slice(0,18)}...`);
      console.log();
    } catch {}
  }
  if (totalEscrowBurned === 0n) console.log('  (none for this union)\n');

  // ─── 8. Pending escrows still active ──────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ACTIVE PENDING ESCROWS');
  console.log('═══════════════════════════════════════════════════════');

  const nextId = await fxPool.nextEscrowId();
  let pendingTotal = 0n;
  const start = nextId > 100n ? nextId - 100n : 0n;

  for (let id = nextId - 1n; id >= start; id--) {
    try {
      const escrow = await fxPool.getEscrow(id);
      const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
      const status = Number(escrow.status ?? escrow[6]);
      if (escrowUnion === UNION.toLowerCase() && status === 0) {
        pendingTotal += (escrow.ninAmount ?? escrow[2]);
        const dl = Number(escrow.deadline ?? escrow[5]);
        console.log(`  EscrowId: ${id.toString()}  |  nIN: ${fmtExact(escrow.ninAmount ?? escrow[2])}  |  INR: ₹${fmt(escrow.inrValue ?? escrow[3])}`);
        console.log(`  Deadline: ${new Date(dl * 1000).toISOString()}  |  Status: ACTIVE`);
        console.log();
      }
    } catch {}
  }
  console.log(`  TOTAL PENDING ESCROW: ${fmtExact(pendingTotal)} nIN (≈ ₹${fmt(pendingTotal)})`);
  console.log();

  // ─── 9. Summary / Reconciliation ──────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  RECONCILIATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Cash Scanned (total minted via CashScanMint):  ₹${fmt(totalScannedInr)} INR`);
  console.log(`  Loans Repaid (principal + interest):            ₹${fmt(totalInterestPaid + totalPrincipalPaid)}`);
  console.log(`    → Principal returned to treasury:             ₹${fmt(totalPrincipalPaid)}`);
  console.log(`    → Interest earned:                            ₹${fmt(totalInterestPaid)}`);
  console.log(`  Loans Disbursed (AcceptLoan):                   ₹${fmt(totalDisbursed)}`);
  console.log(`  nIN Burned (FarmerNinBurned):                   ₹${fmt(totalBurned)}`);
  console.log(`  Escrows Burned (expired):                       ₹${fmt(totalEscrowBurned)}`);
  console.log();
  console.log(`  Current Treasury:                               ₹${fmt(treasury)}`);
  console.log(`  Current Active Escrow:                          ₹${fmt(activeEscrow)}`);
  console.log(`  Current Available (treasury - escrow):          ₹${fmt(treasury - activeEscrow)}`);
  console.log(`  Current Rainy Day:                              ₹${fmt(rainyDay)}`);
  console.log();
  console.log(`  Net flow = Scanned - Disbursed - Burned:        ₹${fmt(totalScannedInr - totalDisbursed - totalBurned)}`);
  console.log(`  Paper trail expects: ₹7,000 physical cash`);
  console.log(`  System shows treasury: ₹${fmt(treasury)}`);
  console.log(`  Discrepancy: ₹${fmt(treasury)} (system) vs ₹7,000 (physical) = ₹${fmt(treasury) - 7000} gap`);
}

main().catch(console.error);
