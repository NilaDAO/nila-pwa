// Demo only (src/demo/shim.js): the record / static shim, installed before anything else runs. Both flags are build-time
// literals (config-overrides.js), so in a real build this file is empty and the shim is not bundled.
if (process.env.REACT_APP_DEMO_RECORD === '1' || process.env.REACT_APP_DEMO_STATIC === '1') require('./shim');
