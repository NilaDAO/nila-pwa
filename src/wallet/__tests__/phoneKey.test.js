// Plan 053: the phone key's low-s signatures and the signed node call headers. (The kind-4 help QR needs
// @stellar/stellar-sdk, which this jest setup does not load.)
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { lowS, signBytes, signPayload } from '../phoneKey';

const N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const big = (u8) => BigInt(`0x${Buffer.from(u8).toString('hex')}`);
const account = 'CDUMMYACCOUNT';

beforeAll(() => {
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
});

async function key() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  return { pair, pub: new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey)) };
}

test('lowS keeps a low s and flips a high one', () => {
  const sig = new Uint8Array(64); sig[0] = 1;
  sig.set(Buffer.from((N - BigInt(1)).toString(16), 'hex'), 32);   // s = n - 1 > n/2
  const out = lowS(sig);
  expect(big(out.subarray(32))).toBe(BigInt(1));
  expect(out.subarray(0, 32)).toEqual(sig.subarray(0, 32));
  const low = new Uint8Array(64); low[63] = 5;
  expect(lowS(low)).toBe(low);
});

test('signPayload gives a low-s signature that verifies', async () => {
  const k = await key();
  const payload = webcrypto.getRandomValues(new Uint8Array(32));
  for (let i = 0; i < 8; i++) {
    const sig = await signPayload(k.pair, payload);
    expect(big(sig.subarray(32)) <= N / BigInt(2)).toBe(true);
    expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.pair.publicKey, sig, payload)).toBe(true);
  }
});

test('a phone-key node call: her account and the raw r|s over the message, base64', async () => {
  const k = await key();
  const seen = [];
  global.fetch = jest.fn(async (url, init) => { seen.push(init); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({}) }; });
  const { signedCall } = require('../../plan/api');   // after TextEncoder is set (beforeAll)
  await signedCall({ kind: 'P256', stellarAddress: account, signMessage: (b) => signBytes(k.pair, b) })('GET', '/stellar/titles');
  const h = seen[0].headers;
  expect(h['X-Nila-Account']).toBe(account);
  const sig = Buffer.from(h['X-Nila-Sig'], 'base64');
  expect(sig).toHaveLength(64);
  const empty = Buffer.from(await webcrypto.subtle.digest('SHA-256', new Uint8Array(0))).toString('hex');
  const msg = `nila-plan\nGET /stellar/titles\n${h['X-Nila-Ts']}\n${empty}`;
  expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.pair.publicKey, sig, new TextEncoder().encode(msg))).toBe(true);
});
