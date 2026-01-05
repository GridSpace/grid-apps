/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { util } from '../../../geo/base.js';
import { fdm_slice, slicePost, supports } from './slice.js';
import { fdm_prepare } from './prepare.js';
import { fdm_export } from './export.js';
import { codec } from '../../core/codec.js';

// noz = nozzle diameter
// fil = filament diameter
// slice = slice height
function extrudePerMM(noz, fil, slice) {
    // (ratio of nozzle to filament) * (ratio of slice to nozzle)
    return ((Math.PI * util.sqr(noz / 2)) / (Math.PI * util.sqr(fil / 2))) * (slice / noz);
};

// dist = distance between extrusion points
// perMM = amount extruded per MM (from extrudePerMM)
// factor = scaling factor (usually 1.0)
function extrudeMM(dist, perMM, factor) {
    return dist * perMM * factor;
}

// defer loading until client and worker exist
function init(worker) {

    worker.dispatch.fdm_support_generate = function(data, send) {
        const { settings } = data;
        const widgets = Object.values(worker.cache);
        const fresh = widgets.filter(widget => supports(settings, widget));
        send.done(codec.encode(fresh.map(widget => { return {
            id: widget.id,
            supports: widget.supports,
        } } )));
    };

}

export const FDM = {
    init,
    extrudePerMM,
    extrudeMM,
    slicePre: undefined,
    slice: fdm_slice,
    slicePost: slicePost,
    prepare: fdm_prepare,
    export: fdm_export
};
