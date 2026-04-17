/**
 * Trace the burned escrows (0-5) — find their creation CashScanMint events
 * and verify whether repayLoan was actually called.
 * Also check the 10k farmer wallet repayment.
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

  // ─── 1. Find ALL CashScanMint events (unfiltered, 15 days) ───────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALL CashScanMint EVENTS (15 days, unfiltered)');
  console.log('═══════════════════════════════════════════════════════');

  const fromBlock15d = latestBlock - 750000; // ~15 days
  const allCashScans = await fxPool.queryFilter(fxPool.filters.CashScanMint(), fromBlock15d, latestBlock);

  console.log(`  Found ${allCashScans.length} CashScanMint events total\n`);

  for (const ev of allCashScans) {
    const { union, ninAmount, inrValue, scanHash } = ev.args;
    if (union.toLowerCase() !== UNION.toLowerCase()) continue;

    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const tx = await provider.getTransaction(ev.transactionHash);
    const receipt = await provider.getTransactionReceipt(ev.transactionHash);

    // Decode purpose
    let purposeLabel = 'UNKNOWN', member = '', loanIdHex = '';
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      if (decoded) {
        const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
        purposeLabel = purposeMap[Number(decoded.args[4])] || `${decoded.args[4]}`;
        member = decoded.args[6]?.toString() || '';
        loanIdHex = decoded.args[5]?.toString() || '';
      }
    } catch {}

    // Check for LoanRepaid in same tx
    let hasRepay = false, repayTotal = 0n, repayLoanId = '';
    let hasAcceptLoan = false, acceptAmount = 0n;
    for (const log of receipt.logs) {
      try {
        const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'LoanRepaid') {
          hasRepay = true;
          repayTotal = parsed.args.interestPaid + parsed.args.principalPaid;
          repayLoanId = parsed.args.loanId;
        }
        if (parsed?.name === 'LoanAccepted') {
          hasAcceptLoan = true;
          acceptAmount = parsed.args.amount;
        }
      } catch {}
    }

    console.log(`  [${ts}] Scan ${fmtExact(ninAmount)} nIN | Purpose: ${purposeLabel} | Member: ${member}`);
    console.log(`    Tx: ${ev.transactionHash}`);
    console.log(`    Caller: ${tx.from}`);
    if (loanIdHex && loanIdHex !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      console.log(`    LoanId: ${loanIdHex}`);
    }
    if (hasRepay) {
      console.log(`    ✅ LoanRepaid in same tx: ₹${fmtExact(repayTotal)} | LoanId: ${repayLoanId}`);
    } else if (purposeLabel === 'REPAY') {
      console.log(`    ❌ NO LoanRepaid in this tx! Scan was REPAY but no repayment processed.`);
    }
    if (hasAcceptLoan) {
      console.log(`    ✅ LoanAccepted: ₹${fmtExact(acceptAmount)}`);
    }
    console.log();
  }

  // ─── 2. ALL LoanRepaid events (15 days) with full detail ──────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALL LoanRepaid EVENTS (15 days) — full detail');
  console.log('═══════════════════════════════════════════════════════');

  const repaidEvents = await core.queryFilter(core.filters.LoanRepaid(UNION), fromBlock15d, latestBlock);
  let totalRepaid = 0n;

  for (const ev of repaidEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const { loanId, interestPaid, principalPaid } = ev.args;
    const total = interestPaid + principalPaid;
    totalRepaid += total;

    const receipt = await provider.getTransactionReceipt(ev.transactionHash);
    const tx = await provider.getTransaction(ev.transactionHash);

    // Check if CashScanMint in same tx
    let hasScan = false, scanAmount = 0n;
    for (const log of receipt.logs) {
      try {
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'CashScanMint') {
          hasScan = true;
          scanAmount = parsed.args.ninAmount;
        }
      } catch {}
    }

    // Check nIN transfers to understand where nIN came from
    let transfers = [];
    for (const log of receipt.logs) {
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        transfers.push({ from, to, amount: value });
      }
    }

    console.log(`  [${ts}] LoanRepaid ₹${fmtExact(total)} (interest ${fmtExact(interestPaid)} + principal ${fmtExact(principalPaid)})`);
    console.log(`    LoanId: ${loanId}`);
    console.log(`    Tx: ${ev.transactionHash}`);
    console.log(`    Caller: ${tx.from}`);
    if (hasScan) {
      console.log(`    📷 CashScanMint in same tx: ${fmtExact(scanAmount)} nIN (scanned ₹${fmt(scanAmount)}, repaid ₹${fmt(total)}, surplus ₹${fmt(scanAmount - total)})`);
    } else {
      console.log(`    💳 No scan — paid from farmer's existing nIN balance`);
      for (const t of transfers) {
        const fromLabel = t.from === ethers.ZeroAddress ? 'MINT' : t.from.slice(0,10) + '...';
        const toLabel = t.to === ethers.ZeroAddress ? 'BURN' : t.to.slice(0,10) + '...';
        console.log(`       nIN: ${fromLabel} → ${toLabel}: ${fmtExact(t.amount)}`);
      }
    }
    console.log();
  }
  console.log(`  TOTAL ON-CHAIN REPAID (15 days): ₹${fmtExact(totalRepaid)}`);

  // ─── 3. Burned escrow details — trace creation txs ────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  BURNED ESCROWS — CREATION TRACE');
  console.log('═══════════════════════════════════════════════════════');

  // For burned escrows, we need to find their creation events.
  // The creation would be a CashScanMint that assigned them their escrowId.
  // Since we now have ALL CashScanMint events from 15 days, let's match.

  // But escrow creation might not be directly in CashScanMint event.
  // Let's look at the escrow data and try to find the tx that created each one.

  for (let id = 0n; id <= 5n; id++) {
    const escrow = await fxPool.getEscrow(id);
    const status = Number(escrow.status ?? escrow[6]);
    const ninAmt = escrow.ninAmount ?? escrow[2];
    const member = escrow.member ?? escrow[4];
    const deadline = Number(escrow.deadline ?? escrow[5]);
    const statusMap = {0: 'ACTIVE', 1: 'RESOLVED_CASH', 2: 'RESOLVED_USDT', 3: 'BURNED'};

    console.log(`\n  Escrow #${id}: ${statusMap[status]} | nIN: ${fmtExact(ninAmt)} | Member: ${member}`);
    console.log(`    Deadline: ${new Date(deadline * 1000).toISOString()}`);

    // Try to find the burn tx
    const burnEvents = await fxPool.queryFilter(fxPool.filters.EscrowBurned(id), fromBlock15d, latestBlock);
    for (const b of burnEvents) {
      const block = await provider.getBlock(b.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      console.log(`    🔥 Burned at [${ts}]: ${fmtExact(b.args.ninAmount)} nIN | Tx: ${b.transactionHash.slice(0, 22)}...`);
    }

    // Try to find resolve events
    const resolveEvents = await fxPool.queryFilter(fxPool.filters.EscrowResolved(id), fromBlock15d, latestBlock);
    for (const r of resolveEvents) {
      const block = await provider.getBlock(r.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      const resMap = {0: 'PARTIAL', 1: 'CASH', 2: 'USDT', 3: 'BURNED'};
      const receipt = await provider.getTransactionReceipt(r.transactionHash);
      const tx = await provider.getTransaction(r.transactionHash);

      // Decode the resolve call to find how much was resolved
      let resolveAmount = '?';
      try {
        const decoded = fxPool.interface.parseTransaction({ data: tx.data });
        if (decoded) {
          resolveAmount = fmtExact(decoded.args[1]);
        }
      } catch {}

      console.log(`    📤 Resolved at [${ts}]: ${resMap[Number(r.args.resolution)]} | Amount resolved: ${resolveAmount} nIN | Tx: ${r.transactionHash.slice(0, 22)}...`);
    }
  }

  // ─── 4. The 10k wallet payment — who is this farmer? ─────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  THE 10K WALLET PAYMENT (Apr 3 13:20)');
  console.log('═══════════════════════════════════════════════════════');

  // Tx: 0xd34c7d704952e5f9...
  const walletRepayTx = '0xd34c7d704952e5f90c17815bc5a46786de098a7c6135a4c0b6e0534358fa1b4c';
  const receipt = await provider.getTransactionReceipt(walletRepayTx);
  const tx = await provider.getTransaction(walletRepayTx);

  console.log(`  Tx: ${walletRepayTx}`);
  console.log(`  Caller: ${tx.from}`);

  // Decode calldata
  try {
    const decoded = core.interface.parseTransaction({ data: tx.data });
    if (decoded) {
      console.log(`  Function: Core.${decoded.name}(${decoded.args.map(a => typeof a === 'bigint' ? fmtExact(a) : a.toString()).join(', ')})`);
    }
  } catch {
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      if (decoded) {
        console.log(`  Function: FxPool.${decoded.name}(${decoded.args.map(a => typeof a === 'bigint' ? fmtExact(a) : a.toString()).join(', ')})`);
      }
    } catch {}
  }

  // All events
  for (const log of receipt.logs) {
    try {
      const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed) {
        const args = parsed.args.toArray().map((v, i) => `${parsed.fragment.inputs[i]?.name}: ${typeof v === 'bigint' ? fmtExact(v) : v}`);
        console.log(`  → Core.${parsed.name}(${args.join(', ')})`);
      }
    } catch {}
    if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
      const from = ethers.getAddress('0x' + log.topics[1].slice(26));
      const to = ethers.getAddress('0x' + log.topics[2].slice(26));
      const value = BigInt(log.data);
      console.log(`  → nIN Transfer: ${from} → ${to}: ${fmtExact(value)}`);
    }
  }

  // ─── 5. Escrow #12 (the 10k with no repay) — full trace ──────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  ESCROW #12 — THE 10K WITH NO REPAYMENT');
  console.log('═══════════════════════════════════════════════════════');

  const escrow12Tx = '0xd40c541d29e2c54ed20625620502eb56c577d4ad143392306c0529e2ac71a43a';
  const receipt12 = await provider.getTransactionReceipt(escrow12Tx);
  const tx12 = await provider.getTransaction(escrow12Tx);

  console.log(`  Tx: ${escrow12Tx}`);
  console.log(`  Caller: ${tx12.from}`);

  try {
    const decoded = fxPool.interface.parseTransaction({ data: tx12.data });
    if (decoded) {
      const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
      console.log(`  Function: FxPool.${decoded.name}`);
      console.log(`  Args:`);
      console.log(`    unionAddr: ${decoded.args[0]}`);
      console.log(`    loanType: ${decoded.args[1]}`);
      console.log(`    inrValue: ${decoded.args[2]?.toString()}`);
      console.log(`    scanHash: ${decoded.args[3]}`);
      console.log(`    purpose: ${purposeMap[Number(decoded.args[4])]} (${decoded.args[4]})`);
      console.log(`    loanId: ${decoded.args[5]}`);
      console.log(`    member: ${decoded.args[6]}`);
      console.log(`    escrowIdToResolve: ${decoded.args[7]?.toString()}`);
    }
  } catch (e) {
    console.log(`  Could not decode: ${e.message}`);
  }

  console.log(`\n  All events in tx:`);
  for (const log of receipt12.logs) {
    try {
      const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed) console.log(`    → FxPool.${parsed.name}`);
    } catch {}
    try {
      const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed) {
        const args = parsed.args.toArray().map((v, i) => `${parsed.fragment.inputs[i]?.name}: ${typeof v === 'bigint' ? fmtExact(v) : v}`);
        console.log(`    → Core.${parsed.name}(${args.join(', ')})`);
      }
    } catch {}
    if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
      const from = ethers.getAddress('0x' + log.topics[1].slice(26));
      const to = ethers.getAddress('0x' + log.topics[2].slice(26));
      const value = BigInt(log.data);
      console.log(`    → nIN Transfer: ${from.slice(0,10)}... → ${to.slice(0,10)}...: ${fmtExact(value)}`);
    }
  }

  // ─── 6. Summary ───────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  RECONCILIATION');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`
  Burned escrows (0-5): 20,500 nIN scanned → nIN destroyed
    → These scans created escrows but the nIN was burned when escrows expired
    → If repayLoan WAS called in the same tx as the scan, the repayment went through
    → If repayLoan was NOT called, the cash was collected but loans not repaid

  Key question: were the Lily Farm 2x10k repayments (from burned escrows)
  actually processed with repayLoan, or just scanned without repaying?
  `);
}

main().catch(console.error);
