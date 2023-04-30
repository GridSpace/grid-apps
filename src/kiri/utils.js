/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("kiri.utils", [], (root, exports) => {

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
    return moto.ajax.new(fn, rt).request(url, po, hd);
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

function ls2o(key,def) {
    // defer ref b/c it may run in a worker
    return js2o(root.data.local.getItem(key),def);
}

// split 24 bit color into [ r, g, b ]
function rgb(c) {
    return [ (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff ];
}

// return 24 bit color from [ r, g, b ] array
function a2c(a) {
    return (a[0] << 16) | (a[1] << 8) | a[0];
}

// average two color arrays with weighting @ return 24 bit color
function avgc(c1, c2, w = 3) {
    let r1 = rgb(c1);
    let r2 = rgb(c2);
    let d = (w + 2);
    return ((r1[0] * w + r2[0]) / d) << 16
        | ((r1[1] * w + r2[1]) / d) << 8
        | ((r1[2] * w + r2[2]) / d);
}

function areEqual(o1, o2) {
    if (o1 == o2) return true;
    if (Array.isArray(o1) && Array.isArray(o2)) {
        if (o1.length === o2.length) {
            for (let i=0; i<o1.length; i++) {
                if (o1[i] !== o2[i]) {
                    return false;
                }
            }
            return true;
        }
    } else if (typeof(o1) === 'object' && typeof(o2) === 'object') {
        let keys = Object.keys(Object.assign({}, o1, o2));
        for (let key of keys) {
            if (o1[key] !== o2[key]) {
                return false;
            }
        }
        return true;
    }
    return false;
}

function trackFn(fn, name) {
    return function() {
        console.log(name, ...arguments);
        fn(...arguments);
    }
}

exports({
    trackFn,
    areEqual,
    parseOpt,
    encodeOpt,
    ajax,
    o2js,
    js2o,
    ls2o,
    avgc,
    rgb,
    a2c
});

});
