/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { generate as Topo } from './topo3.js';
import { newSlice } from '../../core/slice.js';
import { newPolygon } from '../../../geo/polygon.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { util as base_util } from '../../../geo/base.js';
import { calc_normal, calc_vertex } from '../../../geo/paths.js';
import { CAM } from './driver-be.js';

const DEG2RAG = Math.PI / 180;

class OpArea extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        const pocket = this;
        let { op, state } = this;
        let { tool, mode, down, over, follow, expand, offset, outline, smooth, tolerance } = op;
        let { ov_topz, ov_botz, ov_conv } = op;
        let { settings, widget, tabs, color } = state;
        let { addSlices, setToolDiam, cutTabs, healPolys, shadowAt, workarea } = state;

        let areaTool = new Tool(settings, tool);
        let toolDiam = areaTool.fluteDiameter();
        let toolOver = areaTool.hasTaper() ? over : toolDiam * over;
        let zTop = ov_topz ? workarea.bottom_stock + ov_topz : workarea.top_stock;
        let zBottom = ov_botz ? workarea.bottom_stock + ov_botz : workarea.bottom_part;

        console.log({ workarea, zTop, zBottom });

        setToolDiam(toolDiam);

        // selected area polygons: surfaces and edges
        let { devel, edgeangle } = settings.controller;
        let stack = [];
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
        let faces = CAM.surface_find(widget, (op.surfaces[widget.id] ?? []), (follow ?? edgeangle ?? 5) * DEG2RAG);
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
                    if (outline) {
                        shadow = shadow.clone(true);
                        // remove shadow inner when processing outline only
                        for (let poly of shadow) poly.inner = undefined;
                    }
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
                let zs = down ? base_util.lerp(zTop, bounds.min.z, down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                let lzo;
                if (outline) {
                    area.inner = undefined;
                }
                for (let z of zs) {
                    let slice = newLayer();
                    let layers = slice.output();
                    let outs = [];
                    if (offset === 'none') {
                        outs = [ area.clone().setZ(z) ];
                    } else {
                        POLY.offset([ area ], offset === 'inside' ? [ -toolDiam / 2 ] : [ toolDiam / 2 ], {
                            count: 1, outs, flat: true, z, minArea: 0
                        });
                    }
                    if (outs.length === 0) {
                        // terminate z descent when no further output possible
                        break;
                    }
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

            }
        }

        addSlices(areas.flat());
    }

    prepare(ops, progress) {
        let { op, state, areas } = this;
        let { getPrintPoint , pocket, setTool, setSpindle, setTolerance } = ops;
        let { process } = state.settings;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);

        // process areas as pockets
        while (areas?.length) {
            let printPoint = getPrintPoint();
            let min = {
                dist: Infinity,
                area: undefined
            };
            for (let area of areas.filter(p => !p.used)) {
                console.log({ area });
                let topPolys = area[0].camLines;
                if (!topPolys) continue;
                let poly = topPolys.slice().sort((a,b) => b.area() - a.area())[0];
                if (!poly) continue;
                console.log({ poly, printPoint });
                let find = poly.findClosestPointTo(printPoint);
                if (find.distance < min.dist) {
                    min.area = area;
                    min.dist = find.distance;
                }
            }
            if (min.area) {
                min.area.used = true;
                console.log({ area: min.area });
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

export { OpArea };
