const TerserPlugin = require('terser-webpack-plugin');
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './bin/webpack-three-bundle.js',
  output: {
    path: path.resolve('src/ext'),
    filename: 'three.js',
    library: 'ThreeBundle',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  resolve: {
    extensions: ['.mjs', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  optimization: {
    minimize: false,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          format: {
            comments: false,
          },
        },
      }),
    ],
  },
  performance: {
    hints: false,
    maxAssetSize: 2 * 1024 * 1024,
    maxEntrypointSize: 2 * 1024 * 1024,
  },
};
