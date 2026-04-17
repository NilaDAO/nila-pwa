/**
 * Deep audit — trace every tx, expand CashScanMint search, check nIN balances
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR  = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const NIN_TOKEN = '0x3221749c0C37958375EE92332E5ba7d73eC45865';

const provider = new ethers.JsonRpcProvider(RPC);

const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));

const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

const fmt = (wei) => Math.round(Number(ethers.formatEther(wei)));
const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);

async function main() {
  const latestBlock = await provider.getBlockNumber();

  // ─── A. Expand CashScanMint to 30 days ────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CashScanMint EVENTS — FULL HISTORY (30 days)');
  console.log('═══════════════════════════════════════════════════════');

  const fromBlock30d = latestBlock - 1500000; // ~30 days
  const cashScanFilter = fxPool.filters.CashScanMint(UNION);
  const cashScanEvents = await fxPool.queryFilter(cashScanFilter, fromBlock30d, latestBlock);
  console.log(`  Found ${cashScanEvents.length} CashScanMint events in 30-day window`);

  if (cashScanEvents.length === 0) {
    // Try unfiltered — maybe union param is wrong
    console.log('  Trying unfiltered CashScanMint (all unions, last 5 days)...');
    const fromBlock5d = latestBlock - 250000;
    const allCashScanFilter = fxPool.filters.CashScanMint();
    const allCashScans = await fxPool.queryFilter(allCashScanFilter, fromBlock5d, latestBlock);
    console.log(`  Found ${allCashScans.length} total CashScanMint events across all unions`);
    for (const ev of allCashScans) {
      const { union, fundAddr, ninAmount, inrValue } = ev.args;
      console.log(`    Union: ${union}  |  INR: ₹${fmt(inrValue)}  |  nIN: ${fmtExact(ninAmount)}`);
    }
  }

  for (const ev of cashScanEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { ninAmount, inrValue, rate, scanHash } = ev.args;
    console.log(`  [${ts}] INR: ₹${fmt(inrValue)} | nIN: ${fmtExact(ninAmount)} | Tx: ${ev.transactionHash.slice(0,22)}...`);

    const tx = await provider.getTransaction(ev.transactionHash);
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
      const purpose = Number(decoded.args[4]);
      console.log(`    Purpose: ${purposeMap[purpose]} | Member: ${decoded.args[6]} | EscrowResolve: ${decoded.args[7]?.toString()}`);
    } catch {}
  }
  console.log();

  // ─── B. Trace each repayment tx in detail ─────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DETAILED REPAYMENT TX TRACES');
  console.log('═══════════════════════════════════════════════════════');

  const fromBlock5d = latestBlock - 250000;
  const repaidFilter = core.filters.LoanRepaid(UNION);
  const repaidEvents = await core.queryFilter(repaidFilter, fromBlock5d, latestBlock);

  for (const ev of repaidEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, interestPaid, principalPaid } = ev.args;
    const total = interestPaid + principalPaid;

    console.log(`\n  ── Repay [${ts}] ──`);
    console.log(`  LoanId: ${loanId}`);
    console.log(`  Interest: ₹${fmtExact(interestPaid)} | Principal: ₹${fmtExact(principalPaid)} | Total: ₹${fmtExact(total)}`);

    // Get full receipt to see ALL events in this tx (including CashScanMint, transfers, etc.)
    const receipt = await provider.getTransactionReceipt(ev.transactionHash);
    console.log(`  Tx: ${ev.transactionHash}`);
    console.log(`  From: ${receipt.from}`);
    console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`  Events in this tx:`);

    for (const log of receipt.logs) {
      try {
        // Try parsing with FxPool
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          console.log(`    → FxPool.${parsed.name}: ${JSON.stringify(Object.fromEntries(parsed.args.toArray().map((v,i) => [parsed.fragment.inputs[i]?.name || i, typeof v === 'bigint' ? `${fmtExact(v)} nIN` : v.toString()])))}`);
        }
      } catch {}
      try {
        // Try parsing with Core
        const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          console.log(`    → Core.${parsed.name}: ${JSON.stringify(Object.fromEntries(parsed.args.toArray().map((v,i) => [parsed.fragment.inputs[i]?.name || i, typeof v === 'bigint' ? `${fmtExact(v)} nIN` : v.toString()])))}`);
        }
      } catch {}
      // Check for ERC20 Transfer events (nIN token movements)
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        console.log(`    → nIN Transfer: ${from.slice(0,10)}... → ${to.slice(0,10)}... | ${fmtExact(value)} nIN`);
      }
    }
  }
  console.log();

  // ─── C. Trace each AcceptLoan tx in detail ────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DETAILED LOAN DISBURSEMENT TX TRACES');
  console.log('═══════════════════════════════════════════════════════');

  const acceptedFilter = core.filters.LoanAccepted(UNION);
  const acceptedEvents = await core.queryFilter(acceptedFilter, fromBlock5d, latestBlock);

  for (const ev of acceptedEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, amount, borrower } = ev.args;

    console.log(`\n  ── AcceptLoan [${ts}] ──`);
    console.log(`  LoanId: ${loanId}`);
    console.log(`  Amount: ₹${fmtExact(amount)} | Borrower: ${borrower}`);

    const receipt = await provider.getTransactionReceipt(ev.transactionHash);
    console.log(`  Tx: ${ev.transactionHash}`);
    console.log(`  From: ${receipt.from}`);
    console.log(`  Events in this tx:`);

    for (const log of receipt.logs) {
      try {
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          console.log(`    → FxPool.${parsed.name}: ${JSON.stringify(Object.fromEntries(parsed.args.toArray().map((v,i) => [parsed.fragment.inputs[i]?.name || i, typeof v === 'bigint' ? `${fmtExact(v)}` : v.toString()])))}`);
        }
      } catch {}
      try {
        const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          console.log(`    → Core.${parsed.name}: ${JSON.stringify(Object.fromEntries(parsed.args.toArray().map((v,i) => [parsed.fragment.inputs[i]?.name || i, typeof v === 'bigint' ? `${fmtExact(v)}` : v.toString()])))}`);
        }
      } catch {}
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        console.log(`    → nIN Transfer: ${from.slice(0,10)}... → ${to.slice(0,10)}... | ${fmtExact(value)} nIN`);
      }
    }
  }
  console.log();

  // ─── D. Trace each FarmerNinBurned tx ─────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DETAILED BURN TX TRACES');
  console.log('═══════════════════════════════════════════════════════');

  const burnFilter = fxPool.filters.FarmerNinBurned(UNION);
  const burnEvents = await fxPool.queryFilter(burnFilter, fromBlock5d, latestBlock);

  for (const ev of burnEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { farmer, amount } = ev.args;

    console.log(`\n  ── Burn [${ts}] ──`);
    console.log(`  Farmer: ${farmer} | Amount: ₹${fmtExact(amount)}`);

    const receipt = await provider.getTransactionReceipt(ev.transactionHash);
    console.log(`  Tx: ${ev.transactionHash}`);
    console.log(`  From: ${receipt.from}`);
    console.log(`  Events in this tx:`);

    for (const log of receipt.logs) {
      try {
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          console.log(`    → FxPool.${parsed.name}`);
        }
      } catch {}
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        console.log(`    → nIN Transfer: ${from.slice(0,10)}... → ${to.slice(0,10)}... | ${fmtExact(value)} nIN`);
      }
    }
  }
  console.log();

  // ─── E. ALL escrows for this union (full scan) ────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALL ESCROWS FOR THIS UNION (full scan)');
  console.log('═══════════════════════════════════════════════════════');

  const nextId = await fxPool.nextEscrowId();
  console.log(`  Total escrows in system: ${nextId.toString()}`);

  for (let id = 0n; id < nextId; id++) {
    try {
      const escrow = await fxPool.getEscrow(id);
      const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
      if (escrowUnion !== UNION.toLowerCase()) continue;

      const status = Number(escrow.status ?? escrow[6]);
      const statusMap = {0: 'ACTIVE', 1: 'RESOLVED_CASH', 2: 'RESOLVED_USDT', 3: 'BURNED'};
      const ninAmt = escrow.ninAmount ?? escrow[2];
      const inrVal = escrow.inrValue ?? escrow[3];
      const deadline = Number(escrow.deadline ?? escrow[5]);

      console.log(`  Escrow #${id}: Status=${statusMap[status] || status} | nIN=${fmtExact(ninAmt)} | INR=₹${fmt(inrVal)} | Deadline=${new Date(deadline * 1000).toISOString()}`);
    } catch (e) {
      // skip
    }
  }
  console.log();

  // ─── F. nIN token balance of the union ────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  nIN TOKEN BALANCES');
  console.log('═══════════════════════════════════════════════════════');

  const erc20Abi = ['function balanceOf(address) view returns (uint256)', 'function totalSupply() view returns (uint256)'];
  const nin = new ethers.Contract(NIN_TOKEN, erc20Abi, provider);

  const [unionBal, coreBal, fxBal, totalSupply] = await Promise.all([
    nin.balanceOf(UNION),
    nin.balanceOf(CORE_ADDR),
    nin.balanceOf(FXPOOL_ADDR),
    nin.totalSupply(),
  ]);

  console.log(`  Union balance:     ${fmtExact(unionBal)} nIN`);
  console.log(`  Core balance:      ${fmtExact(coreBal)} nIN`);
  console.log(`  FxPool balance:    ${fmtExact(fxBal)} nIN`);
  console.log(`  Total supply:      ${fmtExact(totalSupply)} nIN`);
  console.log();

  // ─── G. Check borrower nIN balances for recent borrowers ──────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  BORROWER nIN BALANCES');
  console.log('═══════════════════════════════════════════════════════');

  const borrowers = new Set();
  for (const ev of acceptedEvents) {
    borrowers.add(ev.args.borrower);
  }
  for (const ev of burnEvents) {
    borrowers.add(ev.args.farmer);
  }
  for (const addr of borrowers) {
    const bal = await nin.balanceOf(addr);
    console.log(`  ${addr}: ${fmtExact(bal)} nIN`);
  }
  console.log();

  // ─── H. Check ALL LoanRepaid for this union (30 days) ────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALL LoanRepaid EVENTS (30 days)');
  console.log('═══════════════════════════════════════════════════════');

  const repaid30 = await core.queryFilter(core.filters.LoanRepaid(UNION), fromBlock30d, latestBlock);
  let total30Interest = 0n, total30Principal = 0n;
  for (const ev of repaid30) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, interestPaid, principalPaid } = ev.args;
    total30Interest += interestPaid;
    total30Principal += principalPaid;
    console.log(`  [${ts}] Loan ${loanId.slice(0,18)}... | Interest: ₹${fmtExact(interestPaid)} | Principal: ₹${fmtExact(principalPaid)} | Total: ₹${fmtExact(interestPaid + principalPaid)}`);
  }
  console.log(`  TOTAL (30d): Interest ₹${fmt(total30Interest)} + Principal ₹${fmt(total30Principal)} = ₹${fmt(total30Interest + total30Principal)}`);

  // ─── I. Check ALL LoanAccepted (30 days) ──────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL LoanAccepted EVENTS (30 days)');
  console.log('═══════════════════════════════════════════════════════');

  const accepted30 = await core.queryFilter(core.filters.LoanAccepted(UNION), fromBlock30d, latestBlock);
  let total30Disbursed = 0n;
  for (const ev of accepted30) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, amount, borrower } = ev.args;
    total30Disbursed += amount;
    console.log(`  [${ts}] Loan ${loanId.slice(0,18)}... | Amount: ₹${fmtExact(amount)} | Borrower: ${borrower}`);
  }
  console.log(`  TOTAL DISBURSED (30d): ₹${fmt(total30Disbursed)}`);
}

main().catch(console.error);
