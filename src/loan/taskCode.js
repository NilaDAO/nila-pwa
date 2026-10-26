// The crop share request (A1, 26 Oct): the leader starts it on L11 and shows a request QR; a member in self mode scans
// it on their Ready crop share, sees the amounts and draws from their own phone (their account signs). In assist and
// keypad mode there is no request: the member shows a help QR and the leader acts in a session (stellar/session.js).
//   NILA:R:<base32: 'D' | the member's account 32 | expiry ledger 4 | token 32 | cash 8 | hours 4>
import { StrKey } from '@stellar/stellar-sdk';
import { server, sv } from '../stellar/soroban';
import { fromB32, toB32 } from './deskCode';

export const TASK_TERM = 120;   // ledgers (~5 s each): about 10 minutes
const LEN = 1 + 32 + 4 + 32 + 8 + 4;

/** The draw: { contract, fn, args }. */
export function callOf(cfg, r) {
  return { contract: 'fund_core', fn: 'draw_loan',
    args: [sv.address(cfg.union), sv.address(r.member), sv.bytes32(r.token), sv.i128(r.cash), sv.u32(r.hours)] };
}

/** The leader's app: the request QR for `r` = { member (account), token, cash, hours }. */
export async function makeTask(cfg, r) {
  const exp = (await server(cfg).getLatestLedger()).sequence + TASK_TERM;
  const b = new Uint8Array(LEN); const d = new DataView(b.buffer);
  b[0] = 'D'.charCodeAt(0);
  b.set(StrKey.decodeContract(r.member), 1);
  d.setUint32(33, exp);
  b.set(Uint8Array.from(r.token.match(/../g).map((x) => parseInt(x, 16))), 37);
  d.setBigUint64(69, BigInt(r.cash)); d.setUint32(77, Number(r.hours));
  return { ...r, task: 'D', exp, qr: `NILA:R:${toB32(b)}`, until: Math.floor(Date.now() / 1000) + TASK_TERM * 5 };
}

export const isTask = (text) => (text || '').trim().toUpperCase().startsWith('NILA:R:');

/** The member's phone: the request in a scanned QR, or a plain reason. */
export function readTask(text) {
  let b;
  try { b = fromB32((text || '').trim().toUpperCase().slice(7)); } catch { b = null; }
  if (!isTask(text) || !b || b.length !== LEN || b[0] !== 'D'.charCodeAt(0)) throw new Error('This is not a Nila request.');
  const d = new DataView(b.buffer);
  return { task: 'D', member: StrKey.encodeContract(Buffer.from(b.slice(1, 33))), exp: d.getUint32(33),
    token: [...b.slice(37, 69)].map((x) => x.toString(16).padStart(2, '0')).join(''),
    cash: String(d.getBigUint64(69)), hours: d.getUint32(77) };
}
