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
    })
  );

  return config;
};
