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
const { polygons, newLine, newSlope, newPoint, newPolygon } = base;

const PRO = CAM.process;
const POLY = polygons;
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

class Topo {
    constructor() { }

    async generate(opt = {}) {
        let { state, contour, onupdate, ondone } = opt;
        let { widget, settings, tshadow, center, tabs, color } = opt.state;

        let { controller, process } = settings,
            animesh = parseInt(controller.animesh || 100) * 2500,
            axis = contour.axis.toLowerCase(),
            contourX = axis === "x",
            contourY = axis === "y",
            bounds = widget.getBoundingBox().clone(),
            tolerance = contour.tolerance,
            flatness = contour.flatness || (tolerance / 100),
            shadow = tshadow,
            minX = bounds.min.x,
            maxX = bounds.max.x,
            minY = bounds.min.y,
            maxY = bounds.max.y,
            zBottom = contour.bottom ? state.zBottom : 0,
            zMin = Math.max(bounds.min.z, zBottom) + 0.0001,
            boundsX = maxX - minX,
            boundsY = maxY - minY,
            inside = contour.inside,
            density = 1 + (contour.reduction || 0),
            resolution = tolerance ? tolerance : 1/Math.sqrt(animesh/(boundsX * boundsY)),
            tool = new CAM.Tool(settings, contour.tool),
            toolOffset = tool.generateProfile(resolution).profile,
            toolDiameter = tool.fluteDiameter(),
            toolStep = toolDiameter * contour.step, //tool.contourOffset(contour.step),
            leave = contour.leave || 0,
            maxangle = contour.angle,
            curvesOnly = contour.curves,
            bridge = contour.bridging || 0,
            // R2A = 180 / Math.PI,
            stepsX = Math.ceil(boundsX / resolution),
            stepsY = Math.ceil(boundsY / resolution),
            widtopo = widget.topo,
            topoCache = widtopo
                && widtopo.resolution === resolution
                && widtopo.diameter === toolDiameter
                ? widtopo : undefined,
            topo = widget.topo = topoCache || {
                data: new Float32Array(new SharedArrayBuffer(stepsX * stepsY * 4)),
                stepsX: stepsX,
                stepsY: stepsY,
                bounds: bounds,
                diameter: toolDiameter,
                resolution: resolution,
                profile: toolOffset,
                widget: widget,
                raster: true,
                slices: null
            },
            data = topo.data,
            newslices = [],
            tabsMax = tabs ? Math.max(...tabs.map(tab => tab.dim.z/2 + tab.pos.z)) : 0,
            tabsOn = tabs,
            tabHeight = Math.max(process.camTabsHeight + zBottom, tabsMax),
            clipTab = tabsOn ? [] : null,
            clipTo = inside ? shadow : POLY.expand(shadow, toolDiameter/2 + resolution * 3),
            partOff = inside ? 0 : toolDiameter / 2 + resolution,
            gridDelta = Math.floor(partOff / resolution),
            debug = false,
            debug_clips = debug && true,
            debug_topo = debug && true,
            debug_topo_lines = debug && true,
            debug_topo_shells = debug && true,
            time = Date.now;

        if (tolerance === 0 && !topoCache) {
            console.log(widget.id, 'topo auto tolerance', resolution.round(4));
        }

        // console.log({ resolution, flatness });
        // used by Pocket -> Contour
        this.tolerance = resolution;

        if (tabs) {
            clipTab.appendAll(tabs.map(tab => {
                let ctab = POLY.expand([tab.poly], toolDiameter/2);
                ctab.forEach(ct => ct.z = tab.dim.z/2 + tab.pos.z);
                return ctab;
            }).flat());
        }

        // debug clipTab and clipTo
        if (debug_clips) {
            const debug = newSlice(-1);
            const output = debug.output();
            // if (clipTab) output.setLayer("clip.tab", { line: 0xff0000 }).addPolys(clipTab);
            if (clipTo) output.setLayer("clip.to", { line: 0x00dd00 }).addPolys(clipTo);
            newslices.push(debug);
        }

        const probe = this.probe = new Probe({
            profile: toolOffset,
            data,
            stepsX,
            stepsY,
            boundsX,
            boundsY,
            minX,
            minY,
            zMin
        });

        const { toolAtZ, toolAtXY, zAtXY } = probe;

        this.toolAtZ = toolAtZ;
        this.toolAtXY = toolAtXY;
        this.zAtXY = zAtXY;

        const trace = this.trace = new Trace(probe, {
            curvesOnly,
            maxangle,
            flatness,
            bridge,
            contourX
        });

        if (topo.raster) {
            const box = topo.box = new THREE.Box2();

            const params = {
                resolution,
                curvesOnly,
                flatness,
                stepsY,
                minY,
                maxY,
                zMin,
                data,
                box
            };

            onupdate(0, 1, "raster");
            await this.raster(widget, params, (i, l, p) => {
                onupdate(i / 2, l, p);
            });
            topo.raster = false;
        }

        await this.contour({
            box: topo.box,
            minX,
            maxX,
            minY,
            maxY,
            stepsX,
            stepsY,
            boundsX,
            boundsY,
            partOff,
            gridDelta,
            resolution,
            toolStep,
            contourX,
            contourY,
            density,
            clipTo,
            clipTab,
            clipTabZ: clipTab ? clipTab.map(t => t.z) : undefined,
            tabHeight,
            newslices,
            leave,
            color
        }, (i, l, p) => {
            onupdate(l / 2 + i / 2, l, p);
        });

        ondone(newslices);

        return this;
    }

    async raster(widget, params, onupdate) {
        const { resolution } = params;
        const { box } = params;
        const { worker, minions } = kiri;

        const vertices = widget.getGeoVertices({ unroll: true, translate: true }).toShared();
        const range = { min: Infinity, max: -Infinity };

        // swap XZ in shared array
        for (let i=0,l=vertices.length; i<l; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            vertices[i] = z;
            vertices[i + 2] = x;
            range.min = Math.min(range.min, x);
            range.max = Math.max(range.max, x);
        }

        const shards = Math.ceil(Math.min(25, vertices.length / 27000));
        const step = (range.max - range.min) / shards;

        let slices = [];
        let index = 0;
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

        let complete = 0;
        // define sharded ranges
        if (minions.running > 1) {

            worker.putCache({ key: widget.id, data: vertices }, { done: data => {
                // console.log({ put_cache_done: data });
            }});

            let promises = slices.map(slice => {
                return new Promise(resolve => {
                    minions.queue({
                        cmd: "topo_raster",
                        id: widget.id,
                        params,
                        slice
                    }, data => {
                        resolve(data);
                        onupdate(++complete, slices.length, "raster");
                    });
                });
            });

            // merge boxes for all rasters for contouring clipping
            (await Promise.all(promises))
                .map(rec => rec.box)
                .map(box => new THREE.Box2(
                    new THREE.Vector2(box.min.x, box.min.y),
                    new THREE.Vector2(box.max.x, box.max.y)
                ))
                .map(box2 => {
                    box.union(box2);
                    return box2;
                });

            worker.clearCache({}, { done: data => {
                // console.log({ clear_cache_done: data });
            }});

        } else {

            // iterate over shards, merge output
            // const output = [];
            for (let slice of slices) {
                new kiri.topo_slicer(slice.index)
                    .setFromArray(vertices, slice)
                    .slice(resolution)
                    .map(rec => {

                        const slice = kiri.newSlice(rec.z);
                        slice.index = rec.index;
                        slice.lines = rec.lines;
                        for (let line of rec.lines) {
                            const { p1, p2 } = line;
                            if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                            if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                        }

                        raster_slice({
                            ...params,
                            box,
                            lines: rec.lines,
                            gridx: rec.index
                        });

                        return slice;
                    });
                onupdate(++complete, slices.length, "raster");
            }

        }
    }

    async contour(params, onupdate) {
        const trace = this.trace;
        const concurrent = kiri.minions.running;

        const { minX, maxX, minY, maxY, boundsX, boundsY, stepsX, stepsY } = params;
        const { gridDelta, resolution, density, partOff, toolStep, contourX, contourY } = params;
        const { clipTo, clipTab, clipTabZ, tabHeight, newslices, color, leave } = params;

        let stepsTaken = 0,
            stepsTotal = 0;

        if (contourX) {
            stepsTotal += ((maxY - minY + partOff * 2) / toolStep) | 0;
        }

        if (contourY) {
            stepsTotal += ((maxX - minX + partOff * 2) / toolStep) | 0;
        }

        if (stepsTotal === 0) {
            return;
        }

        const box = params.box.clone().expandByVector(new THREE.Vector3(
            partOff, partOff, 0
        ));

        trace.init({
            box,
            leave,
            clipTo,
            clipTab,
            clipTabZ,
            tabHeight,
            resolution,
            concurrent,
            density
        });

        let resolver;
        let pcount = 0;
        let slicesY = [];
        let slicesX = [];
        let promise = new Promise(resolve => {
            resolver = () => {
                // sort output slices (required for async)
                slicesY.sort((a,b) => a.z - b.z);
                slicesX.sort((a,b) => a.z - b.z);
                newslices.appendAll(slicesY);
                newslices.appendAll(slicesX);
                resolve();
            }
        });
        let inc = () => { pcount++ };
        let dec = () => { if (--pcount === 0 && concurrent) resolver() };

        if (contourY) {
            onupdate(0, stepsTotal, "contour y");
            // emit slice per X
            for (let x = minX - partOff; x <= maxX + partOff; x += toolStep) {
                if (x < box.min.x || x > box.max.x) continue;
                const gridx = Math.round(((x - minX) / boundsX) * stepsX);
                const gridy = -gridDelta;
                inc();
                trace.crossY({
                    from: minY - partOff,
                    to: maxY + partOff,
                    x,
                    gridx,
                    gridy
                }, segments => {
                    if (segments.length > 0) {
                        let slice = newSlice(gridx);
                        slice.camLines = segments;
                        slice.output()
                            .setLayer("contour y", {face: color, line: color})
                            .addPolys(segments);
                        slicesY.push(slice);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour y");
                    dec();
                });
            }
        }

        if (contourX) {
            // emit slice per Y
            onupdate(0, stepsTotal, "contour x");
            for (let y = minY - partOff; y <= maxY + partOff; y += toolStep) {
                if (y < box.min.y || y > box.max.y) continue;
                const gridy = Math.round(((y - minY) / boundsY) * stepsY);
                const gridx = -gridDelta;
                inc();
                trace.crossX({
                    from: minX - partOff,
                    to: maxX + partOff,
                    y,
                    gridx,
                    gridy
                }, segments => {
                    if (segments.length > 0) {
                        let slice = newSlice(gridy);
                        slice.camLines = segments;
                        slice.output()
                            .setLayer("contour x", {face: color, line: color})
                            .addPolys(segments);
                        slicesX.push(slice);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour x");
                    dec();
                });
            }
        }

        if (!concurrent) resolver();

        await promise;

        // const lines = newslices.map(s => (s.camLines || []).map(p => p.length));
        // const points = lines.flat().reduce((a,b) => a+b);
        // console.log({ lines, points });

        trace.cleanup();
    }

}

class Probe {

    constructor(params) {

        const { data, profile } = params;
        const { stepsX, stepsY, boundsX, zMin, minX, minY } = params;

        this.params = params;

        // return the touching z given topo x,y and a tool profile
        const toolAtZ = this.toolAtZ = function(x,y) {
            let sx = stepsX,
                sy = stepsY,
                xl = sx - 1,
                yl = sy - 1;

            let gv, i = 0, mz = -Infinity;

            while (i < profile.length) {
                // tool profile point x, y, and z offsets
                const tx = profile[i++] + x;
                const ty = profile[i++] + y;
                const tz = profile[i++];
                if (tx < 0 || tx > xl || ty < 0 || ty > yl) {
                    // if outside max topo steps, use zMin
                    gv = zMin;
                } else {
                    // lookup grid value @ tx, ty
                    gv = data[tx * sy + ty] || zMin;
                }
                // update the rest
                mz = Math.max(tz + gv, mz);
            }

            return Math.max(mz, zMin);
        }

        // export z probe function
        const rx = stepsX / boundsX;
        const ry = stepsX / boundsX;
        const toolAtXY = this.toolAtXY = function(px, py) {
            px = Math.round(rx * (px - minX));
            py = Math.round(ry * (py - minY));
            return toolAtZ(px, py);
        };

        const zAtXY = this.zAtXY = function(px, py) {
            let ix = Math.round(rx * (px - minX));
            let iy = Math.round(ry * (py - minY));
            return data[ix * stepsY + iy] || zMin;
        };

    }

}

class Trace {

    constructor(probe, params) {

        const { curvesOnly, maxangle, flatness, bridge, contourX, leave } = params;

        this.params = params;
        this.probe = probe;

        let trace,
            slice,
            latent,
            lastPP,
            lastSlope;

        const newslice = this.newslice = () => {
            this.slice = slice = [];
        }

        const newtrace = this.newtrace = function() {
            trace = newPolygon().setOpen();
        }

        const end_poly = this.end_poly = function(point) {
            if (latent) {
                trace.push(latent);
            }
            if (trace.length > 0) {
                // add additional constraint on min perimeter()
                if (trace.length > 1) {
                    slice.push(trace);
                }
                newtrace();
            }
            lastPP = undefined;
            latent = undefined;
            lastSlope = undefined;
            if (point) {
                trace.push(point);
                lastPP = point;
            }
        }

        const log = function(map) {
            for (let key in map) {
                const val = map[key];
                if (typeof val === 'number') {
                    map[key] = val.round(4);
                }
            }
            console.log(...arguments);
        }

        const push_point = this.push_point = function(x, y, z) {
            const newP = newPoint(x, y, z);
            const lastP = lastPP;//trace.last();

            if (lastP) {
                const dl = (x - lastP.x) || (y - lastP.y);
                const dz = z - lastP.z;
                const slope = Math.atan2(dz, dl);
                if (curvesOnly && Math.abs(dz) < flatness) {
                    end_poly(newP);
                } else if (lastSlope !== undefined && Math.abs(lastSlope - slope) < 0.001) {
                    latent = newP;
                } else {
                    if (latent) {
                        trace.push(latent);
                        latent = undefined;
                    }
                    if (curvesOnly) {
                        const dv = contourX ? Math.abs(lastP.x - x) : Math.abs(lastP.y - y);
                        // const dz = lastPP.z - z;
                        const angle = Math.atan2( Math.abs(dz), dv) * RAD2DEG;
                        if (angle > maxangle) {
                            end_poly();
                        }
                    }
                    trace.push(newP);
                }
                lastSlope = slope;
            } else {
                trace.push(newP);
            }

            lastPP = newP;
        }

        const object = this.object = this;

        this.inClip = function (clips, checkZ, point) {
            for (let i=0; i<clips.length; i++) {
                let poly = clips[i];
                let zok = checkZ ? checkZ <= poly.z : true;
                object.tabZ = poly.z;
                if (zok && point.isInPolygon(poly)) {
                    return true;
                }
            }
            return false;
        }

    }

    init(params) {
        this.cross = params;
        const { minions } = kiri;
        const { clipTab, clipTabZ } = params;

        // because codec does not encode arbitrary fields
        // in this case, z is appended to clip tabs in topo constructor
        // we pass it as a side-channel and re-consitute here
        if (clipTab)
        for (let i=0, l=clipTab.length; i<l; i++) {
            clipTab[i].z = clipTabZ[i];
        }

        if (minions && this.cross.concurrent) {
            const { codec } = kiri;
            minions.broadcast("trace_init", codec.encode({
                probe: this.probe.params,
                trace: this.params,
                cross: params,
            }));
        }
    }

    cleanup() {
        const { minions } = kiri;

        if (minions && this.cross.concurrent) {
            minions.broadcast("trace_cleanup");
        }
    }

    crossY(params, then) {
        const { minions } = kiri;

        if (minions && this.cross.concurrent) {
            minions.queue({
                cmd: "trace_y",
                params
            }, data => {
                then(kiri.codec.decode(data.slice));
            });
        } else {
            this.crossY_sync(params, then);
        }
    }

    crossX(params, then) {
        const { minions } = kiri;

        if (minions && this.cross.concurrent) {
            minions.queue({
                cmd: "trace_x",
                params
            }, data => {
                then(kiri.codec.decode(data.slice));
            });
        } else {
            this.crossX_sync(params, then);
        }
    }

    crossY_sync(params, then) {
        const { push_point, end_poly, newtrace, newslice, inClip } = this.object;
        const { clipTab, tabHeight, clipTo, box, resolution, density, leave } = this.cross;
        const { toolAtZ } = this.probe;

        let { from, to, x, gridx, gridy } = params;

        const step = resolution * density;
        const checkr = newPoint(0,0);
        newslice();
        newtrace();
        for (let y = from; y < to; y += step) {
            if (y < box.min.y || y > box.max.y) {
                gridy += density;
                continue;
            }
            // find tool z at grid point
            let tv = toolAtZ(gridx, gridy);
            checkr.x = x;
            checkr.y = y;
            // when tabs are on and this point is inside the
            // tab polygon, ensure z is at least tabHeight
            if (clipTab && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                tv = this.tabZ;
            }
            // if the value is on the floor and inside the clip
            // poly (usually shadow), end the segment
            if (clipTo && !inClip(clipTo, undefined, checkr)) {
                end_poly();
                gridy += density;
                continue;
            }
            push_point(x, y, tv + leave);
            gridy += density;
        }
        end_poly();
        then(this.slice);
    }

    crossX_sync(params, then) {
        const { push_point, end_poly, newtrace, newslice, inClip } = this.object;
        const { clipTab, tabHeight, clipTo, box, resolution, density, leave } = this.cross;
        const { toolAtZ } = this.probe;
        let { from, to, y, gridx, gridy } = params;

        const step = resolution * density;
        const checkr = newPoint(0,0);
        newslice();
        newtrace();
        for (let x = from; x < to; x += step) {
            if (x < box.min.x || x > box.max.x) {
                gridx += density;
                continue;
            }
            // find tool z at grid point
            let tv = toolAtZ(gridx, gridy);
            checkr.x = x;
            checkr.y = y;
            // when tabs are on and this point is inside the
            // tab polygon, ensure z is at least tabHeight
            if (clipTab && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                tv = this.tabZ;
            }
            // if the value is on the floor and inside the clip
            // poly (usually shadow), end the segment
            if (clipTo && !inClip(clipTo, undefined, checkr)) {
                end_poly();
                gridx += density;
                continue;
            }
            push_point(x, y, tv + leave);
            gridx += density;
        }
        end_poly();
        then(this.slice);
    }
}

function raster_slice(inputs) {
    const { lines, data, box, resolution, curvesOnly } = inputs;
    const { flatness, zMin, minY, maxY, stepsY, gridx } = inputs;
    const { slice } = inputs;

    let gridy,
        gridi, // index
        gridv, // value
        i, il, j, x, y, tv;

    // filter lines pairs to only surface "up-facing", "uncovered" lines
    let points = [];
    // emit an array of valid line-pairs
    const len = lines.length;

    outer: for (let i=0; i<len; i++) {
        let l1 = lines[i], p1 = l1.p1, p2 = l1.p2;
        // eliminate vertical
        if (Math.abs(p1.y - p2.y) < flatness) continue;
        // eliminate if both points below cutoff
        if (p1.z < zMin && p2.z < zMin) continue;
        // sort p1,p2 by y for comparison
        if (p1.y > p2.y) { const tp = p1; p1 = p2; p2 = tp };
        // eliminate if points "under" other lines
        for (let j=0; j<len; j++) {
            // skip self and adjacent
            if (j >= i-1 && j <= i+1) continue;
            let l2 = lines[j], p3 = l2.p1, p4 = l2.p2;
            // sort p3,p4 by y for comparison
            if (p3.y > p4.y) { const tp = p3; p3 = p4; p4 = tp };
            // it's under the other line
            if (Math.max(p1.z,p2.z) < Math.min(p3.z,p4.z)) {
                // it's inside the other line, too, so skip
                if (p1.y >= p3.y && p2.y <= p4.y) continue outer;
            }
        }
        points.push(p1, p2);
        box.expandByPoint(p1);
        box.expandByPoint(p2);
    }

    gridy = 0;
    // rasterize one x slice
    for (y = minY; y < maxY && gridy < stepsY; y += resolution) {
        gridi = gridx * stepsY + gridy;
        gridv = data[gridi] || zMin;
        // strategy using raw lines (faster slice, but more lines)
        for (i=0, il=points.length; i<il; i += 2) {
            const p1 = points[i], p2 = points[i+1];
            // one endpoint above grid
            const crossz = (p1.z > gridv || p2.z > gridv);
            // segment crosses grid y
            const spansy = (p1.y <= y && p2.y >= y);
            if (crossz && spansy) {
                // compute intersection of z ray up
                // and segment at this grid point
                const dy = p1.y - p2.y,
                    dz = p1.z - p2.z,
                    pct = (p1.y - y) / dy,
                    nz = p1.z - (dz * pct);
                // save if point is greater than existing grid point
                if (nz > gridv) {
                    gridv = data[gridi] = Math.max(nz, zMin);
                    if (slice) slice.output()
                        .setLayer("heights", {face: 0, line: 0})
                        .addLine(
                            newPoint(p1.x, y, 0),
                            newPoint(p1.x, y, gridv)
                        );
                }
            }
        }
        gridy++;
    }

    // remove flat lines when curvesOnly
    if (curvesOnly) {
        let nup = [];
        for (let i=0, p=points, l=p.length; i<l; i += 2) {
            const p1 = p[i];
            const p2 = p[i+1];
            if (Math.abs(p1.z - p2.z) >= flatness) {
                nup.push(p1, p2);
            }
        }
        points = nup;
    }

    return points;
};

CAM.Topo = async function(opt) {
    return new Topo().generate(opt);
};

moto.broker.subscribe("minion.started", msg => {
    const { funcs, cache, reply, log } = msg;

    funcs.topo_raster = (data, seq) => {
        const { id, slice, params } = data;
        const { resolution } = params;
        const vertices = cache[id];
        const box = new THREE.Box2();
        new kiri.topo_slicer(slice.index)
            .setFromArray(vertices, slice)
            .slice(resolution)
            .forEach(rec => {
                const { z, index, lines } = rec;

                for (let line of lines) {
                    const { p1, p2 } = line;
                    if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                    if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                }

                raster_slice({
                    ...params,
                    box,
                    lines,
                    gridx: index
                });
            });
        // only pass back bounds of rasters to be merged
        reply({ seq, box });
    };

    funcs.trace_init = data => {
        const { cache } = self;
        const { codec } = kiri;
        data.cross.clipTo = codec.decode(data.cross.clipTo);
        data.cross.clipTab = codec.decode(data.cross.clipTab);
        const probe = new Probe(data.probe);
        const trace = new Trace(probe, data.trace);
        cache.trace = {
            probe,
            trace,
            cross: data.cross
        };
        trace.init(data.cross);
    };

    funcs.trace_y = (data, seq) => {
        const { cache } = self;
        const { trace } = cache.trace;
        trace.crossY_sync(data.params, slice => {
            slice = kiri.codec.encode(slice);
            reply({ seq, slice });
        });
    };

    funcs.trace_x = (data, seq) => {
        const { cache } = self;
        const { trace } = cache.trace;
        trace.crossX_sync(data.params, slice => {
            slice = kiri.codec.encode(slice);
            reply({ seq, slice });
        });
    };

    funcs.trace_cleanup = () => {
        delete cache.trace;
    };
});

});
