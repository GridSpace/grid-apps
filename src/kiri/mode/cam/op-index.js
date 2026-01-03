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

        let { lastAxisIndex, widget, updateSlicer, computeShadows, setAxisIndex } = state;
        let { degrees, absolute } = op;

        if (absolute && lastAxisIndex === degrees) {
            return console.log('skip redundant absolute index');
        } else if (!absolute && degrees === 0) {
            return console.log('skip redundant relative index');
        }

        this.degrees = await setAxisIndex(degrees, absolute);
        state.lastAxisIndex = this.degrees;

        // force recompute of topo
        widget.topo = undefined;

        // update slicer for new widget geometry
        updateSlicer();

        // recompute shadow from new widget geometry
        await computeShadows();
    }

    prepare(ops, progress) {
        let { camOut, printPoint, zSafe } = ops;
        // max point of stock corner radius when rotating (safe z when indexing)
        // move above rotating stock
        camOut(printPoint = printPoint.clone().setZ(zSafe), 0);
        // issue rotation command
        camOut(printPoint = printPoint.clone().setZ(zSafe).setA(this.degrees), 0);
    }
}
