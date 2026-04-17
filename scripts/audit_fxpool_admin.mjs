/**
 * Find who has DEFAULT_ADMIN_ROLE on FxPool so we know who can call setRolesRegistry.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const ROLES_ADDR = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';

const provider = new ethers.JsonRpcProvider(RPC);
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FxPool ADMIN DISCOVERY');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get the role constants
  const DEFAULT_ADMIN_ROLE = await fxPool.DEFAULT_ADMIN_ROLE();
  const UNION_ROLE = await fxPool.UNION_ROLE();
  console.log(`  DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`);
  console.log(`  UNION_ROLE:         ${UNION_ROLE}`);

  // Scan for RoleGranted events to find who holds DEFAULT_ADMIN_ROLE
  console.log('\n── Searching RoleGranted events (last ~30 days) ──\n');

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - 1500000;

  const roleGrantedFilter = fxPool.filters.RoleGranted(DEFAULT_ADMIN_ROLE);
  const events = await fxPool.queryFilter(roleGrantedFilter, fromBlock, latestBlock);
  console.log(`  DEFAULT_ADMIN_ROLE grant events: ${events.length}`);

  const adminCandidates = new Set();
  for (const ev of events) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    const account = ev.args.account;
    const sender = ev.args.sender;
    adminCandidates.add(account);
    console.log(`  [${ts}] account=${account} granted by ${sender}`);
  }

  // Also search wider window (90 days) for the initial grant
  if (events.length === 0) {
    console.log('\n  No grants in 30-day window. Searching 90 days...');
    const fromBlock90 = latestBlock - 4500000;
    const wider = await fxPool.queryFilter(roleGrantedFilter, fromBlock90, latestBlock);
    console.log(`  Found ${wider.length} events`);
    for (const ev of wider) {
      const block = await provider.getBlock(ev.blockNumber);
      const ts = new Date(block.timestamp * 1000).toISOString();
      adminCandidates.add(ev.args.account);
      console.log(`  [${ts}] account=${ev.args.account} granted by ${ev.args.sender}`);
    }
  }

  // Also search UNION_ROLE grants to find all leaders
  console.log('\n── UNION_ROLE grant events (shows current global leaders) ──\n');
  const unionRoleEvents = await fxPool.queryFilter(fxPool.filters.RoleGranted(UNION_ROLE), fromBlock, latestBlock);
  for (const ev of unionRoleEvents) {
    const block = await provider.getBlock(ev.blockNumber);
    const ts = new Date(block.timestamp * 1000).toISOString();
    console.log(`  [${ts}] account=${ev.args.account} granted by ${ev.args.sender}`);
  }

  // Check hasRole directly for known addresses
  console.log('\n── Direct hasRole(DEFAULT_ADMIN_ROLE, wallet) checks ──\n');
  const candidates = [
    '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7',  // Supervisor1
    '0xaf7030023CF86611FfC5a71798a0f7022210F2b3',  // Supervisor2
    '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070',  // Union
    '0x7687DD5c8cE4E42EBdd4A94CCd4FC9c4A7f18528',  // another
    ...Array.from(adminCandidates),
  ];

  for (const addr of new Set(candidates)) {
    try {
      const has = await fxPool.hasRole(DEFAULT_ADMIN_ROLE, addr);
      const hasUnion = await fxPool.hasRole(UNION_ROLE, addr);
      console.log(`  ${addr}`);
      console.log(`    DEFAULT_ADMIN_ROLE: ${has ? '✅ YES' : '❌'}`);
      console.log(`    UNION_ROLE:         ${hasUnion ? '✅ YES' : '❌'}`);
    } catch (e) {
      console.log(`  ${addr}: error ${e.message.slice(0, 60)}`);
    }
  }

  // Prepare the transaction data
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TRANSACTION TO SEND');
  console.log('═══════════════════════════════════════════════════════\n');
  const calldata = fxPool.interface.encodeFunctionData('setRolesRegistry', [ROLES_ADDR]);
  console.log(`  To:     ${FXPOOL_ADDR}  (FxPool)`);
  console.log(`  From:   <admin wallet>`);
  console.log(`  Method: setRolesRegistry(address)`);
  console.log(`  Arg:    ${ROLES_ADDR}  (Roles contract)`);
  console.log(`  Data:   ${calldata}`);
  console.log(`\n  This changes FxPool.rolesRegistry from 0x000...000 → ${ROLES_ADDR}`);
  console.log(`  After this tx, confirmCashDelivery and other gated functions will work.`);
}

main().catch(console.error);
