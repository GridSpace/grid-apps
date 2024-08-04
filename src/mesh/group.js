/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: add.three
// dep: moto.license
// dep: moto.broker
// dep: moto.client
// dep: mesh.object
// use: mesh.api
// use: mesh.model
gapp.register("mesh.group", [], (root, exports) => {

const { mesh, moto } = root;
const { Quaternion, Group, Vector3 } = THREE;
const { broker } = gapp;
const { space } = moto;

const call = broker.send;
const worker = moto.client.fn;
const lookUp = new Vector3(0,0,-1);

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
    // @param free {boolean} prevent cleanup of model so it can be re-used
    remove(model, opt = { free: true }) {
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
        if (opt.free) model.remove(true);
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
        this.centerModels();
        let { dim, mid } = this.bounds;
        let { x, y, z } = dim;
        let max = Math.max(x, y, z);
        if (max < 2) {
            mesh.api.log.emit(`auto-scaling import from ${max.round(5)}`);
            this.scale(1000, 1000, 1000);
        }
        let { center, floor } = mesh.api.prefs.map.space;
        if (center !== false) this.centerXY();
        if (floor !== false) this.floor();
        return this;
    }

    rotate(x = 0, y = 0, z = 0) {
        console.log('group rotate', ...arguments);
        for (let model of this.models) {
            model.rotate(...arguments);
        }
    }

    scale(x = 1, y = 1, z = 1) {
        for (let m of this.models) {
            m.scale(x, y, z);
        }
        return this;
    }

    // center objects to group bounds
    // dependent on first being added to world/scene
    centerModels() {
        let bounds = this.bounds;
        for (let model of this.models) {
            model.center(bounds);
        }
        let { center } = mesh.api.prefs.map.space;
        if (center === false) {
            let { mid } = bounds;
            this.move(mid.x, mid.y, mid.z);
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

    normals() {
        for (let model of this.models) {
            model.normals(...arguments);
        }
    }

    select() {
        for (let model of this.models) {
            model.select(...arguments);
        }
    }
};

});
