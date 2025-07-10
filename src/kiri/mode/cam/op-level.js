/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { newSlice } from '../../core/slice.js';

class OpLevel extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, widget, addSlices } = state;
        let { updateToolDiams, tabs, cutTabs } = state;
        let { bounds, zMax, ztOff, color, tshadow } = state;
        let { stock } = settings;

        let toolDiam = new Tool(settings, op.tool).fluteDiameter();
        let stepOver = this.stepOver = toolDiam * op.step;
        let z = zMax + ztOff - op.down;

        updateToolDiams(toolDiam);

        let points = [];
        let clear = op.stock ?
            [ newPolygon().centerRectangle({x:0,y:0,z:0}, stock.x, stock.y) ] :
            POLY.outer(POLY.offset(tshadow, toolDiam * (op.over || 0)));

        POLY.fillArea(clear, 90, stepOver, points);

        let lines = this.lines = [];
        for (let i=0; i<points.length; i += 2) {
            let slice = newSlice(z);
            lines.push( newPolygon().setOpen().addPoints([ points[i], points[i+1] ]).setZ(z) );
            slice.output()
                .setLayer("level", {face: color, line: color})
                .addPolys(this.lines);
            addSlices(slice);
        }
    }

    prepare(ops, progress) {
        let { op, state, lines, stepOver } = this;
        let { setTool, setSpindle, printPoint, setPrintPoint } = ops;
        let { polyEmit, newLayer, tip2tipEmit, camOut } = ops;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);
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
        setPrintPoint(printPoint);

        newLayer();
    }
}

export { OpLevel };
