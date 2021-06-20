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
    (funcs[cmd] || funcs.bad)(data);
};

function reply(msg, direct) {
    self.postMessage(msg, direct);
}

const funcs = {
    union: data => {
        if (!(data.polys && data.polys.length)) {
            reply({union: CODEC.encode([])});
            return;
        }
        let polys = CODEC.decode(data.polys);
        let union = POLY.union(polys, data.minarea || 0, true);
        reply({union: CODEC.encode(union)});
    },

    topShells: data => {
        let top = CODEC.decode(data.top, {full: true});
        let {z, count, offset1, offsetN, fillOffset, opt} = data;
        KIRI.driver.FDM.share.doTopShells(z, top, count, offset1, offsetN, fillOffset, opt);
        reply({top: CODEC.encode(top, {full: true})});
    },

    fill: data => {
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
        reply({ fill: arr }, [ arr.buffer ]);
    },

    clip: data => {
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

        reply({ clips });
    },

    bad: data => {
        reply({error: "invalid command"});
    }
};
