/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// dep: ext.three
// dep: ext.three-bgu
gapp.register("mesh.api", [
    "moto.license", // dep: moto.license
    "moto.client",  // dep: moto.client
    "moto.space",   // dep: moto.space
    "mesh.tool",    // dep: mesh.tool
    "add.array",    // dep: add.array
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.api) return;

let space = moto.Space;
let models = [];

let api = mesh.api = {

    models: {
        all: models,

        add: model => {
            if (!models.contains(model)) {
                space.model.add(model.mesh);
                models.push(model);
            }
        },

        remove: Array.handle(model => {
            space.model.remove(model.mesh);
            models.remove(model);
        })
    }
};

})();
