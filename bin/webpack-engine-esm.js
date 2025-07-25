import path  from "path"
import webpack from 'webpack';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
    mode: 'production',
    entry: path.resolve(__dirname, '../src/kiri/run/engine.js'),
    output: {
        path: path.resolve(__dirname, '../out'),
        filename: 'engine.js',
        library: {
            type: 'module'
        },
        module: true
    },
    target: 'web',
    experiments: {
        outputModule: true
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.versions.node': false,
      }),
    ],
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
    node: {
      global: true,
      __filename: false,
      __dirname: false,
    },
}; 