// Node proof for P0: run the Stellar checks with a throwaway testnet key whose only use is a
// raw-hash callback, i.e. exactly what Privy's useSignRawHash returns. No Privy account needed.
import { Keypair } from '@stellar/stellar-sdk';
import { sorobanAuth, sep10Local, sep10TestAnchor } from '../src/checks.js';

const kp = Keypair.random();
const address = kp.publicKey();
const signHash = async (hash) => {
  if (hash.length !== 32) throw new Error(`expected a 32-byte hash, got ${hash.length}`);
  return new Uint8Array(kp.sign(Buffer.from(hash)));
};

let failed = 0;
for (const [name, fn] of [['Soroban auth entry', sorobanAuth], ['SEP-10 local', sep10Local], ['SEP-10 test anchor', sep10TestAnchor]]) {
  try {
    const r = await fn({ address, signHash, log: (m) => console.log(`  ${m}`) });
    console.log(`PASS ${name} ${JSON.stringify(r)}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
