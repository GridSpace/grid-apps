/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';

export class OpLaserOn extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    prepare(ops, progress) {
        const { printPoint, setPrintPoint, setTool, zmax, camOut } = ops;
        this.op.silent = true;
        setTool(0);
        ops.addGCode(this.op.enable);
        ops.setLasering(true, this.op.power);
    }
}
