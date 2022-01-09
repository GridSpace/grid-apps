/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.model", [
    "add.array",    // dep: add.array
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "mesh.object",  // dep: mesh.object
    "mesh.group",   // dep: mesh.group
    "mesh.api",     // dep: mesh.api
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.model) return;

let mapp = mesh;
let space = moto.Space;
let worker = moto.client.fn;

/** default materials **/
let materials = mesh.material = {
    unselected: new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        shininess: 100,
        specular: 0x202020,
        color: 0xffff00,
        opacity: 1
    }),
    selected: new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        shininess: 100,
        specular: 0x202020,
        color: 0x00ee00,
        opacity: 1
    }),
    wireframe: new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        wireframe: true,
        color: 0x0
    }),
};

/** 3D model rendered on plaform **/
mesh.model = class MeshModel extends mesh.object {
    constructor(data, id) {
        super(id);
        let { file, mesh, vertices, indices, normals } = data;

        if (!mesh) {
            dbug.error(`'${file}' missing mesh data`);
            return;
        }

        // remove file name extensions
        let text = file || '';
        let dot = text.lastIndexOf('.');
        if (dot > 0) file = text.substring(0, dot);

        this.file = file || 'unnamed';
        this.load(mesh || vertices, indices, normals);

        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, { file, mesh });
    }

    get type() {
        return "model";
    }

    get object() {
        return this.mesh;
    }

    get matrix() {
        return this.mesh.matrixWorld.elements;
    }

    debug() {
        worker.model_debug({
            matrix: this.matrix,
            id: this.id
        }).then(data => {
            // for debugging matrix ops
            return mesh.api.group.new([new mesh.model({
                file: `synth-${this.name}`,
                mesh: data
            })]);
        });
    }

    load(vertices, indices, normals) {
        let geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        if (indices) geo.setIndex(new THREE.BufferAttribute(indices, 1));
        if (!normals) geo.computeVertexNormals();
        let meh = this.mesh = new THREE.Mesh(geo, materials.unselected);
        meh.receiveShadow = true;
        meh.castShadow = true;
        meh.renderOrder = 1;
        // sets fallback opacity for wireframe toggle
        this.opacity(1);
        // this ref allows clicks to be traced to models and groups
        meh.model = this;
        // sync data to worker
        worker.model_load({id: this.id, name: this.file, vertices, indices});
    }

    reload(vertices, indices, normals) {
        this.wireframe(false);
        let geo = this.mesh.geometry;
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.setAttribute('normal', undefined);
        if (indices) geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.attributes.position.needsUpdate = true;
        if (!normals) geo.computeVertexNormals();
        // sync data to worker
        worker.model_load({id: this.id, name: this.name, vertices, indices});
    }

    get group() {
        return this._group;
    }

    set group(gv) {
        if (gv && this._group && this._group !== gv) {
            throw "models can only belong to one group";
        }
        this._group = gv;
    }

    get attributes() {
        return this.mesh.geometry.attributes;
    }

    get vertices() {
        return this.attributes.position.count;
    }

    get faces() {
        return this.vertices / 3;
    }

    visible(bool) {
        if (bool === undefined) {
            return this.mesh.visible;
        }
        if (bool.toggle) {
            return this.visible(!this.mesh.visible);
        }
        this.mesh.visible = bool;
    }

    material(mat) {
        let op = this.opacity();
        this.mesh.material = mat = mat.clone();
        mat.opacity = op;
        if (op === 1) this.wireframe(false);
    }

    opacity(ov, opt = {}) {
        let mat = this.mesh.material;
        if (ov === undefined) {
            return mat.opacity;
        }
        if (ov.restore) {
            ov = this._op;
        } else if (ov.temp !== undefined) {
            ov = ov.temp;
        } else {
            this._op = ov;
        }
        if (ov <= 0.0) {
            mat.transparent = false;
            mat.opacity = 1;
            mat.visible = false;
        } else {
            mat.transparent = true;
            mat.opacity = ov;
            mat.visible = true;
        }
        space.update();
    }

    wireframe(bool, opt = {}) {
        if (bool === undefined) {
            return this._wire ? {
                enabled: true,
                opacity: this.opacity(),
                color: this._wire ? this._wire.material.color : undefined,
            } : {
                enabled: false
            };
        }
        if (bool.toggle) {
            return this.wireframe(this._wire ? false : true, opt);
        }
        if (this._wire) {
            this.mesh.remove(this._wire);
            this._wire = undefined;
            this.opacity({restore: true});
        }
        if (bool) {
            this._wire = new THREE.Mesh(this.mesh.geometry.shallowClone(), materials.wireframe);
            this.mesh.add(this._wire);
            this.opacity({temp: opt.opacity || 0});
        }
        space.update();
    }

    remove() {
        if (arguments.length === 0) {
            // direct call requires pass through group
            this.group.remove(this);
            this.group = undefined;
            this.removed = 'pending';
        } else {
            // update worker state
            worker.object_destroy({id: this.id});
            // update object store
            mesh.db.space.remove(this.id);
            // tag removed for debugging
            this.removed = 'complete';
        }
    }
};

})();
