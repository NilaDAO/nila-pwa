/**
 * Test: can anyone call cashScanMint? Or is it gated by leader check?
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';

const provider = new ethers.JsonRpcProvider(RPC);
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  // Encode a cashScanMint call — purpose=INVEST, 100 INR, random scan hash
  // cashScanMint(unionAddr, loanType, inrValue, scanHash, purpose, loanId, member, escrowIdToResolve)
  const loanTypeBytes = ethers.encodeBytes32String('GroundUp Fund');
  const scanHash = ethers.keccak256(ethers.toUtf8Bytes('test-' + Date.now()));
  const calldata = fxPool.interface.encodeFunctionData('cashScanMint', [
    UNION,
    loanTypeBytes,
    100, // inrValue
    scanHash,
    0, // purpose: INVEST
    ethers.ZeroHash, // loanId
    ethers.ZeroAddress, // member
    0n, // escrowIdToResolve
  ]);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  CAN ANYONE CALL cashScanMint?');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test with random/unrelated wallets
  const wallets = [
    { label: 'Random wallet (never touched Nila)', addr: '0x0000000000000000000000000000000000000001' },
    { label: 'Random wallet 2', addr: '0x1111111111111111111111111111111111111111' },
    { label: 'Known Supervisor1 (leader)', addr: '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7' },
    { label: 'Known Supervisor2 (leader)', addr: '0xaf7030023CF86611FfC5a71798a0f7022210F2b3' },
    { label: 'Union contract address itself', addr: UNION },
    { label: 'Another random', addr: '0xDEADbEEFdeadBEEfDEAdBEEfDeAdBEEfDeadbEEF' },
  ];

  console.log('Simulating: cashScanMint(union, GroundUp Fund, 100 INR, scanHash, INVEST)\n');

  for (const w of wallets) {
    try {
      await provider.call({
        to: FXPOOL_ADDR,
        from: w.addr,
        data: calldata,
      });
      console.log(`  ✅ ${w.label}`);
      console.log(`     ${w.addr}`);
      console.log(`     Would succeed!\n`);
    } catch (e) {
      const reason = e.reason || e.shortMessage || e.info?.error?.message || e.message;
      console.log(`  ❌ ${w.label}`);
      console.log(`     ${w.addr}`);
      console.log(`     ${reason?.slice(0, 100)}\n`);
    }
  }

  // Also test cashScanMint with purpose=REPAY to see if there's any additional check
  console.log('\nSimulating: cashScanMint(union, GroundUp Fund, 100 INR, scanHash, REPAY)\n');

  const calldataRepay = fxPool.interface.encodeFunctionData('cashScanMint', [
    UNION,
    loanTypeBytes,
    100,
    scanHash,
    1, // REPAY
    '0x000000000000000000000000000000000000000000000000000000000005ab81', // real loan id
    '0x33D8D0B5550BF1B144A16501103b00F2078eF59A',
    0n,
  ]);

  for (const w of wallets) {
    try {
      await provider.call({
        to: FXPOOL_ADDR,
        from: w.addr,
        data: calldataRepay,
      });
      console.log(`  ✅ ${w.label}: would succeed`);
    } catch (e) {
      const reason = e.reason || e.shortMessage || e.info?.error?.message || e.message;
      console.log(`  ❌ ${w.label}: ${reason?.slice(0, 80)}`);
    }
  }

  // Check the function modifier by looking at the revert reasons
  console.log('\n\n══ DIAGNOSIS ══');
  console.log('If ALL addresses succeed → cashScanMint is PUBLIC (anyone can mint)');
  console.log('If only leaders succeed → it IS gated (my earlier statement was wrong)');
  console.log('If all fail → same rolesRegistry issue affecting all leader-gated functions');
}

main().catch(console.error);
