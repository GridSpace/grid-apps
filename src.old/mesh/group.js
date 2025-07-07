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
const { Group, Box3 } = THREE;
const { broker } = gapp;
const { space } = moto;

const call = broker.send;
const worker = moto.client.fn;

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

    get bounds() {
        let box3 = new Box3();
        for (let model of this.models) {
            box3.union(model.world_bounds);
        }
        return box3;
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

    promote() {
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
        this.log('group-rotate', ...arguments);
        for (let model of this.models) {
            model.rotate(...arguments);
        }
        return this;
    }

    qrotate(quaternion) {
        this.log('group-rotate', quaternion.toArray());
        for (let model of this.models) {
            model.qrotate(quaternion);
        }
        return this;
    }

    scale(x = 1, y = 1, z = 1) {
        this.log('group-scale', ...arguments);
        for (let m of this.models) {
            m.scale(x, y, z);
        }
        return this;
    }

    move(x = 0, y = 0, z = 0) {
        this.log('group-move', ...arguments);
        if (!(x || y || z)) return;
        for (let model of this.models) {
            model.move(x, y, z);
        }
        return this;
    }

    center() {
        let b = this.bounds;
        return this.move(-b.mid.x, -b.mid.y, -b.mid.z);
    }

    centerXY() {
        let b = this.bounds;
        return this.move(-b.mid.x, -b.mid.y, 0);
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
