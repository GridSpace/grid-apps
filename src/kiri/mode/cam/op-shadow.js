/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { polygons as POLY } from '../../../geo/polygons.js';

/**
 * Computes the Part "shadow" and attaches relevant data to the "state" object
 *
 * The part shadow consists of top-cown layers at which the polygon shadow changes
 * shape. For curved or sloped surfaces, this is approximated and paths that clip
 * to it should use the next lower layer from current Z to ensure no part collisions.
 *
 * The shadow at each layer is computed by top-down unioning the part outline with
 * the shadow from the layer above.
 *
 * This operation is injected at the start of the operation chain before processing.
 */
class OpShadow extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    weight() {
        return 0.1;
    }

    async slice(progress) {
        let state = this.state;
        let { ops, slicer, widget, unsafe, addSlices, shadowAt } = state;

        let realOps = ops.map(rec => rec.op).filter(op => op);
        let trueShadow = state.settings.process.camTrueShadow === true;

        let minStepDown = realOps
            .map(op => (op.down || 3) / (trueShadow ? 1 : 3))
            .reduce((a,v) => Math.min(a, v, 1));

        let tslices = [];
        let tshadow = [];
        let tzindex = slicer.interval(minStepDown, {
            fit: true, off: 0.01, down: true, flats: true
        });
        let skipTerrain = unsafe;

        if (skipTerrain) {
            console.log("skipping terrain generation");
            tzindex = [ tzindex.pop() ];
        }

        let lsz; // only shadow up to bottom of last shadow for progressive union
        let cnt = 0;
        let tot = 0;

        // terrain is the "shadow stack" where index 0 = top of part
        // thus array.length -1 = bottom of part
        let terrain = await slicer.slice(tzindex, { each: data => {
            let shadow = trueShadow ? shadowAt(data.z, lsz) : [];
            tshadow = POLY.union(tshadow.slice().appendAll(data.tops).appendAll(shadow), 0.01, true);
            tslices.push(data.slice);
            // capture current shadow for this slice
            data.slice.shadow = tshadow;
            if (false) {
                const slice = data.slice;
                addSlices(slice);
                slice.output()
                    .setLayer("shadow", {line: 0x888800, thin: true })
                    .addPolys(POLY.setZ(tshadow.clone(true), data.z), { thin: true });
                slice.output()
                    .setLayer("slice", {line: 0x886622, thin: true })
                    .addPolys(POLY.setZ(data.tops.clone(true), data.z), { thin: true });
                // let p1 = [], p2 = [], cp = p1;
                // for (let line of data.lines) {
                //     cp.push(line.p1);
                //     cp.push(line.p2);
                //     cp = (cp === p1 ? p2 : p1);
                // }
                // slice.output()
                //     .setLayer("lines1", {line: 0x884444, thin: true })
                //     .addLines(p1, { thin: true });
                // slice.output()
                //     .setLayer("lines2", {line: 0x444488, thin: true })
                //     .addLines(p2, { thin: true });
            }
            lsz = data.z;
            progress(0.5 + 0.5 * (++cnt / tot));
        }, progress: (index, total) => {
            tot = total;
            progress((index / total) * 0.5);
        } });

        if (terrain.length === 0) {
            throw `invalid widget shadow`;
        }

        // TODO: deprecate use of separate shadow vars in state
        state.center = tshadow[0].bounds.center();
        state.tshadow = tshadow;    // true shadow (base of part)
        state.terrain = terrain;    // stack of shadow slices stored in tops
        state.tslices = tslices;    // raw slicer 'data' layer outputs
        state.skipTerrain = skipTerrain;

        // TODO: refactor ops to use a unified shadow object
        state.shadow = {
            base: tshadow,          // computed shadow union at base of part
            stack: terrain,         // stack of shadow slices
            slices: tslices,        // raw slicer 'data' objects
            skip: skipTerrain
        };

        // identify through holes which are inner/child polygons
        // on the bottom-most layer of the shadow stack (tshadow, index == 0)
        state.thruHoles = tshadow.map(p => p.inner || []).flat();
    }
}

export { OpShadow };
