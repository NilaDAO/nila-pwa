/**
 * Trace cashScanMint as a RANDOM wallet to see exactly where the leader check fires.
 * Compare with Supervisor1 trace.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const ROLES_ADDR = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';
const SUPERVISOR1 = '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7';
const RANDOM = '0x0000000000000000000000000000000000000001';

const provider = new ethers.JsonRpcProvider(RPC);
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  const calldata = fxPool.interface.encodeFunctionData('cashScanMint', [
    UNION,
    ethers.encodeBytes32String('GroundUp Fund'),
    100,
    ethers.keccak256(ethers.toUtf8Bytes('random-' + Date.now())),
    0,
    ethers.ZeroHash,
    ethers.ZeroAddress,
    0n,
  ]);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  RANDOM wallet — cashScanMint trace');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const trace = await provider.send('debug_traceCall', [
      { from: RANDOM, to: FXPOOL_ADDR, data: calldata },
      'latest',
      { tracer: 'callTracer' },
    ]);

    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
      [UNION.toLowerCase()]: 'Union',
    };

    function walk(node, depth = 0) {
      if (!node) return;
      const indent = '  '.repeat(depth);
      const toLabel = knownAddrs[node.to?.toLowerCase()] || node.to?.slice(0, 10) + '...';
      const fromLabel = knownAddrs[node.from?.toLowerCase()] || node.from?.slice(0, 10) + '...';
      const err = node.error ? ` ⚠ ${node.error}` : '';
      const output = node.output ? ` → ${node.output.slice(0, 30)}` : '';
      console.log(`${indent}${node.type} ${fromLabel} → ${toLabel} [${node.input?.slice(0, 10) || 'nodata'}]${err}${output}`);
      if (node.calls) for (const c of node.calls) walk(c, depth + 1);
    }
    walk(trace);
  } catch (e) {
    console.log(`Trace failed: ${e.message}`);
  }

  // Do the same for Supervisor1 — to get the delta
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SUPERVISOR1 — same call (works)');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const trace = await provider.send('debug_traceCall', [
      { from: SUPERVISOR1, to: FXPOOL_ADDR, data: calldata },
      'latest',
      { tracer: 'callTracer' },
    ]);

    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
    };

    function walk(node, depth = 0) {
      if (!node) return;
      const indent = '  '.repeat(depth);
      const toLabel = knownAddrs[node.to?.toLowerCase()] || node.to?.slice(0, 10) + '...';
      const fromLabel = knownAddrs[node.from?.toLowerCase()] || node.from?.slice(0, 10) + '...';
      const err = node.error ? ` ⚠ ${node.error}` : '';
      console.log(`${indent}${node.type} ${fromLabel} → ${toLabel} [${node.input?.slice(0, 10) || 'nodata'}]${err}`);
      if (node.calls) for (const c of node.calls) walk(c, depth + 1);
    }
    walk(trace);
  } catch (e) {
    console.log(`Trace failed: ${e.message}`);
  }

  // Check the Core contract for any leader-check functions
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Core ABI — all leader/role functions');
  console.log('═══════════════════════════════════════════════════════\n');

  const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
  const coreFns = (coreAbi.abi ?? coreAbi).filter(x => x.type === 'function');
  for (const fn of coreFns) {
    const n = fn.name?.toLowerCase() || '';
    if (n.includes('leader') || n.includes('role') || n.includes('admin') || n.includes('permit') || n.includes('auth')) {
      const types = fn.inputs.map(i => `${i.type} ${i.name}`).join(', ');
      const sel = ethers.id(`${fn.name}(${fn.inputs.map(i => i.type).join(',')})`).slice(0, 10);
      console.log(`  ${sel} ${fn.name}(${types})`);
    }
  }

  // Also check if Core has a leader-check that the FxPool might be relying on
  // Try to read leader state from Core directly
  console.log('\n── Trying Core leader queries ──');

  const coreContract = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);

  // Try unionLeaders mapping or similar
  const testSigs = [
    'function unionLeader(address) view returns (address)',
    'function unionLeaders(address,address) view returns (bool)',
    'function isUnionLeader(address,address) view returns (bool)',
    'function leaders(address,address) view returns (bool)',
  ];

  for (const sig of testSigs) {
    try {
      const c = new ethers.Contract(CORE_ADDR, [sig], provider);
      const fnName = sig.match(/function (\w+)/)[1];
      const paramCount = sig.split(',').length;
      const args = paramCount === 2 ? [UNION, SUPERVISOR1] : [UNION];
      const result = await c[fnName](...args);
      console.log(`  ✅ Core.${sig.split('function ')[1].split(' view')[0]}:`);
      console.log(`     result: ${result}`);
    } catch (e) {
      // silent
    }
  }
}

main().catch(console.error);
