/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';

export class OpGCode extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    prepare(ops, progress) {
        ops.addGCode(this.op.gcode);
    }
}
