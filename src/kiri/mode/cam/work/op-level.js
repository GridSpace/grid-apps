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
        let { down, tool, step, stepz, inset } = op;
        let { stock } = settings;
        let { center } = stock;

        let toolDiam = new Tool(settings, tool).fluteDiameter();
        let stepOver = this.stepOver = toolDiam * step;
        let wpos = state.widget.track.pos;
        let zTop = zMax + ztOff;
        let zBot = zTop - down;
        let zList = stepz && down ? util.lerp(zTop, zBot, stepz) : [ zBot ];

        if (share.ran) {
            console.log('skip');
            this.skip = true;
            return;
        } else if (op.stock) {
            share.ran = true;
        }

        updateToolDiams(toolDiam);

        let points = [];
        let clear = op.stock ?
            [ newPolygon().centerRectangle({
                x: -wpos.x + center.x,
                y: -wpos.y + center.y,
                z:  wpos.z + center.z
            }, stock.x + toolDiam/2, stock.y) ] :
            POLY.outer(POLY.offset(shadow.base, toolDiam * (inset || 0)));

        POLY.fillArea(clear, 1090, stepOver, points);

        let layers = this.layers = [];
        for (let z of zList) {
            let lines = [];
            layers.push(lines);
            for (let i=0; i<points.length; i += 2) {
                let slice = newSlice(z);
                lines.push( newPolygon().setOpen().addPoints([ points[i], points[i+1] ]).setZ(z) );
                slice.output()
                    .setLayer("level", {face: color, line: color})
                    .addPolys(lines);
                addSlices(slice);
            }
        }
    }

    prepare(ops, progress) {
        let { layers, skip, stepOver } = this;
        let { printPoint } = ops;
        let { newLayer, tip2tipEmit, camOut } = ops;

        if (skip) {
            return;
        }

        for (let lines of layers) {
            lines = lines.map(p => { return { first: p.first(), last: p.last(), poly: p } });
            printPoint = tip2tipEmit(lines, printPoint, (el, point, count) => {
                let poly = el.poly;
                if (poly.last() === point) {
                    poly.reverse();
                }
                poly.forEachPoint((point, pidx) => {
                    camOut(point.clone(), true, stepOver);
                }, false);
            });
            newLayer();
        }
    }
}

export { OpLevel };
