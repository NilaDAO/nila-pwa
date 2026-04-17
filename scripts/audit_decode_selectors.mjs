import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const coreAbi = JSON.parse(readFileSync('src/components/ABI/genericFundCore.json', 'utf8'));
const fxAbi = JSON.parse(readFileSync('src/components/ABI/NilaFxPool.json', 'utf8'));

const targets = {
  '0xb3e3b601': 'cashScanMint → Core (STATICCALL before mint)',
  '0xe3c3f6bb': 'cashScanMint → Core (CALL after mint)',
  '0x2dcf838b': 'cashScanMint → Core (STATICCALL after)',
  '0xfeaf968c': 'cashScanMint → external (via 0xda0f8df6 proxy)',
};

console.log('── Matching selectors against Core ABI ──\n');
const coreFns = (coreAbi.abi ?? coreAbi).filter(x => x.type === 'function');

for (const fn of coreFns) {
  const types = fn.inputs.map(i => i.type).join(',');
  const sig = `${fn.name}(${types})`;
  const sel = ethers.id(sig).slice(0, 10);
  if (targets[sel]) {
    console.log(`  ✓ ${sel} = ${sig}`);
    console.log(`    Use: ${targets[sel]}`);
    console.log(`    Inputs: ${fn.inputs.map(i => `${i.type} ${i.name}`).join(', ')}`);
    console.log(`    Outputs: ${fn.outputs?.map(o => o.type).join(', ') || 'void'}`);
    console.log();
  }
}

console.log('── Matching against FxPool ABI ──\n');
const fxFns = (fxAbi.abi ?? fxAbi).filter(x => x.type === 'function');
for (const fn of fxFns) {
  const types = fn.inputs.map(i => i.type).join(',');
  const sig = `${fn.name}(${types})`;
  const sel = ethers.id(sig).slice(0, 10);
  if (targets[sel]) {
    console.log(`  ✓ ${sel} = ${sig} (FxPool)`);
  }
}

console.log('\n── Common Chainlink / price feed selectors ──');
const chainlinkSigs = ['latestRoundData()', 'latestAnswer()', 'decimals()'];
for (const s of chainlinkSigs) {
  console.log(`  ${ethers.id(s).slice(0, 10)} = ${s}`);
}

console.log('\n── Common leader-check candidates (for Core) ──');
const candidates = [
  'isUnionLeader(address)',
  'isUnionLeader(address,address)',
  'onlyLeader(address)',
  'leaderOf(address)',
  'unionLeader(address)',
  'unionLeaders(address,address)',
  'unionAdmin(address)',
  'isLeader(address,address)',
  'canMint(address,address)',
  'canDisburse(address,address)',
  'canRepay(address,address)',
];
for (const sig of candidates) {
  const sel = ethers.id(sig).slice(0, 10);
  const match = targets[sel] ? ' ← MATCH!' : '';
  console.log(`  ${sel} = ${sig}${match}`);
}
