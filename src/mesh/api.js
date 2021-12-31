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
        // @returns {MeshGroup[]}
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
        // @returns {MeshModel[]}
        list() {
            return groups.map(g => g.models).flat();
        },

        // @param group {MeshModel}
        remove: (model) => {
            model.group.remove(model);
        }
    }
};

let util = mesh.util = {

    // @param object {THREE.Object3D}
    // @returns bounds modified for moto.Space
    bounds: (object) => {
        let box = new THREE.Box3().setFromObject(object);
        let bnd = {
            min: {
                x: box.min.x,
                y: box.min.z,
                z: box.min.y
                },
            max: {
                x: box.max.x,
                y: box.max.z,
                z: box.max.y
            }
        };
        bnd.size = {
            x: bnd.max.x - bnd.min.x,
            y: bnd.max.y - bnd.min.y,
            z: bnd.max.z - bnd.min.z
        };
        bnd.center = {
            x: (bnd.max.x + bnd.min.x) / 2,
            y: (bnd.max.y + bnd.min.y) / 2,
            z: (bnd.max.z + bnd.min.z) / 2
        };
        return bnd;
    }

};

})();
