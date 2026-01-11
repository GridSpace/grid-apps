/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { newPrint } from '../../../core/print.js';
import { sla_slice } from './slice.js';
import { sla_export } from './export.js';

export const SLA = {
    init,
    legacy: false,
    slice: sla_slice,
    prepare: sla_prepare,
    export: sla_export,
};

if (SLA.legacy) {
    console.log("SLA Driver in Legacy Mode");
}

function init(worker) {
    // console.log({ INIT_SLA: worker });
}

// runs in worker. would usually be in src/mode/sla/prepare.js
// but the SLA driver skips the prepare step because there is no path routing
async function sla_prepare(widgets, settings, update) {
    self.kiri_worker.current.print = newPrint(settings, widgets);
    if (!SLA.wasm) {
        fetch('/wasm/kiri-sla.wasm')
            .then(response => response.arrayBuffer())
            .then(bytes => WebAssembly.instantiate(bytes, {
                env: {
                    reportf: (a,b) => { console.log('[f]',a,b) },
                    reporti: (a,b) => { console.log('[i]',a,b) }
                }
            }))
            .then(results => {
                let {module, instance} = results;
                let {exports} = instance;
                let heap = new Uint8Array(exports.memory.buffer);
                SLA.wasm = {
                    heap,
                    memory: exports.memory,
                    render: exports.render,
                    rle_encode: exports.rle_encode
                };
            });
    }
    update(1);
}
