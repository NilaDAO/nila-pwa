/**
 * Precise trace: map every CashScanMint to its escrow, decode purpose, find the 5k gap.
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
  const fromBlock = latestBlock - 250000;

  // ─── Get ALL CashScanMint events (unfiltered) ─────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALL CashScanMint EVENTS — DETAILED TRACE');
  console.log('═══════════════════════════════════════════════════════');

  const allCashScans = await fxPool.queryFilter(fxPool.filters.CashScanMint(), fromBlock, latestBlock);

  let totalScanned = 0n;
  const scanDetails = [];

  for (const ev of allCashScans) {
    const { union, ninAmount, inrValue, scanHash } = ev.args;
    if (union.toLowerCase() !== UNION.toLowerCase()) continue;

    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const tx = await provider.getTransaction(ev.transactionHash);
    const receipt = await provider.getTransactionReceipt(ev.transactionHash);

    // Decode calldata to get purpose
    let purpose = -1, purposeLabel = 'UNKNOWN', loanId = '', member = '', escrowToResolve = 0n;
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      if (decoded) {
        purpose = Number(decoded.args[4]);
        const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
        purposeLabel = purposeMap[purpose] || `${purpose}`;
        loanId = decoded.args[5]?.toString();
        member = decoded.args[6]?.toString();
        escrowToResolve = decoded.args[7] ?? 0n;
      }
    } catch {
      // Maybe called through another contract (repayLoan bundles it)
      try {
        const decoded = core.interface.parseTransaction({ data: tx.data });
        if (decoded) {
          purposeLabel = `via Core.${decoded.name}`;
        }
      } catch {}
    }

    // Check what other events are in this tx
    let hasRepay = false;
    let repayAmount = 0n;
    let repayInterest = 0n;
    let repayPrincipal = 0n;
    let hasBurn = false;
    let burnAmount = 0n;
    let hasEscrowResolved = false;
    let resolvedEscrows = [];
    let transfers = [];

    for (const log of receipt.logs) {
      try {
        const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'LoanRepaid') {
          hasRepay = true;
          repayInterest = parsed.args.interestPaid;
          repayPrincipal = parsed.args.principalPaid;
          repayAmount = repayInterest + repayPrincipal;
        }
      } catch {}
      try {
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'FarmerNinBurned') {
          hasBurn = true;
          burnAmount = parsed.args.amount;
        }
        if (parsed?.name === 'EscrowResolved') {
          hasEscrowResolved = true;
          const resMap = {0: 'ACTIVE', 1: 'CASH', 2: 'USDT', 3: 'BURNED'};
          resolvedEscrows.push({ id: parsed.args.escrowId.toString(), resolution: resMap[Number(parsed.args.resolution)] });
        }
      } catch {}
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        transfers.push({ from, to, amount: value });
      }
    }

    totalScanned += ninAmount;

    const detail = {
      ts, ninAmount, purposeLabel, hasRepay, repayAmount, repayInterest, repayPrincipal,
      hasBurn, burnAmount, hasEscrowResolved, resolvedEscrows, txHash: ev.transactionHash,
      member, escrowToResolve, transfers
    };
    scanDetails.push(detail);

    console.log(`\n  ── CashScanMint [${ts}] ──`);
    console.log(`  nIN Minted: ${fmtExact(ninAmount)}  |  Purpose: ${purposeLabel}`);
    console.log(`  Member: ${member || 'N/A'}  |  EscrowToResolve: ${escrowToResolve.toString()}`);
    console.log(`  Tx: ${ev.transactionHash}`);
    console.log(`  Caller: ${tx.from}`);

    if (hasRepay) {
      console.log(`  ⤷ REPAY in same tx: Interest ₹${fmtExact(repayInterest)} + Principal ₹${fmtExact(repayPrincipal)} = ₹${fmtExact(repayAmount)}`);
      const surplus = ninAmount - repayAmount;
      console.log(`  ⤷ SURPLUS (scan - repay): ${fmtExact(surplus)} nIN (₹${fmt(surplus)})`);
      console.log(`    ↳ This surplus stays in escrow or treasury. Physical ₹${fmt(surplus)} may have been returned as CHANGE to farmer.`);
    }
    if (hasBurn) {
      console.log(`  ⤷ BURN in same tx: ${fmtExact(burnAmount)} nIN`);
    }
    if (hasEscrowResolved) {
      console.log(`  ⤷ ESCROW RESOLVED: ${JSON.stringify(resolvedEscrows)}`);
    }
    if (transfers.length > 0) {
      console.log(`  ⤷ nIN Transfers:`);
      for (const t of transfers) {
        const fromLabel = t.from === ethers.ZeroAddress ? 'MINT' : t.from.slice(0,10) + '...';
        const toLabel = t.to === ethers.ZeroAddress ? 'BURN' : t.to.slice(0,10) + '...';
        console.log(`      ${fromLabel} → ${toLabel}: ${fmtExact(t.amount)} nIN`);
      }
    }
  }

  console.log(`\n  ═══ TOTAL SCANNED: ${fmtExact(totalScanned)} nIN`);

  // ─── Now trace the resolveEscrowCash and burn txs separately ──────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CASH-OUT TRANSACTIONS (Burns + Escrow Resolutions)');
  console.log('═══════════════════════════════════════════════════════');

  // Get all EscrowResolved events
  const resolvedEvents = await fxPool.queryFilter(fxPool.filters.EscrowResolved(), fromBlock, latestBlock);
  for (const ev of resolvedEvents) {
    const { escrowId, resolution } = ev.args;
    const escrow = await fxPool.getEscrow(escrowId);
    const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
    if (escrowUnion !== UNION.toLowerCase()) continue;

    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const resMap = {0: 'PARTIAL/ACTIVE', 1: 'CASH', 2: 'USDT', 3: 'BURNED'};

    // Get all events in this tx
    const receipt = await provider.getTransactionReceipt(ev.transactionHash);
    const tx = await provider.getTransaction(ev.transactionHash);

    console.log(`\n  ── EscrowResolved #${escrowId} [${ts}] — ${resMap[Number(resolution)]} ──`);
    console.log(`  Tx: ${ev.transactionHash}`);
    console.log(`  Caller: ${tx.from}`);

    // Decode calldata
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      if (decoded) {
        console.log(`  Function: ${decoded.name}(${decoded.args.map(a => typeof a === 'bigint' ? fmtExact(a) : a.toString()).join(', ')})`);
      }
    } catch {
      try {
        const decoded = core.interface.parseTransaction({ data: tx.data });
        if (decoded) {
          console.log(`  Function: Core.${decoded.name}`);
        }
      } catch {}
    }

    // List all events in tx
    for (const log of receipt.logs) {
      try {
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) console.log(`    → FxPool.${parsed.name}`);
      } catch {}
      try {
        const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) console.log(`    → Core.${parsed.name}`);
      } catch {}
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        const fromLabel = from === ethers.ZeroAddress ? 'MINT' : from.slice(0,10) + '...';
        const toLabel = to === ethers.ZeroAddress ? 'BURN' : to.slice(0,10) + '...';
        console.log(`    → nIN Transfer: ${fromLabel} → ${toLabel}: ${fmtExact(value)} nIN`);
      }
    }
  }

  // ─── FULL TIMELINE ────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  PHYSICAL CASH LEDGER RECONSTRUCTION');
  console.log('═══════════════════════════════════════════════════════');

  // The physical cash IN/OUT is:
  // CASH IN = scans for REPAY (farmer pays union cash)
  // CASH OUT = resolveEscrowCash (union gives cash to borrower as loan)

  let physicalCashIn = 0n;
  let physicalCashOut = 0n;
  let changeGivenBack = 0n;

  console.log('\n  CASH IN (farmer pays physical cash for repayment):');
  for (const d of scanDetails) {
    if (d.hasRepay) {
      const surplus = d.ninAmount - d.repayAmount;
      physicalCashIn += d.ninAmount;
      if (surplus > 0n) changeGivenBack += surplus;
      console.log(`  [${d.ts}] Scanned ₹${fmtExact(d.ninAmount)} | Repaid ₹${fmtExact(d.repayAmount)} | Surplus/Change: ₹${fmtExact(surplus)}`);
    } else if (d.purposeLabel === 'INVEST') {
      console.log(`  [${d.ts}] Investment scan ₹${fmtExact(d.ninAmount)} (adds to treasury, NOT physical farmer cash)`);
    } else if (d.purposeLabel === 'DISBURSE') {
      console.log(`  [${d.ts}] Disburse scan ₹${fmtExact(d.ninAmount)}`);
    } else {
      console.log(`  [${d.ts}] Scan ₹${fmtExact(d.ninAmount)} — Purpose: ${d.purposeLabel}`);
      // If purpose unknown but part of repay cycle, still count as cash-in
    }
  }

  console.log(`\n  CASH OUT (escrows resolved as CASH — physical cash given to borrower):`);
  for (const ev of resolvedEvents) {
    const { escrowId, resolution } = ev.args;
    if (Number(resolution) !== 1) continue; // Only CASH resolutions
    const escrow = await fxPool.getEscrow(escrowId);
    const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
    if (escrowUnion !== UNION.toLowerCase()) continue;
    // The escrow has nIN=0 now because it was fully resolved, need to find original amount
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    console.log(`  [${ts}] Escrow #${escrowId} resolved as CASH (nIN now: ${fmtExact(escrow.ninAmount ?? escrow[2])})`);
  }

  console.log(`\n  SUMMARY:`);
  console.log(`  Total Cash Scanned (in repay txs): ₹${fmtExact(physicalCashIn)}`);
  console.log(`  Total Change Returned to Farmers:  ₹${fmtExact(changeGivenBack)}`);
  console.log(`  Net Cash Received:                 ₹${fmtExact(physicalCashIn - changeGivenBack)}`);

  // ─── ESCROW HISTORY ───────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ESCROW-BY-ESCROW HISTORY');
  console.log('═══════════════════════════════════════════════════════');

  // For each escrow, trace its creation and resolution
  const nextId = await fxPool.nextEscrowId();
  for (let id = 0n; id < nextId; id++) {
    const escrow = await fxPool.getEscrow(id);
    const escrowUnion = (escrow.union ?? escrow[0])?.toLowerCase();
    if (escrowUnion !== UNION.toLowerCase()) continue;

    const status = Number(escrow.status ?? escrow[6]);
    const statusMap = {0: 'ACTIVE', 1: 'RESOLVED_CASH', 2: 'RESOLVED_USDT', 3: 'BURNED'};
    const ninNow = escrow.ninAmount ?? escrow[2];
    const deadline = Number(escrow.deadline ?? escrow[5]);
    const member = escrow.member ?? escrow[4] ?? 'N/A';

    console.log(`\n  Escrow #${id}: ${statusMap[status]} | Current nIN: ${fmtExact(ninNow)} | Member: ${member}`);
    console.log(`    Deadline: ${new Date(deadline * 1000).toISOString()}`);

    // Check all EscrowResolved events for this escrow
    const escrowResolved = resolvedEvents.filter(e => e.args.escrowId === id);
    for (const r of escrowResolved) {
      const block = await provider.getBlock(r.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      const resMap = {0: 'PARTIAL', 1: 'CASH', 2: 'USDT', 3: 'BURNED'};
      console.log(`    Resolution at [${ts}]: ${resMap[Number(r.args.resolution)]}`);
    }

    // Check EscrowBurned for this escrow
    const escrowBurned = (await fxPool.queryFilter(fxPool.filters.EscrowBurned(id), fromBlock, latestBlock));
    for (const b of escrowBurned) {
      const block = await provider.getBlock(b.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      console.log(`    BURNED at [${ts}]: ${fmtExact(b.args.ninAmount)} nIN destroyed`);
    }
  }

  // ─── KEY INSIGHT ──────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  KEY INSIGHT: WHERE IS THE 5K GAP?');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`
  System believes: 12,000 nIN in active escrows = ₹12,000 physical cash
  Union reports:   ₹7,000 physical cash
  Gap:             ₹5,000

  Active escrows:
    #11: 800 nIN   — leftover from 11,000 scan after 10,200 resolved
    #12: 10,000 nIN — standalone scan
    #13: 600 nIN   — standalone scan
    #14: 600 nIN   — standalone scan
    Total: 12,000 nIN

  The gap comes from cash that was SCANNED (creating escrows)
  but then PHYSICALLY given away without resolving the escrow on-chain.

  Possible sources:
  1. Change given back to farmers (scan surplus not resolved)
  2. Cash-outs done physically without resolveEscrowCash
  3. Scan amounts that exceed actual physical cash received
  `);
}

main().catch(console.error);
