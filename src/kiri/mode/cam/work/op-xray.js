/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { newSlice } from '../../../core/slice.js';
import { Slicer } from './slicer-cam.js';

class OpXRay extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { widget, addSlices } = this.state;
        let slicer = new Slicer(widget);
        let xrayind = Object.keys(slicer.zLine)
            .map(v => parseFloat(v).round(5))
            .sort((a,b) => a-b);
        let xrayopt = { each: data => {
            let slice = newSlice(data.z);
            slice.addTops(data.tops);
            // data.tops.forEach(top => slice.addTop(top));
            slice.lines = data.lines;
            slice.xray();
            addSlices(slice);
        }, over: false, flatoff: 0, edges: true, openok: true };
        await slicer.slice(xrayind, xrayopt);
        // xrayopt.over = true;
        // slicer.slice(xrayind, xrayopt);
    }
}

export { OpXRay };
