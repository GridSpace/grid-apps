const path = require('path');
const webpack = require('webpack');

module.exports = {
    mode: 'production',
    entry: path.resolve(__dirname, './webpack-quickjs-bundle.js'),
    output: {
        path: path.resolve(__dirname, '../src/ext'),
        filename: 'quickjs.js',
        library: {
            type: 'module'
        },
        module: true
    },
    experiments: {
        outputModule: true
    },
    resolve: {
        extensions: ['.mjs', '.js'],
        fallback: {
            'path': false,
            'fs': false,
            'crypto': false
        }
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.QTS_DEBUG': JSON.stringify(false),
            'process.env.NODE_ENV': JSON.stringify('production')
        })
    ],
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
        minimize: false
    },
    performance: {
        hints: false,
        maxAssetSize: 2 * 1024 * 1024,
        maxEntrypointSize: 2 * 1024 * 1024,
    },
};
