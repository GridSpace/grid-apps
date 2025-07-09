/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import "../ext/clip2.js";
import "../ext/earcut.js";
import '../add/array.js';
import '../add/class.js';
import '../add/three.js';

import { base } from '../geo/base.js';
import { codec, encode } from '../kiri/codec.js';
import { doTopShells } from '../kiri-mode/fdm/post.js';
import { newPoint } from '../geo/point.js';
import { polygons as POLY } from '../geo/polygons.js';
import { sliceZ } from '../geo/slicer.js';
import { Slicer as cam_slicer } from '../kiri-mode/cam/slicer.js';
import { Slicer as topo_slicer } from '../kiri-mode/cam/slicer2.js';
import { Probe, Trace, raster_slice } from '../kiri-mode/cam/topo3.js';
import { wasm_ctrl } from '../geo/wasm.js';

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
    let { data } = msg;
    let { cmd } = data;
    debug('MINION.onmessage', { cmd, data });
    try {
        (funcs[cmd] || funcs.invalid)(data, data.seq, cmd);
    } catch (error) {
        log('MINION.dispatch.error', error);
    }
};

function reply(msg, direct) {
    self.postMessage(msg, direct);
}

function log() {
    console.log(`[${name}]`, ...arguments);
}

function debug() {
    // console.log(`[${name}]`, ...arguments);
}

const funcs = self.minion = {
    invalid(data, seq, cmd) {
        console.error({ invalid_minion_command: cmd, data });
        reply({ seq, error: `invalid command (${cmd})` });
    },

    label(data, seq) {
        name = data.name;
        self.kiri_minion = { name, cache, log };
    },

    config(data) {
        if (data.base) {
            Object.assign(base.config, data.base);
        } else {
            log({invalid: data});
        }
    },

    union(data, seq) {
        if (!(data.polys && data.polys.length)) {
            reply({ seq, union: codec.encode([]) });
            return;
        }
        let state = { zeros: [] };
        let polys = codec.decode(data.polys);
        let union = POLY.union(polys, data.minarea || 0, true);
        reply({ seq, union: codec.encode(union) }, state.zeros);
    },

    topShells(data, seq) {
        let top = codec.decode(data.top, {full: true});
        let {z, count, offset1, offsetN, fillOffset, opt} = data;
        doTopShells(z, top, count, offset1, offsetN, fillOffset, opt);
        let state = { zeros: [] };
        reply({ seq, top: codec.encode(top, {full: true}) }, state.zeros);
    },

    fill(data, seq) {
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

    clip(data, seq) {
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

    sliceZ(data, seq) {
        debug('minion.sliceZ', { data, seq });
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

    putCache(msg) {
        const { key, data } = msg;
        // log({ minion_putCache: key, data });
        if (data) {
            cache[key] = data;
        } else {
            delete cache[key];
        }
    },

    clearCache(msg) {
        for (let key in cache) {
            delete cache[key];
        }
    },

    wasm(data) {
        if (data.enable) {
            wasm_ctrl.enable();
        } else {
            wasm_ctrl.disable();
        }
    },

    // CAM slice support

    cam_slice_init() {
        cache.slicer = new cam_slicer();
    },

    cam_slice_cleanup() {
        delete cache.slicer;
    },

    cam_slice(data, seq) {
        const { bucket, opt } = data;
        cache.slicer.sliceBucket(bucket, opt, slice => {
            // log({ slice });
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

    // CAM Topo3 support

    topo_raster(data, seq) {
        const { id, slice, params } = data;
        const { resolution } = params;
        const vertices = cache[id];
        const box = new THREE.Box2();
        new topo_slicer(slice.index)
            .setFromArray(vertices, slice)
            .slice(resolution)
            .forEach(rec => {
                const { z, index, lines } = rec;

                for (let line of lines) {
                    const { p1, p2 } = line;
                    if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                    if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                }

                raster_slice({
                    ...params,
                    box,
                    lines,
                    gridx: index
                });
            });
        // only pass back bounds of rasters to be merged
        reply({ seq, box });
    },

    trace_init(data) {
        data.cross.clipTo = codec.decode(data.cross.clipTo);
        data.cross.clipTab = codec.decode(data.cross.clipTab);
        const probe = new Probe(data.probe);
        const trace = new Trace(probe, data.trace);
        cache.trace = {
            probe,
            trace,
            cross: data.cross
        };
        trace.init(data.cross);
    },

    trace_y(data, seq) {
        const { trace } = cache.trace;
        trace.crossY_sync(data.params, slice => {
            slice = codec.encode(slice);
            reply({ seq, slice });
        });
    },

    trace_x(data, seq) {
        const { trace } = cache.trace;
        trace.crossX_sync(data.params, slice => {
            slice = codec.encode(slice);
            reply({ seq, slice });
        });
    },

    trace_cleanup() {
        delete cache.trace;
    },

    // CAM Topo4 support

    topo4_slice(data, seq) {
        const { slice, resolution } = data;
        const vertices = cache.vertices;
        const recs = new kiri.topo_slicer(slice.index)
            .setFromArray(vertices, slice)
            .slice(resolution)
            .map(rec => {
                const { z, index, lines } = rec;

                for (let line of lines) {
                    const { p1, p2 } = line;
                    if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                    if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                }

                const points = codec.encodePointArray(lines.map(l => [ l.p1, l.p2 ]).flat());
                const shared = new Float32Array(new SharedArrayBuffer(points.length * 4));
                shared.set(points);

                return {
                    z, index, shared,
                    polys: codec.encode(sliceConnect(lines)),
                };
            });
        // only pass back bounds of rasters to be merged
        reply({ seq, recs });
    },

    topo4_lathe(data, seq) {
        const { angle } = data;
        const { slices, tool } = cache.lathe;

        const axis = new THREE.Vector3(1, 0, 0);
        const mrot = new THREE.Matrix4().makeRotationAxis(axis, -angle);
        const stmp = slices.map(s => {
            const lines = s.lines.slice();
            rotatePoints(lines, mrot);
            return { z: s.z, lines }
        });

        const topo4 = Object.assign(new Topo4(), cache.lathe);
        const heights = topo4.lathePath(stmp, tool);

        reply({ seq, heights });
    }
};
