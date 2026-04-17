import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const NIN_TOKEN = '0x3221749c0C37958375EE92332E5ba7d73eC45865';

const provider = new ethers.JsonRpcProvider(RPC);
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

const fmtExact = (wei) => Number(ethers.formatEther(wei)).toFixed(2);

async function main() {
  const latestBlock = await provider.getBlockNumber();

  // ─── 1. Trace EVERY nIN transfer in each Lily Farm scan tx ────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXACT nIN FLOWS IN LILY FARM SCAN TRANSACTIONS');
  console.log('═══════════════════════════════════════════════════════\n');

  const txHashes = [
    { label: 'Scan 1 (4,500 for 0a6e66)', hash: '0xaedbc8f1e10bd0ffad87cda0365388336942c45ebc3326a785e9184fd4802d8f' },
    { label: 'Scan 2 (4,500 for 0a6e66)', hash: '0x4b50ca7bf04b610a807a27ae166e23a40cdbd3ea1255dfaa65555e770da9e058' },
    { label: 'Scan 3 (1,300 for 0a6e66)', hash: '0x353e6df321eb06b1dcbe26d05756bad8d39eed83235a6f36dd965ab65d79092c' },
    { label: 'Scan 4 (10,000 for 0c9168)', hash: '0x15eaf059e7fc0a70e13ec158a18b04b066eb609c49f5ab4d565b31719f233b42' },
    { label: 'Scan 5 (200 for 0c9168)', hash: '0x96c0b55665a5de4137859e4ce2165289a0ee844d41d31aafe1c0984085c04f0d' },
  ];

  for (const { label, hash } of txHashes) {
    console.log(`  ── ${label} ──`);
    console.log(`  Tx: ${hash}`);

    const receipt = await provider.getTransactionReceipt(hash);
    const tx = await provider.getTransaction(hash);

    // Decode calldata
    try {
      const decoded = fxPool.interface.parseTransaction({ data: tx.data });
      if (decoded) {
        const purposeMap = {0: 'INVEST', 1: 'REPAY', 2: 'DISBURSE'};
        console.log(`  Call: cashScanMint(purpose=${purposeMap[Number(decoded.args[4])]}, loanId=...${decoded.args[5]?.toString().slice(-6)}, inrValue=${decoded.args[2]?.toString()})`);
      }
    } catch {
      try {
        const decoded = core.interface.parseTransaction({ data: tx.data });
        console.log(`  Call: Core.${decoded.name}`);
      } catch {}
    }

    // ALL events
    console.log(`  Events:`);
    for (const log of receipt.logs) {
      // nIN transfers
      if (log.topics[0] === ethers.id('Transfer(address,address,uint256)') && log.address.toLowerCase() === NIN_TOKEN.toLowerCase()) {
        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);
        const fromLabel = from === ethers.ZeroAddress ? 'MINT' :
                          from.toLowerCase() === FXPOOL_ADDR.toLowerCase() ? 'FxPool' :
                          from.toLowerCase() === CORE_ADDR.toLowerCase() ? 'Core' :
                          from.slice(0, 10) + '...';
        const toLabel = to === ethers.ZeroAddress ? 'BURN' :
                        to.toLowerCase() === FXPOOL_ADDR.toLowerCase() ? 'FxPool' :
                        to.toLowerCase() === CORE_ADDR.toLowerCase() ? 'Core' :
                        to.slice(0, 10) + '...';
        console.log(`    nIN: ${fromLabel} → ${toLabel}: ${fmtExact(value)}`);
      }

      // Core events
      try {
        const parsed = core.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          const args = parsed.args.toArray().map((v, i) => {
            const name = parsed.fragment.inputs[i]?.name || i;
            const val = typeof v === 'bigint' ? fmtExact(v) : v.toString();
            return `${name}=${val}`;
          });
          console.log(`    Core.${parsed.name}(${args.join(', ')})`);
        }
      } catch {}

      // FxPool events
      try {
        const parsed = fxPool.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed) {
          if (parsed.name === 'CashScanMint') {
            console.log(`    FxPool.CashScanMint(ninAmount=${fmtExact(parsed.args.ninAmount)}, inrValue=${fmtExact(parsed.args.inrValue)})`);
          } else {
            console.log(`    FxPool.${parsed.name}`);
          }
        }
      } catch {}
    }
    console.log();
  }

  // ─── 2. Check for ANY earlier CashScanMint for this union (60+ days) ───
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EARLIER SCANS (searching 90 days)');
  console.log('═══════════════════════════════════════════════════════\n');

  const fromBlock90d = latestBlock - 4500000;
  const allScans = await fxPool.queryFilter(fxPool.filters.CashScanMint(), fromBlock90d, latestBlock);

  const unionScans = allScans.filter(e => e.args.union.toLowerCase() === UNION.toLowerCase());
  console.log(`  Total CashScanMint for this union (90 days): ${unionScans.length}`);

  for (const ev of unionScans) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
    console.log(`  [${ts}] ${fmtExact(ev.args.ninAmount)} nIN | Block ${ev.blockNumber}`);
  }

  // ─── 3. Check ALL LoanRepaid for these 2 loans (90 days) ─────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL LoanRepaid for Lily Farm loans (90 days)');
  console.log('═══════════════════════════════════════════════════════\n');

  const loans = [
    '0x00000000000000000000000000000000000000000000000000000000000a6e66',
    '0x00000000000000000000000000000000000000000000000000000000000c9168',
  ];

  for (const loanId of loans) {
    const events = await core.queryFilter(core.filters.LoanRepaid(UNION, loanId), fromBlock90d, latestBlock);
    console.log(`  Loan ...${loanId.slice(-6)}: ${events.length} LoanRepaid events`);
    for (const ev of events) {
      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString().slice(0, 19);
      console.log(`    [${ts}] interest ${fmtExact(ev.args.interestPaid)} + principal ${fmtExact(ev.args.principalPaid)}`);
    }
  }

  // ─── 4. Check treasury at time of Lily Farm repay ─────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TREASURY STATE');
  console.log('═══════════════════════════════════════════════════════\n');

  // Current treasury
  const [treasury, rainyDay] = await Promise.all([
    core.unionTreasury(UNION),
    core.unionRainyDay(UNION),
  ]);
  console.log(`  Current treasury: ${fmtExact(treasury)} nIN`);
  console.log(`  Current rainy day: ${fmtExact(rainyDay)} nIN`);
}

main().catch(console.error);
