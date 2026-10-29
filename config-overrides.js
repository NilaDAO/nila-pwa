const { InjectManifest } = require('workbox-webpack-plugin');
const webpack = require('webpack');

const fg = require('fast-glob');

module.exports = (config, env) => {
  const wb =
    config.plugins.find(p => p.constructor?.name === 'InjectManifest') ||
    (env === 'production' &&
      config.plugins.push(new InjectManifest({ swSrc: './public/nila-sw.js', swDest: 'nila-sw.js' })) &&
      config.plugins[config.plugins.length - 1]);

  // grab every image but **not** index.html
  const images = fg
    .sync('public/images/**/*.{webp,png,jpg,jpeg,svg,gif}')
    .map(f => ({ url: f.replace(/^public/, ''), revision: null }));

  Object.assign(wb, {
    swSrc: './public/nila-sw.js',
    swDest: 'nila-sw.js',
    compileSrc: true,
    additionalManifestEntries: images,   // <- ONLY images
  });

  // keep the qrcode ignore
  config.ignoreWarnings = [
    { module: /html5-qrcode/, message: /source map/ },
  ];

  // inject REACT_APP_VERSION and FORCE_LOGOUT into both SW and app
  config.plugins.push(
    new webpack.DefinePlugin({
      'process.env.REACT_APP_VERSION': JSON.stringify(process.env.REACT_APP_VERSION),
      'process.env.REACT_APP_FORCE_LOGOUT': JSON.stringify(process.env.REACT_APP_FORCE_LOGOUT),
      // a literal, so webpack drops the Privy imports when it is empty (wallet/WalletRoot.jsx)
      'process.env.REACT_APP_PRIVY_APP_ID': JSON.stringify(process.env.REACT_APP_PRIVY_APP_ID || ''),
      // demo builds only (src/demo): literals, so a real build carries none of the shim
      'process.env.REACT_APP_DEMO_RECORD': JSON.stringify(process.env.REACT_APP_DEMO_RECORD || ''),
      'process.env.REACT_APP_DEMO_STATIC': JSON.stringify(process.env.REACT_APP_DEMO_STATIC || ''),
    })
  );

  // Privy (wallet/PrivyRoot.jsx): its optional add-ons are not installed and not used —
  // resolve them to empty modules. stellar-sdk needs Buffer in the browser.
  config.resolve.alias = {
    ...config.resolve.alias,
    '@stripe/stripe-js': false,
    '@abstract-foundation/agw-client': false,
    '@farcaster/mini-app-solana': false,
    '@solana-program/memo': false,
    permissionless: false,
  };
  config.resolve.fallback = { ...config.resolve.fallback, buffer: require.resolve('buffer/') };
  config.plugins.push(new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }));

  return config;
};
