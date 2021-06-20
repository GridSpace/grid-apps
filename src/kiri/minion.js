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

self.onmessage = function(msg) {
    let data = msg.data;
    switch (data.cmd) {
        case "union":
            if (!(data.polys && data.polys.length)) {
                self.postMessage({union: CODEC.encode([])});
                return;
            }
            let polys = CODEC.decode(data.polys);
            let union = POLY.union(polys, data.minarea || 0, true);
            self.postMessage({union: CODEC.encode(union)});
            break;
        default:
            self.postMessage({error: "invalid command"});
            break;
    }
};

// console.log(`kiri | init mini | ${KIRI.version || "rogue"}`);
