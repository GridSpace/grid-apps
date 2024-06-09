/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.polygons
// dep: geo.point
// dep: kiri.slice
// dep: kiri-mode.laser.driver
// use: kiri.pack
// use: kiri.render
gapp.register("kiri-mode.drag.driver", [], (root, exports) => {

root.kiri.driver.DRAG = root.kiri.driver.LASER;

});

