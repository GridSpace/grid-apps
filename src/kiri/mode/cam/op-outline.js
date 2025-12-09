/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from './op-area.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { newPolygon } from '../../../geo/polygon.js';

class OpOutline extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    // todo: wide cutout, dogbones

    async slice(progress) {
        let { op, state } = this;
        let { shadow, tool, widget } = state;
        let shadow_base = shadow.base;
        if (!(shadow_base && shadow_base.length)) {
            throw 'missing shadow base';
        }
        let areas = POLY.flatten(POLY.expand(shadow.base, tool.fluteDiameter() / 2 - 0.001));
        let cutout = {
            areas: { [widget.id]: areas.map(p => p.toArray()) },
            dogbones: op.dogbones,
            down: op.down,
            expand: 0,
            mode: 'trace',
            outline: op.omitthru,
            ov_botz: op.ov_botz,
            ov_topz: op.ov_topz,
            plunge: op.plunge,
            rate: op.rate,
            rename: op.rename ?? "outline",
            revbones: op.revbones,
            smooth: 0,
            spindle: op.spindle,
            surfaces: {},
            tool: op.tool,
            tr_type: 'none',
        };
        this.op_cutout = new OpArea(state, cutout);
        return this.op_cutout.slice(progress);
    }

    async prepare(ops, progress) {
        return this.op_cutout.prepare(ops, progress);
    }
}

export { OpOutline };
