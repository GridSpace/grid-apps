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

export function ensureSLAMemory(required) {
    let wasm = SLA.wasm;
    let available = wasm.memory.buffer.byteLength;

    if (available >= required) {
        return;
    }

    let page = 65536;
    let pages = Math.ceil((required - available) / page);
    try {
        wasm.memory.grow(pages);
    } catch (error) {
        let growError = new Error(`SLA WASM memory grow failed: need ${required} bytes, have ${available} bytes`);
        growError.code = "SLA_WASM_MEMORY";
        growError.cause = error;
        throw growError;
    }
    wasm.heap = new Uint8Array(wasm.memory.buffer);
}

// runs in worker. would usually be in src/mode/sla/prepare.js
// but the SLA driver skips the prepare step because there is no path routing
async function sla_prepare(widgets, settings, update) {
    self.kiri_worker.current.print = newPrint(settings, widgets);
    if (!SLA.wasm) {
        SLA.wasmPromise = SLA.wasmPromise || fetch('/wasm/kiri-sla.wasm')
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
        await SLA.wasmPromise;
    }
    update(1);
}
