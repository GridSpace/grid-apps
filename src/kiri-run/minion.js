/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import "../ext/clip2.js";
import "../ext/earcut.js";
import '../add/array.js';
import '../add/class.js';
import '../add/three.js';

import { base } from '../geo/base.js';
import { newPoint } from '../geo/point.js';
import { polygons as POLY } from '../geo/polygons.js';
import { sliceZ } from '../geo/slicer.js';
import { codec } from '../kiri/codec.js';
import { broker } from '../moto/broker.js';
import { doTopShells } from '../kiri-mode/fdm/post.js';
import { wasm_ctrl } from '../geo/wasm.js';
import { Slicer } from "../kiri-mode/cam/slicer.js";
// import { cam_slice } from "../kiri-mode/cam/slice.js";

const clib = self.ClipperLib;
const ctyp = clib.ClipType;
const ptyp = clib.PolyType;
const cfil = clib.PolyFillType;

let cache = self.cache = {};
let name = "unknown";

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

self.onmessage = function(msg) {
    console.log("worker sent message:", {msg,funcs});
    let data = msg.data;
    let cmd = data.cmd;
    (funcs[cmd] || funcs.bad)(data, data.seq, cmd);
};

function reply(msg, direct) {
    self.postMessage(msg, direct);
}

function log() {
    console.log(`[${name}]`, ...arguments);
}

const funcs = self.minion = {
    label(data, seq) {
        name = data.name;
    },

    config: data => {
        if (data.base) {
            Object.assign(base.config, data.base);
        } else {
            log({invalid: data});
        }
    },

    union: (data, seq) => {
        if (!(data.polys && data.polys.length)) {
            reply({ seq, union: codec.encode([]) });
            return;
        }
        let state = { zeros: [] };
        let polys = codec.decode(data.polys);
        let union = POLY.union(polys, data.minarea || 0, true);
        reply({ seq, union: codec.encode(union) }, state.zeros);
    },

    topShells: (data, seq) => {
        let top = codec.decode(data.top, {full: true});
        let {z, count, offset1, offsetN, fillOffset, opt} = data;
        doTopShells(z, top, count, offset1, offsetN, fillOffset, opt);
        let state = { zeros: [] };
        reply({ seq, top: codec.encode(top, {full: true}) }, state.zeros);
    },

    fill: (data, seq) => {
        let polys = codec.decode(data.polys);
        let { angle, spacing, minLen, maxLen } = data;
        let fill = POLY.fillArea(polys, angle, spacing, [], minLen, maxLen);
        let arr = new Float32Array(fill.length * 4);
        for (let i=0, p=0; p<fill.length; ) {
            let pt = fill[p++];
            arr[i++] = pt.x;
            arr[i++] = pt.y;
            arr[i++] = pt.z;
            arr[i++] = pt.index;
        }
        reply({ seq, fill: arr }, [ arr.buffer ]);
    },

    clip: (data, seq) => {
        const clip = new clib.Clipper();
        const ctre = new clib.PolyTree();
        const clips = [];
        const M = base.config.clipper;

        let lines = data.lines.map(array => {
            return codec.decodePointArray2D(array, data.z, (X, Y) => { return {X: X*M, Y: Y*M} })
        });
        let polys = data.polys.map(array => {
            return codec.decodePointArray2D(array, data.z, (X, Y) => { return {X: X*M, Y: Y*M} })
        });

        clip.AddPaths(lines, ptyp.ptSubject, false);
        clip.AddPaths(polys, ptyp.ptClip, true);

        const state = { zeros: [] };
        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            for (let node of ctre.m_AllPolys) {
                clips.push(codec.encode(POLY.fromClipperNode(node, data.z), state.zeros));
            }
        }

        reply({ seq, clips }, state.zeros);
    },

    sliceZ: (data, seq) => {
        console.log('minion.sliceZ', { data, seq });
        let { z, points, options } = data;
        let i = 0, p = 0, realp = new Array(points.length / 3);
        while (i < points.length) {
            realp[p++] = newPoint(points[i++], points[i++], points[i++]).round(3);
        }
        let state = { zero: [] };
        let output = [];
        sliceZ(z, realp, {
            ...options,
            each(out) { output.push(out) }
        }).then(() => {
            for (let rec of output) {
                // lines do not pass codec properly (for now)
                delete rec.lines;
            }
            reply({ seq, output: codec.encode(output) }, state.zeros);
        });
    },

    putCache: msg => {
        const { key, data } = msg;
        // log({ minion_putCache: key, data });
        if (data) {
            cache[key] = data;
        } else {
            delete cache[key];
        }
    },

    clearCache: msg => {
        for (let key in cache) {
            delete cache[key];
        }
    },

    wasm: data => {
        if (data.enable) {
            wasm_ctrl.enable();
        } else {
            wasm_ctrl.disable();
        }
    },

    bad: (data, seq, cmd) => {
        reply({ seq, error: `invalid command (${cmd})` });
    },

    

    cam_slice_init: () => {
        cache.slicer = new Slicer();
    },

    cam_slice_cleanup: () => {
        delete cache.slicer;
    },

    cam_slice: (data, seq) => {
        const { bucket, opt } = data;
        // log({ slice: bucket, opt });
        cache.slicer.sliceBucket(bucket, opt, slice => {
            // console.log({ slice });
        }).then(data => {
            data.forEach(rec => {
                rec.polys = encode(rec.polys);
                if (rec.lines) {
                    const points = rec.lines.map(l => [l.p1, l.p2]).flat();
                    rec.lines = encodePointArray(points);
                }
            });
            reply({ seq, slices: data });
        });
    },
};

broker.publish("minion.started", { funcs, cache, reply, log });
