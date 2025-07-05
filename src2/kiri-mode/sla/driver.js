/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { newPrint } from '../../kiri/print.js';

export const driver = {
    prepare,
    legacy: false
};

if (driver.legacy) {
    console.log("SLA Driver in Legacy Mode");
}

// runs in worker. would usually be in src/mode/sla/prepare.js
// but the SLA driver skips the prepare step because there is no path routing
async function prepare(widgets, settings, update) {
    self.worker.print = newPrint(settings, widgets);
    if (!driver.wasm) {
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
                driver.wasm = {
                    heap,
                    memory: exports.memory,
                    render: exports.render,
                    rle_encode: exports.rle_encode
                };
            });
    }
    update(1);
}

export { prepare };
