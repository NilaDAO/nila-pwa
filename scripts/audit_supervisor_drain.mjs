/**
 * Trace supervisor USDT drain and nIN deposits around the Lily Farm
 * escrow burns (Apr 6). Look for deposit/transfer events from known
 * supervisor wallets and any treasury deposit events.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const NIN_TOKEN = '0x3221749c0C37958375EE92332E5ba7d73eC45865';
const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';

// Known callers from earlier traces
const SUPERVISOR_1 = '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7';
const SUPERVISOR_2 = '0xaf7030023CF86611FfC5a71798a0f7022210F2b3';

const provider = new ethers.JsonRpcProvider(RPC);
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);
const fmt6 = (wei) => Number(ethers.formatUnits(wei, 6)).toFixed(2); // USDT has 6 decimals

async function main() {
  const latestBlock = await provider.getBlockNumber();
  // Focus on Apr 2-8 window
  const fromBlock = latestBlock - 350000; // ~7 days before latest

  // ─── 1. Search for ALL Core events for this union ─────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALL Core contract events for this union (7+ days)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get all events from Core that mention this union
  // Search for common deposit/withdraw events
  const eventNames = [
    'DepositJunior', 'DepositSenior', 'WithdrawTreasury',
    'TreasuryDeposit', 'TreasuryWithdraw', 'Deposit',
    'UnbondRequested', 'UnbondClaimed',
  ];

  for (const name of eventNames) {
    try {
      const filter = core.filters[name]?.(UNION) ?? core.filters[name]?.();
      if (!filter) continue;
      const events = await core.queryFilter(filter, fromBlock, latestBlock);
      const unionEvents = events.filter(e => {
        const args = e.args;
        return args && Object.values(args).some(v =>
          typeof v === 'string' && v.toLowerCase() === UNION.toLowerCase()
        );
      });
      if (unionEvents.length > 0 || events.length > 0) {
        console.log(`  ${name}: ${events.length} events (${unionEvents.length} for this union)`);
        for (const ev of events) {
          const block = await provider.getBlock(ev.blockNumber);
          const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
          const args = ev.args.toArray().map((v, i) => {
            const n = ev.fragment?.inputs?.[i]?.name || i;
            return `${n}=${typeof v === 'bigint' ? fmtExact(v) : v}`;
          });
          console.log(`    [${ts}] ${args.join(', ')}`);
          console.log(`      Tx: ${ev.transactionHash}`);
        }
      }
    } catch {}
  }

  // ─── 2. Search for nIN transfers to/from Core involving union ─────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  nIN Token transfers involving Core & Union (7+ days)');
  console.log('═══════════════════════════════════════════════════════\n');

  const erc20Abi = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ];
  const nin = new ethers.Contract(NIN_TOKEN, erc20Abi, provider);

  // Transfers TO Core (deposits)
  const toCore = await nin.queryFilter(nin.filters.Transfer(null, CORE_ADDR), fromBlock, latestBlock);
  console.log(`  nIN transfers TO Core: ${toCore.length} total`);
  for (const ev of toCore) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
    const from = ev.args.from;
    const value = ev.args.value;
    // Filter for interesting sources (not FxPool mints, focus on direct deposits)
    if (from.toLowerCase() === FXPOOL_ADDR.toLowerCase()) continue; // skip cashScanMint flow
    if (from.toLowerCase() === UNION.toLowerCase() ||
        from.toLowerCase() === SUPERVISOR_1.toLowerCase() ||
        from.toLowerCase() === SUPERVISOR_2.toLowerCase()) {
      console.log(`  [${ts}] ${from.slice(0,10)}... → Core: ${fmtExact(value)} nIN`);
      console.log(`    Tx: ${ev.transactionHash}`);
    }
  }

  // Transfers FROM Core (withdrawals, loan disbursements)
  const fromCore = await nin.queryFilter(nin.filters.Transfer(CORE_ADDR, null), fromBlock, latestBlock);
  console.log(`\n  nIN transfers FROM Core: ${fromCore.length} total`);
  for (const ev of fromCore) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
    const to = ev.args.to;
    const value = ev.args.value;
    console.log(`  [${ts}] Core → ${to.slice(0,10)}...: ${fmtExact(value)} nIN`);
    console.log(`    Tx: ${ev.transactionHash}`);
  }

  // ─── 3. USDT transfers involving FxPool, Union, Supervisors ───────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  USDT transfers (FxPool, Union, Supervisors)');
  console.log('═══════════════════════════════════════════════════════\n');

  const usdt = new ethers.Contract(USDT, erc20Abi, provider);

  const addresses = [FXPOOL_ADDR, UNION, SUPERVISOR_1, SUPERVISOR_2];
  for (const addr of addresses) {
    const label = addr === FXPOOL_ADDR ? 'FxPool' :
                  addr === UNION ? 'Union' :
                  addr === SUPERVISOR_1 ? 'Supervisor1' : 'Supervisor2';

    // USDT sent FROM this address
    const sent = await usdt.queryFilter(usdt.filters.Transfer(addr, null), fromBlock, latestBlock);
    for (const ev of sent) {
      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
      console.log(`  [${ts}] USDT: ${label} → ${ev.args.to.slice(0,10)}...: $${fmt6(ev.args.value)}`);
      console.log(`    Tx: ${ev.transactionHash}`);
    }

    // USDT received BY this address
    const received = await usdt.queryFilter(usdt.filters.Transfer(null, addr), fromBlock, latestBlock);
    for (const ev of received) {
      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
      console.log(`  [${ts}] USDT: ${ev.args.from.slice(0,10)}... → ${label}: $${fmt6(ev.args.value)}`);
      console.log(`    Tx: ${ev.transactionHash}`);
    }
  }

  // ─── 4. ALL transactions FROM the supervisor wallets on Apr 6 ─────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Burn escrow transactions (Apr 6)');
  console.log('═══════════════════════════════════════════════════════\n');

  // We know the burn txs — trace ALL events in each
  const burnTxs = [
    '0x87ac4e1db331e04a8c08', // escrow 0
    '0x6cdcbf8641c59de07a64', // escrow 2
    '0xdddf1626563555a38f2b', // escrow 3
    '0x77b12446346cadfefe85', // escrow 4
    '0xb936ec28de833340fdaa', // escrow 5
    '0xeb86f4343ad56c2550d9', // escrow 1
  ];

  // Also look at the escrow #6 resolution on the same day
  const resolveTx = '0xfa642f340fe3bd2eca91cc5027dd108295e2b7316d5dbf7af1f308b95e00cd78';
  const receipt = await provider.getTransactionReceipt(resolveTx);
  const tx = await provider.getTransaction(resolveTx);
  const block = await provider.getBlock(receipt.blockNumber);
  const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);

  console.log(`  Escrow #6 resolution [${ts}]:`);
  console.log(`    Caller: ${tx.from}`);
  try {
    const decoded = fxPool.interface.parseTransaction({ data: tx.data });
    console.log(`    Function: ${decoded.name}(${decoded.args.map(a => typeof a === 'bigint' ? fmtExact(a) : a.toString()).join(', ')})`);
  } catch {}

  // Check all events in same block range for supervisor activity
  console.log('\n  All FxPool events from Supervisor wallets (Apr 5-7):');
  const fromBlockApr5 = fromBlock; // approximate
  const allFxEvents = await fxPool.queryFilter({}, fromBlock, latestBlock);
  for (const ev of allFxEvents) {
    try {
      const receipt = await provider.getTransactionReceipt(ev.transactionHash);
      if (receipt.from.toLowerCase() === SUPERVISOR_1.toLowerCase() ||
          receipt.from.toLowerCase() === SUPERVISOR_2.toLowerCase() ||
          receipt.from.toLowerCase() === UNION.toLowerCase()) {
        const parsed = fxPool.interface.parseLog({ topics: [...ev.topics], data: ev.data });
        if (parsed && !['CashScanMint', 'EscrowBurned', 'EscrowResolved', 'FarmerNinBurned'].includes(parsed.name)) {
          const bl = await provider.getBlock(ev.blockNumber);
          const ts = new Date(bl.timestamp * 1000).toISOString().slice(0, 19);
          console.log(`    [${ts}] FxPool.${parsed.name} from ${receipt.from.slice(0,10)}...`);
          console.log(`      Tx: ${ev.transactionHash}`);
        }
      }
    } catch {}
  }

  // ─── 5. Look for depositJunior/depositSenior calls ────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Looking for deposit events on Core (all types)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Scan ALL Core events (not filtered by name) for this union
  const allCoreEvents = await core.queryFilter({}, fromBlock, latestBlock);
  console.log(`  Total Core events in window: ${allCoreEvents.length}`);

  for (const ev of allCoreEvents) {
    try {
      const parsed = core.interface.parseLog({ topics: [...ev.topics], data: ev.data });
      if (!parsed) continue;
      // Check if this event involves our union
      const argsStr = JSON.stringify(parsed.args, (k, v) => typeof v === 'bigint' ? v.toString() : v);
      if (!argsStr.toLowerCase().includes(UNION.toLowerCase().slice(2))) continue;

      // Skip LoanRepaid and LoanAccepted (already traced)
      if (['LoanRepaid', 'LoanAccepted'].includes(parsed.name)) continue;

      const bl = await provider.getBlock(ev.blockNumber);
      const ts = new Date(bl.timestamp * 1000).toISOString().slice(0, 19);
      const args = parsed.args.toArray().map((v, i) => {
        const name = parsed.fragment.inputs[i]?.name || i;
        const val = typeof v === 'bigint' ? fmtExact(v) : v.toString();
        return `${name}=${val}`;
      });
      console.log(`  [${ts}] Core.${parsed.name}(${args.join(', ')})`);
      console.log(`    Tx: ${ev.transactionHash}`);
    } catch {}
  }
}

main().catch(console.error);
