/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.line
// dep: geo.point
// dep: geo.polygon
// dep: geo.polygons
// dep: kiri.slice
// dep: kiri-mode.cam.driver
// dep: kiri-mode.cam.slicer2
// dep: moto.broker
gapp.register("kiri-mode.cam.topo", [], (root, exports) => {

const { base, kiri } = root;
const { driver, newSlice } = kiri;
const { CAM } = driver;
const { polygons, newPoint, newPolygon, sliceConnect } = base;

const PRO = CAM.process;
const POLY = polygons;
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

class Topo4 {
    constructor() { }

    async generate(opt = {}) {
        let { state, op, onupdate, ondone } = opt;
        let { widget, settings, tabs } = opt.state;
        let { controller, process } = settings;

        let axis = op.axis.toLowerCase(),
            tool = new CAM.Tool(settings, op.tool),
            bounds = widget.getBoundingBox().clone(),
            density = parseInt(controller.animesh || 100) * 2500,
            { min, max } = bounds,
            span = {
                x: max.x - min.x,
                y: max.y - min.y
            },
            contour = {
                x: axis === "x",
                y: axis === "y"
            },
            zMin = min.z + 0.0001,
            tolerance = op.tolerance,
            resolution = tolerance ? tolerance : 1 / Math.sqrt(density / (span.x * span.y)),
            step = this.step = (tool.traceOffset() * 2) * op.step;

        if (tolerance === 0) {
            console.log(widget.id, 'topo4 auto tolerance', resolution.round(4));
        }

        this.resolution = resolution;
        this.vertices = widget.getGeoVertices().toShared();
        this.tool = tool.generateProfile(resolution).profile;

        onupdate(0, "lathe");

        const range = this.range = { min: Infinity, max: -Infinity };
        const slices = this.sliced = await this.slice(onupdate);
        for (let slice of slices) {
            range.min = Math.min(range.min, slice.z);
            range.max = Math.max(range.max, slice.z);
            slice.output()
                .setLayer("lathe", { line: 0x888888 })
                .addPolys(slice.topPolys());
        }

        const lathe = await this.lathe(onupdate);

        onupdate(1, "lathe");
        ondone([...slices, ...lathe]);
    }

    async slice(onupdate) {
        const { vertices, resolution } = this;

        const range = this.range = { min: Infinity, max: -Infinity };
        const box = this.box = new THREE.Box2();

        // swap XZ in shared array
        for (let i=0, l=vertices.length; i<l; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            vertices[i] = z;
            vertices[i + 2] = x;
            range.min = Math.min(range.min, x);
            range.max = Math.max(range.max, x);
        }

        const shards = Math.ceil(Math.min(25, vertices.length / 27000));
        const step = (range.max - range.min) / shards;

        let index = 0;
        let slices = this.slices = [];
        let slice = { min: range.min, max: range.min + step, index };

        for (let z = range.min; z < range.max; z += resolution) {
            if (z > slice.max) {
                slices.push(slice);
                slice = { min: z, max: z + step, index };
            }
            index++;
        }
        slices.push(slice);
        console.log({ shards, range, step, slices });

        if (kiri.minions.running > 1) {
            return await this.sliceMinions(onupdate);
        } else {
            return await this.sliceWorker(onupdate);
        }
    }

    async sliceWorker(onupdate) {
        const { vertices, slices, resolution } = this;
        const { codec } = kiri;

        let output = [];
        let complete = 0;
        for (let slice of slices) {
            const recs = new kiri.topo_slicer(slice.index)
                .setFromArray(vertices, slice)
                .slice(resolution)
                .map(rec => {
                    const slice = kiri.newSlice(rec.z);
                    for (let line of rec.lines) {
                        const { p1, p2 } = line;
                        if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                        if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                    }
                    slice.index = rec.index;
                    slice.addTops(sliceConnect(rec.lines));

                    const points = codec.encodePointArray(rec.lines.map(l => [ l.p1, l.p2 ]).flat());
                    const shared = new Float32Array(new SharedArrayBuffer(points.length * 4));
                    shared.set(points);
                    slice.shared = shared;

                    return slice;
                });
            output.appendAll(recs);
            onupdate(++complete /slices.length);
        }

        return output;
    }

    async sliceMinions(onupdate) {
        const { codec } = kiri;
        const { queue, putCache, clearCache } = this;
        const { vertices, slices, resolution } = this;
        putCache("vertices", vertices);

        let complete = 0;
        let promises = slices.map(slice => {
            return queue("topo4_slice", {
                resolution,
                slice
            }).then(data => {
                onupdate(++complete / slices.length);
                return data;
            });
        });

        // merge boxes for all rasters for contouring clipping
        const output = codec.decode(await Promise.all(promises))
            .map(rec => rec.recs)
            .flat()
            .map(rec => newSlice(rec.z)
                .addTops(rec.polys)
                .setFields({ shared: rec.shared }))
            .sort((a,b) => a.z - b.z);

        clearCache();
        return output;
    }

    async lathe(onupdate) {
        if (false && kiri.minions.running > 1) {
            return await this.latheMinions(onupdate);
        } else {
            return await this.latheWorker(onupdate);
        }
    }

    lathePath(slices, tool) {
        const { resolution, step } = this;

        const tlen = tool.length;
        const slen = slices.length;
        const sinc = Math.max(1, Math.ceil(step / resolution));
        const heights = [];

        // console.log({ slen, step, resolution, sinc });

        // cull slice lines to only the ones in range (5x faster)
        const maxo = Math.max(...tool) * resolution;
        const oslices = [];
        for (let slice of slices) {
            const lines = slice.lines;
            const plen = lines.length;
            const rec = { z: slice.z, lines: [] };
            for (let i = 0; i < plen; ) {
                ++i; // skip x which should match slice.z
                let py0 = lines[i++];
                const pz0 = lines[i++];
                ++i; // skip x which should match slice.z
                let py1 = lines[i++];
                const pz1 = lines[i++];
                if ((py0 < -maxo && py1 < -maxo) || (py0 > maxo && py1 > maxo)) {
                    continue;
                }
                rec.lines.push(0, py0, pz0, 0, py1, pz1);
            }
            oslices.push(rec);
        }

        // iterate over all slices (real x = z)
        // find max real z using z ray intersect from tool point to slice lines + offset
        for (let si = 0; si < slen; si += sinc) {
            const rx = oslices[si].z;
            let mz = 0;
            // iterate over tool offsets
            for (let ti = 0; ti < tlen; ) {
                // tool offset in grid units from present x (si)
                const xo = tool[ti++]; // x grid offset (slice)
                const yo = tool[ti++] * resolution; // y grid offset (mult rez to get real y)
                const zo = tool[ti++]; // real z delta offset
                // get slice index corresponding with offset
                const ts = si + xo;
                // outside of slice array, skip
                if (ts < 0 || ts >= slen) continue;
                const slice = oslices[ts];
                const lines = slice.lines;
                const plen = lines.length;
                for (let i = 0; i < plen; ) {
                    ++i; // skip x which should match slice.z
                    let py0 = lines[i++];
                    const pz0 = lines[i++];
                    ++i; // skip x which should match slice.z
                    let py1 = lines[i++];
                    const pz1 = lines[i++];
                    if ((py0 <= yo && py1 >= yo) || (py1 <= yo && py0 >= yo)) {
                        const dz = pz1 - pz0;
                        const dy = Math.abs(py1 - py0);
                        const fr = Math.abs(yo - py0) / dy;
                        const lz = pz0 + dz * fr + zo;
                        // check z height
                        mz = Math.max(mz, lz);
                    }
                }
            }
            heights.push(rx, 0, mz);
        }

        return heights;
    }

    async latheWorker(onupdate) {
        const { sliced, tool } = this;

        const steps = 100;
        const rota = (360 / steps) * DEG2RAD;
        const axis = new THREE.Vector3(1, 0, 0);
        const mrot = new THREE.Matrix4().makeRotationAxis(axis, rota);

        const slices = sliced.map(s => { return { z: s.z, lines: s.shared } });
        const paths = [];
        const recs = [];

        // this.lathePath(slices, tool, paths);

        let angle = 0;
        let count = 0;
        // for each step angle, find Z spine heights, produce record
        while (count++ < steps) {
            const heights = this.lathePath(slices, tool, paths);
            recs.push({ angle, heights });
            angle -= rota;
            for (let lines of slices.map(s => s.lines)) {
                rotatePoints(lines, mrot);
            }
        }

        for (let rec of recs) {
            const { angle, heights } = rec;
            const degrees = angle * RAD2DEG;
            const points = heights.toFloat32();

            const poly = newPolygon().setOpen().addPoints(
                [...points].group(3).map(a => newPoint(a[0], a[1], a[2]).setA(degrees))
            );
            rotatePoints(points, new THREE.Matrix4().makeRotationAxis(axis, angle));
            const top = newPolygon().setOpen().addPoints(
                [...points].group(3).map(a => newPoint(a[0], a[1], a[2]))
            );

            const slice = newSlice();//.addTops([ top ]);
            slice.camLines = [ poly ];
            slice.output()
                .setLayer("lathe", { line: 0xffff00 })
                .addPoly(top);

            paths.push(slice);
        }

        console.log({ tool, slices, paths });

        return paths;
    }

    async latheMinions(onupdate) {
        const { codec } = kiri;
        const { sliced, resolution, tool, step } = this;
        const { putCache, clearCache, queue } = this;

        console.log({ sliced });
        putCache("lathe", {
            tool,
            step,
            range,
            resolution,
            slices: sliced.map(s => { return { z: s.z, lines: s.shared } })
        });

        let complete = 0;
        let promises = sliced.map(slice => {
            return queue("topo4_lathe", {
                    // resolution
                }).then(data => {
                    onupdate(++complete / sliced.length);
                    return data;
                });
        });

        // merge boxes for all rasters for contouring clipping
        const output = await Promise.all(promises);
        console.log({ output });

        clearCache();
        return [];
    }

    putCache(key, data) {
        kiri.worker.putCache({ key, data }, { done: data => { } });
    }

    clearCache() {
        kiri.worker.clearCache({}, { done: data => { } });
    }

    queue(cmd, params) {
        return new Promise(resolve => {
            kiri.minions.queue({ cmd, ...params }, resolve);
        });
    }
}

function rotatePoints(lines, rot) {
    new THREE.BufferAttribute(lines, 3).applyMatrix4(rot);
}

CAM.Topo4 = async function(opt) {
    return new Topo4().generate(opt);
};

moto.broker.subscribe("minion.started", msg => {
    const { funcs, cache, reply, log } = msg;
    const { codec } = kiri;

    funcs.topo4_slice = (data, seq) => {
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
    };

    funcs.topo4_lathe = (data, seq) => {
        // console.log({ topo4_lathe: data });

        // const { resolution } = data;
        const { resolution, sliced, tool, step } = cache.lathe;

        reply({ seq, abc: 123 });
    }

});

});
