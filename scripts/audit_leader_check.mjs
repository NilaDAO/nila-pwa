/**
 * Investigate "not a leader of this union" error on confirmCashDelivery.
 * Check: rolesRegistry of FxPool vs Core, redeemOrder 0, nextRedeemOrderId.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const CORE_ADDR = '0x4173BbaF66A4f9A2705d05B800e8602370366756';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const ROLES_ADDR = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';

const provider = new ethers.JsonRpcProvider(RPC);
const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const core = new ethers.Contract(CORE_ADDR, coreAbi.abi ?? coreAbi, provider);
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  LEADER CHECK INVESTIGATION');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Roles registries
  console.log('── ROLES REGISTRIES ──');
  try {
    const fxRoles = await fxPool.rolesRegistry();
    console.log(`  FxPool.rolesRegistry():  ${fxRoles}`);
  } catch (e) { console.log(`  FxPool.rolesRegistry(): ERROR - ${e.message}`); }

  try {
    const coreRoles = await core.rolesRegistry?.();
    console.log(`  Core.rolesRegistry():    ${coreRoles}`);
  } catch (e) { console.log(`  Core.rolesRegistry(): not callable`); }

  console.log(`  env ROLES_MAIN:          ${ROLES_ADDR}`);

  // 2. Redeem orders
  console.log('\n── REDEEM ORDERS ──');
  try {
    const nextId = await fxPool.nextRedeemOrderId();
    console.log(`  nextRedeemOrderId: ${nextId.toString()}`);

    for (let id = 0n; id < nextId; id++) {
      try {
        const o = await fxPool.redeemOrders(id);
        const statusMap = { 0: 'OPEN', 1: 'COMMITTED', 2: 'DELIVERED', 3: 'CANCELLED', 4: 'EXPIRED' };
        console.log(`\n  Order #${id}:`);
        console.log(`    union:      ${o.union}`);
        console.log(`    farmer:     ${o.farmer}`);
        console.log(`    lp:         ${o.lp}`);
        console.log(`    inrValue:   ${o.inrValue?.toString()}`);
        console.log(`    usdtLocked: ${o.usdtLocked?.toString()}`);
        console.log(`    feeBP:      ${o.feeBP?.toString()}`);
        console.log(`    status:     ${o.status?.toString()} (${statusMap[Number(o.status)] || '?'})`);
        console.log(`    deadline:   ${o.deadline ? new Date(Number(o.deadline) * 1000).toISOString() : '?'}`);
      } catch (e) {
        console.log(`  Order #${id}: error ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  nextRedeemOrderId error: ${e.message}`);
  }

  // 3. Known supervisor wallets / leader check
  console.log('\n── LEADER CHECKS (try to identify current leader) ──');

  // Check the NilaUnion contract for leader
  const unionAbi = ['function unionLeader() view returns (address)'];
  try {
    const unionContract = new ethers.Contract(UNION, unionAbi, provider);
    const leader = await unionContract.unionLeader();
    console.log(`  NilaUnion(${UNION}).unionLeader(): ${leader}`);
  } catch (e) {
    console.log(`  NilaUnion.unionLeader() error: ${e.message}`);
  }

  // Check the Roles contract
  const rolesAbi = [
    'function isUnionLeader(address union, address who) view returns (bool)',
    'function unionLeader(address union) view returns (address)',
    'function leaders(address union, address who) view returns (bool)',
  ];
  const rolesC = new ethers.Contract(ROLES_ADDR, rolesAbi, provider);

  // Try different signatures
  const knownWallets = [
    '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7',  // Supervisor 1
    '0xaf7030023CF86611FfC5a71798a0f7022210F2b3',  // Supervisor 2
    '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070',  // Union address itself
    '0x7687DD5c8cE4E42EBdd4A94CCd4FC9c4A7f18528',  // Appeared in earlier traces
  ];

  console.log('\n  Trying rolesRegistry.isUnionLeader(union, wallet):');
  for (const w of knownWallets) {
    try {
      const isLeader = await rolesC.isUnionLeader(UNION, w);
      console.log(`    ${w}: ${isLeader}`);
    } catch (e) {
      console.log(`    ${w}: ERROR ${e.message.slice(0, 60)}`);
      break;
    }
  }

  console.log('\n  Trying rolesRegistry.unionLeader(union):');
  try {
    const leader = await rolesC.unionLeader(UNION);
    console.log(`    result: ${leader}`);
  } catch (e) {
    console.log(`    ERROR: ${e.message.slice(0, 80)}`);
  }

  // 4. Look at Roles contract directly — introspect all functions
  console.log('\n── ROLES CONTRACT BYTECODE CHECK ──');
  const code = await provider.getCode(ROLES_ADDR);
  console.log(`  Code length: ${code.length} bytes (${(code.length - 2) / 2} bytes of code)`);

  // Check if the FxPool has a separate leader check — look for functions
  console.log('\n── FxPool ABI functions containing "leader" ──');
  const fxAbiRaw = fxAbi.abi ?? fxAbi;
  for (const fn of fxAbiRaw) {
    if (fn.type === 'function' && (fn.name?.toLowerCase().includes('leader') || fn.name?.toLowerCase().includes('role'))) {
      console.log(`  ${fn.name}(${fn.inputs?.map(i => `${i.type} ${i.name}`).join(', ') || ''})`);
    }
  }

  // 5. Let's call confirmCashDelivery.staticCall with each wallet to see who would succeed
  console.log('\n── staticCall simulation: confirmCashDelivery(0) ──');
  // Load order 0 first to get the actual union
  try {
    const order0 = await fxPool.redeemOrders(0n);
    console.log(`  Order 0 union: ${order0.union}`);
    console.log(`  Order 0 status: ${order0.status}`);

    // Try calling with impersonated wallet (needs a Signer, but we can use callStatic with from)
    for (const w of knownWallets) {
      try {
        const tx = {
          to: FXPOOL_ADDR,
          from: w,
          data: '0x6539fb66' + '0000000000000000000000000000000000000000000000000000000000000000', // confirmCashDelivery(0)
        };
        await provider.call(tx);
        console.log(`    ${w}: ✅ would succeed`);
      } catch (e) {
        const reason = e.reason || e.shortMessage || e.info?.error?.message || e.message;
        console.log(`    ${w}: ❌ ${reason?.slice(0, 80)}`);
      }
    }
  } catch (e) {
    console.log(`  Could not read order 0: ${e.message}`);
  }
}

main().catch(console.error);
