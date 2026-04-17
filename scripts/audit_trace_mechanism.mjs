/**
 * Trace the internal calls of a successful cashScanMint to find
 * what contract it queries for the leader check.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const ROLES_ADDR = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';
const SUPERVISOR1 = '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7';

const provider = new ethers.JsonRpcProvider(RPC);
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TRACING cashScanMint INTERNAL CALLS');
  console.log('═══════════════════════════════════════════════════════\n');

  // Build a cashScanMint call
  const calldata = fxPool.interface.encodeFunctionData('cashScanMint', [
    UNION,
    ethers.encodeBytes32String('GroundUp Fund'),
    100,
    ethers.keccak256(ethers.toUtf8Bytes('trace-' + Date.now())),
    0, // INVEST
    ethers.ZeroHash,
    ethers.ZeroAddress,
    0n,
  ]);

  // Use debug_traceCall with callTracer
  console.log('Calling debug_traceCall with Supervisor1 as sender...\n');

  try {
    const trace = await provider.send('debug_traceCall', [
      {
        from: SUPERVISOR1,
        to: FXPOOL_ADDR,
        data: calldata,
      },
      'latest',
      { tracer: 'callTracer' },
    ]);

    // Walk the call tree and list all addresses touched
    const addresses = new Set();
    const externalCalls = [];

    function walk(node, depth = 0) {
      if (!node) return;
      if (node.to) {
        addresses.add(node.to.toLowerCase());
        externalCalls.push({
          depth,
          type: node.type,
          from: node.from,
          to: node.to,
          input: node.input?.slice(0, 10), // selector only
          output: node.output?.slice(0, 20),
          error: node.error,
        });
      }
      if (node.calls) {
        for (const c of node.calls) walk(c, depth + 1);
      }
    }

    walk(trace);

    console.log('── Call tree ──');
    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
      [UNION.toLowerCase()]: 'Union',
      '0x3221749c0c37958375ee92332e5ba7d73ec45865': 'nIN Token',
      [SUPERVISOR1.toLowerCase()]: 'Supervisor1',
    };

    for (const call of externalCalls) {
      const indent = '  '.repeat(call.depth);
      const toLabel = knownAddrs[call.to?.toLowerCase()] || call.to?.slice(0, 10) + '...';
      const fromLabel = knownAddrs[call.from?.toLowerCase()] || call.from?.slice(0, 10) + '...';
      console.log(`${indent}${call.type} ${fromLabel} → ${toLabel} [${call.input || 'no data'}]${call.error ? ` ERROR: ${call.error}` : ''}`);
    }

    console.log('\n── Unique addresses touched ──');
    for (const addr of addresses) {
      const label = knownAddrs[addr] || 'unknown';
      console.log(`  ${addr} — ${label}`);
    }

    // Now try to decode the selector called on "Roles" or unexpected contracts
    console.log('\n── Non-FxPool calls (external leader checks?) ──');
    for (const call of externalCalls) {
      if (call.to?.toLowerCase() !== FXPOOL_ADDR.toLowerCase() && call.input) {
        console.log(`  ${knownAddrs[call.to?.toLowerCase()] || call.to}: selector=${call.input}`);

        // Try to identify known selectors
        const selectors = {
          '0xa217fddf': 'DEFAULT_ADMIN_ROLE()',
          '0x91d14854': 'hasRole(bytes32,address)',
          '0x248a9ca3': 'getRoleAdmin(bytes32)',
          '0x95390ad7': 'isUnionLeader(address,address)',
          '0x3655f8c8': 'unionLeader(address)',
          '0x70a08231': 'balanceOf(address)',
          '0x18160ddd': 'totalSupply()',
          '0x40c10f19': 'mint(address,uint256)',
          '0x23b872dd': 'transferFrom',
          '0xa9059cbb': 'transfer',
          '0xdd62ed3e': 'allowance',
        };
        if (selectors[call.input]) {
          console.log(`    → ${selectors[call.input]}`);
        }
      }
    }
  } catch (e) {
    console.log(`debug_traceCall failed: ${e.message}`);
    console.log('\nTrying alchemy_traceCall alternative...');

    // Fallback: try prestate tracer which shows state reads
    try {
      const prestate = await provider.send('debug_traceCall', [
        { from: SUPERVISOR1, to: FXPOOL_ADDR, data: calldata },
        'latest',
        { tracer: 'prestateTracer' },
      ]);
      console.log('\nAddresses read by this call:');
      for (const addr of Object.keys(prestate)) {
        console.log(`  ${addr}`);
      }
    } catch (e2) {
      console.log(`prestateTracer also failed: ${e2.message}`);
    }
  }

  // Now do the same for confirmCashDelivery to see what it queries
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  TRACING confirmCashDelivery INTERNAL CALLS');
  console.log('═══════════════════════════════════════════════════════\n');

  const confirmCalldata = fxPool.interface.encodeFunctionData('confirmCashDelivery', [0n]);

  try {
    const trace = await provider.send('debug_traceCall', [
      {
        from: SUPERVISOR1,
        to: FXPOOL_ADDR,
        data: confirmCalldata,
      },
      'latest',
      { tracer: 'callTracer' },
    ]);

    const externalCalls = [];
    function walk(node, depth = 0) {
      if (!node) return;
      if (node.to) {
        externalCalls.push({
          depth,
          type: node.type,
          from: node.from,
          to: node.to,
          input: node.input?.slice(0, 10),
          error: node.error,
        });
      }
      if (node.calls) for (const c of node.calls) walk(c, depth + 1);
    }
    walk(trace);

    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
      [UNION.toLowerCase()]: 'Union',
      [SUPERVISOR1.toLowerCase()]: 'Supervisor1',
    };

    for (const call of externalCalls) {
      const indent = '  '.repeat(call.depth);
      const toLabel = knownAddrs[call.to?.toLowerCase()] || call.to?.slice(0, 10) + '...';
      const fromLabel = knownAddrs[call.from?.toLowerCase()] || call.from?.slice(0, 10) + '...';
      console.log(`${indent}${call.type} ${fromLabel} → ${toLabel} [${call.input || 'no data'}]${call.error ? ` ERROR: ${call.error}` : ''}`);
    }
  } catch (e) {
    console.log(`Failed: ${e.message}`);
  }

  // Try the same on resolveEscrowCash which also works for leaders
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  TRACING resolveEscrowCash INTERNAL CALLS');
  console.log('═══════════════════════════════════════════════════════\n');

  const resolveCalldata = fxPool.interface.encodeFunctionData('resolveEscrowCash', [14n, ethers.parseEther('1')]);

  try {
    const trace = await provider.send('debug_traceCall', [
      { from: SUPERVISOR1, to: FXPOOL_ADDR, data: resolveCalldata },
      'latest',
      { tracer: 'callTracer' },
    ]);

    const externalCalls = [];
    function walk(node, depth = 0) {
      if (!node) return;
      if (node.to) {
        externalCalls.push({ depth, type: node.type, from: node.from, to: node.to, input: node.input?.slice(0, 10), error: node.error });
      }
      if (node.calls) for (const c of node.calls) walk(c, depth + 1);
    }
    walk(trace);

    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
      [UNION.toLowerCase()]: 'Union',
      [SUPERVISOR1.toLowerCase()]: 'Supervisor1',
    };

    for (const call of externalCalls) {
      const indent = '  '.repeat(call.depth);
      const toLabel = knownAddrs[call.to?.toLowerCase()] || call.to?.slice(0, 10) + '...';
      const fromLabel = knownAddrs[call.from?.toLowerCase()] || call.from?.slice(0, 10) + '...';
      console.log(`${indent}${call.type} ${fromLabel} → ${toLabel} [${call.input || 'no data'}]${call.error ? ` ERROR: ${call.error}` : ''}`);
    }
  } catch (e) {
    console.log(`Failed: ${e.message}`);
  }
}

main().catch(console.error);
