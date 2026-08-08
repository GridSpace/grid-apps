/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { Tool } from '../core/tool.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { polygons as POLY } from '../../../../geo/polygons.js';
import { newSlice } from '../../../core/slice.js';
import { util } from '../../../../geo/base.js';

class OpLevel extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices, color, settings, shadow } = state;
        let { share, updateToolDiams, zMax, ztOff } = state;
        let { down, tool, step, stepz, inset, sr_type } = op;
        let { stock } = settings;
        let { center } = stock;

        let toolDiam = new Tool(settings, tool).fluteDiameter();
        let stepOver = this.stepOver = toolDiam * step;
        let wpos = state.widget.track.pos;
        let zTop = zMax + ztOff;
        let zBot = zTop - down;
        let zList = stepz && down ? util.lerp(zTop, zBot, stepz) : [ zBot ];

        // ensure zList is descending
        zList.sort((a,b) => b - a);

        if (share.ran) {
            console.log('skip');
            this.skip = true;
            return;
        } else if (op.stock) {
            share.ran = true;
        }

        updateToolDiams(toolDiam);

        let clear = op.stock ?
            [ newPolygon().centerRectangle({
                x: -wpos.x + center.x,
                y: -wpos.y + center.y,
                z:  wpos.z + center.z
            }, stock.x + toolDiam/2, stock.y) ] :
            POLY.outer(POLY.offset(shadow.base, toolDiam * (inset || 0)));

        let level_polys = [];
        // check 'offset' for backward compatibility with older save files (renamed to 'concentric')
        if (sr_type === 'concentric' || sr_type === 'offset') {
            POLY.offset(clear, -stepOver, { count: 999, outs: level_polys, flat: true, z: 0, minArea: 0.01 });
            level_polys.push(...clear.map(p => p.clone(true)));
        } else if (sr_type === 'spiral' || sr_type === 'concentric spiral') {
            let loops = [];
            POLY.offset(clear, -stepOver, { count: 999, outs: loops, flat: true, z: 0, minArea: 0.01 });
            loops.push(...clear.map(p => p.clone(true)));
            level_polys = POLY.spiralize(loops);
        } else {
            let points = [];
            POLY.fillArea(clear, 1090, stepOver, points);
            for (let i = 0; i < points.length; i += 2) {
                level_polys.push(newPolygon().setOpen().addPoints([ points[i], points[i+1] ]));
            }
        }

        let layers = this.layers = [];

        for (let z of zList) {
            let lines = [];
            layers.push(lines);
            let slice = newSlice(z);
            for (let poly of level_polys) {
                let pz = poly.clone(true).setZ(z);
                if (!poly.isOpen()) {
                    pz.push(pz.first());
                }
                lines.push(pz);
            }
            slice.output()
                .setLayer("level", {face: color, line: color})
                .addPolys(lines);
            addSlices(slice);
        }
    }

    prepare(ops, progress) {
        let { layers, skip, stepOver } = this;
        let { printPoint } = ops;
        let { newLayer, tip2tipEmit, camOut, zSafe, tool } = ops;

        if (skip) {
            return;
        }

        let spiral = this.op.sr_type === 'spiral' || this.op.sr_type === 'concentric spiral';
        let layer_index = 0;
        for (let lines of layers) {
            lines = lines.map(p => { return { first: p.first(), last: p.last(), poly: p } });
            if (spiral && layer_index > 0) {
                camOut(printPoint.clone().setZ(zSafe), 0);
                newLayer();
            }
            printPoint = tip2tipEmit(lines, printPoint, (el, point, count) => {
                let poly = el.poly;
                if (poly.last() === point) {
                    poly.reverse();
                }
                poly.forEachPoint((point, pidx) => {
                    camOut(point.clone(), pidx === 0 ? 0 : true, stepOver);
                }, false);
            });
            newLayer();
            layer_index++;
        }
    }
}

export { OpLevel };
