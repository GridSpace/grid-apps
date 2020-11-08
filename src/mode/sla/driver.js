/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.SLA) return;

    const KIRI = self.kiri,
        SLA = KIRI.driver.SLA = {
            // init,           // src/mode/sla/client.js
            // slice,          // src/mode/sla/slice.js
            printSetup,
            // export,         // src/mode/sla/export.js
            // printDownload,  // src/mode/sla/client.js
            legacy: false
        };

    if (SLA.legacy) console.log("SLA Driver in Legacy Mode");

    /**
     * DRIVER PRINT CONTRACT - runs in worker
     * @param {Object} print state object
     * @param {Function} update incremental callback
     */
    function printSetup(print, update) {
        update(1);
    };

})();
