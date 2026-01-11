/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { util } from '../../../../geo/base.js';
import { sliceOne, slicePost } from './slice.js';
import { fdm_prepare } from './prepare.js';
import { fdm_export } from './export.js';

// noz = nozzle diameter
// fil = filament diameter
// slice = slice height
function extrudePerMM(noz, fil, slice) {
    // if (isNaN(noz)) console.trace({ noz });
    // if (isNaN(fil)) console.trace({ fil });
    // if (isNaN(slice)) console.trace({ slice });
    // (ratio of nozzle to filament) * (ratio of slice to nozzle)
    return ((Math.PI * util.sqr(noz / 2)) / (Math.PI * util.sqr(fil / 2))) * (slice / noz);
};

// dist = distance between extrusion points
// perMM = amount extruded per MM (from extrudePerMM)
// factor = scaling factor (usually 1.0)
function extrudeMM(dist, perMM, factor) {
    // if (isNaN(dist)) console.trace({ dist });
    // if (isNaN(perMM)) console.trace({ perMM });
    // if (isNaN(factor)) console.trace({ factor });
    return dist * perMM * factor;
}

// defer loading until client and worker exist
function init(worker) {
    // worker.dispatch.fdm_support_generate = function(data, send) {
    //     const { settings } = data;
    //     const widgets = Object.values(worker.cache);
    //     const fresh = widgets.filter(widget => supports(settings, widget));
    //     send.done(codec.encode(fresh.map(widget => { return {
    //         id: widget.id,
    //         supports: widget.supports,
    //     } } )));
    // };
}

export const FDM = {
    init,
    extrudePerMM,
    extrudeMM,
    slicePre: undefined,
    slice: sliceOne,
    slicePost: slicePost,
    prepare: fdm_prepare,
    export: fdm_export
};
