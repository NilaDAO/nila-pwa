/**
 * Before setting rolesRegistry on FxPool, verify that ALL current global
 * UNION_ROLE holders are also registered as leaders in the Roles contract
 * for this specific union. If any are missing, they'll lose access.
 */
import { ethers } from 'ethers';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const ROLES_ADDR = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';

const provider = new ethers.JsonRpcProvider(RPC);
const roles = new ethers.Contract(ROLES_ADDR, [
  'function isLeader(address union, address who) view returns (bool)',
  'function leaders(address union, address who) view returns (bool)',
], provider);

async function main() {
  const wallets = [
    { label: 'Supervisor1', addr: '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7' },
    { label: 'Supervisor2', addr: '0xaf7030023CF86611FfC5a71798a0f7022210F2b3' },
    { label: 'Union',       addr: '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070' },
    { label: '0x4Ba22D562F', addr: '0x4Ba22D562F4e308c539c08E7544d9dAe8DB020A6' },
    { label: 'Admin (0x7687DD5c)', addr: '0x7687DD5c8cE4E42EBdd4A94CCd4FC9c4A7f18528' },
  ];

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Roles contract leader registration for union ${UNION}`);
  console.log('═══════════════════════════════════════════════════════\n');

  let allCovered = true;
  for (const w of wallets) {
    try {
      const isLeader = await roles.isLeader(UNION, w.addr);
      const fromLeaders = await roles.leaders(UNION, w.addr);
      const registered = isLeader || fromLeaders;
      console.log(`  ${registered ? '✅' : '❌'} ${w.label.padEnd(20)} ${w.addr}`);
      console.log(`     isLeader: ${isLeader} | leaders[]: ${fromLeaders}`);
      if (!registered) allCovered = false;
    } catch (e) {
      console.log(`  ❓ ${w.label}: ${e.message.slice(0, 60)}`);
      allCovered = false;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  if (allCovered) {
    console.log('  ✅ ALL global leaders are also registered in Roles.');
    console.log('  Safe to call setRolesRegistry — no one loses access.');
  } else {
    console.log('  ⚠️  SOME wallets have UNION_ROLE on FxPool but are NOT');
    console.log('  registered in the Roles contract for this union.');
    console.log('');
    console.log('  If setRolesRegistry causes ALL leader checks to switch to');
    console.log('  per-union Roles, those wallets will lose access.');
    console.log('');
    console.log('  → Either: register them in Roles first, OR');
    console.log('  → Confirm that cashScanMint/resolveEscrowCash keep using');
    console.log('    the global UNION_ROLE check even after rolesRegistry is set.');
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
