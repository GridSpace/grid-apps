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
const { polygons, newLine, newSlope, newPoint, newPolygon, sliceConnect } = base;

const PRO = CAM.process;
const POLY = polygons;
const RAD2DEG = 180 / Math.PI;

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
            step = this.step = tool.fluteDiameter() * op.step;

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

    async latheWorker(onupdate) {
        const { range, resolution, sliced, tool } = this;

        const slices = sliced.map(s => { return { z: s.z, lines: s.shared } });
        const heights = [];
        const tlen = tool.length;
        const slen = slices.length;
        // iterate over all slices (real x = z)
        // find max real z using z ray intersect from tool point to slice lines + offset
        for (let si = 0; si < slen; si++) {
            const rx = slices[si].z;
            let mz = 0;
            // iterate over tool offsets
            for (let ti = 0; ti < tlen; ) {
                // tool offset in grid units from present x (si)
                const xo = tool[ti++]; // x grid offset (slice)
                const yo = tool[ti++]; // y grid offset (mult rez to get real y)
                const zo = tool[ti++]; // real z delta offset
                // get slice index corresponding with offset
                const ts = si + xo;
                // outside of slice array, skip
                if (ts < 0 || ts >= slen) continue;
                const slice = slices[ts];
                const lines = slice.lines;
                const plen = lines.length;
                for (let i = 0; i < plen; ) {
                    ++i; // skip x which should match slice.z
                    const py0 = lines[i++];
                    const pz0 = lines[i++];
                    ++i; // skip x which should match slice.z
                    const py1 = lines[i++];
                    const pz1 = lines[i++];
                    if (py0 <= yo && py1 >= yo) {
                        // check z height
                        mz = Math.max(mz, pz0, pz1);
                    }
                }
            }
            heights.push(mz);
        }

        console.log({ tool, range, resolution, slices, heights });

        return [];
    }

    async latheMinions(onupdate) {
        const { codec } = kiri;
        const { sliced, range, resolution, tool } = this;
        const { putCache, clearCache, queue } = this;

        console.log({ sliced });
        putCache("lathe", {
            tool,
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
        const { resolution, sliced, tool } = cache.lathe;

        reply({ seq, abc: 123 });
    }

});

});
