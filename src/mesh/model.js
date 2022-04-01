/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: add.three
// dep: moto.license
// dep: moto.client
// dep: mesh.object
// use: mesh.api
// use: mesh.util
// use: mesh.group
gapp.register("mesh.model", [], (root, exports) => {

const { MeshPhongMaterial, MeshBasicMaterial } = THREE;
const { BufferGeometry, BufferAttribute, DoubleSide, Mesh } = THREE;
const { mesh, moto } = root;
const { space } = moto;

const mapp = mesh;
const worker = moto.client.fn;

/** default materials **/
let materials = mesh.material = {
    // model unselected
    normal: new MeshPhongMaterial({
        side: DoubleSide,
        transparent: true,
        shininess: 125,
        specular: 0x202020,
        color: 0xf0f000,
        opacity: 1
    }),
    // model selected
    select: new MeshPhongMaterial({
        side: DoubleSide,
        transparent: true,
        shininess: 125,
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

    // override and translate mesh
    move(x = 0, y = 0, z = 0) {
        let arr = this.attributes.position.array;
        for (let i=0, l=arr.length; i<l; ) {
            arr[i] = arr[i++] + x;
            arr[i] = arr[i++] + y;
            arr[i] = arr[i++] + z;
        }
        this.reload(arr);
        return this;
    }

    // override and translate mesh
    scale(x = 1, y = 1, z = 1) {
        let arr = this.attributes.position.array;
        for (let i=0, l=arr.length; i<l; ) {
            arr[i] = arr[i++] *= x;
            arr[i] = arr[i++] *= y;
            arr[i] = arr[i++] *= z;
        }
        this.reload(arr);
        return this;
    }

    mirror() {
        return this.duplicate({ mirror: true });
    }

    // return new group containing just this model in world coordinates
    duplicate(opt = {}) {
        worker.model_duplicate({
            matrix: this.matrix,
            id: this.id,
            opt
        }).then(data => {
            let group = mesh.api.group.new([new mesh.model({
                file: `${this.file}`,
                mesh: data
            })]).setSelected();
            if (opt.mirror) {
                group.move(0, 0, group.bounds.dim.z);
            }
        });
    }

    rebuild(opt = {}) {
        if (this.lines) {
            space.scene.remove(this.lines);
            this.lines = undefined;
        }
        if (opt.clean) {
            return;
        }
        worker.model_rebuild({
            matrix: this.matrix,
            id: this.id
        }).then(data => {
            let { lines } = data;
            if (lines) {
                let points = [];
                for (let i=0; i<lines.length;) {
                    points.push(new THREE.Vector3(lines[i++], lines[i++], lines[i++]));
                }
                let material = new THREE.LineBasicMaterial( { color: 0xdddddd } );
                let geometry = new THREE.BufferGeometry().setFromPoints(points);
                let segments = this.lines = new THREE.LineSegments(geometry, material);
                space.scene.add(segments);
            }
        });
    }

    load(vertices, indices, normals) {
        let geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        if (indices) {
            // unroll indexed geometries
            geo.setIndex(new BufferAttribute(indices, 1));
            geo = geo.toNonIndexed();
        }
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
        worker.model_load({id: this.id, name: this.file, vertices});
    }

    reload(vertices) {
        let was = this.wireframe(false);
        let geo = this.mesh.geometry;
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        geo.setAttribute('normal', undefined);
        // signal util.box3expand that geometry changed
        geo._model_invalid = true;
        geo.computeVertexNormals();
        // allows raycasting to work
        geo.computeBoundingSphere();
        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, { file: this.file, mesh: vertices });
        // sync data to worker
        worker.model_load({id: this.id, name: this.name, vertices});
        // restore wireframe state
        this.wireframe(was);
        // fixup normals
        this.normals({refresh: true});
        // re-gen face index in surface mode
        mesh.api.mode.check();
    }

    rename(file) {
        this.file = file;
        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, { file, mesh: this.attributes.position.array });
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
            this.mesh.add(this._norm = mesh.util.faceNormals(this.mesh));
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
                let model;
                // new model becomes top
                if (o2.length)
                this.group.add(model = new mesh.model({
                    file: `${this.file}`,
                    mesh: o2
                }).applyMatrix4(m4));
                if (o1.length) {
                    // o1 becomes bottom
                    this.reload(o1);
                    resolve(model);
                } else {
                    this.remove();
                    resolve(model);
                }
            });
        });
    }

    zlist(round = 2) {
        return new Promise((resolve,reject) => {
            let { id, matrix } = this;
            worker.model_zlist({id, matrix, round}).then(data => {
                resolve(data);
            });
        });
    }

    // release from a group but remain in memory and storage
    // so it can be re-assigned to another group
    ungroup() {
        this.group.remove(this, { free: false });
        this.group = undefined;

        return worker.model_duplicate({
            matrix: this.matrix,
            id: this.id,
            opt: {}
        }).then(data => {
            this.reload(data);
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
        this.rebuild({ clean: true });
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

    selectFaces(list = [], action = {}) {
        let faces = this.sel.faces;
        for (let t of list) {
            if (action.toggle) {
                faces.remove(t) || faces.addOnce(t);
            } else if (action.clear) {
                faces.remove(t);
            } else if (action.select) {
                faces.addOnce(t);
            }
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
    find(int, action, radians = 0) {
        let { point, face } = int;
        let { x, y, z } = point;
        let { a, b, c } = face;
        let timer = setTimeout(() => {
            timer = undefined;
            mesh.api.log.emit("matching surface").pin();
        }, 150);
        worker.model_select({
            id: this.id, x, y:-z, z:y, a, b, c, matrix: this.matrix, radians
        }).then(data => {
            if (timer) {
                clearTimeout(timer);
            }
            let { faces, edges, verts, point } = data;
            // console.log({data});
            // this.toggleSelectedVertices(verts);
            this.selectFaces(faces, action);
            this.updateSelections();
            if (!timer) {
                mesh.api.log.emit("surface match complete").unpin();
                moto.space.refresh();
            }
        });
    }

};

});
