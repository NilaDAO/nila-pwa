// A wallet request with no answer (16 Nov): Privy's signature request made while the app is still loading (a reload on
// a screen that signs at once, e.g. the border job) can get neither a signature nor an error, so its screen waited for
// ever ("…"). askAgain asks again after waitMs (the same hash gives the same signature); after `asks` asks, an error.

export const SIGN_WAIT_MS = 8_000;
export const SIGN_ASKS = 4;
export const NO_ANSWER = 'Your wallet did not answer. Check your internet and open the app again.';

const STALLED = Symbol('stalled');

/** ask() → a promise; its answer, else the same ask again after waitMs without one. Errors pass through at once. */
export async function askAgain(ask, { waitMs = SIGN_WAIT_MS, asks = SIGN_ASKS, label = 'wallet request' } = {}) {
  for (let n = 1; ; n += 1) {
    let t;
    const stalled = new Promise((resolve) => { t = setTimeout(() => resolve(STALLED), waitMs); });
    try {
      const out = await Promise.race([ask(), stalled]);
      if (out !== STALLED) return out;
    } finally {
      clearTimeout(t);
    }
    console.warn(`[privy] no answer to the ${label} after ${waitMs / 1000} s (ask ${n} of ${asks})`);
    if (n >= asks) throw new Error(NO_ANSWER);
  }
}
