/** A waiting move of a member's account (review 5 Nov, nila-soroban `cfdc357`): once her account names a union, a
 *  change of union or code waits the union's recovery wait, and a recovery started meanwhile cancels it. After the
 *  wait anyone may apply it with `finish_move` (no signature: it applies only what she already signed). The app does
 *  that silently: her own start when her plain account holds XLM, or the leader's app when it handles her help QR. */

/** `account.pending_move()` as read (scValToNative): { to: ['Union', addr] | ['Code', bytes], at } or null. */
export function parseMove(m) {
  if (!m || !Array.isArray(m.to)) return null;
  const [kind, target] = m.to;
  return { kind: String(kind), target, at: Number(m.at) };
}

/** Due once the chain's time has reached `at` (the phone's clock, unix seconds; a call too early is refused anyway). */
export const isDue = (m, nowSec = Math.floor(Date.now() / 1000)) => !!m && nowSec >= m.at;

/** A move to this union already waits: the app does not ask again. */
export const waitsFor = (m, union) => !!m && m.kind === 'Union' && m.target === union;
