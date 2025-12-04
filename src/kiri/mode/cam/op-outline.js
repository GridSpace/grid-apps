/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from './op-area.js';
import { polygons as POLY } from '../../../geo/polygons.js';

class OpOutline extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    // todo: wide cutout, dogbones

    async slice(progress) {
        let { op, state } = this;
        let { shadow, tool, widget } = state;
        let shadowBase = shadow.base;
        let areas = POLY.expand(shadowBase, tool.fluteDiameter() / 2);
        let cutout = {
            rename: op.rename ?? "outline",
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
        };
        this.op_cutout = new OpArea(state, cutout);
        return this.op_cutout.slice(progress);
    }

    async prepare(ops, progress) {
        return this.op_cutout.prepare(ops, progress);
    }
}

export { OpOutline };
