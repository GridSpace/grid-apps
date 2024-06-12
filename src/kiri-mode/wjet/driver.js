/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.laser.driver
gapp.register("kiri-mode.wjet.driver", [], (root, exports) => {

const DRIVERS = root.kiri.driver;
const { LASER } = DRIVERS;
const { TYPE } = LASER;
DRIVERS.WJET = Object.assign({}, LASER, { name: 'WaterJet', type: TYPE.WJET });

});

