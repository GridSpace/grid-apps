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
        let { tool, mode, down, over, follow, expand, plunge, smooth, tolerance } = op;
        let { ov_topz, ov_botz, ov_conv } = op;
        let { settings, widget, tabs, color } = state;
        let { addSlices, setToolDiam, cutTabs, healPolys, shadowAt, workarea } = state;

        let areaTool = new Tool(settings, tool);
        let toolDiam = areaTool.fluteDiameter();
        let toolOver = toolDiam * over;
        let zTop = ov_topz ? workarea.bottom_stock + ov_topz : workarea.top_stock;
        let zBottom = ov_botz ? workarea.bottom_stock + ov_botz : workarea.bottom_stock;

        console.log({ workarea, zTop, zBottom });

        setToolDiam(toolDiam);

        // selected area polygons: surfaces and edges
        let { devel, edgeangle } = settings.controller;
        let groups = [];
        let polys = [];

        function newGroup() {
            groups.push(newSlice());
            return groups.peek();
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
        for (let area of polys) {
            let bounds = area.getBounds3D();

            if (devel) newGroup().output()
                .setLayer("area", { line: 0xff8800 }, false)
                .addPolys([ area ]);

            if (mode === 'clear') {
                let zs = base_util.lerp(zTop, zBottom, down);
                console.log({ area, bounds, zs });
                for (let z of zs) {
                    let layers = newGroup().output();
                    let outs = [];
                    let clip = [];
                    let shadow = shadowAt(z);
                    POLY.subtract([ area ], shadow, clip, undefined, undefined, 0);
                    POLY.offset(clip, [ -toolDiam / 2, -toolOver ], {
                        count: 1, outs, flat: true, z, minArea: 0
                    });
                    if (outs.length === 0) {
                        break;
                    }
                    layers
                        .setLayer("shadow", { line: 0x0088ff }, false)
                        .addPolys(shadow);
                    layers
                        .setLayer("clear", { line: 0x88ff00 }, false)
                        .addPolys(outs);
                }

            } else
            if (mode === 'trace') {

            } else
            if (mode === 'surface') {

            }
        }

        addSlices(groups);
    }

    prepare(ops, progress) {
        let { op, state, pockets } = this;
        let { getPrintPoint , pocket, setTool, setSpindle, setTolerance } = ops;
        let { process } = state.settings;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);
    }
}

export { OpArea };
