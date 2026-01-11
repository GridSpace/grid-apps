/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { generate as topo4_generate } from './topo4.js';
import { newPoint } from '../../../../geo/point.js';

function createFilter(op) {
    let ok = () => true;
    let filter = slices => slices;
    let filterString = op.filter?.map(l => l.trim()).join('\n');
    if (filterString) {
        try {
            const obj = eval(`( ${filterString} )`);
            const accept = [];
            let index = 0;
            let sl_fn = obj?.slices ?? ok;
            filter = function (slices) {
                for (let slice of slices) {
                    if (sl_fn(slice, index++)) {
                        accept.push(slice);
                    }
                }
                return accept;
            };
        } catch (e) {
            console.log('filter parse error', e, op.filter);
        }
    }
    return filter;
}

class OpLathe extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices, color } = state;
        let filter = createFilter(op);
        this.topo = await topo4_generate({
            op,
            state,
            onupdate: (pct, msg) => {
                progress(pct, msg);
            },
            ondone: (slices) => {
                slices = filter(slices);
                this.slices = slices;
                addSlices(slices, false);
            }
        });
    }

    prepare(ops, progress) {
        let { slices, state, topo } = this;
        let { camOut, newLayer, setContouring, setNextIsMove, zSafe } = ops;
        let { gcodeResetA } = state.settings.device;

        // start top center, X = 0, Y = 0 closest to 4th axis chuck
        camOut(newPoint(0, 0, zSafe).setA(0), 0);
        setContouring(true);
        setNextIsMove();

        for (let slice of slices) {
            // ignore debug slices
            if (!slice.camLines) {
                continue;
            }

            for (let path of slice.camLines) {
                for (let point of path.points) {
                    camOut(point);
                }
            }

            newLayer();
        }

        // move to safe height and reset A axis
        newLayer();
        ops.addGCode([`G0 Z${zSafe.round(2)}`, gcodeResetA.join('\n') ?? "G92.4 A0 R0"]);
    }
}

export { OpLathe };