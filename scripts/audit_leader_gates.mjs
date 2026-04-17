/**
 * Compare leader gate behavior across FxPool functions for Supervisor1 wallet.
 * Uses a real active escrow (#14: 600 nIN, ACTIVE, union = our union).
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const RPC = 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED';
const UNION = '0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070';
const FXPOOL_ADDR = '0xBaE307FE0A453955c649cD8f81e3DA572dF448eA';
const SUPERVISOR1 = '0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7';
const SUPERVISOR2 = '0xaf7030023CF86611FfC5a71798a0f7022210F2b3';
const FARMER = '0x33D8D0B5550BF1B144A16501103b00F2078eF59A';

const provider = new ethers.JsonRpcProvider(RPC);
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));
const fxPool = new ethers.Contract(FXPOOL_ADDR, fxAbi.abi ?? fxAbi, provider);

async function main() {
  // Tests to run
  const tests = [
    {
      name: 'cashScanMint (INVEST, 100)',
      data: () => fxPool.interface.encodeFunctionData('cashScanMint', [
        UNION,
        ethers.encodeBytes32String('GroundUp Fund'),
        100,
        ethers.keccak256(ethers.toUtf8Bytes('t1')),
        0, ethers.ZeroHash, ethers.ZeroAddress, 0n,
      ]),
    },
    {
      name: 'resolveEscrowCash(14, 1)',  // 1 nIN on escrow #14 (600 active)
      data: () => fxPool.interface.encodeFunctionData('resolveEscrowCash', [14n, ethers.parseEther('1')]),
    },
    {
      name: 'confirmCashDelivery(0)',
      data: () => fxPool.interface.encodeFunctionData('confirmCashDelivery', [0n]),
    },
    {
      name: 'burnFarmerNin(farmer, 1)',
      data: () => fxPool.interface.encodeFunctionData('burnFarmerNin', [FARMER, ethers.parseEther('1')]),
    },
  ];

  const callers = [
    { label: 'Random', addr: '0x0000000000000000000000000000000000000001' },
    { label: 'Supervisor1', addr: SUPERVISOR1 },
    { label: 'Supervisor2', addr: SUPERVISOR2 },
    { label: 'Union', addr: UNION },
  ];

  for (const test of tests) {
    console.log(`\n── ${test.name} ──`);
    const data = test.data();
    for (const c of callers) {
      try {
        await provider.call({ to: FXPOOL_ADDR, from: c.addr, data });
        console.log(`  ✅ ${c.label}`);
      } catch (e) {
        const reason = e.reason || e.shortMessage || e.info?.error?.message || e.message;
        // Try to extract the actual revert string
        let clean = reason;
        if (reason?.includes('reverted with reason')) {
          const m = reason.match(/"([^"]+)"/);
          if (m) clean = m[1];
        }
        console.log(`  ❌ ${c.label}: ${clean?.slice(0, 80)}`);
      }
    }
  }
}

main().catch(console.error);
