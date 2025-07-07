/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.line
// dep: geo.point
// dep: geo.polygon
// dep: geo.polygons
// dep: moto.broker
// dep: kiri.slice
// dep: kiri-mode.cam.driver
// dep: kiri-mode.cam.slicer2
gapp.register("kiri-mode.cam.topo", [], (root, exports) => {

const { base, kiri, moto } = root;
const { driver, newSlice } = kiri;
const { CAM } = driver;
const { polygons, newPoint, newPolygon, sliceConnect } = base;

const PRO = CAM.process;
const POLY = polygons;
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

function scale(fn, factor = 1, base = 0) {
    return (value, msg) => {
        fn(base + value * factor, msg);
    }
}

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
            step = this.step = (tool.traceOffset() * 2) * op.step,
            angle = this.angle = op.angle || 1;

        if (tool.isTaperMill() && step === 0) {
            step = this.step = op.step * tool.unitScale();
        }

        if (tolerance === 0) {
            console.log(widget.id, 'topo4 auto tolerance', resolution.round(4));
        }

        this.zBottom = state.zBottom;
        this.resolution = resolution;
        this.vertices = widget.getGeoVertices({ unroll: true, translate: true });
        this.tabverts = widget.getTabVertices();
        this.tool = tool.generateProfile(resolution).profile;
        this.maxo = tool.profileDim.maxo * resolution;
        this.diam = tool.fluteDiameter();
        this.zoff = widget.track.top || 0;
        this.leave = op.leave || 0;
        this.linear = op.linear || false;
        this.lineColor = state.settings.controller.dark ? 0xffff00 : 0x555500;

        onupdate(0, "lathe");

        const range = this.range = { min: Infinity, max: -Infinity };
        const slices = this.sliced = await this.slice(scale(onupdate, 0.25, 0));
        for (let slice of slices) {
            range.min = Math.min(range.min, slice.z);
            range.max = Math.max(range.max, slice.z);
            slice.output()
                .setLayer("lathe", { line: 0x888888 })
                .addPolys(slice.topPolys());
        }

        const lathe = await this.lathe(scale(onupdate, 0.75, 0.25));

        onupdate(1, "lathe");
        ondone(lathe);
        // ondone([...slices, ...lathe]);

        return this;
    }

    async slice(onupdate) {
        const { vertices, resolution, tabverts, zoff } = this;

        const range = this.range = { min: Infinity, max: -Infinity };
        const box = this.box = new THREE.Box2();

        // swap XZ in shared array
        for (let i=0, l=vertices.length; i<l; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2] + zoff;
            vertices[i] = z;
            vertices[i + 2] = x;
            range.min = Math.min(range.min, x);
            range.max = Math.max(range.max, x);
        }

        // add tool radius to slice min/max range ot fully carve part
        range.min -= this.diam / 2;
        range.max += this.diam / 2;

        // merge in tab vertices here so they don't affect slice range / dimensions
        for (let i=0, l=tabverts.length; i<l; i += 3) {
            const x = tabverts[i];
            const z = tabverts[i + 2] + zoff;
            tabverts[i] = z;
            tabverts[i + 2] = x;
        }

        // re-create shared vertex array for workers
        this.vertices = [].appendAll(vertices).appendAll(tabverts).toFloat32().toShared();

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
        if (kiri.minions.running > 1) {
            return await this.latheMinions(onupdate);
        } else {
            return await this.latheWorker(onupdate);
        }
    }

    lathePath(slices, tool) {
        const { resolution, step, zBottom, maxo } = this;

        const tlen = tool.length;
        const slen = slices.length;
        const sinc = Math.max(1, Math.ceil(step / resolution));
        const heights = [];

        // cull slice lines to only the ones in range (5x faster)
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
        let lz = 0;
        for (let si = 0; si < slen; si += sinc) {
            const rx = oslices[si].z;
            let mz = -Infinity;
            // iterate over tool offsets
            for (let ti = 0; ti < tlen; ) {
                // tool offset in grid units from present x (si)
                const xo = tool[ti++]; // x grid offset (slice)
                const yo = tool[ti++] * resolution; // y grid offset (mult rez to get real y)
                const zo = tool[ti++]; // real z delta offset
                // get slice index corresponding with offset
                const ts = si + xo;
                // outside of slice array, skip
                if (ts < 0 || ts >= slen - 1) {
                    continue;
                }
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
                        if (dy === 0) continue;
                        const fr = Math.abs(yo - py0) / dy;
                        const lz = pz0 + dz * fr + zo;
                        // check z height
                        mz = Math.max(mz, lz);
                    }
                }
                if (mz === -Infinity && xo === 0 && yo === 0) {
                    // tool tip is off the model
                    continue;
                }
            }
            if (mz === -Infinity) {
                mz = zBottom; // Math.min(0, lz)
            } else if (zBottom && mz < zBottom) {
                mz = zBottom;
            }
            heights.push(rx, 0, lz = mz);
        }

        return heights;
    }

    async latheWorker(onupdate) {
        const { sliced, tool, zoff, leave } = this;

        const rota = this.angle * DEG2RAD;
        const steps = (Math.PI * 2) / rota;
        const axis = new THREE.Vector3(1, 0, 0);
        const mrot = new THREE.Matrix4().makeRotationAxis(axis, rota);
        const slices = sliced.map(s => { return { z: s.z, lines: s.shared } });
        const paths = [];
        const recs = [];

        let angle = 0;
        let count = 0;
        // for each step angle, find Z spine heights, produce record
        while (count++ < steps) {
            const heights = this.lathePath(slices, tool, paths);
            recs.push({ angle, heights, degrees: angle * RAD2DEG });
            angle -= rota;
            for (let lines of slices.map(s => s.lines)) {
                rotatePoints(lines, mrot);
            }
            onupdate(count / steps);
        }

        count = recs[0].heights.length / 3;
        while (count-- > 0) {
            let slice = newSlice(count);
            slice.camLines = [ newPolygon().setOpen() ];
            paths.push(slice);
        }

        for (let rec of recs) {
            const { degrees, heights } = rec;
            [...heights].group(3).forEach((a,i) => {
                // progress each path 360 degrees to prevent A rolling backwards
                paths[i].camLines[0].push( newPoint(a[0], a[1], a[2] + leave).setA(degrees + i * -360) );
            });
        }

        for (let slice of paths) {
            const poly = slice.camLines[0];
            if (!poly.length) {
                console.log('empty', slice);
                continue;
            }
            // repeat first point 360 degrees progressed
            const repeat = poly.points[0];
            slice.camLines[0].push(repeat.clone().setA(repeat.a - 360));
            slice.output()
                .setLayer("lathe", { line: this.lineColor })
                .addPoly(poly.clone().applyRotations().move({ z: -zoff, x:0, y:0 }));
        }

        // console.log({ tool, slices, paths });

        return paths;
    }

    async latheMinions(onupdate) {
        const { sliced, tool, zoff, leave, maxo, zBottom, step, resolution, linear } = this;
        const { putCache, clearCache, queue } = this;

        const rota = this.angle * DEG2RAD;
        const steps = (Math.PI * 2) / rota;
        const slices = sliced.map(s => { return { z: s.z, lines: s.shared } });
        const paths = [];
        const recs = [];

        putCache("lathe", {
            maxo,
            tool,
            step,
            slices,
            zBottom,
            resolution,
        });

        let done = 0;
        let tangle = 0;
        let count = 0;
        let promises = [];
        // for each step angle, find Z spine heights, produce record
        while (count++ < steps) {
            const angle = tangle;
            let p = new Promise(resolve => {
                queue("topo4_lathe", { angle }).then(data => {
                    // console.log({ angle, data });
                    recs.push({ angle, heights: data.heights, degrees: angle * RAD2DEG });
                    onupdate(++done / steps);
                    resolve();
                });
            });
            // await p;
            promises.push(p);
            tangle -= rota;
        }

        await Promise.all(promises);
        recs.sort((a, b) => { return b.angle - a.angle });

        // let linear = true;

        count = linear ? recs.length : recs[0].heights.length / 3;
        while (count-- > 0) {
            let slice = newSlice(count);
            slice.camLines = [ newPolygon().setOpen() ];
            paths.push(slice);
        }

        if (linear) {
            recs.forEach((rec,i) => {
                const { degrees, heights } = rec;
                [...heights].group(3).forEach((a) => {
                    paths[i].camLines[0].push( newPoint(a[0], a[1], a[2] + leave).setA(degrees) );
                });
                if (i % 2 === 1) {
                    paths[i].camLines[0].reverse();
                }
            });
        } else {
            for (let rec of recs) {
                const { degrees, heights } = rec;
                [...heights].group(3).forEach((a,i) => {
                    // progress each path 360 degrees to prevent A rolling backwards
                    paths[i].camLines[0].push( newPoint(a[0], a[1], a[2] + leave).setA(degrees + i * -360) );
                });
            }
        }

        for (let slice of paths) {
            const poly = slice.camLines[0];
            if (!poly.length) {
                console.log('empty', slice);
                continue;
            }
            if (!linear) {
                // repeat first point 360 degrees progressed
                const repeat = poly.points[0];
                slice.camLines[0].push(repeat.clone().setA(repeat.a - 360));
            }
            slice.output()
                .setLayer("lathe", { line: this.lineColor })
                .addPoly(poly.clone().applyRotations().move({ z: -zoff, x:0, y:0 }));
        }

        // console.log({ tool, slices, paths });
        clearCache();

        return paths;
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

CAM.Topo4 = function(opt) {
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
        const { angle } = data;
        const { slices, tool } = cache.lathe;

        const axis = new THREE.Vector3(1, 0, 0);
        const mrot = new THREE.Matrix4().makeRotationAxis(axis, -angle);
        const stmp = slices.map(s => {
            const lines = s.lines.slice();
            rotatePoints(lines, mrot);
            return { z: s.z, lines }
        });

        const topo4 = Object.assign(new Topo4(), cache.lathe);
        const heights = topo4.lathePath(stmp, tool);

        reply({ seq, heights });
    }

});

});
