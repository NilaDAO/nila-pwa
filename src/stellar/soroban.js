// Soroban calls from the app (P5; design useSorobanTx). Her own transaction (she is the source), simulated
// and assembled here against the public RPC from /stellar/config, signed with her Privy Stellar wallet
// (a 32-byte hash), then fee-bumped by the node (POST /stellar/feebump; she holds no XLM) and followed on
// the RPC until it lands. Reads are simulations with no signature.
import { Address, BASE_FEE, Contract, TransactionBuilder, nativeToScVal, rpc, scValToNative } from '@stellar/stellar-sdk';

const API = process.env.REACT_APP_API_BASE_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => btoa(String.fromCharCode(...u8));

export const sv = {
  address: (a) => new Address(a).toScVal(),
  i128: (n) => nativeToScVal(BigInt(n), { type: 'i128' }),
  u32: (n) => nativeToScVal(Number(n), { type: 'u32' }),
  u64: (n) => nativeToScVal(BigInt(n), { type: 'u64' }),
  bytes32: (hex) => nativeToScVal(Uint8Array.from(hex.replace(/^0x/, '').padStart(64, '0').match(/../g).map((x) => parseInt(x, 16))), { type: 'bytes' }),
  bytes: (u8) => nativeToScVal(u8, { type: 'bytes' }),
  u32enum: (n) => nativeToScVal(Number(n), { type: 'u32' }),
  none: () => nativeToScVal(null),
};

/** A uint256 token id (decimal string) as 32 bytes, big-endian, hex. */
export const tokenHex = (decimal) => BigInt(decimal).toString(16).padStart(64, '0');

const server = (cfg) => new rpc.Server(cfg.rpc_url, { allowHttp: cfg.rpc_url?.startsWith('http://') });

/** A read: simulate `fn` on `contract` (any funded account as source; the sponsor is). */
export async function readContract(cfg, contractName, fn, args = []) {
  const s = server(cfg);
  const id = cfg.contracts[contractName];
  if (!id) throw new Error(`no ${contractName} contract in the node config`);
  const src = await s.getAccount(cfg.sponsor);
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(new Contract(id).call(fn, ...args)).setTimeout(60).build();
  const sim = await s.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

async function feeBump(xdr) {
  const r = await fetch(`${API}/stellar/feebump`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xdr }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || `fee-bump ${r.status}`);
  return body.hash;
}

/** The RPC comes from the node's config: sign only the call she asked for. One op from her own account,
 * the same contract, function and arguments, and auth only by her account as source (no entry that
 * would sign for another address). */
// stellar-sdk 17 exposes XDR fields as properties (union: `.type`); older builds as methods (`.switch()`).
const credType = (a) => (typeof a.credentials === 'function' ? a.credentials().switch().name : a.credentials?.type);

function checkPrepared(raw, tx, source) {
  const ops = tx.operations;
  const bad = () => { throw new Error('The network returned a different transaction. Nothing was signed.'); };
  if (tx.source !== source || ops.length !== 1 || ops[0].type !== 'invokeHostFunction' || (ops[0].source && ops[0].source !== source)) bad();
  if (ops[0].func.toXDR('base64') !== raw.operations[0].func.toXDR('base64')) bad();
  if ((ops[0].auth || []).some((a) => credType(a) !== 'sorobanCredentialsSourceAccount')) bad();
}

/** A sent transaction's status on the RPC: SUCCESS | FAILED | NOT_FOUND (null when the RPC fails). */
export async function txStatus(cfg, hash) {
  const r = await server(cfg).getTransaction(hash).catch(() => null);
  return r?.status ?? null;
}

/** Her call: build → simulate → sign (her Privy wallet) → node fee-bump → wait. Returns { hash, result }. */
export async function invokeContract({ cfg, source, signHash, contractName, fn, args, onSent }) {
  const s = server(cfg);
  const id = cfg.contracts[contractName];
  if (!id) throw new Error(`no ${contractName} contract in the node config`);
  const acct = await s.getAccount(source);
  const raw = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(new Contract(id).call(fn, ...args)).setTimeout(300).build();
  const tx = await s.prepareTransaction(raw);           // simulate + footprint + resource fee + auth
  checkPrepared(raw, tx, source);
  tx.addSignature(source, b64(await signHash(tx.hash())));
  const hash = await feeBump(tx.toXDR());
  onSent?.(hash);
  for (let i = 0; i < 60; i++) {
    const r = await s.getTransaction(hash).catch(() => null);
    if (r && r.status === 'SUCCESS') return { hash, result: r.returnValue ? scValToNative(r.returnValue) : null };
    if (r && r.status === 'FAILED') throw Object.assign(new Error('The Stellar network did not accept this transaction.'), { hash });
    await sleep(1000);
  }
  throw Object.assign(new Error('No answer from the Stellar network yet.'), { hash });
}
