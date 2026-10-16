// P0 spike: the Stellar checks, shared by the browser page (Privy) and the Node proof.
// Every check gets only `signHash(hash32) -> 64-byte ed25519 signature`, the one primitive
// Privy offers for Stellar (useSignRawHash). If these pass with that alone, Privy covers
// Soroban auth entries and SEP-10 (design open item 43).
import {
  Address, Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder,
  WebAuth, authorizeEntry, nativeToScVal, rpc,
} from '@stellar/stellar-sdk';

export const NET = Networks.TESTNET;
const RPC_URL = 'https://soroban-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const TEST_ANCHOR = 'https://testanchor.stellar.org';

const toB64 = (u8) => btoa(String.fromCharCode(...u8));

export async function fund(address) {
  const r = await fetch(`${FRIENDBOT}?addr=${address}`);
  // 400 = already funded; fine for a re-run.
  if (!r.ok && r.status !== 400) throw new Error(`friendbot ${r.status}`);
}

async function waitFor(server, hash) {
  for (let i = 0; i < 30; i++) {
    const r = await server.getTransaction(hash);
    if (r.status !== 'NOT_FOUND') return r;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`tx ${hash} not found after 30 s`);
}

// 1. Soroban auth entry. A separate sponsor key is the tx source and pays the fee; her
// account only authorises the call through an address-credential auth entry (the
// sponsored / fee-bump model). The call: native XLM SAC transfer of 1 stroop from her.
export async function sorobanAuth({ address, signHash, log = () => {} }) {
  const server = new rpc.Server(RPC_URL);
  const sponsor = Keypair.random();
  await Promise.all([fund(sponsor.publicKey()), fund(address)]);
  log(`sponsor ${sponsor.publicKey()} and member ${address} funded on testnet`);

  const sac = Asset.native().contractId(NET);
  const op = Operation.invokeContractFunction({
    contract: sac,
    function: 'transfer',
    args: [new Address(address).toScVal(), new Address(sponsor.publicKey()).toScVal(),
      nativeToScVal(1n, { type: 'i128' })],
  });
  const build = async (o) => new TransactionBuilder(await server.getAccount(sponsor.publicKey()),
    { fee: BASE_FEE, networkPassphrase: NET }).addOperation(o).setTimeout(120).build();

  const tx1 = await build(op);
  const sim = await server.simulateTransaction(tx1);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulate: ${sim.error}`);
  const entries = sim.result.auth;
  log(`${entries.length} auth entry(ies) to sign for ${address}`);

  const until = (await server.getLatestLedger()).sequence + 100;
  const signed = await Promise.all(entries.map((e) =>
    // The callback gets sha256(HashIdPreimage) — a 32-byte hash, nothing else.
    authorizeEntry(e, async (_preimage, payload) => signHash(payload), until, NET)));
  log('auth entries signed through the raw-hash callback (SDK verified each signature)');

  const op2 = Operation.invokeHostFunction({ func: tx1.operations[0].func, auth: signed });
  const sim2 = await server.simulateTransaction(await build(op2));
  if (rpc.Api.isSimulationError(sim2)) throw new Error(`simulate (signed): ${sim2.error}`);
  const tx = rpc.assembleTransaction(await build(op2), sim2).build();
  tx.sign(sponsor);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') throw new Error(`send: ${sent.errorResult?.toXDR('base64')}`);
  const res = await waitFor(server, sent.hash);
  if (res.status !== 'SUCCESS') throw new Error(`tx ${sent.hash}: ${res.status}`);
  log(`on-chain SUCCESS, tx ${sent.hash}`);
  return { pass: true, tx: sent.hash, ledger: res.ledger };
}

async function signChallenge(xdrB64, passphrase, address, signHash) {
  const tx = TransactionBuilder.fromXDR(xdrB64, passphrase);
  const sig = await signHash(tx.hash()); // SEP-10: sign the tx hash (sha256 of the signature base)
  tx.addSignature(address, toB64(sig));
  return tx.toXDR();
}

// 2a. SEP-10 against a challenge built here, verified with the SDK's own server-side check
// (what the trust's Anchor Platform does).
export async function sep10Local({ address, signHash, log = () => {} }) {
  const server = Keypair.random();
  const challenge = WebAuth.buildChallengeTx(server, address, 'nila.land', 300, NET, 'auth.nila.land');
  const signedXdr = await signChallenge(challenge, NET, address, signHash);
  const signers = WebAuth.verifyChallengeTxSigners(signedXdr, server.publicKey(), NET, [address],
    'nila.land', 'auth.nila.land');
  if (!signers.includes(address)) throw new Error('client signature not accepted');
  log(`challenge verified, signers: ${signers.join(', ')}`);
  return { pass: true, signers };
}

// 2b. SEP-10 against a real anchor: SDF's test anchor issues a JWT only for a valid signature.
export async function sep10TestAnchor({ address, signHash, log = () => {} }) {
  const toml = await (await fetch(`${TEST_ANCHOR}/.well-known/stellar.toml`)).text();
  const authUrl = toml.match(/WEB_AUTH_ENDPOINT\s*=\s*"([^"]+)"/)?.[1];
  if (!authUrl) throw new Error('no WEB_AUTH_ENDPOINT in the test anchor toml');
  const c = await (await fetch(`${authUrl}?account=${address}`)).json();
  if (!c.transaction) throw new Error(`challenge: ${JSON.stringify(c)}`);
  const signedXdr = await signChallenge(c.transaction, c.network_passphrase || NET, address, signHash);
  const t = await (await fetch(authUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  })).json();
  if (!t.token) throw new Error(`token: ${JSON.stringify(t)}`);
  log(`test anchor issued a JWT (${t.token.slice(0, 16)}…)`);
  return { pass: true, authUrl };
}
