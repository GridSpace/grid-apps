/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const KIRI = self.kiri,
        CAM = KIRI.driver.CAM = {
            // init,        // src/mode/cam/client.js
            // slice,       // src/mode/cam/slice.js
            // prepare,     // src/mode/cam/prepare.js
            // export       // src/mode/cam/export.js
        },
        CPRO = CAM.process = {
            LEVEL: 1,
            ROUGH: 2,
            OUTLINE: 3,
            CONTOUR_X: 4,
            CONTOUR_Y: 5,
            TRACE: 6,
            DRILL: 7
        };

        // defer loading until KIRI.client and KIRI.worker exist
        KIRI.loader.push(function(API) {

            if (KIRI.client)
            KIRI.client.traces = function(ondone) {
                KIRI.client.sync();
                send("traces", {
                    settings: API.conf.get()
                }, ondone);
            };

            if (KIRI.worker)
            KIRI.worker.traces = function(data, send) {
                const { settings } = data;
                const widgets = Object.values(cache);
                widgets.forEach(widget => CAM.traces(settings, widget));
                send.done(123);
            };

        });

})();
