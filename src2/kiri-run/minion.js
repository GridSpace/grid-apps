/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// Future imports for src/kiri-run/minion.js when unwrapped from gapp.register()

// Core dependencies from root
import { base, kiri } from '../../main/gapp.js';

// Base dependencies
import { polygons } from '../../geo/base.js';

// Kiri dependencies
import { codec } from '../../kiri/index.js';

// Moto dependencies
import { broker } from '../../moto/broker.js';

// Note: This module also depends on:
// - moto.license (for licensing functionality)
// - geo.slicer (for slicing functionality)
// - geo.wasm (for WebAssembly functionality)
// - kiri-mode.fdm.post (for FDM post processing)
// - kiri-mode.cam.topo (for CAM topo functionality)
// - kiri-mode.cam.topo4 (for CAM topo4 functionality)
// - kiri-mode.cam.slicer (for CAM slicing)
// - ext.clip2 (for clipping operations)
// - Various kiri API functions injected via root

const POLY = polygons;
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
        kiri.driver.FDM.doTopShells(z, top, count, offset1, offsetN, fillOffset, opt);
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
        let { z, points, options } = data;
        let i = 0, p = 0, realp = new Array(points.length / 3);
        while (i < points.length) {
            realp[p++] = base.newPoint(points[i++], points[i++], points[i++]).round(3);
        }
        let state = { zero: [] };
        let output = [];
        base.sliceZ(z, realp, {
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
            base.wasm_ctrl.enable();
        } else {
            base.wasm_ctrl.disable();
        }
    },

    bad: (data, seq, cmd) => {
        reply({ seq, error: `invalid command (${cmd})` });
    }
};

moto.broker.publish("minion.started", { funcs, cache, reply, log });

// Future exports for src/kiri-run/minion.js when unwrapped from gapp.register()

// Utility functions
export { reply, log };

// Constants
export { POLY, clib, ctyp, ptyp, cfil };

// Global variables
export { cache, name };

// Default export - the main minion functionality
export default funcs; 