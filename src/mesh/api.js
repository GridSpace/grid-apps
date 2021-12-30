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

        add: (list, group = new THREE.Group()) => {
            if (!Array.isArray(list)) {
                list = [ list ];
            }
            for (let model of list) {
                models.addOnce(model);
                model.group = group;
                group.add(model.mesh);
            }
            space.world.add(group);
            space.refresh();
        },

        remove: list => {
            if (!Array.isArray(list)) {
                list = [ list ];
            }
            for (let model of list) {
                if (models.remove(model)) {
                    model.group.remove(model.mesh);
                    if (model.group.children.length === 0) {
                        space.world.remove(model.group);
                    }
                    space.refresh();
                }
            }
        }
    }
};

})();
