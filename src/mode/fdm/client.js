/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        FDM = KIRI.driver.FDM;

    FDM.init = function(kiri, api) {
        api.event.on("settings.load", (settings) => {
            if (settings.mode !== 'FDM') return;
            settings.process.outputOriginCenter = (settings.device.originCenter || false);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.fdmSupport.marker.style.display = proc.sliceSupportEnable ? 'flex' : 'none';
            api.ui.fdmInfill.marker.style.display = proc.sliceFillSparse > 0 ? 'flex' : 'none';
            api.ui.fdmRaft.marker.style.display = proc.outputRaft ? 'flex' : 'none';
        });
    }

})();
