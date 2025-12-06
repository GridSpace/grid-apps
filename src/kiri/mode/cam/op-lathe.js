/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { generate as topo4_generate } from './topo4.js';
import { newPoint } from '../../../geo/point.js';

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
        let { op, slices, topo } = this;
        let { camOut, newLayer, zSafe } = ops;

        let rez = topo.resolution;

        // start top center, X = 0, Y = 0 closest to 4th axis chuck
        camOut(newPoint(0, 0, zSafe), 0);

        for (let slice of slices) {
            // ignore debug slices
            if (!slice.camLines) {
                continue;
            }

            let last;
            for (let path of slice.camLines) {
                let latent;
                path.forEachPoint((point, pidx) => {
                    if (last) {
                        const dz = Math.abs(last.z - point.z);
                        if (dz < rez) {
                            // latent point should still be included in
                            // preview b/c arcs would look like straight lines
                            latent = point.clone();
                            return;
                        }
                        if (latent) {
                            camOut(latent, 1);
                            latent = undefined;
                        }
                    }
                    camOut(last = point.clone(), pidx > 0 ? 1 : 0);
                }, false);
                if (latent) {
                    camOut(latent, 1);
                }
            }

            newLayer();
        }

        // move to safe height and reset A axis
        let last = ops.lastPoint();
        let amax = (Math.round(last.a / 360) * 360).round(2);
        // camOut(last = last.clone().setZ(zmax), 0);
        // camOut(last = last.clone().setA(amax), 0);
        newLayer();
        ops.addGCode([`G0 Z${zSafe.round(2)}`, `G0 A${amax}`, "G92 A0"]);
    }
}

export { OpLathe };