/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from './op-area.js';
import { newPolygon } from '../../../geo/polygon.js';
import { polygons as POLY } from '../../../geo/polygons.js';

class OpRough extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    // todo: cutThruBypass

    async slice(progress) {
        let { op, state } = this;
        let { shadow, stock, tool, widget } = state;
        let { workarea } = state;

        let cutThruBypass = op.down > workarea.top_stock - workarea.bottom_part;
        let cutOutside = !op.inside;
        let shadowBase = shadow.base;

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }

        if (op.all) {
            shadowBase = [ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ];
        }

        let areas = POLY.flatten(POLY.expand(shadowBase, tool.fluteDiameter() / 2 - 0.001));
        let ops_list = this.ops_list = [ ];

        ops_list.push(new OpArea(state, {
            rename: op.rename ?? "rough",
            spindle: op.spindle,
            tool: op.tool,
            rate: op.rate,
            plunge: op.plunge,
            mode: 'clear',
            over: op.step,
            down: op.down,
            expand: 0,
            smooth: 0,
            outline: true,
            omitthru: op.omitthru,
            leave_xy: op.leave,
            leave_z: op.leavez,
            ov_botz: op.ov_botz,
            ov_topz: op.ov_topz,
            areas: { [widget.id]: areas.map(p => p.toArray()) },
            surfaces: {}
        }));

        if (cutOutside) {
            ops_list.push(new OpArea(state, {
                rename: op.rename ?? "rough",
                spindle: op.spindle,
                tool: op.tool,
                rate: op.rate,
                plunge: op.plunge,
                mode: 'trace',
                tr_type: 'none',
                down: op.down,
                expand: 0,
                smooth: 1,
                outline: !op.omitthru,
                ov_botz: op.ov_botz,
                ov_topz: op.ov_topz,
                areas: { [widget.id]: areas.map(p => p.toArray()) },
                surfaces: {}
            }));
        }

        for (let op of this.ops_list) {
            await op.slice(progress);
        }
    }

    async prepare(ops, progress) {
        for (let op of this.ops_list) {
            await op.prepare(ops, progress);
        }
    }
}

export { OpRough };
