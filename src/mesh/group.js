/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.group", [
    "add.array",    // dep: add.array
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "mesh.object",  // dep: mesh.object
    "mesh.model",   // dep: mesh.model
    "mesh.api",     // dep: mesh.api
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.group) return;

mesh.group = class MeshGroup extends mesh.object {

    // @param group {mesh.model[]}
    constructor(models = []) {
        super();
        this.group = new THREE.Group();
        this.models = [];
        for (let model of models) {
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
        // remove all models
        if (arguments.length === 0) {
            for (let m of this.models.slice()) {
                this.remove(m);
            }
            return;
        }
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

    // center objects to group bounds
    // dependent on first being added to world/scene
    centerModels() {
        let bounds = this.bounds();
        for (let model of this.models) {
            model.center(bounds);
        }
        return this;
    }

    opacity() {
        for (let model of this.models) {
            model.opacity(...arguments);
        }
    }

    wireframe() {
        for (let model of this.models) {
            model.wireframe(...arguments);
        }
    }

    material() {
        for (let model of this.models) {
            model.material(...arguments);
        }
    }
};

})();
