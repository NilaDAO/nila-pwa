// Static demo only (src/demo/shim.js), installed before anything else runs. The flag is a build-time literal
// (config-overrides.js), so in a real build this file is empty and the shim is not bundled. Recording the local demo
// stack's calls is done outside the app (nila-integrations scripts/demo/serve.mjs).
if (process.env.REACT_APP_DEMO_STATIC === '1') require('./shim');
