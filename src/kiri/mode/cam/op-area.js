/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// todo: surface offset pattern
// todo: trace dogbones, merge overlap

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newSlice } from '../../core/slice.js';
import { newPoint } from '../../../geo/point.js';
import { newPolygon } from '../../../geo/polygon.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { util as base_util } from '../../../geo/base.js';
import { CAM } from './driver-be.js';

const DEG2RAD = Math.PI / 180;
const clib = self.ClipperLib;
const ctyp = clib.ClipType;
const ptyp = clib.PolyType;
const cfil = clib.PolyFillType;
const ts_off = 0.01;

// todo: review tool_shadow. offset both directions for travel inside and outside / between?

class OpArea extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { tool, mode, down, over, follow, expand, outline, smooth } = op;
        let { ov_topz, ov_botz, direction, rename } = op;
        let { settings, widget, tabs, color } = state;
        let { addSlices, setToolDiam, cutTabs, shadowAt, workarea } = state;

        let areaTool = new Tool(settings, tool);
        let smoothVal = (smooth ?? 0) / 10;
        let toolDiam = areaTool.fluteDiameter();
        let toolOver = areaTool.getStepSize(over);
        let zTop = ov_topz ? workarea.bottom_stock + ov_topz : workarea.top_z;
        let zBottom = ov_botz ? workarea.bottom_stock + ov_botz : Math.max(workarea.bottom_z, workarea.bottom_part) + workarea.bottom_cut;
        let shadowBase = state.shadow.base;
        let thruHoles = state.shadow.holes;

        // also updates tab offsets
        setToolDiam(toolDiam);

        // selected area polygons: surfaces and edges
        let { devel, edgeangle } = settings.controller;
        let stack = [];
        let surfaces = this.surfaces = [];
        let areas = this.areas = [ stack ];
        let polys = [];

        function newArea() {
            if (stack.length) {
                stack = [];
                areas.push(stack);
            }
        }

        function newLayer(z) {
            stack.push(newSlice(z));
            return stack.peek();
        }

        // gather area selections
        for (let arr of (op.areas[widget.id] ?? [])) {
            polys.push(newPolygon().fromArray(arr));
        }

        // connect open poly edge segments into closed loops (when possible)
        // surface and edge selections produce open polygons by default
        polys = POLY.nest(POLY.reconnect(polys, false));

        // gather surface selections
        let vert = widget.getGeoVertices({ unroll: true, translate: true }).map(v => v.round(4));
        let faces = CAM.surface_find(widget, (op.surfaces[widget.id] ?? []), (follow ?? edgeangle ?? 5) * DEG2RAD);
        let fpoly = [];
        let fminz = Infinity;
        for (let face of faces) {
            let i = face * 9;
            fpoly.push(newPolygon()
                .add(vert[i++], vert[i++], fminz = Math.min(fminz, vert[i++]))
                .add(vert[i++], vert[i++], fminz = Math.min(fminz, vert[i++]))
                .add(vert[i++], vert[i++], fminz = Math.min(fminz, vert[i++]))
            );
        }
        // remove invalid edges (eg. when vertical walls are the only selection)
        fpoly = fpoly.filter(p => p.area() > 0.001);

        // add in unioned surface areas
        polys.push(...POLY.setZ(POLY.union(fpoly, 0.00001, true), fminz));

        // smoothing for jaggies usually caused by vertical walls
        if (smoothVal)
        polys = polys.map(poly => POLY.offset(POLY.offset([ poly ], smoothVal), -smoothVal)).flat();

        // expand selections (flattens z variable polys)
        if (Math.abs(expand) > 0) {
            let nupolys = polys.filter(p => p.open); // set aside open
            for (let p of polys.filter(p => !p.open)) {
                let expanded = POLY.expand([ p ], expand);
                if (expanded) {
                    POLY.setZ(expanded, p.minZ());
                    nupolys.push(...expanded.flat());
                }
            }
            // polys = nupolys;
            // re-merge after expansion in case it produces overlap
            polys = POLY.union(nupolys, 0.00001, true);
        }

        // process each area separately
        let proc = 0;
        let pinc = 1 / polys.length;
        for (let area of polys) {
            let bounds = area.getBounds3D();

            if (outline) {
                // remove inner voids when processing outline only
                area.inner = undefined;
            }

            newLayer().output()
                .setLayer("area", { line: 0xff8800 }, false)
                .addPolys([ area ]);

            newArea();

            if (mode === 'clear') {
                let zs = down ? base_util.lerp(zTop, zBottom, down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                let lzo;
                outer: for (;;)
                for (let z of zs) {
                    let slice = newLayer(z);
                    let layers = slice.output();
                    let shadow = await shadowAt(z);
                    let tool_shadow = POLY.offset(shadow, [ toolDiam / 2 - ts_off ], { count: 1, z });
                    // for roughing/outline backward compatability
                    if (op.omitthru) {
                        shadow = omitMatching(shadow, thruHoles);
                    }
                    // progressive offset of polygons inside area clipped to the shadow
                    let outs = [];
                    let clip = [];
                    POLY.subtract([ area ], shadow, clip, undefined, undefined, 0);
                    POLY.offset(clip, [ -toolDiam / 2, -toolOver ], {
                        count: op.steps ?? 999, outs, flat: true, z, minArea: 0
                    });
                    // if we see no offsets, re-check the mesh bottom Z then exit
                    if (outs.length === 0) {
                        if (bounds && lzo > bounds.min.z) {
                            // try a bottom layer matching bottom of selection
                            zs = [ bounds.min.z ];
                            bounds = undefined;
                            continue outer;
                        }
                        // terminate z descent when no further output possible
                        break outer;
                    }
                    // cut tabs when present
                    if (tabs.length) outs = cutTabs(tabs, outs);
                    // for roughing backward compatability
                    if (op.leave_z) {
                        for (let out of outs)
                            for (let p of out.points)
                                p.z += op.leave_z;
                    }
                    // for roughing backward compatability
                    if (op.leave_xy) {
                        outs = outs.map(poly => poly.offset(-op.leave_xy)).flat();
                    }
                    // support legacy outline features
                    if (op.omitouter) {
                        outs = omitOuter(outs);
                    } else if (op.omitinner) {
                        outs = omitInner(outs);
                    }
                    // store travel boundary that triggers up and over moves
                    slice.tool_shadow = [ area, ...shadow, ...tool_shadow ];
                    slice.camLines = outs;
                    zroc += zinc;
                    lzo = z;
                    progress(proc + (pinc * zroc), 'clear');
                    if (devel) layers
                        .setLayer("base", { line: 0xff0000 }, false)
                        .addPolys(shadowBase)
                        .setLayer("shadow", { line: 0x00ff00 }, false)
                        .addPolys(shadow)
                        .setLayer("tool shadow", { line: 0x44ff88 }, false)
                        .addPolys(tool_shadow);
                    layers
                        .setLayer(rename ?? "clear", { line: color }, false)
                        .addPolys(outs);
                    // of the last output still cuts, we need an escape
                    if (z === zs.peek()) {
                        break outer;
                    }
                }
                proc += pinc;
                progress(proc, 'clear');
            } else
            if (mode === 'trace') {
                let { tr_type  } = op;
                let zs = down ? base_util.lerp(zTop, zBottom, down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                for (let z of zs) {
                    let slice = newLayer(z);
                    let layers = slice.output();
                    let shadow = await shadowAt(z);
                    let outs = [];
                    if (tr_type === 'none') {
                        // todo: move this out of the zs loop and only setZ when needed
                        area = area.clone(true);
                        outs = [ zs.length > 1 ? area.setZ(z) : clampZ(area, zTop, zBottom) ];
                    } else {
                        // drape is legacy outline
                        let offit = op.drape ? shadow : [ area ];
                        if (op.omitthru && op.drape) {
                            offit = omitMatching(offit, thruHoles);
                        }
                        // todo: move this out of the zs loop
                        let stepping = tr_type === 'inside' ?
                            [ -toolDiam / 2, -toolOver ] :
                            [ toolDiam / 2, toolOver ];
                        POLY.offset(offit, stepping, {
                            count: op.steps ?? 1, outs, flat: true, z, minArea: 0, open: true
                        });
                    }
                    if (outs.length === 0 && !op.drape) {
                        // terminate z descent when no further output possible
                        break;
                    }
                    // add dogbones when specified
                    if (op.dogbones) outs.forEach(out => out.addDogbones(toolDiam / 5, op.revbones));
                    // cut tabs when present
                    if (tabs) outs = cutTabs(tabs, outs);
                    // support legacy outline features
                    if (op.omitouter) {
                        outs = omitOuter(outs);
                    } else if (op.omitinner) {
                        outs = omitInner(outs);
                    }
                    slice.camLines = outs;
                    // store travel boundary that triggers up and over moves
                    slice.tool_shadow = [ area, ...shadow, ...POLY.offset(shadow, [ toolDiam / 2 - ts_off ], { count: 1, z }) ];
                    zroc += zinc;
                    progress(proc + (pinc * zroc), 'trace');
                    layers
                        .setLayer(rename ?? "trace", { line: color }, false)
                        .addPolys(outs);
                }
                proc += pinc;
                progress(proc, 'trace');
            } else
            if (mode === 'surface') {
                let { sr_type, sr_angle, tolerance } = op;

                let resolution = tolerance || 0.05;
                let raster = await self.get_raster_gpu({ mode: "tracing", resolution });
                let surface = [];
                let paths = [];

                // prepare paths
                if (sr_type === 'linear') {
                    // scan the area bounding box with rays at defined angle
                    let scan = scanBoxAtAngle(bounds, sr_angle * DEG2RAD, toolOver);
                    let lines = scan.map(line => {
                        let { a, b } = line;
                        return [ newPoint(a.x, a.y, 0).toClipper(), newPoint(b.x, b.y, 0).toClipper() ]
                    });
                    // use clipper to clip lines to the area polygon
                    let clip = new clib.Clipper();
                    let ctre = new clib.PolyTree();
                    clip.AddPaths(lines, ptyp.ptSubject, false);
                    clip.AddPaths(POLY.toClipper([ area ]), ptyp.ptClip, true);
                    if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
                        for (let node of ctre.m_AllPolys) {
                            paths.push(POLY.fromClipperNode(node, 0));
                        }
                    }
                    // convert resulting poly lines to raster float32 array groups
                    paths = paths.map(poly => poly.points.map(p => [ p.x, p.y ]).flat().toFloat32());
                } else
                if (sr_type === 'offset') {
                    // progressive inset from perimeter
                    POLY.offset([ area ], [ -toolDiam / 2, -toolOver ], {
                        count: 999, outs: paths, flat: true, z: 0, minArea: 0
                    });
                    paths.forEach(poly => poly.isClosed() && poly.push(poly.first()));
                    paths = paths.map(poly => poly.points.map(p => [ p.x, p.y ]).flat().toFloat32());
                }

                // prepare tool mesh points
                let toolBounds = new THREE.Box3()
                    .expandByPoint({ x: -toolDiam/2, y: -toolDiam/2, z: 0 })
                    .expandByPoint({ x: toolDiam/2, y: toolDiam/2, z: 0 });
                let toolPos = areaTool.generateProfile(resolution).profile.slice();
                for (let i=0; i<toolPos.length; i+= 3) {
                    toolBounds.expandByPoint({ x: toolPos[i], y: toolPos[i+1], z: toolPos[i+2] });
                }
                let toolData = { positions: toolPos, bounds: toolBounds };

                // prepare terrain and raster paths over terrain
                let vertices = widget.getGeoVertices({ unroll: true, translate: true });
                let wbounds = bounds.clone().expandByVector({ x: toolDiam/2, y: toolDiam/2, z: 0 });
                wbounds.min.z = zBottom;
                wbounds.max.z = zTop;
                await raster.loadTool({
                    sparseData: toolData
                });
                await raster.loadTerrain({
                    triangles: vertices,
                    boundsOverride: wbounds
                });
                let output = await raster.generateToolpaths({
                    paths,
                    step: toolOver / 2,
                    zFloor: zBottom - 1,
                    onProgress(pct) { console.log({ pct }); onupdate(pct/100, 100) }
                });
                raster.terminate();

                // todo: port clever bits from topo3 for inside/outside detection and tab clipping

                // convert terrain raster output back to open polylines
                for (let path of output.paths) {
                    path = newPolygon().fromArray([1, ...path]);
                    if (op.refine) path.refine(op.refine);
                    surface.push(path);
                    newLayer().output()
                        .setLayer(rename ?? "linear", { line: color }, false)
                        .addPolys([ path ]);
                }

                // output this surface
                surfaces.push(surface);
            }
        }

        // return only slices containing ares to mill
        addSlices(areas.flat().filter(s => s.camLines && s.camLines.length));
    }

    prepare(ops, progress) {
        let { op, state, areas, surfaces } = this;
        let { newLayer, pocket, polyEmit, printPoint, tip2tipEmit } = ops;
        let { setContouring, setNextIsMove } = ops;
        let { process } = state.settings;

        // process surface paths
        if (surfaces.length) {
            setContouring(true);
            for (let surface of surfaces) {
                let array = surface.map(poly => { return {
                    el: poly,
                    first: poly.first(),
                    last: poly.last()
                } });
                tip2tipEmit(array, printPoint, (next, point) => {
                    setNextIsMove();
                    if (next.last === point) next.el.reverse();
                    printPoint = polyEmit(next.el);
                    newLayer();
                });
            }
            setContouring(false);
            // skip areas when processing surfaces
            return;
        }

        // process areas as pockets
        while (areas?.length) {
            let min = {
                dist: Infinity,
                area: undefined
            };
            for (let area of areas.filter(p => p.length && !p.used)) {
                // skip devel / debug only areas
                let topPolys = area[0].camLines;
                if (!topPolys) continue;
                // select poly with largest area
                let poly = topPolys.slice().sort((a,b) => b.area() - a.area())[0];
                if (!poly) continue;
                // compute move distance to top poly for efficient routing
                let find = poly.findClosestPointTo(printPoint);
                if (find.distance < min.dist) {
                    min.area = area;
                    min.dist = find.distance;
                }
            }
            // if we have a next-closest top poly, pocket that
            if (min.area) {
                min.area.used = true;
                pocket({
                    cutdir: op.ov_conv,
                    depthFirst: process.camDepthFirst,
                    easeDown: op.down && process.easeDown ? op.down : 0,
                    progress: (n,m) => progress(n/m, "area"),
                    slices: min.area.filter(slice => slice.camLines)
                });
            } else {
                break;
            }
        }
    }
}

function omitOuter(polys) {
    let inner = [];
    for (let poly of polys) {
        if (poly.inner) inner.push(...poly.inner);
    }
    return inner;
}

function omitInner(polys) {
    for (let poly of polys) {
        poly.inner = undefined;
    }
    return polys;
}

function omitMatching(target, matches) {
    target = target.clone(true);
    for (let poly of target.filter(p => p.inner)) {
        poly.inner = poly.inner.filter(inner => {
            for (let ho of matches) {
                if (inner.isEquivalent(ho)) {
                    return false;
                }
            }
            return true;
        });
    }
    return target;
}

function clampZ(poly, min, max) {
    for (let p of poly.points) {
        if (p.z < min) p.z = min;
        else if (p.z > max) p.z = max;
    }
    if (poly.inner) {
        for (let poly of poly.inner) {
            clampZ(poly, min, max);
        }
    }
    return poly;
}

// box2: THREE.Box2
// angle: radians (direction of each scan ray)
// step: spacing between parallel rays (world units)
function scanBoxAtAngle(box2, angle, step) {
    const cx = (box2.min.x + box2.max.x) * 0.5;
    const cy = (box2.min.y + box2.max.y) * 0.5;
    const w = box2.max.x - box2.min.x;
    const h = box2.max.y - box2.min.y;

    // ray direction
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // normal between rays (perpendicular to ray dir)
    const nx = -dy;
    const ny = dx;

    // extent of the box along the normal
    const extentN = Math.abs(nx) * w + Math.abs(ny) * h;

    // length of each ray across the box (along ray dir)
    const extentD = Math.abs(dx) * w + Math.abs(dy) * h;

    // how many rays to cover the box; +1 so edges are covered
    const count = Math.max(1, Math.ceil(extentN / step) + 1);

    const halfSpan = step * (count - 1) * 0.5;
    const halfD = extentD * 0.5;
    const rays = [];

    for (let i = 0; i < count; i++) {
        // offset along normal
        const o = -halfSpan + i * step;
        const ox = cx + nx * o;
        const oy = cy + ny * o;

        // segment endpoints for this ray inside (or slightly outside) the box
        const ax = ox - dx * halfD;
        const ay = oy - dy * halfD;
        const bx = ox + dx * halfD;
        const by = oy + dy * halfD;

        rays.push({
            a: new THREE.Vector2(ax, ay),
            b: new THREE.Vector2(bx, by),
        });
    }

    return rays;
}

export { OpArea };
