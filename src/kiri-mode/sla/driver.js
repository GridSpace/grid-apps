/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// use: kiri.print
gapp.register("kiri-mode.sla.driver", [], (root, exports) => {

const { kiri } = root
const { driver } = kiri;

const SLA = driver.SLA = {
    prepare,
    legacy: false
};

if (SLA.legacy) {
    console.log("SLA Driver in Legacy Mode");
}

// runs in worker. would usually be in src/mode/sla/prepare.js
// but the SLA driver skips the prepare step because there is no path routing
async function prepare(widgets, settings, update) {
    root.worker.print = kiri.newPrint(settings, widgets);
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

});
