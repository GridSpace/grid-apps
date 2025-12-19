/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from './op-area.js';

class OpTrace extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    // todo: cut thru, wide steps

    async slice(progress) {
        let { op, state } = this;
        let { areas, direction, down, expand, follow, offover, offset, outline, mode, ov_botz, ov_topz } = op;
        let { plunge, rate, refine, smooth, spindle, step, steps, thru, tolerance, tool } = op;
        let trace = {
            areas,
            direction,
            dogbones: op.dogbone,
            down,
            expand,
            follow,
            mode: mode === 'clear' ? 'clear' : 'trace',
            outline,
            ov_botz,
            ov_topz,
            over: op.step,
            plunge,
            rate,
            refine,
            rename: op.rename ?? "trace",
            revbones: op.revbone,
            smooth,
            spindle,
            step,
            surfaces: {},
            tolerance,
            tool,
            tr_over: offover,
            tr_type: offset
        };
        this.op_trace = new OpArea(state, trace);
        return this.op_trace.slice(progress);
    }

    async prepare(ops, progress) {
        return this.op_trace.prepare(ops, progress);
    }
}

export { OpTrace };
