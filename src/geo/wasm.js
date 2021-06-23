/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// only active in workers
if (!self.window) (function() {

    if (!self.geo) self.geo = {};

    const factor = self.base.config.clipper;
    const geo = self.geo;
    const debug = false;

    function log() {
        console.log(...arguments);
    }

    function writePolys(view, polys) {
        let pcount = 0;
        for (let poly of polys) {
            pcount += writePoly(view, poly);
        }
        return pcount;
    }

    function writePoly(view, poly, inner) {
        if (inner) {
            poly.setCounterClockwise();
        } else {
            poly.setClockwise();
        }
        let count = 1;
        let points = poly.points;
        let inners = poly.inner;
        view.writeU16(points.length, true);
        for (let i=0, il=points.length; i<il; i++) {
            let point = points[i];
            view.writeI32((point.x * factor)|0, true);
            view.writeI32((point.y * factor)|0, true);
        }
        if (inners) {
            for (let i=0, il=inners.length; i<il; i++) {
                count += writePoly(view, inners[i], true);
            }
        }
        return count;
    }

    function readPoly(view, z) {
        let points = view.readU16(true);
        if (points === 0) return;
        let poly = self.base.newPolygon();
        while (points-- > 0) {
            poly.add(view.readI32(true)/factor, view.readI32(true)/factor, z || 0);
        }
        return poly;
    }

    function readPolys(view, z, out = []) {
        for (;;) {
            let poly = readPoly(view, z);
            if (poly) {
                out.push(poly);
            } else {
                break;
            }
        }
        return out;
    }

    function polyOffset(polys, offset, z) {
        let wasm = geo.wasm,
            buffer = geo.wasm.shared,
            pcount = writePolys(new DataWriter(wasm.heap, buffer), polys),
            resat = wasm.fn.offset(buffer, pcount, offset * factor),
            out = readPolys(new DataReader(wasm.heap, resat), z);
        return polyNest(out);
    }

    function polyUnion(polys, z) {
        let wasm = geo.wasm,
        buffer = geo.wasm.shared,
            pcount = writePolys(new DataWriter(wasm.heap, buffer), polys),
            resat = wasm.fn.union(buffer, pcount),
            out = readPolys(new DataReader(wasm.heap, resat), z);
        return polyNest(out);
    }

    function polyDiff(polysA, polysB, z, AB, BA) {
        let wasm = geo.wasm,
        buffer = geo.wasm.shared,
            writer = new DataWriter(wasm.heap, buffer),
            pcountA = writePolys(writer, polysA),
            pcountB = writePolys(writer, polysB),
            resat = wasm.fn.diff(buffer, pcountA, pcountB, AB?1:0, BA?1:0, base.config.clipperClean),
            reader = new DataReader(wasm.heap, resat);
        if (AB) {
            AB.appendAll(polyNest(readPolys(reader, z)));
        }
        if (BA) {
            BA.appendAll(polyNest(readPolys(reader, z)));
        }
    }

    // nest closed polygons without existing parent / child relationships
    function polyNest(polys) {
        polys.sort((a,b) => {
            return b.bounds.minx - a.bounds.minx;
        });
        // from smallest to largest, check for enclosing bounds and nest
        for (let i=0, il=polys.length; i<il; i++) {
            let smaller = polys[i];
            // prevent parent poly from being consumed
            if (smaller.inner) continue;
            for (let j=i+1; j<il; j++) {
                let larger = polys[j];
                if (larger.bounds.contains(smaller.bounds)) {
                    larger.addInner(smaller);
                    break;
                }
            }
        }
        let tops = [];
        for (let i=0, il=polys.length; i<il; i++) {
            let poly = polys[i];
            if (!poly.parent) {
                tops.push(poly);
            }
        }
        return tops;
    }

    function runTests() {
        let newPolygon = self.base.newPolygon;
        let p1 = newPolygon().add(0,0).add(4,0).add(4,4).add(0,4);
        let p2 = p1.clone().setZ(0).move({x:2, y:2});
        let d1 = [];
        let d2 = [];
        geo.wasm.js.diff([p1], [p2], 0, d1, d2);
        console.log('diff',{p1:p1.points, p2:p2.points, d1:d1[0].points, d2:d2[0].points});
        let o1 = geo.wasm.js.offset([p1], 1, 0);
        console.log('offs',{o1:o1[0].points});
    }

    fetch('/wasm/kiri-geo.wasm')
        .then(response => response.arrayBuffer())
        .then(bytes => WebAssembly.instantiate(bytes, {
            env: {
                polygon: (a,b) => { console.log('polygon',a,b) },
                point: (a,b) => { console.log('point',a,b) },
                abc:  (a,b,c) => { console.log('abc',a,b,c) }
            },
            wasi_snapshot_preview1: {
                args_get: (count,bufsize) => { return 0 },
                args_sizes_get: (count,bufsize) => { },
                environ_get: (count,bufsize) => { return 0 },
                environ_sizes_get: (count,bufsize) => { },
                proc_exit: (code) => { return code }
            }
        }))
        .then(results => {
            let { module, instance } = results;
            let { exports } = instance;
            let heap = new DataView(exports.memory.buffer);
            let wasm = geo.wasm = {
                heap,
                exports,
                memory: exports.memory,
                memmax: exports.memory.buffer.byteLength,
                malloc: exports.mem_get,
                free: exports.mem_clr,
                set_debug: exports.set_debug
            };
            wasm.shared = wasm.malloc(1024 * 1024 * 10),
            wasm.fn = {
                diff: exports.poly_diff,
                union: exports.poly_union,
                offset: exports.poly_offset
            };
            wasm.js = {
                diff: polyDiff,
                union: polyUnion,
                offset: polyOffset
            };
            if (debug) {
                wasm.set_debug(1);
                runTests();
            }
        });

})();
