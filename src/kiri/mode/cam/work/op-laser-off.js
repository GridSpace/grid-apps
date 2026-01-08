/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';

export class OpLaserOff extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    prepare(ops, progress) {
        const { printPoint, zmax, camOut } = ops;
        this.op.silent = true;
        ops.addGCode(this.op.disable);
        ops.setLasering(false);
        camOut(printPoint.clone().setZ(zmax), 0);
    }
}
