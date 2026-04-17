/**
 * Fix: set FxPool.rolesRegistry to the correct Roles contract address.
 *
 * Usage:
 *   node scripts/fix_set_roles_registry.mjs
 *
 * Must be signed by the FxPool admin (DEFAULT_ADMIN_ROLE):
 *   0x7687DD5c8cE4E42EBdd4A94CCd4FC9c4A7f18528
 *
 * This script PRINTS the transaction parameters — it does NOT broadcast.
 * Paste the `data` field into your Ledger-connected wallet (MetaMask,
 * Rabby, Frame, etc.) with "to" set to the FxPool address.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const ROLES_ADDR  = '0xc0a03f3A5319cE29205AeED7FDC0e6013e3E9bF9';
const ADMIN       = '0x7687DD5c8cE4E42EBdd4A94CCd4FC9c4A7f18528';

const provider = new ethers.JsonRpcProvider(RPC);
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SET FxPool.rolesRegistry — PRE-FLIGHT CHECKS');
  console.log('═══════════════════════════════════════════════════════\n');

  // Pre-flight: read current state
  const currentRoles = await fxPool.rolesRegistry();
  console.log(`  Current rolesRegistry: ${currentRoles}`);
  console.log(`  Target rolesRegistry:  ${ROLES_ADDR}`);

  if (currentRoles.toLowerCase() === ROLES_ADDR.toLowerCase()) {
    console.log('\n  ✅ Already set correctly. Nothing to do.');
    return;
  }

  // Verify admin still holds DEFAULT_ADMIN_ROLE
  const DEFAULT_ADMIN_ROLE = await fxPool.DEFAULT_ADMIN_ROLE();
  const adminHasRole = await fxPool.hasRole(DEFAULT_ADMIN_ROLE, ADMIN);
  console.log(`\n  Admin wallet:          ${ADMIN}`);
  console.log(`  Has DEFAULT_ADMIN_ROLE: ${adminHasRole ? '✅ YES' : '❌ NO — CANNOT SIGN'}`);

  if (!adminHasRole) {
    console.log('\n  ❌ Aborting — admin wallet no longer holds DEFAULT_ADMIN_ROLE.');
    return;
  }

  // Simulate the call to make sure it would succeed
  console.log('\n── Simulating tx (eth_call with from=admin) ──');
  const calldata = fxPool.interface.encodeFunctionData('setRolesRegistry', [ROLES_ADDR]);
  try {
    await provider.call({ from: ADMIN, to: FXPOOL_ADDR, data: calldata });
    console.log('  ✅ Simulation succeeded — tx will go through.');
  } catch (e) {
    const reason = e.reason || e.shortMessage || e.message;
    console.log(`  ❌ Simulation FAILED: ${reason}`);
    console.log('  Aborting — do not broadcast.');
    return;
  }

  // Gas estimate
  let gasEstimate = 0n;
  try {
    gasEstimate = await provider.estimateGas({ from: ADMIN, to: FXPOOL_ADDR, data: calldata });
    console.log(`  Gas estimate: ${gasEstimate.toString()}`);
  } catch (e) {
    console.log(`  ⚠️  Gas estimate failed: ${e.message.slice(0, 60)}`);
  }

  // Current gas prices
  const feeData = await provider.getFeeData();
  console.log(`  Suggested maxFeePerGas:         ${ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei')} gwei`);
  console.log(`  Suggested maxPriorityFeePerGas: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, 'gwei')} gwei`);

  // Print transaction to submit
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TRANSACTION TO SUBMIT');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('  Paste these into your Ledger-connected wallet:');
  console.log('');
  console.log(`  Network:   Polygon mainnet (chainId 137)`);
  console.log(`  From:      ${ADMIN}`);
  console.log(`  To:        ${FXPOOL_ADDR}`);
  console.log(`  Value:     0`);
  console.log(`  Data:      ${calldata}`);
  console.log(`  Gas limit: ${gasEstimate > 0n ? (gasEstimate * 12n / 10n).toString() + ' (estimate × 1.2)' : 'auto / ~100000'}`);
  console.log('');
  console.log('  Method:    setRolesRegistry(address)');
  console.log(`  Arg _roles: ${ROLES_ADDR}`);
  console.log('');
  console.log('  After submission, re-run this script to verify rolesRegistry is set.');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ALTERNATIVE: sign & broadcast with env PRIVATE_KEY');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('  If you want this script to broadcast directly, set:');
  console.log('    PRIVATE_KEY=0x...   (admin wallet private key)');
  console.log('  and re-run. NOT recommended for Ledger — use wallet UI.');
  console.log('');

  // Optional broadcast if PRIVATE_KEY provided
  if (process.env.PRIVATE_KEY) {
    console.log('\n── PRIVATE_KEY detected — broadcasting ──');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    if (wallet.address.toLowerCase() !== ADMIN.toLowerCase()) {
      console.log(`  ❌ Wallet address mismatch: ${wallet.address} != ${ADMIN}`);
      return;
    }
    const fxPoolSigner = fxPool.connect(wallet);
    const tx = await fxPoolSigner.setRolesRegistry(ROLES_ADDR);
    console.log(`  Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

    // Verify
    const newRoles = await fxPool.rolesRegistry();
    console.log(`  New rolesRegistry: ${newRoles}`);
  }
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
