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
