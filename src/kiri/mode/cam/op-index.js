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
        const { lastPoint, zmax, zclear, camOut, stock, newLayer } = ops;
        let last = lastPoint();
        if (last) {
            // max point of stock corner radius when rotating (safe z when indexing)
            const rzmax = (Math.max(stock.y, stock.z) * Math.sqrt(2)) / 2 + zclear;
            const zmove = Math.max(rzmax, zmax);
            // move above rotating stock
            camOut(last = last.clone().setZ(zmove), 0);
            // issue rotation command
            camOut(last = last.clone().setZ(zmove).setA(this.degrees), 0);
        }
    }
}
