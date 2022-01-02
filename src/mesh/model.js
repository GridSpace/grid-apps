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

/** default materials **/
let materials = mesh.material = {
    unselected: new THREE.MeshPhongMaterial({
        transparent: true,
        shininess: 100,
        specular: 0x181818,
        color: 0xffff00,
        opacity: 1
    }),
    selected: new THREE.MeshPhongMaterial({
        transparent: true,
        shininess: 100,
        specular: 0x181818,
        color: 0x00ff00,
        opacity: 1
    })
};

/** 3D model rendered on plaform **/
mesh.model = class MeshModel extends mesh.object {
    constructor(data) {
        super();
        let { file, mesh } = data;

        if (!mesh) {
            dbug.error(`'${file}' missing mesh data`);
            return;
        }

        this.file = file;
        this.mesh = this.load(mesh);
    }

    object() {
        return this.mesh;
    }

    sync() {
        moto.client.fn.model_sync({
            matrix: this.mesh.matrixWorld.elements,
            id: this.id
        }).then(data => {
            if (data && data.length)
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
        meh.material.side = THREE.DoubleSide;
        meh.receiveShadow = true;
        meh.castShadow = true;
        meh.renderOrder = 1;
        // this ref allows clicks to be traced to models and groups
        meh.model = this;
        // sync data to worker
        moto.client.fn.model_load({id: this.id, name: this.name, vertices, indices});
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
        geo.computeFaceNormals();
        geo.computeVertexNormals();
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
        moto.Space.update();
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
            return this.wireframe(this._wire ? false : true);
        }
        if (this._wire) {
            this.mesh.remove(this._wire);
            this._wire = undefined;
            this.opacity(this._wireo);
        }
        if (bool) {
            this._wireo = this.opacity();
            this._wire = new THREE.LineSegments(
                new THREE.WireframeGeometry(this.mesh.geometry),
                new THREE.LineBasicMaterial({ color: opt.color || 0 }));
            this.mesh.add(this._wire);
            this.opacity(opt.opacity || 0);
        }
        moto.Space.update();
    }

    material(mat) {
        this.mesh.material = mat;
    }

    remove() {
        if (arguments.length === 0) {
            // direct call requires pass through group
        } else {
            // called from group
            moto.client.fn.model_remove({id: this.id});
        }
    }
};

})();
