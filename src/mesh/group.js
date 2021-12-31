/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.group", [
    "add.array",    // dep: add.array
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "mesh.object",  // dep: mesh.object
    "mesh.model",   // dep: mesh.model
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.group) return;

mesh.group = class MeshGroup extends mesh.object {

    // @param group {mesh.model[]}
    constructor(models) {
        super();
        this.group = new THREE.Group();
        this.models = [];
        for (let model of (models || [])) {
            this.add(model);
        }
    }

    object() {
        return this.group;
    }

    // @param model {MeshModel}
    add(model) {
        model.group = this;
        this.models.addOnce(model);
        this.group.add(model.mesh);
        moto.Space.update();
        return this;
    }

    // @param model {MeshModel}
    remove(model) {
        model.group = undefined;
        this.models.remove(model);
        this.group.remove(model.mesh);
        // auto-remove group when empty
        if (this.group.children.length === 0) {
            mesh.api.group.remove(this);
        }
        moto.Space.update();
        return this;
    }
};

})();
