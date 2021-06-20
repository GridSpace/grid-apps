/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

let BASE = self.base,
    KIRI = self.kiri,
    UTIL = BASE.util,
    POLY = BASE.polygons,
    CODEC = KIRI.codec;

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

function reply(msg) {
    self.postMessage(msg);
}

self.onmessage = function(msg) {
    let data = msg.data;
    switch (data.cmd) {
        case "union":
            if (!(data.polys && data.polys.length)) {
                reply({union: CODEC.encode([])});
                return;
            }
            let polys = CODEC.decode(data.polys);
            let union = POLY.union(polys, data.minarea || 0, true);
            reply({union: CODEC.encode(union)});
            break;
        case "top.shells":
            let top = CODEC.decode(data.top, {full: true});
            let {z, count, offset1, offsetN, fillOffset, opt} = data;
            KIRI.driver.FDM.share.doTopShells(z, top, count, offset1, offsetN, fillOffset, opt);
            reply({top: CODEC.encode(top, {full: true})});
            break;
        default:
            reply({error: "invalid command"});
            break;
    }
};

// console.log(`kiri | init mini | ${KIRI.version || "rogue"}`);
