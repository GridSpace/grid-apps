/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

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

class OpArea extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { tool, mode, down, over, follow, expand, outline, refine, smooth } = op;
        let { ov_topz, ov_botz, ov_conv } = op;
        let { settings, widget, tabs, color } = state;
        let { addSlices, setToolDiam, cutTabs, healPolys, shadowAt, workarea } = state;

        let areaTool = new Tool(settings, tool);
        let toolDiam = areaTool.fluteDiameter();
        let toolOver = areaTool.hasTaper() ? over : toolDiam * over;
        let zTop = ov_topz ? workarea.bottom_stock + ov_topz : workarea.top_stock;
        let zBottom = ov_botz ? workarea.bottom_stock + ov_botz : workarea.bottom_part;

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

        function newLayer() {
            stack.push(newSlice());
            return stack.peek();
        }

        // gather area selections
        for (let arr of (op.areas[widget.id] ?? [])) {
            polys.push(newPolygon().fromArray(arr));
        }

        // connect open poly edge segments into closed loops (when possible)
        // surface and edge selections produce open polygons by default
        polys = POLY.nest(healPolys(polys));

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

        // todo: implement `refine` and `smooth`

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
            polys = nupolys;
        }

        // process each area separately
        let proc = 0;
        let pinc = 1 / polys.length;
        for (let area of polys) {
            let bounds = area.getBounds3D();

            if (devel) newLayer().output()
                .setLayer("area", { line: 0xff8800 }, false)
                .addPolys([ area ]);

            newArea();

            if (outline) {
                // remove inner voids when processing outline only
                area.inner = undefined;
            }

            if (mode === 'clear') {
                let zs = down ? base_util.lerp(zTop, zBottom, down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                let lzo;
                outer: for (;;)
                for (let z of zs) {
                    let slice = newLayer();
                    let layers = slice.output();
                    let outs = [];
                    let clip = [];
                    let shadow = shadowAt(z);
                    POLY.subtract([ area ], shadow, clip, undefined, undefined, 0);
                    POLY.offset(clip, [ -toolDiam / 2, -toolOver ], {
                        count: 999, outs, flat: true, z, minArea: 0
                    });
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
                    if (tabs) outs = cutTabs(tabs, outs);
                    slice.camLines = outs;
                    zroc += zinc;
                    lzo = z;
                    progress(proc + (pinc * zroc), 'clear');
                    if (devel) layers
                        .setLayer("shadow", { line: 0x0088ff }, false)
                        .addPolys(shadow);
                    layers
                        .setLayer("clear", { line: 0x88ff00 }, false)
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
                let zs = down ? base_util.lerp(zTop, bounds.min.z, down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                let lzo;
                for (let z of zs) {
                    let slice = newLayer();
                    let layers = slice.output();
                    let outs = [];
                    if (tr_type === 'none') {
                        area = area.clone(true);
                        outs = [ zs.length > 1 ? area.setZ(z) : area ];
                    } else {
                        POLY.offset([ area ], tr_type === 'inside' ? [ -toolDiam / 2 ] : [ toolDiam / 2 ], {
                            count: 1, outs, flat: true, z, minArea: 0
                        });
                    }
                    if (outs.length === 0) {
                        // terminate z descent when no further output possible
                        break;
                    }
                    // cut tabs when present
                    if (tabs) outs = cutTabs(tabs, outs);
                    slice.camLines = outs;
                    zroc += zinc;
                    lzo = z;
                    progress(proc + (pinc * zroc), 'trace');
                    layers
                        .setLayer("trace", { line: 0x88ff00 }, false)
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
                    // todo: progressive inset from perimeter
                    console.log({ sr_offset: toolOver });
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
                    surface.push(path);
                    newLayer().output()
                        .setLayer("linear", { line: 0x00ff00 }, false)
                        .addPolys([ path ]);
                }

                // output this surface
                surfaces.push(surface);
            }
        }

        addSlices(areas.flat());
    }

    prepare(ops, progress) {
        let { op, state, areas, surfaces } = this;
        let { getPrintPoint, newLayer, pocket, polyEmit, setTool, setSpindle, tip2tipEmit } = ops;
        let { process } = state.settings;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);

        let printPoint = getPrintPoint();

        // process surface paths
        for (let surface of surfaces) {
            let array = surface.map(poly => { return {
                el: poly,
                first: poly.first(),
                last: poly.last()
            } });
            tip2tipEmit(array, printPoint, (next, first, count) => {
                printPoint = polyEmit(next.el, 0, 1, printPoint, {});
                newLayer();
            });
        }

        // skip areas when processing surfaces
        if (surfaces.length) {
            return;
        }

        // process areas as pockets
        while (areas?.length) {
            let min = {
                dist: Infinity,
                area: undefined
            };
            for (let area of areas.filter(p => !p.used)) {
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
