/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { newSlice } from '../../core/slice.js';
import { util } from '../../../geo/base.js';

class OpLevel extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, addSlices, updateToolDiams } = state;
        let { zMax, ztOff, color, tshadow } = state;
        let { stock } = settings;

        let toolDiam = new Tool(settings, op.tool).fluteDiameter();
        let stepOver = this.stepOver = toolDiam * op.step;
        let zTop = zMax + ztOff;
        let zBot = zTop - op.down;
        let zList = op.stepz ? util.lerp(zTop, zBot, op.stepz) : [ zBot ];

        updateToolDiams(toolDiam);

        let points = [];
        let clear = op.stock ?
            [ newPolygon().centerRectangle({x:0,y:0,z:0}, stock.x + toolDiam/2, stock.y) ] :
            POLY.outer(POLY.offset(tshadow, toolDiam * (op.inset || 0)));

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
        let { op, layers, stepOver } = this;
        let { setTool, setSpindle, printPoint, setPrintPoint } = ops;
        let { newLayer, tip2tipEmit, camOut } = ops;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);
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
        setPrintPoint(printPoint);
    }
}

export { OpLevel };
