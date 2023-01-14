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
const { polygons, newLine, newSlope, newPoint, newPolygon } = base;

const PRO = CAM.process;
const POLY = polygons;
const RAD2DEG = 180 / Math.PI;

class Topo {
    constructor() { }

    async generate(opt = {}) {
        let { state, contour, onupdate, ondone } = opt;
        let { widget, settings, tshadow, center, tabs, color } = opt.state;

        let { controller, process } = settings,
            density = parseInt(controller.animesh || 100) * 2500,
            axis = contour.axis.toLowerCase(),
            contourX = axis === "x",
            contourY = axis === "y",
            bounds = widget.getBoundingBox().clone(),
            tolerance = contour.tolerance,
            flatness = contour.flatness || 0.005,
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
            resolution = tolerance ? tolerance : 1/Math.sqrt(density/(boundsX * boundsY)),
            tool = new CAM.Tool(settings, contour.tool),
            toolOffset = tool.generateProfile(resolution).profile,
            toolDiameter = tool.fluteDiameter(),
            toolStep = toolDiameter * contour.step,
            traceJoin = toolDiameter / 2,
            maxangle = contour.angle,
            curvesOnly = contour.curves,
            bridge = contour.bridging || 0,
            // R2A = 180 / Math.PI,
            stepsX = Math.ceil(boundsX / resolution),
            stepsY = Math.ceil(boundsY / resolution),
            widtopo = widget.topo,
            topoCache = widtopo && widtopo.resolution === resolution ? widtopo : undefined,
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

        const probe = new Probe({
            profile: toolOffset,
            data,
            stepsX,
            stepsY,
            boundsX,
            boundsY,
            zMin
        });

        const { toolAtZ, toolAtXY, zAtXY } = probe;

        this.toolAtZ = toolAtZ;
        this.toolAtXY = toolAtXY;
        this.zAtXY = zAtXY;

        function contouring() {
            let gridx = 0,
                gridy,
                gridi, // index
                gridv, // value
                i, il, j, x, y, tv,
                stepsTaken = 0,
                stepsTotal = 0;

            if (contourX) {
                stepsTotal += ((maxX - minX + partOff * 2) / toolStep) | 0;
            }

            if (contourY) {
                stepsTotal += ((maxY - minY + partOff * 2) / toolStep) | 0;
            }

            const box = topo.box.clone().expandByVector(new THREE.Vector3(
                partOff, partOff, 0
            ));

            const trace = new Trace({
                probe,
                curvesOnly,
                maxangle,
                flatness
            });

            if (contourY) {
                // emit slice per X
                for (x = minX - partOff; x <= maxX + partOff; x += toolStep) {
                    if (x < box.min.x || x > box.max.x) continue;
                    gridx = Math.round(((x - minX) / boundsX) * stepsX);
                    gridy = -gridDelta;

                    const segments = trace.crossY({
                        from: minY - partOff,
                        to: maxY + partOff,
                        step: resolution,
                        box,
                        x,
                        gridx,
                        gridy,
                        clipTo,
                        clipTab,
                        tabHeight
                    });

                    if (segments.length > 0) {
                        let slice = newSlice(gridx);
                        slice.camLines = segments;
                        slice.output()
                            .setLayer("contour y", {face: color, line: color})
                            .addPolys(segments);
                        newslices.push(slice);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour y");
                }
            }

            if (contourX) {
                // emit slice per Y
                for (y = minY - partOff; y <= maxY + partOff; y += toolStep) {
                    if (y < box.min.y || y > box.max.y) continue;
                    gridy = Math.round(((y - minY) / boundsY) * stepsY);
                    gridx = -gridDelta;

                    const segments = trace.crossX({
                        from: minX - partOff,
                        to: maxX + partOff,
                        step: resolution,
                        box,
                        y,
                        gridx,
                        gridy,
                        clipTo,
                        clipTab,
                        tabHeight
                    });

                    if (segments.length > 0) {
                        let slice = newSlice(gridy);
                        slice.camLines = segments;
                        slice.output()
                            .setLayer("contour x", {face: color, line: color})
                            .addPolys(segments);
                        newslices.push(slice);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour x");
                }
            }
        }

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
            await this.topo_raster(widget, params);
            topo.raster = false;
        }

        contouring();
        ondone(newslices);

        return this;
    }

    async topo_raster(widget, params) {
        const { resolution } = params;

        console.log({ topo_raster: widget, resolution });

        const dispatch = kiri.worker;
        const minions = kiri.minions;
        const vertices = widget.getGeoVertices().toShared();
        const range = { min: Infinity, max: -Infinity };
        const { box } = params;

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
        console.log({ shards, range, step, slices });

        // define sharded ranges
        if (minions.running > 1) {

            console.time('topo raster minion');
            dispatch.putCache({ key: widget.id, data: vertices }, { done: data => {
                // console.log({ put_cache_done: data });
            }});

            let promises = slices.map((slice, index) => {
                return new Promise(resolve => {
                    minions.queue({
                        cmd: "topo_raster",
                        id: widget.id,
                        params,
                        slice
                    }, data => {
                        resolve(data);
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

            dispatch.clearCache({}, { done: data => {
                // console.log({ clear_cache_done: data });
            }});
            console.timeEnd('topo raster minion');

        } else {

            console.time('topo raster');
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
            }
            console.timeEnd('topo raster');

        }
    }
}

class Probe {

    constructor(params) {

        const { data, profile } = params;
        const { stepsX, stepsY, boundsX, boundsY, zMin } = params;

        // return the touching z given topo x,y and a tool profile
        const toolAtZ = this.toolAtZ = function(x,y) {
            let sx = stepsX,
                sy = stepsY,
                xl = sx - 1,
                yl = sy - 1;

            let tx, ty, tz, gv, i = 0, mz = -1;

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

            return Math.max(mz, 0);
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

    constructor(params) {

        const { probe, curvesOnly, maxangle, flatness } = params;

        this.probe = probe;

        let trace,
            slice,
            latent,
            lastP;

        const newslice = this.newslice = () => {
            this.slice = slice = [];
        }

        const push_point = this.push_point = function(x, y, z) {
            const newP = newPoint(x, y, z);
            // todo: merge co-linear, not just co-planar
            if (lastP && Math.abs(lastP.z - z) < flatness) {
                if (curvesOnly) {
                    if ((trace.last() || lastP).distTo2D(newP) >= bridge) {
                        end_poly();
                    }
                } else {
                    latent = newP;
                }
            } else {
                if (latent) {
                    trace.push(latent);
                    latent = null;
                }
                if (curvesOnly && lastP) {
                    // maxangle
                    const dz = Math.abs(lastP.z - z);
                    const dv = contourX ? Math.abs(lastP.x - x) : Math.abs(lastP.y - y);
                    const angle = Math.atan2(dz, dv) * RAD2DEG;
                    // if (lastP.z < 0.1) console.log('pp', {dz, dxy, angle});
                    if (angle > maxangle) {
                        lastP = newP;
                        return;
                    }
                }
                trace.push(newP);
            }
            lastP = newP;
        }

        const end_poly = this.end_poly = function() {
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
            latent = undefined;
            lastP = undefined;
        }

        const newtrace = this.newtrace = function() {
            trace = newPolygon().setOpen();
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

    crossY(params) {
        const { push_point, end_poly, newtrace, newslice, inClip } = this.object;
        const { toolAtZ, toolAtXY, zAtXY } = this.probe;
        let { from, to, step, box, x, gridx, gridy } = params;
        let { clipTab, tabHeight, clipTo } = params;
        const checkr = newPoint(0,0);
        newslice();
        newtrace();
        for (let y = from; y < to; y += step) {
            if (y < box.min.y || y > box.max.y) {
                gridy++;
                continue;
            }
            // find tool z at grid point
            let tv = toolAtZ(gridx, gridy);
            checkr.x = x;
            checkr.y = y;
            // when tabs are on and this point is inside the
            // tab polygon, ensure z is at least tabHeight
            if (clipTab && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                tv = trace.tabZ;
            }
            // if the value is on the floor and inside the clip
            // poly (usually shadow), end the segment
            if (clipTo && !inClip(clipTo, undefined, checkr)) {
                end_poly();
                gridy++;
                continue;
            }
            push_point(x, y, tv);
            gridy++;
        }
        end_poly();
        return this.slice;
    }

    crossX(params) {
        const { push_point, end_poly, newtrace, newslice, inClip } = this.object;
        const { toolAtZ, toolAtXY, zAtXY } = this.probe;
        let { from, to, step, box, y, gridx, gridy } = params;
        let { clipTab, tabHeight, clipTo } = params;
        const checkr = newPoint(0,0);
        newslice();
        newtrace();
        for (let x = from; x < to; x += step) {
            if (x < box.min.x || y > box.max.x) {
                gridx++;
                continue;
            }
            // find tool z at grid point
            let tv = toolAtZ(gridx, gridy);
            checkr.x = x;
            checkr.y = y;
            // when tabs are on and this point is inside the
            // tab polygon, ensure z is at least tabHeight
            if (clipTab && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                tv = trace.tabZ;
            }
            // if the value is on the floor and inside the clip
            // poly (usually shadow), end the segment
            if (clipTo && !inClip(clipTo, undefined, checkr)) {
                end_poly();
                gridx++;
                continue;
            }
            push_point(x, y, tv);
            gridx++;
        }
        end_poly();
        return this.slice;
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
        gridv = data[gridi] || 0;
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
    // console.log({ cam_slicer2_minion: msg });
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
});

});
