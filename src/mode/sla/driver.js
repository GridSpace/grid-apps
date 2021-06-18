/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.SLA) return;

    const KIRI = self.kiri,
        SLA = KIRI.driver.SLA = {
            // init,           // src/mode/sla/client.js
            // slice,          // src/mode/sla/slice.js
            prepare,
            // export,         // src/mode/sla/export.js
            // printDownload,  // src/mode/sla/client.js
            legacy: false
        };

    if (SLA.legacy) console.log("SLA Driver in Legacy Mode");

    // runs in worker. would usually be in src/mode/sla/prepare.js
    function prepare(widgets, settings, update) {
        self.worker.print = KIRI.newPrint(settings, widgets);
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

})();
