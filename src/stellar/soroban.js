// Soroban calls from the app (P5; design useSorobanTx). Her own transaction (she is the source), simulated
// and assembled here against the public RPC from /stellar/config, signed with her Privy Stellar wallet
// (a 32-byte hash), then fee-bumped by the node (POST /stellar/feebump; she holds no XLM) and followed on
// the RPC until it lands. Reads are simulations with no signature.
import { Account, Address, Asset, BASE_FEE, Contract, Operation, TransactionBuilder, authorizeEntry, authorizeInvocation, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

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
  bool: (b) => nativeToScVal(!!b, { type: 'bool' }),
  string: (t) => nativeToScVal(String(t), { type: 'string' }),
};

/** A uint256 token id (decimal string) as 32 bytes, big-endian, hex. */
export const tokenHex = (decimal) => BigInt(decimal).toString(16).padStart(64, '0');

const server = (cfg) => new rpc.Server(cfg.rpc_url, { allowHttp: cfg.rpc_url?.startsWith('http://') });

/** A read: simulate `fn` on `contract` (any funded account as source; the sponsor is). */
export async function readContract(cfg, contractName, fn, args = []) {
  const s = server(cfg);
  const id = contractId(cfg, contractName);
  if (!id) throw new Error(`no ${contractName} contract in the node config`);
  // A simulation checks no sequence number, so the source account is not loaded first (one RPC call per read, 22 Oct).
  const tx = new TransactionBuilder(new Account(cfg.sponsor, '0'), { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(new Contract(id).call(fn, ...args)).setTimeout(60).build();
  const sim = await s.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

// stellar-sdk 17 exposes XDR members as properties, older builds as methods.
const at = (o, k) => (typeof o[k] === 'function' ? o[k]() : o[k]);

/** Many crop shares at once (22 Oct): fund_core keeps each as persistent DataKey::FoodToken(union, token_id), so one
 *  getLedgerEntries call reads up to 200 of them instead of a simulation each. Returns { [hex]: FoodToken | null }. */
export async function readFoodTokens(cfg, union, hexes) {
  const id = contractId(cfg, 'fund_core');
  if (!id) throw new Error('no fund_core contract in the node config');
  const contract = new Address(id).toScAddress();
  const uniq = [...new Set(hexes.map((h) => h.replace(/^0x/, '').toLowerCase().padStart(64, '0')))];
  const keyOf = (hex) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract, durability: at(xdr.ContractDataDurability, 'persistent'),
    key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('FoodToken'), sv.address(union), sv.bytes32(hex)]),
  }));
  const out = Object.fromEntries(uniq.map((h) => [h, null]));
  const s = server(cfg);
  for (let i = 0; i < uniq.length; i += 200) {
    const part = uniq.slice(i, i + 200);
    const keys = part.map(keyOf);
    const r = await s.getLedgerEntries(...keys);
    for (const e of r.entries || []) {
      const want = e.key.toXDR('base64');
      const i2 = keys.findIndex((k) => k.toXDR('base64') === want);
      if (i2 >= 0) out[part[i2]] = scValToNative(at(at(e.val, 'contractData'), 'val'));
    }
  }
  return out;
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

function checkPrepared(raw, tx, source, given = []) {
  const ops = tx.operations;
  const bad = () => { throw new Error('The network returned a different transaction. Nothing was signed.'); };
  if (tx.source !== source || ops.length !== 1 || ops[0].type !== 'invokeHostFunction' || (ops[0].source && ops[0].source !== source)) bad();
  if (ops[0].func.toXDR('base64') !== raw.operations[0].func.toXDR('base64')) bad();
  // Another address's entry only when it is exactly one she was given (a leader's signed entry, 22 Oct).
  const ok = new Set(given.map((e) => e.toXDR('base64')));
  if ((ops[0].auth || []).some((a) => credType(a) !== 'sorobanCredentialsSourceAccount' && !ok.has(a.toXDR('base64')))) bad();
}

/** A sent transaction's status on the RPC: SUCCESS | FAILED | NOT_FOUND (null when the RPC fails). */
export async function txStatus(cfg, hash) {
  const r = await server(cfg).getTransaction(hash).catch(() => null);
  return r?.status ?? null;
}

/** Her call: build → simulate → sign (her Privy wallet) → node fee-bump → wait. Returns { hash, result }. */
/** A Nila contract by name, or 'usdc': the USDC Stellar asset contract (a leader's USDC send, 22 Oct). */
export function contractId(cfg, name) {
  if (name === 'usdc') {
    const [code, issuer] = (cfg.usdc_asset || ':').split(':');
    return code && issuer ? new Asset(code, issuer).contractId(cfg.passphrase) : undefined;
  }
  return cfg.contracts[name];
}

export async function invokeContract({ cfg, source, signHash, contractName, fn, args, auth, onSent }) {
  const s = server(cfg);
  const id = contractId(cfg, contractName);
  if (!id) throw new Error(`no ${contractName} contract in the node config`);
  const acct = await s.getAccount(source);
  // `auth`: entries already signed by another address (base64 XDR; the leader's at the desk, 22 Oct; hers from her QR,
  // 23 Oct). Her own part is the source-account entries a first simulation records for the call; the second
  // (prepare) then checks them all with the given ones.
  const given = (auth || []).map((a) => xdr.SorobanAuthorizationEntry.fromXDR(a, 'base64'));
  // A copy each time: building advances the account's sequence.
  const build = (op) => new TransactionBuilder(new Account(acct.accountId(), acct.sequenceNumber()), { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(op).setTimeout(300).build();
  let op = new Contract(id).call(fn, ...args);
  if (given.length) {
    const sim = await s.simulateTransaction(build(op));
    if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
    const own = (sim.result?.auth || []).filter((a) => credType(a) === 'sorobanCredentialsSourceAccount');
    op = Operation.invokeContractFunction({ contract: id, function: fn, args, auth: [...own, ...given] });
  }
  const raw = build(op);
  const tx = await s.prepareTransaction(raw);           // simulate + footprint + resource fee + auth
  checkPrepared(raw, tx, source, given);
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

/** The leader's side of a call another account submits (22 Oct, the desk: claim_junior_cash): the call is simulated
 *  with `source` (the member) as the transaction's account, and the entry for `signer` (the leader) is signed with
 *  her Privy wallet, valid for `ledgers` ledgers (~5 s each). Returns the signed entry as base64 XDR. */
export async function signAuthFor({ cfg, source, signer, signHash, contractName, fn, args, ledgers = 720 }) {
  const s = server(cfg);
  const id = contractId(cfg, contractName);
  if (!id) throw new Error(`no ${contractName} contract in the node config`);
  const acct = await s.getAccount(source);
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(new Contract(id).call(fn, ...args)).setTimeout(60).build();
  const sim = await s.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  const until = (await s.getLatestLedger()).sequence + ledgers;
  const sign = async (_preimage, payload) => Uint8Array.from(await signHash(payload));
  // The entry with a credential node for her address (the sdk checks it: forAddress); a source-account entry is the
  // member's own.
  let signed;
  for (const e of sim.result?.auth || []) {
    if (credType(e) === 'sorobanCredentialsSourceAccount') continue;
    try { signed = await authorizeEntry(e, sign, until, cfg.passphrase, signer); break; } catch (err) {
      if (!/no credential node/.test(err.message)) throw err;
    }
  }
  if (!signed) throw new Error('This call needs no signature from you.');
  return signed.toXDR('base64');
}

/** Her signed authorization of (contract, fn, args) for a call another account submits later (23 Oct, the voucher:
 *  machinery.claim checks her auth of (union, token, max hours) only): no simulation, a random nonce (one use) and
 *  an expiry `ledgers` ahead (~5 s each). Returns { entry (base64 XDR), until (unix seconds, about) }. */
export async function signInvocation({ cfg, signer, signHash, contractName, fn, args, ledgers }) {
  const id = contractId(cfg, contractName);
  if (!id) throw new Error(`no ${contractName} contract in the node config`);
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
      contractAddress: new Address(id).toScAddress(), functionName: fn, args })),
    subInvocations: [],
  });
  const latest = (await server(cfg).getLatestLedger()).sequence;
  const entry = await authorizeInvocation({ signer: async (_preimage, payload) => Uint8Array.from(await signHash(payload)),
    validUntilLedgerSeq: latest + ledgers, invocation, networkPassphrase: cfg.passphrase, publicKey: signer, authV2: false });
  return { entry: entry.toXDR('base64'), until: Math.floor(Date.now() / 1000) + ledgers * 5 };
}

/** A signed authorization entry (base64 XDR) read back: its signer, contract name, function, ScVal and native args. */
export function readAuthEntry(cfg, b64) {
  const get = (o, k) => (typeof o?.[k] === 'function' ? o[k]() : o?.[k]);
  const e = xdr.SorobanAuthorizationEntry.fromXDR(b64, 'base64');
  const cred = get(e, 'credentials');
  // Address credentials as recorded by a simulation (V2 on Protocol 27) or made by authorizeInvocation (V1).
  const addr = get(cred, 'address') || get(cred, 'addressV2') || get(get(cred, 'addressWithDelegates'), 'addressCredentials');
  const c = get(get(get(e, 'rootInvocation'), 'function'), 'contractFn');
  if (!addr || !c) throw new Error('This code cannot be read.');
  const contract = Address.fromScAddress(get(c, 'contractAddress')).toString();
  const name = Object.keys(cfg.contracts).find((k) => cfg.contracts[k] === contract);
  const args = get(c, 'args') || [];
  return { signer: Address.fromScAddress(get(addr, 'address')).toString(), contractName: name, fn: String(get(c, 'functionName')),
    args, native: args.map((a) => scValToNative(a)) };
}
