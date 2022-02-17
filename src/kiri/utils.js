/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function () {

const { kiri, moto } = self;

function parseOpt(ov) {
    let opt = {}, kv, kva;
    // handle kiri legacy and proper url encoding better
    ov.replace(/&/g,',').split(',').forEach(function(el) {
        kv = decodeURIComponent(el).split(':');
        if (kv.length === 2) {
            kva = opt[kv[0]] = opt[kv[0]] || [];
            kva.push(decodeURIComponent(kv[1]));
        }
    });
    return opt;
}

function encodeOpt(opt) {
    let out = [];
    Object.keys(opt).forEach(key => {
        if (key === 'ver') return;
        let val = opt[key];
        out.push(encodeURIComponent(key) + ":" + encodeURIComponent(val));
    });
    return out.length ? '?' + out.join(',') : '';
}

function ajax(url, fn, rt, po, hd) {
    return new moto.Ajax(fn, rt).request(url, po, hd);
}

function o2js(o,def) {
    return o ? JSON.stringify(o) : def || null;
}

function js2o(s,def) {
    try {
        return s ? JSON.parse(s) : def || null;
    } catch (e) {
        console.log({malformed_json:s});
        return def || null;
    }
}

kiri.utils = {
    parseOpt,
    encodeOpt,
    ajax,
    o2js,
    js2o
};

})();
