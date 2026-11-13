// The demo stack's login stand-in (nila-integrations scripts/demo-stack.sh: Cognito calls to <origin>/__demo/cognito,
// no SMS, the dummy code 000000). On only when all three hold, so a real build can never use it even if the flag
// slipped in: REACT_APP_COGNITO_DEMO=1, the local fork chain (REACT_APP_CHAIN_ID=31337) and a localhost page.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// The static demo build (src/demo/shim.js, REACT_APP_DEMO_STATIC=1) answers these calls in the browser, on any host.
export const DEMO_STATIC = process.env.REACT_APP_DEMO_STATIC === '1';

// The flag first, on a build-time literal (config-overrides.js): a real build folds this to false and drops every
// DEMO_COGNITO branch, so no demo code ships to pwa.nila.land (the release lane's check fails the build otherwise).
// The literal itself first (13 Nov), not FLAG: a real build folds `'' === '1'` here and drops the guard and its text.
export const DEMO_COGNITO = process.env.REACT_APP_COGNITO_DEMO === '1' && (() => {
  if (DEMO_STATIC) return true;
  const ok = process.env.REACT_APP_CHAIN_ID === '31337'
    && typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname);
  if (!ok) console.error('[demo] REACT_APP_COGNITO_DEMO is set outside the local demo (chain 31337 on localhost): ignored, real Cognito is used');
  return ok;
})();
