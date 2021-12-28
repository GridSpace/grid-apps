/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    // start worker pool
    moto.client.start(`/code/mesh_pool?${gapp.version}`, moto.client.max());

})();
