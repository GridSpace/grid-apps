/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    // start worker pool (disabled for now with *0)
    moto.client.start(`/code/mesh_pool?${gapp.version}`, moto.client.max() * 0);

    gapp.finalize("mesh.work");

})();
