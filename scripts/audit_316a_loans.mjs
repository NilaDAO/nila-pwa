/**
 * Check ALL loan activity for farmer 0x316aC3c2ea25dF803De875eD7cd436609d20783A
 * against union 0xF18E...070. Verify if loans 0a6e66 and 0c9168 are actually closed.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FARMER = '0x316aC3c2ea25dF803De875eD7cd436609d20783A';
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

const fmt = (wei) => Math.round(Number(ethers.formatEther(wei)));
const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);

async function main() {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - 1500000; // ~30 days

  // ─── 1. Query loans for this borrower via viewer ──────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  LOANS FOR FARMER ${FARMER}`);
  console.log('═══════════════════════════════════════════════════════');

  try {
    const loanIds = await viewer.getLoansByBorrower(UNION, FARMER);
    console.log(`  Found ${loanIds.length} loans via viewer.getLoansByBorrower\n`);

    for (const loanId of loanIds) {
      console.log(`  ── Loan ${loanId} ──`);
      try {
        const info = await viewer.getBorrowerInfo(UNION, loanId);
        console.log(`    Raw result:`, JSON.stringify(info, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
      } catch (e) {
        console.log(`    getBorrowerInfo error: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  getLoansByBorrower error: ${e.message}`);
  }

  // ─── 2. Direct query of the two known loan IDs ────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  DIRECT LOAN QUERY — 0x...0a6e66 and 0x...0c9168');
  console.log('═══════════════════════════════════════════════════════');

  const loanIds = [
    '0x00000000000000000000000000000000000000000000000000000000000a6e66',
    '0x00000000000000000000000000000000000000000000000000000000000c9168',
  ];

  for (const loanId of loanIds) {
    console.log(`\n  ── Loan ${loanId.slice(0, 22)}...${loanId.slice(-6)} ──`);
    try {
      const info = await viewer.getBorrowerInfo(UNION, loanId);
      const fields = info.toArray ? info.toArray() : info;
      console.log(`    Raw:`, JSON.stringify(fields, (k, v) => typeof v === 'bigint' ? v.toString() : v));
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }

    // Also try reading from core directly
    try {
      // Try different function names
      const funcs = ['loans', 'loanInfo', 'getLoan'];
      for (const fn of funcs) {
        if (core[fn]) {
          const result = await core[fn](UNION, loanId);
          console.log(`    Core.${fn}:`, JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v));
          break;
        }
      }
    } catch {}
  }

  // ─── 3. ALL LoanRepaid events for these specific loans ────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL LoanRepaid EVENTS for loans 0a6e66 and 0c9168');
  console.log('═══════════════════════════════════════════════════════');

  for (const loanId of loanIds) {
    console.log(`\n  Loan ${loanId.slice(-6)}:`);
    const filter = core.filters.LoanRepaid(UNION, loanId);
    const events = await core.queryFilter(filter, fromBlock, latestBlock);

    if (events.length === 0) {
      // Try wider search
      const allRepaid = await core.queryFilter(core.filters.LoanRepaid(UNION), fromBlock, latestBlock);
      const matching = allRepaid.filter(e => e.args.loanId === loanId);
      console.log(`    Direct filter: 0 events. Broad search found ${matching.length} matching.`);
      for (const ev of matching) {
        const block = await provider.getBlock(ev.blockNumber);
        const ts = new Date(block.timestamp * 1000).toISOString();
        console.log(`    [${ts}] Interest: ${fmtExact(ev.args.interestPaid)} + Principal: ${fmtExact(ev.args.principalPaid)}`);
      }
    } else {
      let totalRepaid = 0n;
      for (const ev of events) {
        const block = await provider.getBlock(ev.blockNumber);
        const ts = new Date(block.timestamp * 1000).toISOString();
        const total = ev.args.interestPaid + ev.args.principalPaid;
        totalRepaid += total;
        console.log(`    [${ts}] Interest: ${fmtExact(ev.args.interestPaid)} + Principal: ${fmtExact(ev.args.principalPaid)} = ${fmtExact(total)}`);
        console.log(`      Tx: ${ev.transactionHash}`);
      }
      console.log(`    Total repaid: ${fmtExact(totalRepaid)}`);
    }
  }

  // ─── 4. ALL LoanAccepted events for this farmer ───────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL LoanAccepted EVENTS for this farmer');
  console.log('═══════════════════════════════════════════════════════');

  const acceptedAll = await core.queryFilter(core.filters.LoanAccepted(UNION), fromBlock, latestBlock);
  for (const ev of acceptedAll) {
    if (ev.args.borrower?.toLowerCase() === FARMER.toLowerCase()) {
      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      console.log(`  [${ts}] LoanAccepted: LoanId ${ev.args.loanId.slice(-8)} | Amount: ${fmtExact(ev.args.amount)}`);
      console.log(`    Tx: ${ev.transactionHash}`);
    }
  }

  // ─── 5. Also check the 11k INVEST scan for this farmer (Apr 7) ───
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  THE 11K INVEST SCAN (Apr 7 04:08) for this farmer');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Member 0x316aC3 had an 11,000 INVEST scan on Apr 7 04:08:31');
  console.log('  This went to escrow #8 which was later resolved for cash-outs.');
  console.log('  If 0x316aC3 is Lily Farm, they also invested 11,000.');

  // ─── 6. nIN balance of this farmer ────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  nIN BALANCE');
  console.log('═══════════════════════════════════════════════════════');
  const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
  const nin = new ethers.Contract(NIN_TOKEN, erc20Abi, provider);
  const bal = await nin.balanceOf(FARMER);
  console.log(`  ${FARMER}: ${fmtExact(bal)} nIN`);

  // ─── 7. Check ALL repaid events more broadly (60 days) ────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL LoanRepaid for union (60 days)');
  console.log('═══════════════════════════════════════════════════════');

  const fromBlock60d = latestBlock - 3000000;
  const allRepaid60 = await core.queryFilter(core.filters.LoanRepaid(UNION), fromBlock60d, latestBlock);
  console.log(`  Total LoanRepaid events (60 days): ${allRepaid60.length}`);
  let grandTotal = 0n;
  for (const ev of allRepaid60) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const total = ev.args.interestPaid + ev.args.principalPaid;
    grandTotal += total;
    console.log(`  [${ts}] Loan ...${ev.args.loanId.slice(-6)} | ${fmtExact(total)} (int ${fmtExact(ev.args.interestPaid)} + prin ${fmtExact(ev.args.principalPaid)})`);
  }
  console.log(`  Grand total repaid (60d): ${fmtExact(grandTotal)}`);
}

main().catch(console.error);
