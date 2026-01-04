/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { newSlice } from '../../core/slice.js';
import { newPolygon } from '../../../geo/polygon.js';

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

    async slice(progress) {
        let state = this.state;

        let { addSlices, settings, shadowAt, unsafe, widget, workarea } = state;
        let { devel } = settings.controller;

        let bounds = widget.getBoundingBox();
        let slices = [];
        let shadowBase;
        let skipTerrain = unsafe;
        let terrain = [];
        let tzindex = [];

        let minZ = Math.floor(bounds.min.z);
        let maxZ = Math.floor(bounds.max.z);
        for (let z = maxZ; z >= minZ; z--) {
            tzindex.push(z);
        }

        if (skipTerrain) {
            console.log("skipping terrain generation");
            shadowBase = [ newPolygon() ];
            tzindex = [ ];
        }

        // distributed pre-fill shadow layer cache
        await widget.computeShadowStack(tzindex, prog => progress(prog / 2, 'shadow'));

        // terrain is the "shadow stack" where index 0 = top of part
        // thus array.length -1 = bottom of part
        for (let i=0; i<tzindex.length; i++) {
            let z = tzindex[i];
            let shadow = shadowBase = await shadowAt(z);
            let slice = newSlice(z);
            slice.shadow = shadow;
            slice.addTops(shadow);
            slices.push(slice);
            terrain.push({ slice, tops: shadow });
            if (devel) {
                slice.output()
                    .setLayer("shadow", {line: 0x888800, thin: true })
                    .addPolys(shadow, { thin: true });
            }
            progress(0.5 + (i / tzindex.length) * 0.5, 'shadow');
        }

        if (devel && slices.length) {
            addSlices(slices);
        }

        if (terrain.length === 0) {
            throw `invalid widget shadow`;
        }

        // TODO: refactor ops to use a unified shadow object
        state.shadow = {
            base: shadowBase,       // computed shadow union at base of part
            holes: shadowBase.map(p => p.inner || []).flat(),
            skip: skipTerrain,
            slices: slices,         // legacy / transitional
            stack: terrain,         // stack of shadow slices
        };

    }
}

export { OpShadow };
