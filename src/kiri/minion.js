/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

let BASE = self.base,
    KIRI = self.kiri,
    UTIL = BASE.util,
    POLY = BASE.polygons,
    CODEC = KIRI.codec,
    clib = self.ClipperLib,
    ctyp = clib.ClipType,
    ptyp = clib.PolyType,
    cfil = clib.PolyFillType;

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

self.onmessage = function(msg) {
    let data = msg.data;
    let cmd = data.cmd;
    (funcs[cmd] || funcs.bad)(data, data.seq);
};

function reply(msg, direct) {
    self.postMessage(msg, direct);
}

const funcs = {
    config: data => {
        if (data.base) {
            Object.assign(BASE.config, data.base);
        } else {
            console.log({invalid: data});
        }
    },

    union: (data, seq) => {
        if (!(data.polys && data.polys.length)) {
            reply({ seq, union: CODEC.encode([]) });
            return;
        }
        let polys = CODEC.decode(data.polys);
        let union = POLY.union(polys, data.minarea || 0, true);
        reply({ seq, union: CODEC.encode(union) });
    },

    topShells: (data, seq) => {
        let top = CODEC.decode(data.top, {full: true});
        let {z, count, offset1, offsetN, fillOffset, opt} = data;
        KIRI.driver.FDM.share.doTopShells(z, top, count, offset1, offsetN, fillOffset, opt);
        reply({ seq, top: CODEC.encode(top, {full: true}) });
    },

    fill: (data, seq) => {
        let polys = CODEC.decode(data.polys);
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
        let clip = new clib.Clipper();
        let ctre = new clib.PolyTree();
        let clips = [];

        clip.AddPaths(data.lines, ptyp.ptSubject, false);
        clip.AddPaths(data.polys, ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            for (let node of ctre.m_AllPolys) {
                clips.push(CODEC.encode(POLY.fromClipperNode(node, data.z)));
            }
        }

        reply({ seq, clips });
    },

    sliceBucket: (data, seq) => {
        let { points, slices, options } = data;
        let i = 0, p = 0, realp = new Array(points.length / 3);
        while (i < points.length) {
            realp[p++] = BASE.newPoint(points[i++], points[i++], points[i++]);
        }
        let output = [];
        for (let params of slices) {
            let rec = KIRI.slicer.sliceZ(params.z, realp, options, params);
            output.push({
                params,
                data: { tops: rec.tops, clip: rec.clip }
            });
        }
        reply({ seq, output: CODEC.encode(output) });
    },

    wasm: data => {
        if (data.enable) {
            geo.enable();
        } else {
            geo.disable();
        }
    },

    bad: (data, seq) => {
        reply({ seq, error: "invalid command" });
    }
};
