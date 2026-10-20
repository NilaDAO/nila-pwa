// The demo stack's login stand-in (nila-integrations scripts/demo-stack.sh: Cognito calls to <origin>/__demo/cognito,
// no SMS, the dummy code 000000). On only when all three hold, so a real build can never use it even if the flag
// slipped in: REACT_APP_COGNITO_DEMO=1, the local fork chain (REACT_APP_CHAIN_ID=31337) and a localhost page.
const FLAG = process.env.REACT_APP_COGNITO_DEMO === '1';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export const DEMO_COGNITO = (() => {
  if (!FLAG) return false;
  const ok = process.env.REACT_APP_CHAIN_ID === '31337'
    && typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname);
  if (!ok) console.error('[demo] REACT_APP_COGNITO_DEMO is set outside the local demo (chain 31337 on localhost): ignored, real Cognito is used');
  return ok;
})();
