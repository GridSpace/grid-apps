/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';

export class OpIndex extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    weight() {
        return 0.1;
    }

    async slice() {
        let { op, state } = this;
        if (!state.isIndexed) {
            throw 'index op requires indexed stock';
        }
        let { widget, updateSlicer, computeShadows, setAxisIndex } = state;
        this.degrees = await setAxisIndex(op.degrees, op.absolute);
        // force recompute of topo
        widget.topo = undefined;
        updateSlicer();
        await computeShadows();
    }

    prepare(ops, progress) {
        let { zmax, zsafe, camOut, printPoint } = ops;
        // max point of stock corner radius when rotating (safe z when indexing)
        let ztop = Math.max(zsafe, zmax);
        // move above rotating stock
        camOut(printPoint = printPoint.clone().setZ(ztop), 0);
        // issue rotation command
        camOut(printPoint = printPoint.clone().setZ(ztop).setA(this.degrees), 0);
    }
}
