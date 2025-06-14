const path = require('path');

module.exports = {
    mode: 'production',
    entry: path.resolve(__dirname, './webpack-three-bundle.js'),
    output: {
        path: path.resolve(__dirname, '../ext'),
        filename: 'three.js',
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
        minimize: false
    },
    performance: {
        hints: false,
        maxAssetSize: 2 * 1024 * 1024,
        maxEntrypointSize: 2 * 1024 * 1024,
    },
}; 