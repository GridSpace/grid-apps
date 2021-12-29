/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// start worker pool (disabled for now with *0)
moto.client.start(`/code/mesh_pool?${gapp.version}`, moto.client.max() * 0);

// dep: ext.three
// dep: ext.three-bgu
gapp.finalize("mesh.work", [
    "moto.license", // dep: moto.license
    "moto.client"   // dep: moto.client
]);

})();
