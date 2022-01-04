/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.group", [
    "add.array",    // dep: add.array
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "moto.broker",  // dep: moto.broker
    "mesh.object",  // dep: mesh.object
    "mesh.model",   // dep: mesh.model
    "mesh.api",     // dep: mesh.api
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.group) return;

let broker = gapp.broker;
let call = broker.send;

let space = moto.Space;
let worker = moto.client.fn;

mesh.group = class MeshGroup extends mesh.object {

    // @param group {MeshModel[]}
    constructor(models = [], id) {
        super(id);
        this.group = new THREE.Group();
        this.models = [];
        for (let model of models) {
            this.add(model);
        }
    }

    type() {
        return "group";
    }

    object() {
        return this.group;
    }

    // @param model {MeshModel}
    add(model) {
        model.group = this;
        this.models.addOnce(model);
        this.group.add(model.mesh);
        space.update();
        call.model_add({model, group:this});
        worker.group_add({id: this.id, model:model.id});
        // update data store
        mesh.db.space.put(this.id, this.models.map(m => m.id));
        return this;
    }

    // @param model {MeshModel}
    remove(model) {
        // console.log('group',this,'remove',model);
        // remove all models and group
        if (arguments.length === 0) {
            for (let m of this.models.slice()) {
                this.remove(m);
            }
            return;
        }
        this.models.remove(model);
        this.group.remove(model.mesh);
        // create message for listeners
        call.model_remove({model, group:this});
        // trigger sync with worker
        worker.group_remove({id: this.id, model: model.id});
        // ensure worker cleanup of model
        model.remove(true);
        // auto-remove group when empty
        if (this.group.children.length === 0) {
            mesh.api.group.remove(this);
            // update worker state
            worker.object_destroy({id: this.id});
            // update object store
            mesh.db.space.remove(this.id);
        } else {
            // update data store
            mesh.db.space.put(this.id, this.models.map(m => m.id));
        }
        space.update();
        return this;
    }

    // update(oldmesh, newmesh) {
    //     this.group.remove(oldmesh);
    //     this.group.add(newmesh);
    // }

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
