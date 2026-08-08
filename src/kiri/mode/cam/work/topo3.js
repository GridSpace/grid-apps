/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { codec } from '../../../core/codec.js';
import { newPoint } from '../../../../geo/point.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { newSlice } from '../../../core/slice.js';
import { Slicer as topo_slicer } from './slicer-topo.js';
import { polygons as POLY } from '../../../../geo/polygons.js';
import { Tool } from '../core/tool.js';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export class Topo {
    constructor() { }

    async generate(opt = {}) {
        let { state, contour, onupdate, ondone } = opt;
        let { widget, settings, shadow, tabs } = opt.state;

        let { controller, process } = settings,
            { webGPU } = controller,
            { workarea } = state,
            animesh = parseInt(controller.animesh || 100) * 2500,
            axis = contour.axis.toLowerCase(),
            contourX = axis === "x",
            contourY = axis === "y",
            contourR = axis === "radial",
            bounds = widget.getBoundingBox().clone(),
            tolerance = contour.tolerance,
            flatness = contour.flatness || (tolerance / 100),
            minX = bounds.min.x,
            maxX = bounds.max.x,
            minY = bounds.min.y,
            maxY = bounds.max.y,
            zBottom = contour.bottom ? workarea.bottom_z : 0,
            zMin = workarea.bottom_z + 0.0001,
            boundsX = maxX - minX,
            boundsY = maxY - minY,
            inside = contour.inside,
            density = 1 + (contour.reduction || 0),
            resolution = (tolerance ? tolerance : 1 / Math.sqrt(animesh / (boundsX * boundsY))).round(5),
            tool = new Tool(settings, contour.tool),
            toolOffset = tool.generateProfile(resolution).profile,
            toolDiameter = tool.fluteDiameter(),
            toolStep = toolDiameter * contour.step,
            leave = contour.leave || 0,
            maxangle = contour.angle,
            curvesOnly = contour.curves,
            curvesDistFraction = (contour.curvesDist !== undefined) ? contour.curvesDist : 0.5,
            curvesDist = curvesDistFraction * toolDiameter,
            bridge = contour.bridging || 0,
            stepsX = Math.ceil(boundsX / resolution),
            stepsY = Math.ceil(boundsY / resolution),
            widtopo = widget.topo,
            topoCache = widtopo
                && widtopo.tolerance === tolerance
                && widtopo.diameter === toolDiameter
                ? widtopo : undefined,
            topo = widget.topo = topoCache || {
                axis,
                data: new Float32Array(new SharedArrayBuffer(stepsX * stepsY * 4)),
                stepsX,
                stepsY,
                bounds,
                diameter: toolDiameter,
                resolution,
                tolerance,
                profile: toolOffset,
                widget,
                raster: true,
                slices: null
            },
            data = topo.data,
            newslices = [],
            tabsMax = tabs ? Math.max(...tabs.map(tab => tab.dim.z / 2 + tab.pos.z)) : 0,
            tabsOn = tabs,
            tabHeight = Math.max(process.camTabsHeight + zBottom, tabsMax),
            clipTab = tabsOn ? [] : null,
            shadowBase = (contour.omitthru && shadow.holes) ? omitMatching(shadow.base, shadow.holes) : shadow.base,
            clipTo = inside ? shadowBase : POLY.expand(shadowBase, toolDiameter / 2 + (contourR ? toolStep : 0) + resolution * 3),
            partOff = inside ? 0 : toolDiameter / 2 + resolution,
            gridDelta = Math.floor(partOff / resolution),
            debug_clips = true;

        let clipStock = undefined;
        if (contour.clipto) {
            let { stock } = settings;
            let { center, x, y } = stock;
            let stockPoly = newPolygon().centerRectangle(center, x, y);
            if (webGPU && !contour.nogpu && !contourR) {
                clipTo.push(stockPoly);
            } else {
                clipStock = [ stockPoly ];
            }
        }

        if (tolerance === 0 && !topoCache) {
            console.log(widget.id, 'topo auto tolerance', resolution.round(4));
        }

        // console.log({ resolution, flatness });
        // used by Pocket -> Contour
        this.tolerance = resolution;

        if (tabsOn) {
            clipTab.appendAll(tabs.map(tab => {
                let ctab = POLY.expand([tab.poly], toolDiameter / 2);
                ctab.forEach(ct => ct.z = tab.dim.z / 2 + tab.pos.z);
                return ctab;
            }).flat());
        }

        // debug clipTab and clipTo
        if (debug_clips) {
            const debug = newSlice(-1);
            const output = debug.output();
            if (clipTab) output.setLayer("clip.tab", { line: 0xff0000 }).addPolys(clipTab);
            if (clipTo) output.setLayer("clip.to", { line: 0x00dd00 }).addPolys(clipTo);
            if (clipStock) output.setLayer("clip.stock", { line: 0xdd00dd }).addPolys(clipStock);
            newslices.push(debug);
        }

        if (webGPU && !contour.nogpu) {
            // invert tool Z offset for gpu code
            let toolBounds = new THREE.Box3()
                .expandByPoint({ x: -toolDiameter/2, y: -toolDiameter/2, z: 0 })
                .expandByPoint({ x: toolDiameter/2, y: toolDiameter/2, z: 0 });
            let toolPos = tool.profile.slice();
            for (let i=0; i<toolPos.length; i+= 3) {
                // toolPos[i+2] = -toolPos[i+2];
                toolBounds.expandByPoint({ x: toolPos[i], y: toolPos[i+1], z: toolPos[i+2] });
            }
            let toolData = { positions: toolPos, bounds: toolBounds };

            let vertices = widget.getGeoVertices({ unroll: true, translate: true });
            let wbounds = widget.getBoundingBox();
            if (!inside) {
                wbounds.expandByVector({ x: toolDiameter/2 + resolution, y: toolDiameter/2 + resolution, z: 0 });
            }

            // swap XY vertices (unswap later after polylines generated)
            if (contourY) {
                vertices = vertices.slice();
                for (let i=0; i<vertices.length; i+= 3) {
                    let tmp = vertices[i+1];
                    vertices[i+1] = vertices[i+0];
                    vertices[i+0] = tmp;
                }
                ['min','max'].forEach(ext => {
                    ext = wbounds[ext];
                    let tmp = ext.x;
                    ext.x = ext.y;
                    ext.y = tmp;
                });
            }

            let trace = contour.trace;
            let gpu = await self.get_raster_gpu({
                mode: contourR ? "tracing" : (trace ? "tracing" : "planar"),
                resolution
            });
            let xStep = density;
            let yStep = Math.ceil(toolStep / resolution);
            let epsilon = 10e-4;
            // load the pre-generated tool profile
            await gpu.loadTool({
                sparseData: toolData
            });
            // rasterize the terrain to the same resolution
            let terrain = await gpu.loadTerrain({
                triangles: vertices,
                boundsOverride: wbounds
            });
            let { gridWidth, positions } = terrain;

            // Map GPU row-major positions to CPU column-major data
            const rx = stepsX / boundsX;
            const ry = stepsY / boundsY;
            const grx = 1 / resolution;
            const gridHeight = Math.ceil((wbounds.max.y - wbounds.min.y) / resolution) + 1;
            for (let ix = 0; ix < stepsX; ix++) {
                for (let iy = 0; iy < stepsY; iy++) {
                    const px = minX + ix / rx;
                    const py = minY + iy / ry;
                    const gix = Math.round((px - wbounds.min.x) * grx);
                    const giy = Math.round((py - wbounds.min.y) * grx);
                    if (gix >= 0 && gix < gridWidth && giy >= 0 && giy < gridHeight) {
                        const val = positions[giy * gridWidth + gix];
                        data[ix * stepsY + iy] = (val === undefined || val <= -1e9) ? zMin : val;
                    } else {
                        data[ix * stepsY + iy] = zMin;
                    }
                }
            }

            // Run through-hole capping on CPU data if omitthru is enabled
            if (contour.omitthru && shadow.holes && shadow.holes.length) {
                const rx_cap = stepsX / boundsX;
                for (let hole of shadow.holes) {
                    const expHole = POLY.expand([hole], resolution * 1.5)[0];
                    if (!expHole) continue;
                    const hbounds = expHole.bounds;
                    const min_ix = Math.max(0, Math.floor(rx_cap * (hbounds.minx - minX)));
                    const max_ix = Math.min(stepsX - 1, Math.ceil(rx_cap * (hbounds.maxx - minX)));
                    const min_iy = Math.max(0, Math.floor(rx_cap * (hbounds.miny - minY)));
                    const max_iy = Math.min(stepsY - 1, Math.ceil(rx_cap * (hbounds.maxy - minY)));

                    for (let ix = min_ix; ix <= max_ix; ix++) {
                        for (let iy = min_iy; iy <= max_iy; iy++) {
                            const idx = ix * stepsY + iy;
                            if (data[idx] < zMin + 0.1) {
                                const px = minX + ix / rx_cap;
                                const py = minY + iy / rx_cap;
                                const pt = newPoint(px, py);
                                if (pt.isInPolygon(expHole)) {
                                    let edgePt = null;
                                    edgePt = hole.findClosestPointOnPerimeter(pt);
                                    let outsidePt = edgePt;
                                    const d = pt.distTo2D(edgePt);
                                    if (d > 0.00001) {
                                        const dx = (edgePt.x - pt.x) / d;
                                        const dy = (edgePt.y - pt.y) / d;
                                        outsidePt = newPoint(edgePt.x + dx * (resolution * 0.5), edgePt.y + dy * (resolution * 0.5));
                                    }
                                    let edge_ix = Math.max(0, Math.min(stepsX - 1, Math.round(rx_cap * (outsidePt.x - minX))));
                                    let edge_iy = Math.max(0, Math.min(stepsY - 1, Math.round(rx_cap * (outsidePt.y - minY))));

                                    if (edge_ix === ix && edge_iy === iy) {
                                        const step_x = Math.sign(outsidePt.x - pt.x) || 0;
                                        const step_y = Math.sign(outsidePt.y - pt.y) || 0;
                                        let nx = Math.max(0, Math.min(stepsX - 1, ix + step_x));
                                        let ny = Math.max(0, Math.min(stepsY - 1, iy + step_y));
                                        if (nx !== ix || ny !== iy) {
                                            edge_ix = nx;
                                            edge_iy = ny;
                                        }
                                    }
                                    data[idx] = data[edge_ix * stepsY + edge_iy];
                                }
                            }
                        }
                    }
                }
            }

            // Initialize probe on Topo instance for CPU-side trace verification/fallbacks
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

            this.toolAtZ = probe.toolAtZ;
            this.toolAtXY = probe.toolAtXY;
            this.zAtXY = probe.zAtXY;

            // Generate 2D radial paths on the CPU if in Radial mode
            let radial2DPaths = [];
            let radialStep = resolution * density;
            if (contourR) {
                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const partOff = inside ? 0 : toolDiameter / 2 + resolution;
                const dx = maxX - centerX + partOff;
                const dy = maxY - centerY + partOff;
                const maxR = Math.sqrt(dx * dx + dy * dy);
                const shape = (contour.shape || 'Concentric').toLowerCase();
                const isConcentricLike = shape === 'concentric' || shape === 'spiral' || shape === 'concentric spiral' || shape === 'contour spiral';
                const isSpiralLike = shape === 'spiral' || shape === 'concentric spiral' || shape === 'contour spiral';

                if (isConcentricLike) {
                    if (clipTo && clipTo.length) {
                        let outs = [];
                        POLY.offset(clipTo, -toolStep, { count: 999, outs: outs, flat: true, z: 0, minArea: 0.01 });

                        let loops = [];
                        for (let i = outs.length - 1; i >= 0; i--) {
                            loops.push(outs[i].clone(true));
                        }
                        for (let poly of clipTo) {
                            loops.push(poly.clone(true));
                        }
                        loops = POLY.flatten(loops, [], true);

                        if (isSpiralLike) {
                            loops = POLY.spiralize(loops);
                        }

                        for (let poly of loops) {
                            const points = poly.points;
                            const numPoints = points.length;
                            if (numPoints < 2) continue;

                            let subPoints = [];
                            const limit = poly.open ? numPoints - 1 : numPoints;
                            for (let i = 0; i < limit; i++) {
                                const p1 = points[i];
                                const p2 = points[(i + 1) % numPoints];
                                const len = p1.distTo2D(p2);

                                if (len > radialStep) {
                                    const divisions = Math.ceil(len / radialStep);
                                    for (let j = 0; j < divisions; j++) {
                                        const pct = j / divisions;
                                        subPoints.push(p1.x + (p2.x - p1.x) * pct, p1.y + (p2.y - p1.y) * pct);
                                    }
                                } else {
                                    subPoints.push(p1.x, p1.y);
                                }
                            }
                            if (poly.open && numPoints > 0) {
                                let lastP = points[numPoints - 1];
                                subPoints.push(lastP.x, lastP.y);
                            }
                            radial2DPaths.push(new Float32Array(subPoints));
                        }
                    }
                }
            }

            let output;
            if (contourR) {
                if (radial2DPaths.length === 0) {
                    gpu.terminate();
                    ondone([], this);
                    return this;
                }
                output = await gpu.generateToolpaths({
                    paths: radial2DPaths,
                    step: radialStep,
                    zFloor: zBottom - 1,
                    onProgress(pct) { onupdate(pct/100, 100) }
                });
            } else {
                output = await gpu.generateToolpaths({
                    xStep,
                    yStep,
                    zFloor: zBottom - 1,
                    onProgress(pct) { console.log({ pct }); onupdate(pct/100, 100) }
                });
            }

            if (contourR) {
                // Post-process the 3D paths on CPU
                gpu.terminate();
                let slices = [];
                let checkr = newPoint(0, 0);

                this.trace = new Trace(this.probe, {
                     curvesOnly,
                     curvesDist,
                     maxangle,
                     flatness,
                     bridge,
                     contourX,
                     contourR,
                     leave,
                     resolution,
                     holes: (contour.omitthru && shadow.holes && shadow.holes.length) ? shadow.holes : null
                 });

                this.trace.init({
                    box: wbounds.clone(),
                    leave,
                    clipTo,
                    clipStock,
                    clipTab,
                    clipTabZ: clipTab ? clipTab.map(t => t.z) : undefined,
                    tabHeight,
                    resolution,
                    concurrent: false,
                    density
                });

                this.trace.newslice();

                const shape = (contour.shape || 'Concentric').toLowerCase();
                let loopIdx = 0;

                for (let pathXYZ of output.paths) {
                    let points = [];
                    for (let i = 0; i < pathXYZ.length; i += 3) {
                        points.push({ x: pathXYZ[i], y: pathXYZ[i+1], z: pathXYZ[i+2] });
                    }

                    if (shape === 'concentric') {
                        let evaluated = [];
                        let hasOut = false;
                        for (let pt of points) {
                            checkr.x = pt.x;
                            checkr.y = pt.y;

                            const inStock = !clipStock || this.trace.inClip(clipStock, undefined, checkr);
                            const inShadow = !clipTo || this.trace.inClip(clipTo, undefined, checkr);
                            const inClipPos = inStock && inShadow;

                            if (!inClipPos) {
                                hasOut = true;
                                evaluated.push({ x: pt.x, y: pt.y, z: 0, inClip: false });
                            } else {
                                let tv = Math.max(pt.z, this.probe.zAtXY(pt.x, pt.y));
                                if (clipTab && clipTab.length && tv < tabHeight && this.trace.inClip(clipTab, tv, checkr)) {
                                    tv = this.trace.tabZ;
                                }
                                evaluated.push({ x: pt.x, y: pt.y, z: tv, inClip: true });
                            }
                        }

                        if (hasOut) {
                            let firstOutIdx = evaluated.findIndex(p => !p.inClip);
                            let rotated = [...evaluated.slice(firstOutIdx), ...evaluated.slice(0, firstOutIdx)];

                            let tracing = false;
                            for (let pt of rotated) {
                                if (pt.inClip) {
                                    if (!tracing) {
                                        this.trace.newtrace();
                                        tracing = true;
                                        this.trace.setLoopIndex(loopIdx);
                                    }
                                    this.trace.push_point(pt.x, pt.y, pt.z + leave);
                                } else {
                                    if (tracing) {
                                        this.trace.end_poly();
                                        tracing = false;
                                    }
                                }
                            }
                            if (tracing) {
                                this.trace.end_poly();
                            }
                        } else {
                            this.trace.newtrace();
                            this.trace.setClosed();
                            this.trace.setLoopIndex(loopIdx);

                            const lastPt = evaluated[evaluated.length - 1];
                            if (lastPt) {
                                this.trace.setLastPoint(newPoint(lastPt.x, lastPt.y, lastPt.z + leave));
                            }
                            for (let pt of evaluated) {
                                this.trace.push_point(pt.x, pt.y, pt.z + leave);
                            }
                            this.trace.end_poly();
                        }
                    } else {
                        let tracing = false;
                        this.trace.newtrace();

                        for (let pt of points) {
                            checkr.x = pt.x;
                            checkr.y = pt.y;

                            const inStock = !clipStock || this.trace.inClip(clipStock, undefined, checkr);
                            const inShadow = !clipTo || this.trace.inClip(clipTo, undefined, checkr);
                            const inClipPos = inStock && inShadow;

                            if (!inClipPos) {
                                if (tracing) {
                                    this.trace.end_poly();
                                    tracing = false;
                                }
                            } else {
                                if (!tracing) {
                                    this.trace.newtrace();
                                    tracing = true;
                                }
                                let tv = Math.max(pt.z, this.probe.zAtXY(pt.x, pt.y));
                                if (clipTab && clipTab.length && tv < tabHeight && this.trace.inClip(clipTab, tv, checkr)) {
                                    tv = this.trace.tabZ;
                                }
                                this.trace.push_point(pt.x, pt.y, tv + leave);
                            }
                        }
                        if (tracing) {
                            this.trace.end_poly();
                        }
                    }
                    loopIdx++;
                }

                let segments = this.trace.slice;
                if (segments.length > 0) {
                    if (shape === 'concentric') {
                        let grouped = [];
                        for (let seg of segments) {
                            let lidx = seg.loopIndex ?? 0;
                            if (!grouped[lidx]) {
                                grouped[lidx] = [];
                            }
                            grouped[lidx].push(seg);
                        }
                        let sliceIdx = 0;
                        for (let g of grouped) {
                            if (g && g.length > 0) {
                                let slice = newSlice(sliceIdx++);
                                slice.camLines = g;
                                slices.push(slice);
                            }
                        }
                    } else {
                        let slice = newSlice(0);
                        slice.camLines = segments;
                        slices.push(slice);
                    }
                }

                ondone(slices, this);
                return this;
            }

            gpu.mode = 'tracing';
            // create coastline path around part for tip-to-tip travels
            // convert shadow/clip poly lines to raster float32 array groups
            let paths = POLY.flatten(clipTo).map(poly => poly.points.map(p => [ p.x, p.y ]).flat().toFloat32());
            let coastline = await gpu.generateToolpaths({
                paths,
                step: 1,
                zFloor: zBottom
            });
            this.coastline = coastline.paths.map(arr => newPolygon().fromArray([0,...arr]));
            gpu.terminate();

            let { numScanlines, pointsPerLine, pathData } = output;
            let xmult = xStep * resolution;
            let ymult = yStep * resolution;
            let xoff = wbounds.min.x;
            let yoff = wbounds.min.y;
            let slices = [];
            function calcPoint(x, y, z, tx, ty) {
                let p = newPoint(x, y, z);
                p.tx = tx;
                p.ty = ty;
                return p;
            }
            // for each toolpath, return a point in part space coordinated
            // attach to a polyline, and annotate with terrain coordinates
            // so we can later dertermine if the point is on or off the part
            for (let i=0; i<numScanlines; i++) {
                let lineStart = i * pointsPerLine;
                let lineData = pathData.slice(lineStart, lineStart + pointsPerLine);
                let points = Array.from(lineData).map((v,j) => calcPoint(j * xmult + xoff, i * ymult + yoff, v, j * xStep, i * yStep));
                let slice = newSlice(i);
                let poly = newPolygon().setOpen();
                let lines = [ ];
                // track z co-planar skipped points for latent emission
                let skip = 0;
                let lp;
                for (let p of points) {
                    // detect points where no rays intersect the part (off part)
                    if (inside && positions[p.ty * gridWidth + p.tx] < zBottom - epsilon) {
                        if (poly.length > 1) {
                            lines.push(poly);
                            poly = newPolygon().setOpen();
                        } else if (poly.length === 1) {
                            poly = newPolygon().setOpen();
                        }
                        lp = undefined;
                        skip = 0;
                        continue;
                    }
                    // off part but we want to return zBottom (outside)
                    if (p.z < zBottom - epsilon) {
                        lp = p;
                        if (poly.length === 0) {
                            skip++;
                            continue;
                        }
                        if (poly.length > 1) {
                            skip = 0;
                            p.z = zBottom;
                            poly.push(p);
                            lines.push(poly);
                            poly = newPolygon().setOpen();
                            continue;
                        }
                    } else if (lp && skip && poly.length === 0) {
                        // latent/last point output
                        lp.z = zBottom;
                        poly.push(lp);
                    }
                    poly.push(lp = p);
                    skip = 0;
                }
                // require two points or more
                if (poly.length > 1) {
                    lines.push(poly);
                }
                // fixup/swap when contouring along Y
                if (contourY) {
                    for (let poly of lines)
                    for (let p of poly.points) {
                        p.swapXY();
                    }
                }
                // raise output points when inside tab boundaries
                if (tabsOn && clipTab.length)
                for (let poly of lines) {
                    for (let p of poly.points) {
                        for (let clip of clipTab) {
                            if (p.z < clip.z && p.isInPolygon(clip)) {
                                p.z = clip.z;
                                break;
                            }
                        }
                    }
                }
                // drop interior points along a continuous slope
                for (let poly of lines) {
                    let { points } = poly;
                    if (points.length < 2) continue;
                    let merged = [ points[0] ];
                    let lastP = points[0];
                    let latent = null;
                    let lastSlope = undefined;
                    for (let i=1; i<points.length; i++) {
                        let newP = points[i];
                        const dl = (newP.x - lastP.x) || (newP.y - lastP.y);
                        const dz = newP.z - lastP.z;
                        const slope = Math.atan2(dz, dl);
                        if (curvesOnly && Math.abs(dz) < flatness) {
                            // end current segment with latent if present
                            if (latent) {
                                merged.push(latent);
                                latent = null;
                            }
                            // add empty points as path separators
                            merged.push(undefined);
                            lastSlope = undefined;
                        } else if (lastSlope !== undefined && Math.abs(lastSlope - slope) < flatness) {
                            latent = newP;
                        } else {
                            if (latent) {
                                merged.push(latent);
                                latent = null;
                            }
                            merged.push(newP);
                            lastSlope = slope;
                        }
                        lastP = newP;
                    }
                    // add final latent point if present
                    if (latent && merged.peek() !== latent) {
                        merged.push(latent);
                    }
                    poly.points = merged;
                }
                // drop flat regions when enabled
                if (curvesOnly) {
                    let nulines = [];
                    for (let poly of lines) {
                        let { points } = poly;
                        let newp = [];
                        for (let p of points) {
                            if (p) {
                                newp.push(p);
                            } else if (newp.length) {
                                nulines.push(newPolygon(newp).setOpen());
                                newp = [];
                            }
                        }
                        nulines.push(newPolygon(newp).setOpen());
                    }
                    lines = nulines.filter(p => p.perimeter() > toolStep);
                }
                slice.camLines = lines;
                slices.push(slice);
                if (inside) {
                    onupdate(i, numScanlines);
                }
            }
            ondone(slices, this);
            return this;
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
            curvesDist,
            maxangle,
            flatness,
            bridge,
            contourX,
            contourR,
            resolution,
            leave,
            holes: (contour.omitthru && shadow.holes && shadow.holes.length) ? shadow.holes : null
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

        // THROUGH-HOLE CAPPING LOGIC (OMIT THROUGH option):
        // If the user wants to omit milling through-holes, we find all grid cells that fall inside
        // any through-hole polygon. Since a through-hole has a depth of 'zMin' (air/empty space), we
        // "cap" the grid cell by copying the height of the nearest solid wall/boundary. This fools
        // the z-height probe into believing the hole is filled at solid part height, preventing
        // the tool from plunging down or generating toolpaths inside the hole.
        if (contour.omitthru && shadow.holes && shadow.holes.length) {
            let cappedCount = 0;
            const rx = stepsX / boundsX; // Coordinate scaling factor
            for (let hole of shadow.holes) {
                // Expand the boundary check slightly (by 1.5 * resolution) to capture boundary cells
                // that may be slightly on the edge of the polygon due to grid discretization.
                const expHole = POLY.expand([hole], resolution * 1.5)[0];
                if (!expHole) continue;
                const hbounds = expHole.bounds;
                // Crop search range to the hole's bounding box to keep loop iterations fast
                const min_ix = Math.max(0, Math.floor(rx * (hbounds.minx - minX)));
                const max_ix = Math.min(stepsX - 1, Math.ceil(rx * (hbounds.maxx - minX)));
                const min_iy = Math.max(0, Math.floor(rx * (hbounds.miny - minY)));
                const max_iy = Math.min(stepsY - 1, Math.ceil(rx * (hbounds.maxy - minY)));

                for (let ix = min_ix; ix <= max_ix; ix++) {
                    for (let iy = min_iy; iy <= max_iy; iy++) {
                        const idx = ix * stepsY + iy;
                        // Only cap empty cells (having a height near zMin) to avoid overwriting solid geometry
                        if (data[idx] < zMin + 0.1) {
                            const px = minX + ix / rx;
                            const py = minY + iy / rx;
                            const pt = newPoint(px, py);
                            if (pt.isInPolygon(expHole)) {
                                // Find the closest boundary point on the original unexpanded hole perimeter
                                let edgePt = null;
                                if (axis === 'x') {
                                    edgePt = hole.snapToIntersectionX(pt);
                                } else if (axis === 'y') {
                                    edgePt = hole.snapToIntersectionY(pt);
                                }
                                if (!edgePt) {
                                    edgePt = hole.findClosestPointOnPerimeter(pt);
                                }
                                let outsidePt = edgePt;
                                const d = pt.distTo2D(edgePt);
                                if (d > 0.00001) {
                                    // Project the coordinate slightly outward (by half a grid step) into the solid part
                                    // to ensure we sample a clean height from the solid part instead of a transitional edge.
                                    const dx = (edgePt.x - pt.x) / d;
                                    const dy = (edgePt.y - pt.y) / d;
                                    outsidePt = newPoint(edgePt.x + dx * (resolution * 0.5), edgePt.y + dy * (resolution * 0.5));
                                }
                                let edge_ix = Math.max(0, Math.min(stepsX - 1, Math.round(rx * (outsidePt.x - minX))));
                                let edge_iy = Math.max(0, Math.min(stepsY - 1, Math.round(rx * (outsidePt.y - minY))));

                                // Fallback: if the outward projection still maps to the same grid cell ix/iy,
                                // step one grid cell away in the direction of the boundary to guarantee we fetch solid height.
                                if (edge_ix === ix && edge_iy === iy) {
                                    const step_x = Math.sign(outsidePt.x - pt.x) || 0;
                                    const step_y = Math.sign(outsidePt.y - pt.y) || 0;
                                    let nx = Math.max(0, Math.min(stepsX - 1, ix + step_x));
                                    let ny = Math.max(0, Math.min(stepsY - 1, iy + step_y));
                                    if (nx !== ix || ny !== iy) {
                                        edge_ix = nx;
                                        edge_iy = ny;
                                    }
                                }
                                // Copy the height from the solid part edge cell onto the hole cell
                                data[idx] = data[edge_ix * stepsY + edge_iy];
                                cappedCount++;
                            }
                        }
                    }
                }
            }
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
            contourR,
            density,
            clipTo,
            clipStock,
            clipTab,
            clipTabZ: clipTab ? clipTab.map(t => t.z) : undefined,
            tabHeight,
            newslices,
            leave,
            shape: contour.shape
        }, (i, l, p) => {
            onupdate(l / 2 + i / 2, l, p);
        });

        ondone(newslices, this);

        return this;
    }

    async raster(widget, params, onupdate) {
        const { resolution } = params;
        const { box } = params;
        const { dispatch, minions } = self.kiri_worker;

        const vertices = widget.getGeoVertices({ unroll: true, translate: true }).toShared();
        const range = { min: Infinity, max: -Infinity };

        // swap XZ in shared array
        for (let i = 0, l = vertices.length; i < l; i += 3) {
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

            dispatch.putCache({ key: widget.id, data: vertices }, {
                done: data => {
                    // console.log({ put_cache_done: data });
                }
            });

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

            dispatch.clearCache({}, {
                done: data => {
                    // console.log({ clear_cache_done: data });
                }
            });

        } else {

            // iterate over shards, merge output
            // const output = [];
            for (let slice of slices) {
                new topo_slicer(slice.index)
                    .setFromArray(vertices, slice)
                    .slice(resolution)
                    .map(rec => {

                        const slice = newSlice(rec.z);
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
                            gridx: rec.index,
                            slice
                        });

                        return slice;
                    });
                onupdate(++complete, slices.length, "raster");
            }

        }
    }

    async contour(params, onupdate) {
        const trace = this.trace;
        const concurrent = self.kiri_worker.minions.running;

        const { minX, maxX, minY, maxY, boundsX, boundsY, stepsX, stepsY } = params;
        const { gridDelta, resolution, density, partOff, toolStep, contourX, contourY, contourR } = params;
        const { clipTo, clipStock, clipTab, clipTabZ, tabHeight, newslices, leave, shape } = params;

        let stepsTaken = 0,
            stepsTotal = 0;

        if (contourX) {
            stepsTotal += ((maxY - minY + partOff * 2) / toolStep) | 0;
        }

        if (contourY) {
            stepsTotal += ((maxX - minX + partOff * 2) / toolStep) | 0;
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const dx = maxX - centerX + partOff;
        const dy = maxY - centerY + partOff;
        const maxR = Math.sqrt(dx * dx + dy * dy);
        const totalTurns = maxR / toolStep;

        if (contourR) {
            stepsTotal += Math.ceil(totalTurns);
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
            clipStock,
            clipTab,
            clipTabZ,
            tabHeight,
            resolution,
            concurrent: contourR ? false : concurrent,
            density
        });

        let resolver;
        let pcount = 0;
        let slicesY = [];
        let slicesX = [];
        let slicesR = [];
        let promise = new Promise(resolve => {
            resolver = () => {
                // sort output slices (required for async)
                slicesY.sort((a, b) => a.z - b.z);
                slicesX.sort((a, b) => a.z - b.z);
                slicesR.sort((a, b) => a.z - b.z);
                newslices.appendAll(slicesY);
                newslices.appendAll(slicesX);
                newslices.appendAll(slicesR);
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
                        let slice = newSlice(x);
                        slice.camLines = segments;
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
                        let slice = newSlice(y);
                        slice.camLines = segments;
                        slicesX.push(slice);
                    }
                    onupdate(++stepsTaken, stepsTotal, "contour x");
                    dec();
                });
            }
        }

        if (contourR) {
            onupdate(0, stepsTotal, "contour radial");
            inc();
            trace.crossRadial({
                centerX,
                centerY,
                maxR,
                toolStep,
                shape: (shape || 'Concentric').toLowerCase()
            }, segments => {
                if (segments.length > 0) {
                    const lshape = (shape || 'Concentric').toLowerCase();
                    if (lshape === 'concentric') {
                        // Export each loop as a separate slice
                        let grouped = [];
                        for (let seg of segments) {
                            let lidx = seg.loopIndex ?? 0;
                            if (!grouped[lidx]) {
                                grouped[lidx] = [];
                            }
                            grouped[lidx].push(seg);
                        }
                        let sliceIdx = 0;
                        for (let g of grouped) {
                            if (g && g.length > 0) {
                                let slice = newSlice(sliceIdx++);
                                slice.camLines = g;
                                slicesR.push(slice);
                            }
                        }
                    } else if (lshape === 'spiral' || lshape === 'concentric spiral' || lshape === 'contour spiral') {
                        // Contour/Concentric Spiral mode: split into separate slices (revolutions)
                        let sliceIdx = 0;
                        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
                            let seg = segments[segIdx];
                            let rN = seg.resampleN || 100;
                            let points = seg.points;
                            let ptsCount = points.length;
                            for (let i = 0; i < ptsCount; i += rN) {
                                let start = Math.max(0, i - 1);
                                let end = Math.min(ptsCount, i + rN);
                                if (end - start < 2) continue;

                                let slice = newSlice(sliceIdx++);
                                let chunkPoly = newPolygon(points.slice(start, end));
                                chunkPoly.setOpen();
                                chunkPoly.spiralId = segIdx;
                                slice.camLines = [ chunkPoly ];
                                slicesR.push(slice);
                            }
                        }
                    } else {
                        // Fallback to Concentric slice building if shape is unrecognized
                        let grouped = [];
                        for (let seg of segments) {
                            let lidx = seg.loopIndex ?? 0;
                            if (!grouped[lidx]) {
                                grouped[lidx] = [];
                            }
                            grouped[lidx].push(seg);
                        }
                        let sliceIdx = 0;
                        for (let g of grouped) {
                            if (g && g.length > 0) {
                                let slice = newSlice(sliceIdx++);
                                slice.camLines = g;
                                slicesR.push(slice);
                            }
                        }
                    }
                }
                onupdate(stepsTotal, stepsTotal, "contour radial");
                dec();
            });
        }

        if (!concurrent) resolver();

        await promise;

        // const lines = newslices.map(s => (s.camLines || []).map(p => p.length));
        // const points = lines.flat().reduce((a,b) => a+b);
        // console.log({ lines, points });

        trace.cleanup();
    }

}

export class Probe {

    constructor(params) {

        const { data, profile } = params;
        const { stepsX, stepsY, boundsX, boundsY, zMin, minX, minY } = params;

        this.params = params;

        // return the touching z given topo x,y and a tool profile
        const toolAtZ = this.toolAtZ = function (x, y) {
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
        const ry = stepsY / boundsY;
        const toolAtXY = this.toolAtXY = function (px, py) {
            px = Math.round(rx * (px - minX));
            py = Math.round(ry * (py - minY));
            return toolAtZ(px, py);
        };

        const zAtXY = this.zAtXY = function (px, py) {
            let ix = Math.round(rx * (px - minX));
            let iy = Math.round(ry * (py - minY));
            return data[ix * stepsY + iy] || zMin;
        };
    }

}

export class Trace {

    constructor(probe, params) {

        const { curvesOnly, curvesDist, maxangle, flatness, bridge, contourX, contourR, leave, resolution } = params;

        this.params = params;
        this.probe = probe;

        // Structured cloning to parallel workers strips getters/prototypes from Polygon objects.
        // We guarantee that all through-hole boundary polygons have their bounds defined with a
        // containsXY(x, y) check so that subsequent slope-masking tests on the worker don't crash.
        if (params.holes) {
            for (let hole of params.holes) {
                if (!hole.bounds) {
                    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
                    for (let p of hole.points) {
                        if (p.x < minx) minx = p.x;
                        if (p.x > maxx) maxx = p.x;
                        if (p.y < miny) miny = p.y;
                        if (p.y > maxy) maxy = p.y;
                    }
                    const hb = {
                        minx, maxx, miny, maxy,
                        containsXY(x, y) {
                            return x >= this.minx && x <= this.maxx && y >= this.miny && y <= this.maxy;
                        }
                    };
                    Object.defineProperty(hole, 'bounds', {
                        value: hb,
                        writable: true,
                        configurable: true
                    });
                }
            }
        }

        let trace,
            slice,
            latent,
            lastPP,
            lastSlope,
            flatBuffer = [],
            flatDist = 0,
            splitDone = false;

        const newslice = this.newslice = () => {
            this.slice = slice = [];
        }

        // Expose helper methods on the Trace class instance to cleanly forward parameters
        // to the active polygon being generated, or to set initial/previous tracing state.
        const setClosed = this.setClosed = function () {
            if (trace) trace.open = false;
        };

        const setLoopIndex = this.setLoopIndex = function (idx) {
            if (trace) trace.loopIndex = idx;
        };

        const setResampleN = this.setResampleN = function (n) {
            if (trace) trace.resampleN = n;
        };

        const setLastPoint = this.setLastPoint = function (point) {
            lastPP = point;
        };

        const newtrace = this.newtrace = function () {
            trace = object.trace = newPolygon().setOpen();
        }

        const end_poly = this.end_poly = function (point) {
            if (flatBuffer.length > 0) {
                if (!splitDone) {
                    for (let p of flatBuffer) {
                        trace.push(p);
                    }
                }
                flatBuffer = [];
                flatDist = 0;
                splitDone = false;
            }
            if (latent) {
                trace.push(latent);
            }
            if (trace.length > 0) {
                // add additional constraint on min perimeter()
                if (trace.length > 1) {
                    slice.push(trace);
                }
                const oldIdx = trace.loopIndex;
                const oldN = trace.resampleN;
                newtrace();
                trace.loopIndex = oldIdx;
                trace.resampleN = oldN;
            }
            lastPP = undefined;
            latent = undefined;
            lastSlope = undefined;
            if (point) {
                trace.push(point);
                lastPP = point;
            }
        }

        const log = function (map) {
            for (let key in map) {
                const val = map[key];
                if (typeof val === 'number') {
                    map[key] = val.round(4);
                }
            }
            console.log(...arguments);
        }

        this.push_point = function (x, y, z) {
            const newP = newPoint(x, y, z);
            const lastP = lastPP;

            if (lastP) {
                // If "Curves Only" is active, check if the point is inside a through-hole.
                // If inside a hole, we split the toolpath immediately at the boundary and skip the point.
                let inHole = false;
                if (curvesOnly && params.holes) {
                    for (let hole of params.holes) {
                        const hb = hole.bounds;
                        if (newP.x >= hb.minx && newP.x <= hb.maxx && newP.y >= hb.miny && newP.y <= hb.maxy) {
                            if (newP.isInPolygon(hole)) {
                                inHole = true;
                                break;
                            }
                        }
                    }
                }

                if (inHole) {
                    if (!splitDone) {
                        trace.setOpen();
                        flatBuffer = [];
                        end_poly();
                        splitDone = true;
                    }
                    flatBuffer = [];
                    flatDist = 0;
                    lastPP = newP;
                    return;
                }

                const dl = (x - lastP.x) || (y - lastP.y);
                const dz = z - lastP.z;

                let isFlat = false;
                if (curvesOnly) {
                    if (contourR) {
                        // RADIAL LOCAL SURFACE SLOPE DETECTION (Curves Only mode):
                        // Radial/Concentric toolpaths move along a curved path. We cannot check flatness
                        // purely by comparing adjacent toolpath points (Math.abs(dz)) because height changes
                        // along concentric arcs on sloped/spherical profiles can be tiny.
                        // Instead, we probe the terrain height in orthogonal directions (+/- delta) around (x, y).
                        const delta = Math.max(resolution * 2, 0.05);
                        const z0 = probe.zAtXY(x, y);

                        // Mask through-holes: if a probed coordinates falls inside a through-hole, we return
                        // the height of the center point (z0). This prevents cliff-edges around through-holes
                        // from registering as "sloped" and generating stray finishing toolpaths near hole boundaries.
                        const getSlopeZ = (px, py) => {
                            if (params.holes) {
                                for (let hole of params.holes) {
                                    const hb = hole.bounds;
                                    if (px >= hb.minx && px <= hb.maxx && py >= hb.miny && py <= hb.maxy) {
                                        if (newPoint(px, py).isInPolygon(hole)) {
                                            return z0;
                                        }
                                    }
                                }
                            }
                            return probe.zAtXY(px, py);
                        };
                        const zX1 = getSlopeZ(x + delta, y);
                        const zX2 = getSlopeZ(x - delta, y);
                        const zY1 = getSlopeZ(x, y + delta);
                        const zY2 = getSlopeZ(x, y - delta);

                        // Scale slopeFlatness with delta to maintain a consistent angle threshold (~3 degrees)
                        const slopeFlatness = Math.max(delta * 0.05, 0.002);
                        const isSurfaceSloped =
                            Math.abs(zX1 - z0) >= slopeFlatness ||
                            Math.abs(zX2 - z0) >= slopeFlatness ||
                            Math.abs(zY1 - z0) >= slopeFlatness ||
                            Math.abs(zY2 - z0) >= slopeFlatness;

                        // The point is flat if the toolpath height change is minimal AND the surrounding surface has no slope
                        isFlat = Math.abs(dz) < slopeFlatness && !isSurfaceSloped;
                    } else {
                        isFlat = Math.abs(dz) < flatness;
                    }
                }

                if (isFlat) {
                    if (flatBuffer.length === 0) {
                        flatBuffer.push(newP);
                        flatDist = lastP.distTo2D(newP);
                        splitDone = false;
                    } else {
                        flatDist += flatBuffer[flatBuffer.length - 1].distTo2D(newP);
                        flatBuffer.push(newP);
                    }

                    if (flatDist > curvesDist) {
                        if (!splitDone) {
                            trace.setOpen();
                            // Empty flatBuffer before calling end_poly to ensure we discard the flat segment
                            // we are splitting at, rather than flushing the flat points into the ended segment.
                            flatBuffer = [];
                            end_poly();
                            splitDone = true;
                        }
                        flatBuffer = [newP];
                    }
                    lastPP = newP;
                    return;
                }

                // If we were in a flat region, flush it now before handling the sloped/steep point
                if (flatBuffer.length > 0) {
                    if (splitDone) {
                        trace.push(flatBuffer[flatBuffer.length - 1]);
                    } else {
                        for (let p of flatBuffer) {
                            trace.push(p);
                        }
                    }
                    flatBuffer = [];
                    flatDist = 0;
                    splitDone = false;
                }

                if (contourR) {
                    if (curvesOnly) {
                        const dv = lastP.distTo2D(newP);
                        const angle = Math.atan2(Math.abs(dz), dv) * RAD2DEG;
                        if (angle > maxangle) {
                            trace.setOpen();
                            end_poly();
                        }
                    }
                    trace.push(newP);
                } else {
                    const slope = Math.atan2(dz, dl);
                    if (lastSlope !== undefined && Math.abs(lastSlope - slope) < flatness) {
                        latent = newP;
                    } else {
                        if (latent) {
                            trace.push(latent);
                            latent = undefined;
                        }
                        if (curvesOnly) {
                            const dv = contourX ? Math.abs(lastP.x - x) : Math.abs(lastP.y - y);
                            const angle = Math.atan2(Math.abs(dz), dv) * RAD2DEG;
                            if (angle > maxangle) {
                                trace.setOpen();
                                end_poly();
                            }
                        }
                        trace.push(newP);
                    }
                    lastSlope = slope;
                }
            } else {
                trace.push(newP);
            }

            lastPP = newP;
        }

        const object = this.object = this;

        this.inClip = function (clips, checkZ, point) {
            let ok = 0;
            for (let i = 0; i < clips.length; i++) {
                let poly = clips[i];
                let zok = checkZ ? checkZ <= poly.z : true;
                object.tabZ = poly.z;
                if (zok && point.isInPolygon(poly)) {
                    ok++;
                }
            }
            return ok > 0;
        }

    }

    init(params) {
        this.cross = params;
        const { minions } = self.kiri_worker ?? {};
        const { clipTab, clipTabZ } = params;

        // because codec does not encode arbitrary fields
        // in this case, z is appended to clip tabs in topo constructor
        // we pass it as a side-channel and re-consitute here
        if (clipTab)
            for (let i = 0, l = clipTab.length; i < l; i++) {
                clipTab[i].z = clipTabZ[i];
            }

        if (minions && this.cross.concurrent) {
            minions.broadcast("trace_init", codec.encode({
                probe: this.probe.params,
                trace: this.params,
                cross: params,
            }));
        }
    }

    cleanup() {
        const { minions } = self.kiri_worker;

        if (minions && this.cross.concurrent) {
            minions.broadcast("trace_cleanup");
        }
    }

    crossY(params, then) {
        const { minions } = self.kiri_worker;

        if (minions && this.cross.concurrent) {
            minions.queue({
                cmd: "trace_y",
                params
            }, data => {
                then(codec.decode(data.slice));
            });
        } else {
            this.crossY_sync(params, then);
        }
    }

    crossX(params, then) {
        const { minions } = self.kiri_worker;

        if (minions && this.cross.concurrent) {
            minions.queue({
                cmd: "trace_x",
                params
            }, data => {
                then(codec.decode(data.slice));
            });
        } else {
            this.crossX_sync(params, then);
        }
    }

    crossY_sync(params, then) {
        const { push_point, end_poly, newtrace, newslice, inClip } = this.object;
        const { clipTab, tabHeight, clipTo, clipStock, box, resolution, density, leave } = this.cross;
        const { toolAtZ } = this.probe;

        let { from, to, x, gridx, gridy } = params;

        const step = resolution * density;
        const checkr = newPoint(0, 0);
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
            if (clipTab && clipTab.length && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                tv = this.tabZ;
            }
            // clip to stock AND shadow (intersection)
            const inStock = !clipStock || inClip(clipStock, undefined, checkr);
            const inShadow = !clipTo || inClip(clipTo, undefined, checkr);
            if (!inStock || !inShadow) {
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
        const { clipTab, tabHeight, clipTo, clipStock, box, resolution, density, leave } = this.cross;
        const { toolAtZ } = this.probe;
        let { from, to, y, gridx, gridy } = params;

        const step = resolution * density;
        const checkr = newPoint(0, 0);
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
            if (clipTab && clipTab.length && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                tv = this.tabZ;
            }
            // clip to stock AND shadow (intersection)
            const inStock = !clipStock || inClip(clipStock, undefined, checkr);
            const inShadow = !clipTo || inClip(clipTo, undefined, checkr);
            if (!inStock || !inShadow) {
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

    crossRadial(params, then) {
        const { minions } = self.kiri_worker || {};
        const { clipTo, toolStep, resolution, density } = this.cross;
        const shape = (params.shape || 'Concentric').toLowerCase();

        if (minions && minions.running > 1 && this.cross.concurrent) {
            if (shape === 'concentric') {
                if (clipTo && clipTo.length) {
                    let outs = [];
                    POLY.offset(clipTo, -toolStep, { count: 999, outs: outs, flat: true, z: 0, minArea: 0.01 });

                    let loops = [];
                    for (let i = outs.length - 1; i >= 0; i--) {
                        loops.push(outs[i].clone(true));
                    }
                    for (let poly of clipTo) {
                        loops.push(poly.clone(true));
                    }
                    loops = POLY.flatten(loops, [], true);

                    let promises = [];
                    let loopIdx = 0;
                    for (let poly of loops) {
                        const lidx = loopIdx;
                        promises.push(new Promise(resolve => {
                            minions.queue({
                                cmd: "trace_radial",
                                params: {
                                    ...params,
                                    loop: poly.toObject(),
                                    loopIdx: lidx
                                }
                            }, data => {
                                resolve(codec.decode(data.slice));
                            });
                        }));
                        loopIdx++;
                    }
                    Promise.all(promises).then(slices => {
                        let merged = [];
                        for (let slice of slices) {
                            if (slice) {
                                merged.push(...slice);
                            }
                        }
                        then(merged);
                    });
                } else {
                    then([]);
                }
            } else if (shape === 'spiral' || shape === 'concentric spiral' || shape === 'contour spiral') {
                this.crossRadial_sync(params, then);
            }
        } else {
            this.crossRadial_sync(params, then);
        }
    }

    crossRadial_sync(params, then) {
        const { push_point, end_poly, newtrace, newslice, inClip } = this.object;
        const { clipTab, tabHeight, clipTo, clipStock, box, resolution, density, leave } = this.cross;
        const { toolAtXY } = this.probe;

        let { centerX, centerY, maxR, toolStep, shape } = params;

        // Step resolution along the curve/polygon
        const step = resolution * density;
        const checkr = newPoint(0, 0);

        newslice();

        const lshape = (shape || 'Concentric').toLowerCase();
        const isConcentricLike = lshape === 'concentric' || lshape === 'spiral' || lshape === 'concentric spiral' || lshape === 'contour spiral';
        const isSpiralLike = lshape === 'spiral' || lshape === 'concentric spiral' || lshape === 'contour spiral';

        if (isConcentricLike) {
            // CONCENTRIC SHAPE GENERATION:
            // Generates closed concentric loop paths from the innermost region to the outer perimeter.
            if (params.loop) {
                let poly = newPolygon().fromObject(params.loop);
                let loopIdx = params.loopIdx;
                const self_trace = this;

                const points = poly.points;
                const numPoints = points.length;
                if (numPoints >= 2) {
                    // 1. Subdivide loop segments:
                    let subPoints = [];
                    for (let i = 0; i < numPoints; i++) {
                        const p1 = points[i];
                        const p2 = points[(i + 1) % numPoints];
                        const len = p1.distTo2D(p2);

                        if (len > step) {
                            const divisions = Math.ceil(len / step);
                            for (let j = 0; j < divisions; j++) {
                                const pct = j / divisions;
                                const x = p1.x + (p2.x - p1.x) * pct;
                                const y = p1.y + (p2.y - p1.y) * pct;
                                subPoints.push({ x, y });
                            }
                        } else {
                            subPoints.push({ x: p1.x, y: p1.y });
                        }
                    }

                    // 2. Evaluate clipping and probe Z height for each point:
                    let evaluated = [];
                    let hasOut = false;

                    for (let pt of subPoints) {
                        checkr.x = pt.x;
                        checkr.y = pt.y;

                        const inStock = !clipStock || inClip(clipStock, undefined, checkr);
                        const inShadow = !clipTo || inClip(clipTo, undefined, checkr);
                        const inClipPos = inStock && inShadow;

                        if (!inClipPos) {
                            hasOut = true;
                            evaluated.push({ x: pt.x, y: pt.y, z: 0, inClip: false });
                        } else {
                            let tv = toolAtXY(pt.x, pt.y);
                            if (clipTab && clipTab.length && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                                tv = this.tabZ;
                            }
                            evaluated.push({ x: pt.x, y: pt.y, z: tv, inClip: true });
                        }
                    }

                    // 3. Emit points using state machine:
                    if (hasOut) {
                        let firstOutIdx = evaluated.findIndex(p => !p.inClip);
                        let rotated = [...evaluated.slice(firstOutIdx), ...evaluated.slice(0, firstOutIdx)];

                        let tracing = false;
                        for (let pt of rotated) {
                            if (pt.inClip) {
                                if (!tracing) {
                                    newtrace();
                                    tracing = true;
                                    self_trace.setLoopIndex(loopIdx);
                                }
                                push_point(pt.x, pt.y, pt.z + leave);
                            } else {
                                if (tracing) {
                                    end_poly();
                                    tracing = false;
                                }
                            }
                        }
                        if (tracing) {
                            end_poly();
                        }
                    } else {
                        newtrace();
                        self_trace.setClosed();
                        self_trace.setLoopIndex(loopIdx);

                        const lastPt = evaluated[evaluated.length - 1];
                        if (lastPt) {
                            self_trace.setLastPoint(newPoint(lastPt.x, lastPt.y, lastPt.z + leave));
                        }
                        for (let pt of evaluated) {
                            push_point(pt.x, pt.y, pt.z + leave);
                        }
                        end_poly();
                    }
                }
            } else if (clipTo && clipTo.length) {
                let outs = [];
                // Use POLY.offset to generate concentric toolpath offsets (step-over) from the boundary.
                // -toolStep is used to offset inwards. We offset on the 2D plane (z: 0) and then probe Z height.
                POLY.offset(clipTo, -toolStep, { count: 999, outs: outs, flat: true, z: 0, minArea: 0.01 });

                // We want to cut from the inside out to minimize tool deflection and vibration.
                // POLY.offset generates paths from outside-in: [first offset, second offset, ..., innermost]
                // We reverse the array to cut from [innermost, ..., second offset, first offset].
                let loops = [];
                for (let i = outs.length - 1; i >= 0; i--) {
                    loops.push(outs[i].clone(true));
                }
                // Append the original boundary (clipTo) at the end so we perform a final perimeter pass.
                for (let poly of clipTo) {
                    loops.push(poly.clone(true));
                }
                loops = POLY.flatten(loops, [], true);

                if (isSpiralLike) {
                    loops = POLY.spiralize(loops);
                }

                const self_trace = this;

                let loopIdx = 0;
                for (let poly of loops) {
                    if (isSpiralLike) {
                        self_trace.setResampleN(poly.resampleN);
                    }
                    const points = poly.points;
                    const numPoints = points.length;
                    if (numPoints < 2) continue;

                    // 1. Subdivide loop segments:
                    // Subdivides long segments into smaller points spaced by 'step'. This guarantees
                    // we have enough point density to accurately sample the 3D surface heights.
                    let subPoints = [];
                    const limit = poly.open ? numPoints - 1 : numPoints;
                    for (let i = 0; i < limit; i++) {
                        const p1 = points[i];
                        const p2 = points[(i + 1) % numPoints];
                        const len = p1.distTo2D(p2);

                        if (len > step) {
                            const divisions = Math.ceil(len / step);
                            for (let j = 0; j < divisions; j++) {
                                const pct = j / divisions;
                                const x = p1.x + (p2.x - p1.x) * pct;
                                const y = p1.y + (p2.y - p1.y) * pct;
                                subPoints.push({ x, y });
                            }
                        } else {
                            subPoints.push({ x: p1.x, y: p1.y });
                        }
                    }
                    if (poly.open && numPoints > 0) {
                        let lastP = points[numPoints - 1];
                        subPoints.push({ x: lastP.x, y: lastP.y });
                    }

                    // 2. Evaluate clipping and probe Z height for each point:
                    // Checks if each point is inside the stock and shadow bounds, then probes the topography.
                    let evaluated = [];
                    let hasOut = false;

                    for (let pt of subPoints) {
                        checkr.x = pt.x;
                        checkr.y = pt.y;

                        const inStock = !clipStock || inClip(clipStock, undefined, checkr);
                        const inShadow = !clipTo || inClip(clipTo, undefined, checkr);
                        const inClipPos = inStock && inShadow;

                        if (!inClipPos) {
                            hasOut = true;
                            evaluated.push({ x: pt.x, y: pt.y, z: 0, inClip: false });
                        } else {
                            let tv = toolAtXY(pt.x, pt.y);
                            if (clipTab && clipTab.length && tv < tabHeight && inClip(clipTab, tv, checkr)) {
                                tv = this.tabZ;
                            }
                            evaluated.push({ x: pt.x, y: pt.y, z: tv, inClip: true });
                        }
                    }

                    // 3. Emit points using state machine:
                    if (hasOut || poly.open) {
                        // PARTIAL CLIPPING: If the loop intersects the boundaries (i.e. goes out of stock),
                        // we must split it into open segments. We find the first out-of-clip point and rotate the array
                        // so it starts outside. For open paths, we do not rotate.
                        let rotated = evaluated;
                        if (hasOut && !poly.open) {
                            let firstOutIdx = evaluated.findIndex(p => !p.inClip);
                            rotated = [...evaluated.slice(firstOutIdx), ...evaluated.slice(0, firstOutIdx)];
                        }

                        let tracing = false;
                        for (let pt of rotated) {
                            if (pt.inClip) {
                                if (!tracing) {
                                    newtrace();
                                    tracing = true;
                                    self_trace.setLoopIndex(loopIdx);
                                }
                                push_point(pt.x, pt.y, pt.z + leave);
                            } else {
                                if (tracing) {
                                    end_poly();
                                    tracing = false;
                                }
                            }
                        }
                        if (tracing) {
                            end_poly();
                        }
                    } else {
                        // NO CLIPPING: If the loop is fully within stock and boundaries, emit as a single closed loop.
                        newtrace();
                        self_trace.setClosed();
                        self_trace.setLoopIndex(loopIdx);

                        // Seed the starting lastPP with the final point of the loop.
                        // This maintains circular continuity, so the first point is checked for flatness
                        // against the last point of the loop, preventing CW vs. CCW starting point asymmetry.
                        const lastPt = evaluated[evaluated.length - 1];
                        if (lastPt) {
                            self_trace.setLastPoint(newPoint(lastPt.x, lastPt.y, lastPt.z + leave));
                        }
                        for (let pt of evaluated) {
                            push_point(pt.x, pt.y, pt.z + leave);
                        }
                        end_poly();
                    }
                    loopIdx++;
                }
            }
        }

        then(this.slice);
    }
}

export function raster_slice(inputs) {
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

    outer: for (let i = 0; i < len; i++) {
        let l1 = lines[i], p1 = l1.p1, p2 = l1.p2;
        // eliminate vertical
        if (Math.abs(p1.y - p2.y) < flatness) continue;
        // eliminate if both points below cutoff
        if (p1.z < zMin && p2.z < zMin) continue;
        // sort p1,p2 by y for comparison
        if (p1.y > p2.y) { const tp = p1; p1 = p2; p2 = tp };
        // eliminate if points "under" other lines
        for (let j = 0; j < len; j++) {
            // skip self and adjacent
            if (j >= i - 1 && j <= i + 1) continue;
            let l2 = lines[j], p3 = l2.p1, p4 = l2.p2;
            // sort p3,p4 by y for comparison
            if (p3.y > p4.y) { const tp = p3; p3 = p4; p4 = tp };
            // it's under the other line
            if (Math.max(p1.z, p2.z) < Math.min(p3.z, p4.z)) {
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
        for (i = 0, il = points.length; i < il; i += 2) {
            const p1 = points[i], p2 = points[i + 1];
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
                        .setLayer("heights", { face: 0, line: 0 })
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
        for (let i = 0, p = points, l = p.length; i < l; i += 2) {
            const p1 = p[i];
            const p2 = p[i + 1];
            if (Math.abs(p1.z - p2.z) >= flatness) {
                nup.push(p1, p2);
            }
        }
        points = nup;
    }

    return points;
};

function omitMatching(target, matches) {
    target = target.clone(true);
    for (let poly of target.filter(p => p.inner)) {
        poly.inner = poly.inner.filter(inner => {
            let innerCenter = inner.bounds.center();
            for (let ho of matches) {
                if (inner.isEquivalent(ho, false, 0.2)) {
                    return false;
                }
                // Fallback check: if the center of the sliced hole is inside the matching hole,
                // and their areas are within a 20% tolerance threshold.
                let hoArea = Math.abs(ho.area());
                let innerArea = Math.abs(inner.area());
                if (hoArea > 0.001 && Math.abs(hoArea - innerArea) / hoArea < 0.2) {
                    if (innerCenter.isInPolygon(ho)) {
                        return false;
                    }
                }
            }
            return true;
        });
    }
    return target;
}

export async function generate(opt) {
    return new Topo().generate(opt);
}
