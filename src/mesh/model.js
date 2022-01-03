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
        specular: 0x181818,
        color: 0xffff00,
        opacity: 1
    }),
    selected: new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        shininess: 100,
        specular: 0x181818,
        color: 0x00ff00,
        opacity: 1
    })
};

/** 3D model rendered on plaform **/
mesh.model = class MeshModel extends mesh.object {
    constructor(data, id) {
        super(id);
        let { file, mesh } = data;

        if (!mesh) {
            dbug.error(`'${file}' missing mesh data`);
            return;
        }

        // remove file name extensions
        let text = file || '';
        let dot = text.lastIndexOf('.');
        if (dot > 0) file = text.substring(0, dot);

        this.file = file || 'unnamed';
        this.mesh = this.load(mesh);

        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, { file, mesh });
    }

    type() {
        return "model";
    }

    object() {
        return this.mesh;
    }

    debug() {
        worker.model_debug({
            matrix: this.mesh.matrixWorld.elements,
            id: this.id
        }).then(data => {
            // for debugging matrix ops
            return mesh.api.group.new([new mesh.model({
                file: `synth-${this.name}`,
                mesh: data[0]
            })]);
        });
    }

    load(vertices, indices) {
        let geo = new THREE.BufferGeometry();
        if (indices) geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        let meh = new THREE.Mesh(geo, materials.unselected);
        geo.computeVertexNormals();
        // geo.computeFaceNormals();
        meh.receiveShadow = true;
        meh.castShadow = true;
        meh.renderOrder = 1;
        // this ref allows clicks to be traced to models and groups
        meh.model = this;
        // sync data to worker
        worker.model_load({id: this.id, name: this.file, vertices, indices});
        return meh;
    }

    reload(vertices, indices) {
        let geo = this.mesh.geometry;
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.setAttribute('normal', undefined);
        if (indices) {
            geo.setIndex(new THREE.BufferAttribute(indices, 1));
            geo.attributes.index.needsUpdate = true;
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
        // geo.computeFaceNormals();
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

    opacity(ov) {
        let mat = this.mesh.material;
        if (ov === undefined) {
            return mat.opacity;
        }
        if (ov <= 0.0) {
            mat.transparent = false;
            mat.opacity = 1;
            mat.visible = false;
        } else {
            mat.transparent = ov < 1.0;
            mat.opacity = ov;
            mat.visible = true;
        }
        space.update();
    }

    wireframe(bool, opt = {}) {
        if (bool === undefined) {
            return this._wire ? {
                enabled: true,
                opacity: this._wireo,
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
            this.opacity(this._wireo);
        }
        if (bool) {
            this.material({clone:true});
            this._wireo = this.opacity();
            this._wire = new THREE.LineSegments(
                new THREE.WireframeGeometry(this.mesh.geometry),
                new THREE.LineBasicMaterial({ color: opt.color || 0 }));
            this.mesh.add(this._wire);
            this.opacity(opt.opacity || 0);
        }
        space.update();
    }

    material(mat) {
        this.mesh.material = mat.clone === true ? this.mesh.material.clone() : mat;
        if (this._wire) {
            this.wireframe(false);
        }
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
