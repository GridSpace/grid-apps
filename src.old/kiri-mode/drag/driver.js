/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.laser.driver
gapp.register("kiri-mode.drag.driver", [], (root, exports) => {

const DRIVERS = root.kiri.driver;
const { LASER } = DRIVERS;
const { TYPE } = LASER;
DRIVERS.DRAG = Object.assign({}, LASER, { name: "DragKnife", type: TYPE.DRAG });

});

