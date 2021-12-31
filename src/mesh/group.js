/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.group", [
    "add.array",    // dep: add.array
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "mesh.model",   // dep: mesh.model
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.group) return;

mesh.group = class MeshGroup {

    // @param group {THREE.Group}
    constructor(models) {
        this.group = new THREE.Group();
        this.models = [];
        for (let model of (models || [])) {
            this.add(model);
        }
    }

    bounds() {
        return mesh.util.bounds(this.group);
    }

    floor() {
        let b = this.bounds();
        this.move(0, 0, -b.min.z);
        return this;
    }

    centerXY() {
        let b = this.bounds();
        this.move(-b.center.x, b.center.y, 0);
        return this;
    }

    move(x = 0, y = 0, z = 0) {
        let pos = this.position();
        pos.set(pos.x + x, pos.y + y, pos.z + z);
        return this;
    }

    position() {
        let pos = this.group.position;
        if (arguments.length === 0) {
            return pos;
        }
        pos.set(...arguments);
    }

    // @param model {MeshModel}
    add(model) {
        model.group = this;
        this.models.addOnce(model);
        this.group.add(model.mesh);
        moto.Space.update();
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
    }
};

})();
