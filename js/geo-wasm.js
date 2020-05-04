"use strict";

var gs_wasm = exports;

// only active in workers
if (!self.window)
(function() {

    if (!self.geo) self.geo = {};

    const factor = self.base.config.clipper;
    const geo = self.geo;

    geo.poly = { offset : polyOffset };

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
        return out;
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
                memory: exports.memory,
                start: exports._start,
                offset: exports.poly_offset,
                malloc: exports.mem_get,
                free: exports.mem_clr
            };

            wasm.start();

            // console.log(polyOffset(
            //     [ self.base.newPolygon().centerRectangle({x:6,y:6},10,10) ], 1
            // ));

            // let memat = wasm.malloc(4096);
            // let writer = new DataWriter(heap, memat);
            // let pcount = writePoly(writer, self.base.newPolygon().centerRectangle({x:6,y:6},10,10));
            //
            // log({instance, exports, heap, memat});
            // log(wasm.heap.buffer.slice(memat, memat+100));
            //
            // let resat = wasm.offset(memat, pcount, 0.5 * factor);
            //
            // log('offset', resat);
            //
            // log(wasm.heap.buffer.slice(resat, resat+100));
            //
            // let reader = new DataReader(heap, resat);
            // let poly = readPoly(reader);
            // console.log({poly});
            //
            // wasm.free(memat);
        });

})();
