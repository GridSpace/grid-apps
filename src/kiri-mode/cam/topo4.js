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
            tolerance = op.tolerance,
            zMin = min.z + 0.0001,
            resolution = tolerance ? tolerance : 1 / Math.sqrt(density / (span.x * span.y)),
            toolOffset = tool.generateProfile(resolution).profile,
            toolDiameter = tool.fluteDiameter(),
            toolStep = toolDiameter * op.step,
            steps = {
                x: Math.ceil(span.x / resolution),
                y: Math.ceil(span.y / resolution)
            };

        if (tolerance === 0) {
            console.log(widget.id, 'topo4 auto tolerance', resolution.round(4));
        }

        this.widget = widget;
        this.resolution = resolution;

        onupdate(0, "lathe");

        const slices = await this.slice(onupdate);
        for (let slice of slices) {
            slice.output()
                .setLayer("lathe", { line: 0x888888 })
                .addPolys(slice.topPolys());
        }

        const lathe = await this.lathe(onupdate);

        onupdate(1, "lathe");
        ondone([...slices, ...lathe]);
    }

    async slice(onupdate) {
        const { widget, resolution } = this;

        const vertices = this.vertices = widget.getGeoVertices().toShared();
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
        // console.log({ shards, range, step, slices });

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
        const { worker, minions, codec } = kiri;
        const { widget, vertices, slices, resolution } = this;

        worker.putCache({ key: widget.id, data: vertices }, { done: data => {
            // console.log({ put_cache_done: data });
        }});

        let complete = 0;
        let promises = slices.map(slice => {
            return new Promise(resolve => {
                minions.queue({
                    cmd: "topo4_slice",
                    id: widget.id,
                    resolution,
                    slice
                }, data => {
                    resolve(data);
                    onupdate(++complete / slices.length);
                });
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

        worker.clearCache({}, { done: data => { }});

        return output;
    }

    async lathe(onupdate) {
        if (kiri.minions.running > 1) {
            return await this.latheMinions(onupdate);
        } else {
            return await this.latheWorker(onupdate);
        }
    }

    async latheWorker(onupdate) {
        return [];
    }

    async latheMinions(onupdate) {
        const { worker, minions, codec } = kiri;
        const { slices, resolution } = this;

        worker.putCache({
            key: "lathe",
            data: slices.map(s => {
                return { z: s.z, lines: s.shared }
            })
        }, { done: data => {
            // console.log({ put_cache_done: data });
        }});

        let complete = 0;
        let promises = slices.map(slice => {
            return new Promise(resolve => {
                minions.queue({
                    cmd: "topo4_lathe",
                    resolution
                }, data => {
                    resolve(data);
                    onupdate(++complete / slices.length);
                });
            });
        });

        // merge boxes for all rasters for contouring clipping
        const output = await Promise.all(promises);

        worker.clearCache({}, { done: data => { }});

        return [];
    }

}

CAM.Topo4 = async function(opt) {
    return new Topo4().generate(opt);
};

moto.broker.subscribe("minion.started", msg => {
    const { funcs, cache, reply, log } = msg;
    const { codec } = kiri;

    funcs.topo4_slice = (data, seq) => {
        const { id, slice, resolution } = data;
        const vertices = cache[id];
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
        console.log({ topo4_lathe: cache });

        const { resolution } = data;
        const slices = cache.lathe;

        log({ slices, resolution });

        reply({ seq, abc: 123 });
    }

});

});
