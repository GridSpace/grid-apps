/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { OpArea } from './op-area.js';

class OpPocket extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { contour, direction, down, expand, follow, outline, omitthru, ov_botz, ov_topz } = op;
        let { plunge, rate, refine, smooth, spindle, surfaces, tolerance, tool, sr_type } = op;
        let pocket = {
            areas: {},
            direction,
            down,
            expand,
            follow,
            mode: contour ? 'surface' : 'clear',
            outline,
            omitthru,
            ov_botz,
            ov_topz,
            over: op.step,
            plunge,
            rate,
            refine,
            rename: op.rename ?? "pocket",
            smooth,
            spindle,
            sr_type: sr_type || 'concentric',
            surfaces,
            tolerance,
            tool,
            tr_type: 'none',
        };
        this.op_pocket = new OpArea(state, pocket);
        return this.op_pocket.slice(progress);
    }

    prepare(ops, progress) {
        return this.op_pocket.prepare(ops, progress);
    }
}

export { OpPocket };
