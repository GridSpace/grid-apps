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
let groups = [];

let api = mesh.api = {

    group: {
        list() {
            return groups.slice();
        },

        // @param group {MeshModel[]}
        new: (models) => {
            api.group.add(new mesh.group(models));
        },

        // @param group {MeshGroup}
        add: (group) => {
            groups.addOnce(group);
            space.world.add(group.group);
            space.update();
        },

        // @param group {MeshGroup}
        remove: (group) => {
            groups.remove(group);
            space.world.remove(group.group);
            space.update();
        }
    },

    model: {
        list() {
            return groups.map(g => g.models).flat();
        },

        remove: (model) => {
            model.group.remove(model);
        }
    }
};

})();
