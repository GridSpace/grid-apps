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
            R2A = 180 / Math.PI,
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

        let newtrace,
            sliceout,
            latent,
            lastP,
            slice, lx, ly,
            startTime = time(),
            stepsTaken = 0,
            stepsTotal = 0;

        // return the touching z given topo x,y and a tool profile
        function toolAtZ(x,y) {
            const profile = toolOffset,
                sx = stepsX,
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
                    gv = topo.data[tx * sy + ty] || zMin;
                }
                // update the rest
                mz = Math.max(tz + gv, mz);
            }

            return Math.max(mz, 0);
        }

        // export z probe function
        const rx = stepsX / boundsX;
        const ry = stepsX / boundsX;
        this.toolAtXY = function(px, py) {
            px = Math.round(rx * (px - minX));
            py = Math.round(ry * (py - minY));
            return toolAtZ(px, py);
        };

        const zAtXY = this.zAtXY = function(px, py) {
            let ix = Math.round(rx * (px - minX));
            let iy = Math.round(ry * (py - minY));
            return topo.data[ix * stepsY + iy] || zMin;
        };

        function push_point(x,y,z) {
            const newP = newPoint(x,y,z);
            // todo: merge co-linear, not just co-planar
            if (lastP && Math.abs(lastP.z - z) < flatness) {
                if (curvesOnly) {
                    if ((newtrace.last() || lastP).distTo2D(newP) >= bridge) {
                        end_poly();
                    }
                } else {
                    latent = newP;
                }
            } else {
                if (latent) {
                    newtrace.push(latent);
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
                newtrace.push(newP);
            }
            lastP = newP;
        }

        function end_poly() {
            if (latent) {
                newtrace.push(latent);
            }
            if (newtrace.length > 0) {
                // add additional constraint on min perimeter()
                if (newtrace.length > 1) {
                    sliceout.push(newtrace);
                }
                newtrace = newPolygon().setOpen();
            }
            latent = undefined;
            lastP = undefined;
        }

        function rastering(slices) {
            if (!topo.raster) {
                console.log(widget.id, 'topo raster cached');
                return topo.box;
            }

            topo.raster = false;
            topo.box = new THREE.Box2();

            let gridx = 0;
            for (let slice of slices) {
                newslices.push(slice);
                slice.points = raster_slice({
                    lines: slice.lines,
                    box: topo.box,
                    data,
                    resolution,
                    curvesOnly,
                    flatness,
                    zMin,
                    minY,
                    maxY,
                    stepsY,
                    slice,
                    gridx: gridx++
                });
                onupdate(++stepsTaken, stepsTotal, "raster surface");
            }

        }

        function contouring(slices) {
            let gridx = 0,
                gridy,
                gridi, // index
                gridv, // value
                i, il, j, jl, x, y, tv, ltv;

            const box = topo.box.expandByVector(new THREE.Vector3(
                partOff, partOff, 0
            ));

            const checkr = newPoint(0,0);
            const inClip = function(polys, checkZ) {
                checkr.x = x;
                checkr.y = y;
                for (let i=0; i<polys.length; i++) {
                    let poly = polys[i];
                    let zok = checkZ ? checkZ <= poly.z : true;
                    tabZ = poly.z;
                    if (zok && checkr.isInPolygon(poly)) {
                        return true;
                    }
                }
                return false;
            };
            let tabZ;

            if (contourY) {
                startTime = time();
                // emit slice per X
                for (x = minX - partOff; x <= maxX + partOff; x += toolStep) {
                    if (x < box.min.x || x > box.max.x) continue;
                    gridx = Math.round(((x - minX) / boundsX) * stepsX);
                    ly = gridy = -gridDelta;
                    slice = newSlice(gridx);
                    newtrace = newPolygon().setOpen();
                    sliceout = [];
                    for (y = minY - partOff; y < maxY + partOff; y += resolution) {
                        if (y < box.min.y || y > box.max.y) {
                            gridy++;
                            continue;
                        }
                        // find tool z at grid point
                        tv = toolAtZ(gridx, gridy);
                        // when tabs are on and this point is inside the
                        // tab polygon, ensure z is at least tabHeight
                        if (tabsOn && tv < tabHeight && inClip(clipTab, tv)) {
                            tv = tabZ;//tabHeight;
                        }
                        // if the value is on the floor and inside the clip
                        // poly (usually shadow), end the segment
                        if (clipTo && !inClip(clipTo)) {
                            end_poly();
                            gridy++;
                            ly = -gridDelta;
                            continue;
                        }
                        push_point(x,y,tv);
                        ly = y;
                        ltv = tv;
                        gridy++;
                    }
                    end_poly();
                    if (sliceout.length > 0) {
                        newslices.push(slice);
                        slice.camLines = sliceout;
                        slice.output()
                            .setLayer("contour y", {face: color, line: color})
                            .addPolys(sliceout);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour y");
                }
            }

            if (contourX) {
                startTime = time();
                // emit slice per Y
                for (y = minY - partOff; y <= maxY + partOff; y += toolStep) {
                    if (y < box.min.y || y > box.max.y) continue;
                    gridy = Math.round(((y - minY) / boundsY) * stepsY);
                    lx = gridx = -gridDelta;
                    slice = newSlice(gridy);
                    newtrace = newPolygon().setOpen();
                    sliceout = [];
                    for (x = minX - partOff; x <= maxX + partOff; x += resolution) {
                        if (x < box.min.x || x > box.max.x) {
                            gridx++;
                            continue;
                        }
                        tv = toolAtZ(gridx, gridy);
                        if (tabsOn && tv < tabHeight && inClip(clipTab, tv)) {
                            tv = tabZ;
                        }
                        if (clipTo && !inClip(clipTo)) {
                            end_poly();
                            gridx++;
                            lx = -gridDelta;
                            continue;
                        }
                        push_point(x,y,tv);
                        lx = x;
                        ltv = tv;
                        gridx++;
                    }
                    end_poly();
                    if (sliceout.length > 0) {
                        newslices.push(slice);
                        slice.camLines = sliceout;
                        slice.output()
                            .setLayer("contour x", {face: color, line: color})
                            .addPolys(sliceout);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour x");
                }
            }
        }

        const params = {
            resolution,
            curvesOnly,
            flatness,
            stepsY,
            minY,
            maxY,
            zMin,
            data
        };

        const slices2 = await this.topo_slice(widget, params);

        rastering(slices2);
        contouring(slices2);
        ondone(newslices);

        return this;
    }

    async topo_slice(widget, params) {
        const { resolution } = params;

        console.log({ topo_slice: widget, resolution });

        const dispatch = kiri.worker;
        const minions = kiri.minions;
        const vertices = widget.getGeoVertices().toShared();
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
        console.log({ shards, range, step, slices });

        // define sharded ranges
        if (minions.running > 1) {

            console.time('new topo slice minion');
            dispatch.putCache({ key: widget.id, data: vertices }, { done: data => {
                // console.log({ put_cache_done: data });
            }});

            let ps = slices.map((slice, index) => {
                return new Promise(resolve => {
                    minions.queue({
                        cmd: "topo_slice",
                        id: widget.id,
                        params,
                        slice
                    }, data => {
                        resolve(data);
                    });
                });
            });

            slices = (await Promise.all(ps))
                .map(rec => rec.res)
                .flat()
                .sort((a,b) => a[0] - b[0])
                .map(rec => {
                    let slice = kiri.newSlice(rec[0]);
                    slice.index = rec[1];
                    let lines = slice.lines = [];
                    for (let i=2, l=rec.length; i<l; ) {
                        lines.push(
                            base.newLine(
                                base.newPoint(rec[i++], rec[i++], rec[i++]),
                                base.newPoint(rec[i++], rec[i++], rec[i++])
                            )
                        );
                    }
                    return slice;
                });

            dispatch.clearCache({}, { done: data => {
                // console.log({ clear_cache_done: data });
            }});
            console.timeEnd('new topo slice minion');
            return slices;

        } else {

            console.time('new topo slice');
            // iterate over shards, merge output
            const output = [];
            for (let slice of slices) {
                const res = new kiri.topo_slicer(slice.index)
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
                        return slice;
                    });
                output.appendAll(res);
            }
            output.sort((a,b) => a.z - b.z);
            console.timeEnd('new topo slice');
            return output;

        }
    }
}

function raster_slice(inputs) {
    const { lines, data, box, resolution, curvesOnly } = inputs;
    const { flatness, zMin, minY, maxY, stepsY, gridx } = inputs;
    const { slice } = inputs;

    let gridy,
        gridi, // index
        gridv, // value
        i, il, j, jl, x, y, tv, ltv;

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

    funcs.topo_slice = (data, seq) => {
        const { id, slice, params } = data;
        const { resolution } = params;
        const vertices = cache[id];
        const res = new kiri.topo_slicer(slice.index)
            .setFromArray(vertices, slice)
            .slice(resolution)
            .map(rec => {
                const { z, index, lines } = rec;

                const ret = [ z, index ];
                for (let line of lines) {
                    const { p1, p2 } = line;
                    if (!p1.swapped) { p1.swapXZ(); p1.swapped = true }
                    if (!p2.swapped) { p2.swapXZ(); p2.swapped = true }
                    ret.push(p1.x, p1.y, p1.z);
                    ret.push(p2.x, p2.y, p2.z);
                }

                // const box = new THREE.Box2();
                // const points = raster_slice({
                //     ...params,
                //     box,
                //     lines,
                //     gridx: index
                // });
                // console.log({ box, points });

                return ret;
            });
        reply({ seq, res });
    };
});

});
