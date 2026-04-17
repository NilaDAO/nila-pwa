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

const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);
const fmt = (wei) => Math.round(Number(ethers.formatEther(wei)));

const FARMER = '0x316aC3c2ea25dF803De875eD7cd436609d20783A';
const LOANS = [
  '0x00000000000000000000000000000000000000000000000000000000000a6e66',
  '0x00000000000000000000000000000000000000000000000000000000000c9168',
];

async function main() {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - 1500000;

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  LILY FARM — 0x316aC3...20783A`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const loanId of LOANS) {
    const short = loanId.slice(-6);

    // Get full loan struct from Core
    const loan = await core.loans(UNION, loanId);
    const raw = loan.toArray ? loan.toArray() : loan;

    // Get viewer info
    const info = await viewer.getBorrowerInfo(UNION, loanId);

    const principal = raw[2];
    const rateBP = Number(raw[3]);
    const createTs = Number(raw[4]);
    const drawdownTs = Number(raw[5]);
    const principalRepaid = raw[7];
    const interestPaid = raw[8];  // interestAccrued/paid from contract state
    const isClosed = raw[12];
    const status = raw[13];

    // Viewer fields
    const vPrincipal = info[2];
    const vRepaid = info[3];
    const vIsClosed = info[6];
    const vOutstanding = info[8];

    console.log(`  ── Loan ...${short} ──`);
    console.log(`    Principal:        ₹${fmtExact(principal)}`);
    console.log(`    Rate:             ${rateBP} BP (${(rateBP/100).toFixed(1)}% annual)`);
    console.log(`    Drawdown:         ${new Date(drawdownTs * 1000).toISOString().slice(0,10)}`);
    console.log(`    Principal Repaid: ₹${fmtExact(principalRepaid)}`);
    console.log(`    Interest Paid:    ₹${fmtExact(interestPaid)}`);
    console.log(`    Total Paid:       ₹${fmtExact(principalRepaid + interestPaid)}`);
    console.log(`    Outstanding:      ₹${fmtExact(BigInt(vOutstanding.toString()))}`);
    console.log(`    Closed:           ${isClosed} | Status: ${status}`);
    console.log();

    // LoanRepaid events for this loan
    const repaidEvents = await core.queryFilter(core.filters.LoanRepaid(UNION, loanId), fromBlock, latestBlock);
    if (repaidEvents.length > 0) {
      console.log(`    LoanRepaid events (on-chain):`);
      let evtInterest = 0n, evtPrincipal = 0n;
      for (const ev of repaidEvents) {
        const block = await provider.getBlock(ev.blockNumber);
        const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
        evtInterest += ev.args.interestPaid;
        evtPrincipal += ev.args.principalPaid;
        console.log(`      [${ts}] interest ₹${fmtExact(ev.args.interestPaid)} + principal ₹${fmtExact(ev.args.principalPaid)}`);
      }
      console.log(`      Event totals: interest ₹${fmtExact(evtInterest)} + principal ₹${fmtExact(evtPrincipal)}`);
      console.log(`      MISSING from events: interest ₹${fmtExact(interestPaid - evtInterest)} + principal ₹${fmtExact(principalRepaid - evtPrincipal)}`);
      console.log(`      (repaid via internal cashScanMint path — no LoanRepaid event)`);
    } else {
      console.log(`    LoanRepaid events: NONE`);
      console.log(`    ALL repayment happened via internal cashScanMint path`);
    }

    // CashScanMint events for this loan
    const allScans = await fxPool.queryFilter(fxPool.filters.CashScanMint(), fromBlock, latestBlock);
    let scanTotal = 0n;
    const loanScans = [];
    for (const ev of allScans) {
      if (ev.args.union.toLowerCase() !== UNION.toLowerCase()) continue;
      const tx = await provider.getTransaction(ev.transactionHash);
      try {
        const decoded = fxPool.interface.parseTransaction({ data: tx.data });
        if (decoded.args[5]?.toString() === loanId) {
          const block = await provider.getBlock(ev.blockNumber);
          const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
          scanTotal += ev.args.ninAmount;
          loanScans.push({ ts, amount: ev.args.ninAmount });
        }
      } catch {}
    }

    if (loanScans.length > 0) {
      console.log(`\n    CashScanMint scans for this loan:`);
      for (const s of loanScans) {
        console.log(`      [${s.ts}] ₹${fmtExact(s.amount)}`);
      }
      console.log(`      Total scanned: ₹${fmtExact(scanTotal)}`);
      console.log(`      Total applied: ₹${fmtExact(principalRepaid + interestPaid)} (principal + interest)`);
      console.log(`      Difference:    ₹${fmtExact(scanTotal - principalRepaid - interestPaid)} (surplus held in escrow, later burned)`);
    }

    console.log('\n');
  }
}

main().catch(console.error);
