import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const VIEWER_ADDR = '0x435A12c4fD4B5a2D1D2ae6AB19D431D62084AdDA';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';

const provider = new ethers.JsonRpcProvider(RPC);
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const viewerAbi = JSON.parse(readFileSync('src/components/ABI/genericFundViewer.json', 'utf8'));
const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);
const viewer = new ethers.Contract(VIEWER_ADDR, viewerAbi.abi ?? viewerAbi, provider);

const fmt = (wei) => Math.round(Number(ethers.formatEther(wei)));
const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);

async function main() {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - 1500000;

  // Get all LoanRepaid events
  const repaidEvents = await core.queryFilter(core.filters.LoanRepaid(UNION), fromBlock, latestBlock);

  // Group by loanId (multiple partial repayments possible)
  const byLoan = {};
  for (const ev of repaidEvents) {
    const { loanId, interestPaid, principalPaid } = ev.args;
    if (!byLoan[loanId]) {
      byLoan[loanId] = { loanId, totalInterest: 0n, totalPrincipal: 0n, events: [] };
    }
    byLoan[loanId].totalInterest += interestPaid;
    byLoan[loanId].totalPrincipal += principalPaid;
    byLoan[loanId].events.push(ev);
  }

  // Also find CashScanMint events to get scan amounts per loan
  const allScans = await fxPool.queryFilter(fxPool.filters.CashScanMint(), fromBlock, latestBlock);
  const scansByLoan = {};
  for (const ev of allScans) {
    if (ev.args.union.toLowerCase() !== UNION.toLowerCase()) continue;
    const tx = await provider.getTransaction(ev.transactionHash);
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      const purpose = Number(decoded.args[4]);
      if (purpose !== 1) continue; // REPAY only
      const loanId = decoded.args[5]?.toString();
      if (!scansByLoan[loanId]) scansByLoan[loanId] = 0n;
      scansByLoan[loanId] += ev.args.ninAmount;
    } catch {}
  }

  // Filter: interest > 50 INR
  const filtered = Object.values(byLoan).filter(l => fmt(l.totalInterest) > 50);

  // Enrich with loan info
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  REPAID LOANS (30 days) — Interest > ₹50');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  let grandPrincipal = 0n, grandInterest = 0n, grandScanned = 0n;

  for (const l of filtered) {
    // Get loan details
    let borrower = '', principal = 0n, rateBP = 0, isClosed = false;
    try {
      const info = await viewer.getBorrowerInfo(UNION, l.loanId);
      borrower = info[0];
      principal = info[2];
      rateBP = Number(info[4]);
      isClosed = info[6];
    } catch {}

    const scanned = scansByLoan[l.loanId] || 0n;
    const surplus = scanned > 0n ? scanned - (l.totalInterest + l.totalPrincipal) : 0n;

    grandPrincipal += l.totalPrincipal;
    grandInterest += l.totalInterest;
    grandScanned += scanned;

    // Get dates
    const firstBlock = await provider.getBlock(l.events[0].blockNumber);
    const lastBlock = await provider.getBlock(l.events[l.events.length - 1].blockNumber);
    const firstDate = new Date(firstBlock.timestamp * 1000).toISOString().slice(0, 10);
    const lastDate = new Date(lastBlock.timestamp * 1000).toISOString().slice(0, 10);
    const dateStr = firstDate === lastDate ? firstDate : `${firstDate} → ${lastDate}`;

    console.log(`  Loan ...${l.loanId.slice(-6)} | ${isClosed ? '✅ CLOSED' : '⚠️  OPEN'} | ${dateStr}`);
    console.log(`    Borrower:  ${borrower}`);
    console.log(`    Original:  ₹${fmtExact(principal)} | Rate: ${rateBP} BP (${(rateBP/100).toFixed(1)}% annual)`);
    console.log(`    Repaid:    ₹${fmtExact(l.totalPrincipal)} principal + ₹${fmtExact(l.totalInterest)} interest = ₹${fmtExact(l.totalPrincipal + l.totalInterest)}`);
    if (scanned > 0n) {
      console.log(`    Scanned:   ₹${fmtExact(scanned)} cash | Surplus: ₹${fmtExact(surplus)}`);
      console.log(`    Interest ate: ₹${fmtExact(l.totalInterest)} of the scanned cash (${((Number(l.totalInterest) / Number(scanned)) * 100).toFixed(1)}%)`);
    }
    console.log();
  }

  console.log('───────────────────────────────────────────────────────────────────────────────');
  console.log(`  TOTALS (${filtered.length} loans):`);
  console.log(`    Principal repaid:  ₹${fmtExact(grandPrincipal)}`);
  console.log(`    Interest paid:     ₹${fmtExact(grandInterest)}`);
  console.log(`    Total repaid:      ₹${fmtExact(grandPrincipal + grandInterest)}`);
  console.log(`    Total scanned:     ₹${fmtExact(grandScanned)}`);
  console.log(`    Interest % of scanned: ${grandScanned > 0n ? ((Number(grandInterest) / Number(grandScanned)) * 100).toFixed(1) : 'N/A'}%`);
  console.log();
}

main().catch(console.error);
