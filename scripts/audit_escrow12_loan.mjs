import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const VIEWER_ADDR = '0x435A12c4fD4B5a2D1D2ae6AB19D431D62084AdDA';

const provider = new ethers.JsonRpcProvider(RPC);
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const viewerAbi = JSON.parse(readFileSync('src/components/ABI/genericFundViewer.json', 'utf8'));
const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const viewer = new ethers.Contract(VIEWER_ADDR, viewerAbi.abi ?? viewerAbi, provider);

const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);

async function main() {
  const FARMER = '0x33D8D0B5550BF1B144A16501103b00F2078eF59A';
  const LOAN_ID = '0x000000000000000000000000000000000000000000000000000000000005ab81';

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ESCROW #12 LOAN: ${LOAN_ID.slice(-8)}`);
  console.log(`  FARMER: ${FARMER}`);
  console.log('═══════════════════════════════════════════════════════');

  // Check loan via viewer
  try {
    const info = await viewer.getBorrowerInfo(UNION, LOAN_ID);
    const raw = info.toArray ? info.toArray() : info;
    const principal = raw[2];
    const principalRepaid = raw[3];
    const isClosed = raw[6];
    const status = raw[9];
    console.log(`\n  getBorrowerInfo:`);
    console.log(`    Principal:       ${fmtExact(principal)} nIN`);
    console.log(`    PrincipalRepaid: ${fmtExact(principalRepaid)} nIN`);
    console.log(`    IsClosed:        ${isClosed}`);
    console.log(`    Status:          ${status}`);
    console.log(`    Outstanding:     ${fmtExact(principal - principalRepaid)} nIN`);
    console.log(`    Raw:`, JSON.stringify(raw, (k,v) => typeof v === 'bigint' ? v.toString() : v));
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  // Check via Core.loans
  try {
    const loan = await core.loans(UNION, LOAN_ID);
    const raw = loan.toArray ? loan.toArray() : loan;
    console.log(`\n  Core.loans:`);
    console.log(`    Raw:`, JSON.stringify(raw, (k,v) => typeof v === 'bigint' ? v.toString() : v));

    // Parse key fields
    console.log(`    borrower: ${raw[0]}`);
    console.log(`    principal: ${fmtExact(raw[2])} nIN`);
    console.log(`    totalRepaid (idx 7): ${fmtExact(raw[7])} nIN`);
    console.log(`    isClosed (idx 12): ${raw[12]}`);
    console.log(`    status (idx 13): ${raw[13]}`);
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  // Check active loans for this farmer
  try {
    const loans = await viewer.getLoansByBorrower(UNION, FARMER);
    console.log(`\n  Active loans for ${FARMER}: ${loans.length}`);
    for (const l of loans) {
      console.log(`    Loan: ${l}`);
      const info = await viewer.getBorrowerInfo(UNION, l);
      console.log(`    Principal: ${fmtExact(info[2])} | Repaid: ${fmtExact(info[3])} | Closed: ${info[6]} | Status: ${info[9]}`);
    }
  } catch (e) {
    console.log(`  getLoansByBorrower error: ${e.message}`);
  }
}

main().catch(console.error);
