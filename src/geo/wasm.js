/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// only active in workers
if (!self.window) (function() {

    if (!self.geo) self.geo = {};

    const factor = self.base.config.clipper;
    const geo = self.geo;

    geo.poly = {
        union: polyUnion,
        offset: polyOffset
    };

    function log() {
        console.log(...arguments);
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

    function polyOffset(polys, offset, z) {
        let wasm = geo.wasm,
            memat = wasm.malloc(1024 * 128),
            writer = new DataWriter(wasm.heap, memat),
            pcount = 0;
        polys.forEach(poly => pcount += writePoly(writer, poly));
        let resat = wasm.offset(memat, pcount, offset * factor),
            reader = new DataReader(wasm.heap, resat),
            out = [];
        for (;;) {
            let poly = readPoly(reader, z);
            if (poly) {
                out.push(poly);
            } else {
                break;
            }
        }
        wasm.free(memat);
        return polyNest(out);
    }

    function polyUnion(polys, z) {
        let wasm = geo.wasm,
            memat = wasm.malloc(1024 * 128),
            writer = new DataWriter(wasm.heap, memat),
            pcount = 0;
        polys.forEach(poly => pcount += writePoly(writer, poly));
        let resat = wasm.union(memat, pcount, pcount * factor),
            reader = new DataReader(wasm.heap, resat),
            out = [];
        for (;;) {
            let poly = readPoly(reader, z);
            if (poly) {
                out.push(poly);
            } else {
                break;
            }
        }
        wasm.free(memat);
        return polyNest(out);
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

    fetch('/wasm/kiri-geo.wasm')
        .then(response => response.arrayBuffer())
        .then(bytes => WebAssembly.instantiate(bytes, {
            env: {
                polygon: (a,b) => { console.log('polygon',a,b) },
                point: (a,b) => { console.log('point',a,b) },
                abs:  (a) => { console.log('abs',a); return Math.abs(a) }
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
            let {module, instance} = results;
            let {exports} = instance;
            let heap = new DataView(exports.memory.buffer);
            let wasm = geo.wasm = {
                heap,
                exports,
                memory: exports.memory,
                malloc: exports.mem_get,
                start: exports._start,
                free: exports.mem_clr,
                union: exports.poly_union,
                offset: exports.poly_offset
            };

            // wasm.start();
        });

})();
