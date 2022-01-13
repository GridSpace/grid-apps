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

let { Quaternion, Group, Vector3 } = THREE;
let broker = gapp.broker;
let call = broker.send;
let space = moto.Space;
let worker = moto.client.fn;
let lookUp = new Vector3(0,0,-1);

mesh.group = class MeshGroup extends mesh.object {

    // @param group {MeshModel[]}
    constructor(models = [], id, name) {
        super(id);
        this.group3 = new Group();
        this.models = [];
        this.name = name;
        for (let model of models) {
            this.add(model);
        }
    }

    get type() {
        return "group";
    }

    get object() {
        return this.group3;
    }

    // @param model {MeshModel}
    add(model) {
        model.group = this;
        this.models.addOnce(model);
        this.group3.add(model.mesh);
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
        this.group3.remove(model.mesh);
        // create message for listeners
        call.model_remove({model, group:this});
        // trigger sync with worker
        worker.group_remove({id: this.id, model: model.id});
        // ensure worker cleanup of model
        model.remove(true);
        // auto-remove group when empty
        if (this.group3.children.length === 0) {
            mesh.api.group.remove(this);
            // manage lifecycle with worker, mesh app caches, etc
            this.destroy();
        } else {
            // update data store
            mesh.db.space.put(this.id, this.models.map(m => m.id));
        }
        space.update();
        return this;
    }

    // rotate model so face normal points toward floor
    faceDown(normal) {
        let q = new Quaternion().setFromUnitVectors(normal, lookUp);
        this.qrotation(q);
        this.floor();
    }

    promote() {
        return this.centerModels().centerXY().floor();
    }

    // center objects to group bounds
    // dependent on first being added to world/scene
    centerModels() {
        let bounds = this.bounds;
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
