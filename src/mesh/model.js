/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.model", [
    "add.array",    // dep: add.array
    "add.three",    // dep: add.three
    "moto.license", // dep: moto.license
    "mesh.object",  // dep: mesh.object
    "mesh.group",   // dep: mesh.group
    "mesh.util",    // dep: mesh.util
    "mesh.api",     // dep: mesh.api
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.model) return;

let mapp = mesh;
let space = moto.Space;
let worker = moto.client.fn;
let { MeshPhongMaterial, MeshBasicMaterial } = THREE;
let { BufferGeometry, BufferAttribute, DoubleSide, Mesh } = THREE;

/** default materials **/
let materials = mesh.material = {
    // model unselected
    normal: new MeshPhongMaterial({
        side: DoubleSide,
        transparent: true,
        shininess: 100,
        specular: 0x202020,
        color: 0xf0f000,
        opacity: 1
    }),
    // model selected
    select: new MeshPhongMaterial({
        side: DoubleSide,
        transparent: true,
        shininess: 100,
        specular: 0x202020,
        color: 0x00e000,
        opacity: 1
    }),
    // face selected (for groups ranges)
    face: new MeshPhongMaterial({
        side: DoubleSide,
        transparent: true,
        shininess: 100,
        specular: 0x202020,
        color: 0x0088ee,
        opacity: 1
    }),
    wireframe: new MeshBasicMaterial({
        side: DoubleSide,
        wireframe: true,
        color: 0x0,
        transparent: true,
        opacity: 0.5
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

        // create local materials
        this.mats = {
            normal: materials.normal.clone(),
            select: materials.select.clone(),
            face: materials.face.clone()
        };

        // information about selected faces, lines, and vertices
        // vertex compound keys are sorted least index to greatest
        this.sel = {
            faces: [], // first index into vertices
            lines: {}, // key = vertex-vertex, val = [ faces ]
            verts: {}, // key = x-y-z, val = { faces:[], sphere }
        };

        this.file = file || 'unnamed';
        this.load(mesh || vertices, indices, normals);
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

    // return new group containing just this model in world coordinates
    duplicate() {
        worker.model_duplicate({
            matrix: this.matrix,
            id: this.id
        }).then(data => {
            mesh.api.group.new([new mesh.model({
                file: `${this.file}-dup`,
                mesh: data
            })]).select();
        });
    }

    load(vertices, indices, normals) {
        let geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        if (indices) geo.setIndex(new BufferAttribute(indices, 1));
        if (!normals) geo.computeVertexNormals();
        let meh = this.mesh = new Mesh(geo, [
            this.mats.normal,
            this.mats.face
        ]);
        geo.addGroup(0, Infinity, 0);
        meh.receiveShadow = true;
        meh.castShadow = true;
        meh.renderOrder = 1;
        // sets fallback opacity for wireframe toggle
        this.opacity(1);
        // this ref allows clicks to be traced to models and groups
        meh.model = this;
        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, { file: this.file, mesh: vertices });
        // sync data to worker
        worker.model_load({id: this.id, name: this.file, vertices, indices});
    }

    reload(vertices, indices, normals) {
        let was = this.wireframe(false);
        let geo = this.mesh.geometry;
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        geo.setAttribute('normal', undefined);
        if (indices) geo.setIndex(new BufferAttribute(indices, 1));
        geo.attributes.position.needsUpdate = true;
        if (!normals) geo.computeVertexNormals();
        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, { file: this.file, mesh: vertices });
        // sync data to worker
        worker.model_load({id: this.id, name: this.name, vertices, indices});
        // restore wireframe state
        this.wireframe(was);
        // fixup normals
        this.normals({refresh: true});
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

    // todo -- put model into its own group
    ungroup() {
        // get current world coordinates
        let { mid } = meh.getBoundingBox();
        // transform mesh into world coordinates
        // move mesh to origin
        // create and add to group
        // move group center back to original center
        geo.moveMesh(-mid.x, -mid.y, -mid.z);
        geo.computeBoundingBox();
        this.move(mid.x, mid.y, mid.z);
    }

    // get, set, or toggle visibility of model and wireframe
    visible(bool) {
        if (bool === undefined) {
            return this.mesh.visible;
        }
        if (bool.toggle) {
            return this.visible(!this.mesh.visible);
        }
        this.mesh.visible = bool;
    }

    // get, set, or toggle selection of model (coloring)
    select(bool) {
        if (bool === undefined) {
            return this.mesh.material[0] === this.mats.normal;
        }
        if (bool.toggle) {
            return this.select(!this.select());
        }
        this.mesh.material[0] = bool ? this.mats.select : this.mats.normal;
        return bool;
    }

    // return selected state
    selected() {
        return this.select();
    }

    opacity(ov, opt = {}) {
        let mat = this.mesh.material;
        if (ov === undefined) {
            return mat[0].opacity;
        }
        if (ov.restore) {
            ov = this._op;
        } else if (ov.temp !== undefined) {
            ov = ov.temp;
        } else {
            this._op = ov;
        }
        for (let m of Object.values(this.mats)) {
            if (ov <= 0.0) {
                m.transparent = false;
                m.opacity = 1;
                m.visible = false;
            } else {
                m.transparent = true;
                m.opacity = ov;
                m.visible = true;
            }
        }
        space.update();
    }

    wireframe(bool, opt = {}) {
        let was = this._wire ? true : false;
        if (bool === undefined) {
            return was ? {
                enabled: true,
                opacity: this.opacity(),
                color: was ? this._wire.material.color : undefined,
            } : {
                enabled: false
            };
        }
        if (bool.toggle) {
            bool = !was;
        }
        // no change
        if (was === bool) {
            return was;
        }
        if (was) {
            this.mesh.remove(this._wire);
            this._wire = undefined;
            this.opacity({restore: true});
        }
        if (bool) {
            this._wire = new Mesh(this.mesh.geometry.shallowClone(), materials.wireframe);
            this.mesh.add(this._wire);
            this.opacity({temp: opt.opacity || 0.15});
        }
        space.update();
        return was;
    }

    normals(bool) {
        let was = this._norm ? true : false;
        if (bool === undefined) {
            return was;
        }
        if (bool.toggle) {
            bool = !was;
        }
        if (bool.refresh && !was) {
            return;
        }
        // no change
        if (was === bool) {
            return was;
        }
        if (was) {
            this.mesh.remove(this._norm);
            this._norm = undefined;
        }
        if (bool) {
            this.mesh.add(this._norm = mesh.util.faceNormals(this.mesh, { size: 0.5 }));
        }
    }

    // invert normals for entire mesh or selected faces depending on mod
    invert(mode) {
        let { modes } = mesh.api;
        let geo = this.mesh.geometry;
        let pos = geo.attributes.position;
        let arr = pos.array;
        function swap(i) {
            let v1x = arr[i  ];
            let v1y = arr[i+1];
            let v1z = arr[i+2];
            arr[i  ] = arr[i+3];
            arr[i+1] = arr[i+4];
            arr[i+2] = arr[i+5];
            arr[i+3] = v1x;
            arr[i+4] = v1y;
            arr[i+5] = v1z;
        }
        switch (mode) {
            case modes.object:
                for (let i=0, l=arr.length; i<l; i += 9) {
                    swap(i);
                }
                break;
            case modes.face:
                for (let face of this.sel.faces) {
                    swap(face * 9);
                }
                break;
        }
        this.reload(arr);
        if (this._norm) this._norm.update();
    }

    // split model along given plane
    split(plane) {
        // extract axes from plane and split when present (only z for now)
        let { z } = plane;
        let m4 = this.mesh.matrix;
        return new Promise((resolve,reject) => {
            let { id, matrix } = this;
            worker.model_split({id, matrix, z}).then(data => {
                let { o1, o2 } = data;
                // new model becomes top
                if (o2.length)
                this.group.add(new mesh.model({
                    file: `${this.file}`,
                    mesh: o2
                }).applyMatrix4(m4)).select();
                // this becomes bottom
                if (o1.length) {
                    this.reload(o1);
                } else {
                    this.remove();
                }
                // and we're done
                resolve();
            });
        });
    }

    // remove model from group and space
    remove() {
        if (arguments.length === 0) {
            // direct call requires pass through group
            this.group.remove(this);
            this.group = undefined;
            this.removed = 'pending';
        } else {
            // manage lifecycle with worker, mesh app caches, etc
            this.destroy();
            // tag removed for debugging
            this.removed = 'complete';
        }
    }

    updateBoundsBox() {
        if (this.group) {
            mesh.util.defer(this.group.deferUBB);
        }
    }

    clearSelections() {
        // clear face selections (since they've been deleted);
        this.sel.faces = [];
        this.updateSelections();
    }

    deleteSelections(mode) {
        let { geometry } = this.mesh;
        let { groups } = geometry;
        let { array } = geometry.attributes.position;
        let newtot = 0;
        // filter to unselected groups
        groups = groups.filter(g => g.materialIndex === 0);
        for (let group of groups) {
            let start = group.start * 3;
            let count = group.count * 3;
            newtot += group.count < Infinity ? count : array.length - start;
        }
        // nothing to do if new length is the same
        if (newtot === array.length) {
            return;
        }
        let newverts = new Float32Array(newtot);
        let pos = 0;
        // copy back unselected faces
        for (let group of groups) {
            let start = group.start * 3;
            let count = group.count * 3;
            if (count === Infinity) count = array.length - start;
            let slice = array.slice(start, start + count);
            newverts.set(slice, pos);
            pos += count;
        }
        this.reload(newverts);
        // clear face selections (since they've been deleted);
        this.sel.faces = [];
        this.updateSelections();

        // let { modes } = mesh.api;
        // switch (mode) {
        //     case modes.face:
        //         console.log('delete selected faces');
        //         break;
        // }
    }

    updateSelections() {
        let faces = this.sel.faces;
        let groups = [];
        if (faces && faces.length) {
            faces = faces.sort((a,b) => a - b).slice();
            let first = faces.shift();
            if (first > 0) {
                groups.push({ start: 0, count: first, mat: 0 });
            }
            let range = { start: first, count: 1, mat: 1 };
            groups.push(range);
            for (let face of faces) {
                if (face === range.start + range.count) {
                    range.count++;
                } else {
                    groups.push(range = { start: range.start + range.count, count: face - range.start - range.count });
                    groups.push(range = { start: face, count: 1, mat: 1 });
                }
            }
            groups.push({ start: range.start + range.count, count: Infinity });
        } else {
            groups.push({ start: 0, count: Infinity });
        }
        let geo = this.mesh.geometry;
        geo.clearGroups();
        for (let group of groups) {
            geo.addGroup(group.start*3, group.count*3, group.mat || 0);
        }
    }

    toggleSelectedFaces(toggle = []) {
        let faces = this.sel.faces;
        for (let t of toggle) {
            faces.remove(t) || faces.addOnce(t);
        }
    }

    toggleSelectedVertices(vert) {
        if (Array.isArray(vert)) {
            for (let e of vert) {
                this.toggleSelectedVertices(e);
            }
            return;
        }
        let sel = this.sel;
        let key = [x,y,z].map(v => v.round(5)).join('-');
        let rec = sel.verts[key];
        if (rec) {
            delete sel.verts[key];
            space.scene.remove(rec.sphere);
        } else {
            let geometry = new THREE.SphereGeometry( 0.5, 16, 16 );
            let material = new MeshPhongMaterial( { color: 0x777777, transparent: true, opacity: 0.25 } );
            let sphere = new Mesh( geometry, material );
            sphere.position.set(x, y, z);
            space.scene.add(sphere);
            sel.verts[key] = {
                sphere,
                faces,
                verts
            };
        }
    }

    // find adjacent faces to clicked point/line on a face
    find(point, face) {
        let { x, y, z } = point;
        let { a, b, c } = face;
        worker.model_select({
            id: this.id, x, y:-z, z:y, a, b, c, matrix: this.matrix
        }).then(data => {
            let { faces, edges, verts, point } = data;
            // console.log({data});
            // this.toggleSelectedVertices(verts);
            this.toggleSelectedFaces(faces);
            this.updateSelections();
        });
    }

};

})();
