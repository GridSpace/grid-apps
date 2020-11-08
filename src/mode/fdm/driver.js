/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        FDM = KIRI.driver.FDM = {
            // init,           // src/mode/fdm/client.js
            // slice,          // src/mode/fdm/slice.js
            // prepare,        // src/mode/fdm/prepare.js
            // printExport,    // src/mode/fdm/export.js
            fixExtruders
        };

    function fixExtruders(settings) {
        Object.entries(settings.widget).forEach(arr => {
            let [wid,val] = arr;
            let dext = settings.device.extruders[val.extruder];
            if (!dext) {
                settings.widget[wid].extruder = 0;
            }
        });
        return settings;
    }

    // customer gcode post function for XYZ daVinci Mini W
    self.kiri_fdm_xyz_mini_w = function(gcode, options) {
        return btoa("; filename = kirimoto.gcode\n; machine = dv1MW0A000\n" + gcode);
    };

})();
