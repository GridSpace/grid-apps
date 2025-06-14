/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { PNG } from '../ext/pngjs.esm.js';

export const load = {
    PNG: {
        parse: function(data, opt = {}) {
            let img = new PNG();
            let progress = opt.progress || noop;
            let ondone = opt.done || noop;
            let onerror = opt.error || noop;
            let onmeta = opt.meta || noop;

            img.on('metadata', function(meta) {
                onmeta(meta);
            });

            img.on('parsed', function(data) {
                ondone(data);
            });

            img.on('error', function(err) {
                onerror(err);
            });

            img.parse(data);
        }
    }
};

function noop() {}
