/**
 * Investigate: does the Roles contract recognize Supervisor2 as a leader?
 * If yes, then FxPool is calling it with wrong args / wrong function signature.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const ROLES_ADDR = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';
const SUPERVISOR1 = '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7';
const SUPERVISOR2 = '0xaf7030023CF86611FfC5a71798a0f7022210F2b3';

const provider = new ethers.JsonRpcProvider(RPC);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ROLES CONTRACT INTERFACE PROBE');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`  Roles contract: ${ROLES_ADDR}`);
  console.log(`  Union:          ${UNION}`);
  console.log(`  Supervisor1:    ${SUPERVISOR1}`);
  console.log(`  Supervisor2:    ${SUPERVISOR2}\n`);

  // Try every plausible leader-check signature on the Roles contract
  const candidates = [
    // most likely
    'function isUnionLeader(address union, address who) view returns (bool)',
    'function isLeader(address union, address who) view returns (bool)',
    'function unionLeader(address union) view returns (address)',
    'function leaderOf(address union) view returns (address)',
    'function leaders(address union, address who) view returns (bool)',
    'function unionLeaders(address union, address who) view returns (bool)',
    'function hasLeaderRole(address union, address who) view returns (bool)',
    'function checkLeader(address union, address who) view returns (bool)',
    // permission-style
    'function canAct(address union, address who) view returns (bool)',
    'function canManage(address union, address who) view returns (bool)',
    // reversed arg order
    'function isUnionLeader(address who, address union) view returns (bool)',
    // bytes32 role variants
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function getUnionLeader(address union) view returns (address)',
  ];

  console.log('── Trying candidate signatures on Roles contract ──\n');

  for (const sig of candidates) {
    try {
      const c = new ethers.Contract(ROLES_ADDR, [sig], provider);
      const fnName = sig.match(/function (\w+)/)[1];
      const inputs = sig.match(/\((.*?)\) view/)[1];
      const paramCount = inputs ? inputs.split(',').length : 0;

      let args;
      if (sig.includes('bytes32')) {
        args = [ethers.id('LEADER_ROLE'), SUPERVISOR2];
      } else if (paramCount === 1) {
        args = [UNION];
      } else if (paramCount === 2) {
        if (sig.includes('who, address union')) {
          args = [SUPERVISOR2, UNION];
        } else {
          args = [UNION, SUPERVISOR2];
        }
      } else {
        args = [];
      }

      const result = await c[fnName](...args);
      console.log(`  ✅ ${sig}`);
      console.log(`     args: ${args.join(', ')}`);
      console.log(`     result: ${result}\n`);
    } catch (e) {
      // only log if it's not a simple "doesn't exist"
      if (!e.message.includes('could not decode') && !e.message.includes('BAD_DATA')) {
        // console.log(`  ❌ ${sig.split('function ')[1].split(')')[0]}): ${e.message.slice(0,60)}`);
      }
    }
  }

  // ── Try the Core contract to see how IT calls roles ──
  console.log('\n── Compare: how Core successfully queries "is leader?" ──\n');

  // Trace a Core function that gates on leader — e.g. repayLoan (already works)
  // But that would require a valid loan. Instead, trace any Core function that fires a leader check.
  // Looking at the repayLoan tx from earlier — 0xd34c7d704952e5f9... was by Supervisor1

  // Actually let's find Core functions that gate on leader
  const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
  const coreFns = (coreAbi.abi ?? coreAbi).filter(x => x.type === 'function');

  // We know Core has roles() and setRoles(). Let's query:
  const core = new ethers.Contract(CORE_ADDR, [
    'function roles() view returns (address)',
  ], provider);

  try {
    const rolesAddr = await core.roles();
    console.log(`  Core.roles(): ${rolesAddr}`);
    console.log(`  Matches env ROLES_MAIN: ${rolesAddr.toLowerCase() === ROLES_ADDR.toLowerCase()}`);
  } catch (e) {
    console.log(`  Core.roles() error: ${e.message}`);
  }

  // And FxPool.rolesRegistry() again for comparison
  const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
  const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);
  const fxRoles = await fxPool.rolesRegistry();
  console.log(`  FxPool.rolesRegistry(): ${fxRoles}`);
  console.log(`  Mismatch: FxPool uses ${fxRoles === ethers.ZeroAddress ? 'ZERO ADDRESS' : fxRoles}`);

  // ── Trace a real Core call that uses leader check ──
  console.log('\n── Tracing a real Core.repayLoan tx (known success) to find Roles call ──\n');

  // Use an earlier successful repayLoan tx from our traces
  // Tx: 0xd34c7d704952e5f9... (Apr 3, Supervisor1 repaid 10k)
  const txHash = '0xd34c7d704952e5f90c17815bc5a46786de098a7c6135a4c0b6e0534358fa1b4c';

  try {
    const trace = await provider.send('debug_traceTransaction', [txHash, { tracer: 'callTracer' }]);

    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
      [UNION.toLowerCase()]: 'Union',
      [SUPERVISOR1.toLowerCase()]: 'Supervisor1',
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
    console.log(`  Trace failed: ${e.message.slice(0, 100)}`);
  }

  // ── Now simulate a Core.repayLoan call as Supervisor1 to trace fresh ──
  console.log('\n── Simulating Core.repayLoan as Supervisor1 — to find leader check path ──\n');

  const repayIface = new ethers.Interface([
    'function repayLoan(address union, bytes32 loanId, uint256 amount)',
  ]);
  const repayCalldata = repayIface.encodeFunctionData('repayLoan', [
    UNION,
    '0x000000000000000000000000000000000000000000000000000000000005ab81',
    ethers.parseEther('1'),
  ]);

  try {
    const trace = await provider.send('debug_traceCall', [
      { from: SUPERVISOR2, to: CORE_ADDR, data: repayCalldata },
      'latest',
      { tracer: 'callTracer' },
    ]);

    const knownAddrs = {
      [FXPOOL_ADDR.toLowerCase()]: 'FxPool',
      [CORE_ADDR.toLowerCase()]: 'Core',
      [ROLES_ADDR.toLowerCase()]: 'Roles',
      [SUPERVISOR2.toLowerCase()]: 'Supervisor2',
    };

    function walk(node, depth = 0) {
      if (!node) return;
      const indent = '  '.repeat(depth);
      const toLabel = knownAddrs[node.to?.toLowerCase()] || node.to?.slice(0, 10) + '...';
      const fromLabel = knownAddrs[node.from?.toLowerCase()] || node.from?.slice(0, 10) + '...';
      const err = node.error ? ` ⚠ ${node.error}` : '';
      const out = node.output ? ` → ${node.output.slice(0, 20)}` : '';
      console.log(`${indent}${node.type} ${fromLabel} → ${toLabel} [${node.input?.slice(0, 10) || 'nodata'}]${err}${out}`);
      if (node.calls) for (const c of node.calls) walk(c, depth + 1);
    }
    walk(trace);
  } catch (e) {
    console.log(`  Trace failed: ${e.message.slice(0, 100)}`);
  }

  // ── Get Roles contract bytecode size and see if it's a proxy ──
  console.log('\n── Roles contract details ──\n');
  const code = await provider.getCode(ROLES_ADDR);
  console.log(`  Code size: ${(code.length - 2) / 2} bytes`);

  // Check for EIP-1967 implementation slot
  const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implRaw = await provider.getStorage(ROLES_ADDR, implSlot);
  const impl = '0x' + implRaw.slice(-40);
  if (impl !== '0x0000000000000000000000000000000000000000') {
    console.log(`  EIP-1967 implementation: ${impl}`);
    const implCode = await provider.getCode(impl);
    console.log(`  Implementation code size: ${(implCode.length - 2) / 2} bytes`);
  }

  // Check admin slot
  const adminSlot = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
  const adminRaw = await provider.getStorage(ROLES_ADDR, adminSlot);
  const admin = '0x' + adminRaw.slice(-40);
  if (admin !== '0x0000000000000000000000000000000000000000') {
    console.log(`  EIP-1967 admin: ${admin}`);
  }
}

main().catch(console.error);
