// Smart accounts (26 Oct, nila-account): every account (member, leader, machine owner, LP) is a contract deployed by
// its union's account factory, at an address that follows from its signer key, so the app knows it offline:
// sha256 of the key is the salt, the factory the deployer (Soroban contract id from address). The key is the Privy
// Stellar wallet on a smartphone (Ed25519, 32 bytes), the device key on a keypad phone (P-256, 65 bytes).
import { Address, StrKey, authorizeEntry, hash, nativeToScVal, xdr } from '@stellar/stellar-sdk';

/** The account address of a signer key (raw bytes), in the union's factory. */
export function accountOfKey(cfg, keyBytes) {
  const factory = cfg?.contracts?.account_factory;
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

/** The account's signer as the factory takes it (`Signer::Ed25519` / `Signer::P256`). */
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
 *  while the union has no factory. */
export const memberOf = (cfg, g) => accountOf(cfg, g) || g;

/** A member's signed authorization entry rebuilt from a QR (legacy address credentials, nonce = expiry ledger): for
 *  her smart account with `Signature::Ed25519`, or, without a factory, for the key's own address. Base64 XDR. */
export function memberEntry(cfg, g, sig, exp, invocation) {
  const account = accountOf(cfg, g);
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
