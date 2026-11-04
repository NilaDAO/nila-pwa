// Smart accounts (26 Oct, nila-account): every account (member, leader, machine owner, LP) is a contract deployed by
// the account deployer, at an address that follows from its signer key, so the app knows it offline: sha256 of the
// key is the salt, the deployer the deploying address (Soroban contract id from address). The key is the Privy
// Stellar wallet on a smartphone (Ed25519, 32 bytes), the device key on a keypad phone (P-256, 65 bytes).
// Member-owned accounts (3 Nov): one deployer for all unions (`account_deployer` in the node config; the per-union
// factory is gone), so the address no longer depends on the union. The account names its union itself afterwards
// (`set_union`, signed by the account); recovery and leader sessions use that union's settings (roles).
import { Address, StrKey, authorizeEntry, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk';

/** The account deployer's contract id (one for all unions), or undefined on a node without smart accounts. */
export const deployerOf = (cfg) => cfg?.contracts?.account_deployer;

/** The account address of a signer key (raw bytes), deployed by the account deployer. */
export function accountOfKey(cfg, keyBytes) {
  const factory = deployerOf(cfg);
  if (!factory) return undefined;
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({
    networkId: hash(Buffer.from(cfg.passphrase)),
    contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({
      address: new Address(factory).toScAddress(), salt: hash(Buffer.from(keyBytes)) })),
  }));
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

/** The account of a Privy Stellar wallet (G…). */
export const accountOf = (cfg, g) => accountOfKey(cfg, StrKey.decodeEd25519PublicKey(g));

/** The account's signer as the deployer takes it (`Signer::Ed25519` / `Signer::P256`). */
export const signerVal = (keyBytes) => xdr.ScVal.scvVec([
  xdr.ScVal.scvSymbol(keyBytes.length === 32 ? 'Ed25519' : 'P256'), nativeToScVal(Buffer.from(keyBytes), { type: 'bytes' })]);

/** A signature as the account checks it (`Signature::Ed25519` / `::P256`, 64 bytes; or `::Leader(address)`). */
export const signatureVal = (kind, value) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind),
  kind === 'Leader' ? new Address(value).toScVal() : nativeToScVal(Buffer.from(value), { type: 'bytes' })]);

/** Signs every entry of `account` (a smart account) with its signer: `sign(payload)` → 64 bytes, of `kind` 'Ed25519'
 *  (Privy) or 'P256' (device key); valid until ledger `validUntil`. The SDK builds the payload for each credential
 *  type (the address-bound one of CAP-71 too). Returns the entries, those of other addresses unchanged. */
export async function signAccountEntries(cfg, entries, account, sign, kind, validUntil) {
  return Promise.all(entries.map((e) => authorizeEntry(e, async (_preimage, payload) => ({
    signatureScVal: signatureVal(kind, await sign(payload)), address: account,
  }), validUntil, cfg.passphrase, account).catch((err) => {
    if (/no credential node|source.?account/i.test(err.message)) return e;
    throw err;
  })));
}

/** The account a signed QR's key (32-byte Ed25519, as G…) stands for: its smart account, or the key's own address
 *  while the node has no account deployer. */
export const memberOf = (cfg, g) => accountOf(cfg, g) || g;

/** A member's signed authorization entry rebuilt from a QR (legacy address credentials, nonce = expiry ledger): for
 *  her smart account with `Signature::Ed25519`, or, without a deployer, for the key's own address. Base64 XDR.
 *  `account` (4 Nov, NILA:N): the account the QR names (after a recovery it does not follow from the key); null = the
 *  key's own address. */
export function memberEntry(cfg, g, sig, exp, invocation, account = accountOf(cfg, g)) {
  const signature = account ? signatureVal('Ed25519', sig)
    : xdr.ScVal.scvVec([nativeToScVal({ public_key: StrKey.decodeEd25519PublicKey(g), signature: Buffer.from(sig) },
      { type: { public_key: ['symbol', null], signature: ['symbol', null] } })]);
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: new Address(account || g).toScAddress(), nonce: xdr.Int64.fromString(String(exp)),
      signatureExpirationLedger: exp, signature,
    })),
    rootInvocation: invocation,
  }).toXDR('base64');
}

/** The member's own signed authorization of `account.set_union(union)` (member-owned accounts, 3 Nov), rebuilt from
 *  its parts: a keypad phone signs it with its device key and sends { nonce, exp, sig } (hex) through the node, and the
 *  leader's app submits it after creating the account. Base64 XDR. */
export function unionEntry(account, union, { nonce, exp, sig }, kind = 'P256') {
  const hex = (h) => Buffer.from(String(h).replace(/^0x/, ''), 'hex');
  const n = hex(nonce);
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address: new Address(account).toScAddress(), nonce: xdr.Int64.fromString(BigInt.asIntN(64, BigInt(`0x${n.toString('hex') || '0'}`)).toString()),
      signatureExpirationLedger: Number(exp), signature: signatureVal(kind, hex(sig)),
    })),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
        contractAddress: new Address(account).toScAddress(), functionName: 'set_union', args: [new Address(union).toScVal()] })),
      subInvocations: [],
    }),
  }).toXDR('base64');
}
