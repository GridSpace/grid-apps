/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { codec } from '../../core/codec.js';
import { newPoint } from '../../../geo/point.js';
import { newPolygon } from '../../../geo/polygon.js';
import { sliceConnect } from '../../../geo/slicer.js';
import { newSlice } from '../../core/slice.js';
import { Tool } from './tool.js';
import { Slicer as topo_slicer } from './slicer_topo.js';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

function scale(fn, factor = 1, base = 0) {
    return (value, msg) => {
        fn(base + value * factor, msg);
    }
}

export class Topo {
    constructor() { }

    async generate(opt = {}) {
        let { state, op, onupdate, ondone } = opt;
        let { widget, settings, tabs, color } = state;
        let { controller, process } = settings;
        let { webGPU } = controller;

        let axis = op.axis.toLowerCase(),
            tool = new Tool(settings, op.tool),
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
            resolution = (tolerance ? tolerance : 1 / Math.sqrt(density / (span.x * span.y))).round(5),
            step = this.step = (tool.traceOffset() * 2) * op.step,
            angle = this.angle = op.angle || 1;

        if (tool.isTaperMill() && step === 0) {
            step = this.step = op.step * tool.unitScale();
        }

        if (tolerance === 0) {
            console.log(widget.id, 'topo4 auto tolerance', resolution.round(4));
        }

        this.zBottom = state.zBottom ?? 0;
        this.resolution = resolution;
        this.vertices = widget.getGeoVertices({ unroll: true, translate: true });
        this.tabverts = widget.getTabVertices();
        this.tool = tool.generateProfile(resolution).profile;
        this.maxo = tool.profileDim.maxo * resolution;
        this.diam = tool.fluteDiameter();
        this.unit = tool.unitScale();
        this.units = controller.units === 'in' ? 25.4 : 1
        this.zoff = widget.track.top || 0;
        this.leave = op.leave || 0;
        this.linear = op.linear || false;
        this.lineColor = color;//controller.dark ? 0xffff00 : 0x555500;
        this.offStart = op.offStart ?? 0;
        this.offEnd = op.offEnd ?? 0;
        this.bounds  = bounds;
        this.gpu = webGPU ?? false;

        onupdate(0, "lathe");

        const parts = webGPU ? [ 0.8, 0.2 ] : [ 0.25, 0.75 ];
        const range = this.range = { min: Infinity, max: -Infinity };
        const slices = this.sliced = await this.slice(scale(onupdate, parts[0], 0));

        for (let slice of slices) {
            range.min = Math.min(range.min, slice.z);
            range.max = Math.max(range.max, slice.z);
        }

        const lathe = await this.lathe(scale(onupdate, parts[1], parts[0]));

        onupdate(1, "lathe");
        ondone(lathe);
        // ondone([...slices, ...lathe]);

        return this;
    }

    async slice(onupdate) {
        const { vertices, resolution, tabverts, zoff, offStart, offEnd, units } = this;
        const { minions } = self.kiri_worker;
        const range = this.range = { min: Infinity, max: -Infinity };

        // swap XZ in shared array
        for (let i = 0, l = vertices.length; i < l; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2] + zoff;
            vertices[i] = z;
            vertices[i + 2] = x;
            range.min = Math.min(range.min, x);
            range.max = Math.max(range.max, x);
        }

        // add tool diameter to slice min/max range to fully carve part
        range.min += offStart * units;
        range.max -= offEnd * units;
        range.max += resolution * 2;

        // merge in tab vertices here so they don't affect slice range / dimensions
        for (let i = 0, l = tabverts.length; i < l; i += 3) {
            const x = tabverts[i];
            const z = tabverts[i + 2] + zoff;
            tabverts[i] = z;
            tabverts[i + 2] = x;
        }

        // re-create shared vertex array for workers
        this.vertices = [].appendAll(vertices).appendAll(tabverts).toFloat32().toShared();

        // rp.rasterizeMesh(vertices, resolution).then(rpo => console.log({ rpo }));
        if (this.gpu) {
            return await this.sliceGPU(onupdate);
        }

        const zSpan = range.max - range.min;
        const shards = Math.ceil(Math.min(25, vertices.length / 27000));
        const totalSteps = Math.ceil(zSpan / resolution);
        const stardSteps = Math.ceil(totalSteps / shards);
        const stepWidth = stardSteps * resolution;

        let slices = this.slices = [];
        for (let i=0; i<shards; i++) {
            let s;
            slices.push(s = {
                min: range.min + i * stepWidth,
                max: Math.min(range.max, range.min + (i+1) * stepWidth),
                index: i * stardSteps
            });
        }

        // console.log({
        //     shards,
        //     step: stepWidth,
        //     range,
        //     resolution,
        //     slices: slices.slice(),
        //     minions
        // });

        if (minions?.running > 1) {
            return await this.sliceMinions(onupdate);
        } else {
            return await this.sliceWorker(onupdate);
        }
    }

    async sliceGPU(onupdate) {
        const { angle, diam, leave, linear, offStart, offEnd, resolution, tool, units, vertices, zBottom } = this;

        // invert tool Z offset for gpu code
        let toolBounds = new THREE.Box3()
            .expandByPoint({ x: -this.diam/2, y: -diam/2, z: 0 })
            .expandByPoint({ x: this.diam/2, y: diam/2, z: 0 });
        let toolPos = tool.slice();
        let minz = Infinity;
        for (let i=0; i<toolPos.length; i += 3) {
            // toolPos[i+2] = -toolPos[i+2];
            toolBounds.expandByPoint({ x: 0, y: 0, z: toolPos[i+2] });
            minz = Math.min(minz,toolPos[i+2]);
        }
        let toolData = { positions: toolPos, bounds: toolBounds };

        // console.time('swap XZ vertices');
        // swap XZ vertices for gpu code
        for (let i=0; i<vertices.length; i+= 3) {
            let tmp = vertices[i+2];
            vertices[i+2] = vertices[i+0];
            vertices[i+1] = -vertices[i+1];
            vertices[i+0] = tmp;
        }
        // console.timeEnd('swap XZ vertices');

        let gpu = await self.get_raster_gpu({
            mode: "radial",
            resolution,
            rotationStep: angle,
            radialRotationOffset: 90
        });
        let xStep = Math.max(1, Math.round(this.step / resolution));
        let boundsOverride = this.bounds.clone();
        boundsOverride.min.x += offStart * units;
        boundsOverride.max.x -= offEnd * units;
        await gpu.loadTool({
            sparseData: toolData
        });
        await gpu.loadTerrain({
            triangles: vertices,
            boundsOverride,
            onProgress(pct) { onupdate(pct/100) }
        });
        let output = await gpu.generateToolpaths({
            xStep,
            yStep: 1,
            zFloor: zBottom,
            onProgress(i,j) { onupdate(i/j) }
        });
        gpu.terminate();

        let { numStrips, strips } = output;
        let degPerRow = 360 / numStrips;
        let slices = this.gpu_slices = [];
        let xmult = resolution * xStep;
        let xoff = boundsOverride.min.x;
        let rows = [];
        for (let i=0; i<numStrips; i++) {
            let points = Array.from(strips[i].pathData).map((v,j) => newPoint(j * xmult + xoff, 0, v + leave).setA(-i * degPerRow));
            rows.push(points);
        }
        if (linear) {
            for (let i=0; i<rows.length; i++) {
                let slice = newSlice(i);
                slice.index = i;
                slice.camLines = [ newPolygon(rows[i]).setOpen() ];
                if (i % 2 === 1) slice.camLines[0].reverse();
                slices.push(slice);
            }
        } else {
            let { pointsPerLine } = strips[0];
            for (let i=0; i<pointsPerLine; i++) {
                let slice = newSlice(i);
                let points = rows.map(row => row[i]);
                points.push(points[0].clone().setA(-360));
                if (i % 2 === 1) points.reverse();
                slice.index = i;
                slice.camLines = [ newPolygon(points).setOpen() ];
                slices.push(slice);
            }
        }
        for (let slice of slices) {
            slice.output()
                .setLayer("lathe", { line: this.lineColor })
                .addPoly(slice.camLines[0].clone().applyRotations());
        }
        // console.log({ webGPU: output, slices });
        return slices;
    }

    async sliceWorker(onupdate) {
        const { vertices, slices, resolution } = this;

        let output = [];
        let complete = 0;
        for (let slice of slices) {
            const recs = new topo_slicer(slice.index)
                .setFromArray(vertices, slice)
                .slice(resolution)
                .map(rec => {
                    const slice = newSlice(rec.z);
                    for (let line of rec.lines) {
                        const { p1, p2 } = line;
                        if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                        if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                    }
                    slice.index = rec.index;
                    slice.addTops(sliceConnect(rec.lines));

                    const points = codec.encodePointArray(rec.lines.map(l => [l.p1, l.p2]).flat());
                    const shared = new Float32Array(new SharedArrayBuffer(points.length * 4));
                    shared.set(points);
                    slice.shared = shared;

                    return slice;
                });
            output.appendAll(recs);
            onupdate(++complete / slices.length);
        }

        return output;
    }

    async sliceMinions(onupdate) {
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
            .sort((a, b) => a.z - b.z);

        clearCache();
        return output;
    }

    async lathe(onupdate) {
        const { minions } = self.kiri_worker;
        if (this.gpu) {
            return await this.latheGPU(onupdate);
        } else if (minions?.running > 1) {
            return await this.latheMinions(onupdate);
        } else {
            return await this.latheWorker(onupdate);
        }
    }

    async latheGPU(onupdate) {
        return this.gpu_slices;
    }

    lathePath(slices, tool) {
        const { resolution, step, zBottom, maxo } = this;

        const tlen = tool.length;
        const slen = slices.length;
        const heights = [];

        // console.log({ tlen, slen, sinc, slices: slices.map(s => s.z) });
        // cull slice lines to only the ones in range (~5x faster)
        const oslices = [];
        for (let slice of slices) {
            const lines = slice.lines;
            const plen = lines.length;
            const rec = { z: slice.z, lines: [] };
            for (let i = 0; i < plen;) {
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
        for (let sz = 0; ; sz += step) {
            let si = Math.ceil(sz / resolution);
            if (si >= oslices.length) break;
            const rx = oslices[si].z;
            let mz = -Infinity;
            // iterate over tool offsets
            for (let ti = 0; ti < tlen;) {
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
                for (let i = 0; i < plen;) {
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
                    // continue;
                }
            }
            if (mz === -Infinity) {
                mz = zBottom;
            } else if (mz < zBottom) {
                mz = zBottom;
            }
            heights.push(rx, 0, lz = mz);
        }

        return heights;
    }

    async latheWorker(onupdate) {
        const { sliced, tool, zoff, leave, linear } = this;

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

        count = linear ? recs.length : recs[0].heights.length / 3;
        // count = recs[0].heights.length / 3;
        while (count-- > 0) {
            let slice = newSlice(count);
            slice.camLines = [newPolygon().setOpen()];
            paths.push(slice);
        }

        if (linear) {
            recs.forEach((rec, i) => {
                const { degrees, heights } = rec;
                [...heights].group(3).forEach((a) => {
                    paths[i].camLines[0].push(newPoint(a[0], a[1], a[2] + leave).setA(degrees));
                });
                if (i % 2 === 1) {
                    paths[i].camLines[0].reverse();
                }
            });
        } else {
            for (let rec of recs) {
                const { degrees, heights } = rec;
                [...heights].group(3).forEach((a, i) => {
                    // progress each path 360 degrees to prevent A rolling backwards
                    paths[i].camLines[0].push(newPoint(a[0], a[1], a[2] + leave).setA(degrees + i * -360));
                });
            }
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
                .addPoly(poly.clone().applyRotations().move({ z: -zoff, x: 0, y: 0 }));
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

        count = linear ? recs.length : recs[0].heights.length / 3;
        while (count-- > 0) {
            let slice = newSlice(count);
            slice.camLines = [newPolygon().setOpen()];
            paths.push(slice);
        }

        if (linear) {
            recs.forEach((rec, i) => {
                const { degrees, heights } = rec;
                [...heights].group(3).forEach((a) => {
                    paths[i].camLines[0].push(newPoint(a[0], a[1], a[2] + leave).setA(degrees));
                });
                if (i % 2 === 1) {
                    paths[i].camLines[0].reverse();
                }
            });
        } else {
            for (let rec of recs) {
                const { degrees, heights } = rec;
                [...heights].group(3).forEach((a, i) => {
                    // progress each path 360 degrees to prevent A rolling backwards
                    paths[i].camLines[0].push(newPoint(a[0], a[1], a[2] + leave).setA(degrees + i * -360));
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
                .addPoly(poly.clone().applyRotations().move({ z: -zoff, x: 0, y: 0 }));
        }

        // console.log({ tool, slices, paths });
        clearCache();

        return paths;
    }

    putCache(key, data) {
        const { dispatch } = self.kiri_worker;
        dispatch.putCache({ key, data }, { done: data => { } });
    }

    clearCache() {
        const { dispatch } = self.kiri_worker;
        dispatch.clearCache({}, { done: data => { } });
    }

    queue(cmd, params) {
        const { minions } = self.kiri_worker;
        return new Promise(resolve => {
            minions.queue({ cmd, ...params }, resolve);
        });
    }
}

export function rotatePoints(lines, rot) {
    new THREE.BufferAttribute(lines, 3).applyMatrix4(rot);
}

export async function generate(opt) {
    return new Topo().generate(opt);
};
