/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.object", [
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "moto.worker",  // dep: moto.worker
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.object) return;

mesh.object = class MeshObject {
    constructor(data) {
        let { file, mesh } = data;

        if (!mesh) {
            dbug.error(`'${file}' missing mesh data`);
            return;
        }

        console.log({new_mesh_object: data});
    }
};

})();
