/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.laser.driver
gapp.register("kiri-mode.wjet.driver", [], (root, exports) => {

const DRIVERS = root.kiri.driver;
DRIVERS.WJET = Object.assign({}, DRIVERS.LASER, { name: 'WaterJet' });

});

