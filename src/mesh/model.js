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

const { MeshPhongMaterial, MeshBasicMaterial, LineBasicMaterial } = THREE;
const { BufferGeometry, BufferAttribute, DoubleSide, Mesh } = THREE;
const { mesh, moto } = root;
const { space } = moto;
const { api } = mesh;

const mapp = mesh;
const worker = moto.client.fn;

/** default materials **/
let materials = mesh.material = {
    // model unselected
    normal: new MeshPhongMaterial({
        flatShading: true,
        side: DoubleSide,
        transparent: true,
        shininess: 125,
        specular: 0x202020,
        color: 0xf0f000,
        opacity: 1
    }),
    // model selected
    select: new MeshPhongMaterial({
        flatShading: true,
        side: DoubleSide,
        transparent: true,
        shininess: 125,
        specular: 0x202020,
        color: 0x00e000,
        opacity: 1
    }),
    // model selected as tool
    tool: new MeshPhongMaterial({
        flatShading: true,
        side: DoubleSide,
        transparent: true,
        shininess: 125,
        specular: 0x202020,
        color: 0xe00000,
        opacity: 1
    }),
    // face selected (for groups ranges)
    face: new MeshPhongMaterial({
        flatShading: true,
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
    wireline: new LineBasicMaterial({
        side: DoubleSide,
        color: 0x0,
        transparent: true,
        opacity: 0.5
    })
};

/** 3D model rendered on plaform **/
mesh.model = class MeshModel extends mesh.object {
    constructor(data, id) {
        super(id);
        let { file, mesh, vertices, indices } = data;

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
            tool: materials.tool.clone(),
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
        this.load(mesh || vertices, indices);
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

    get matrixWorld() {
        return this.mesh.matrixWorld;
    }

    drag(opt = {}) {
        let { start, delta, offset, end } = opt;
        let { snap, snapon } = api.prefs.map.space;
        if (start) {
            let mid = this.bounds.mid;
            this._save = {
                pos: Object.assign({},mid),
                start: Object.assign({},mid),
            }
        } else if (end) {
            delete this._save;
        } else if (offset) {
            let { pos, start } = this._save;
            let target = {
                x: start.x + offset.x,
                y: start.y + offset.y,
                z: start.z + offset.z
            };
            if (snapon && snap) {
                target.x = Math.round(target.x / snap) * snap;
                target.y = Math.round(target.y / snap) * snap;
                target.z = Math.round(target.z / snap) * snap;
            }
            delta = {
                x: target.x - pos.x,
                y: target.y - pos.y,
                z: target.z - pos.z
            };
            pos.x += delta.x;
            pos.y += delta.y;
            pos.z += delta.z;
        }
        if (delta) {
            this.move(delta.x, delta.y, delta.z);
        }
    }

    // override and translate mesh
    move(x = 0, y = 0, z = 0) {
        let attr = this.attributes;
        let arr = attr.position.array;
        for (let i=0, l=arr.length; i<l; ) {
            arr[i] = arr[i++] + x;
            arr[i] = arr[i++] + y;
            arr[i] = arr[i++] + z;
        }
        this.reload(arr, attr.index ? attr.index.array : undefined);
        return this;
    }

    // override and translate mesh
    scale(x = 1, y = 1, z = 1) {
        let attr = this.attributes;
        let arr = attr.position.array;
        for (let i=0, l=arr.length; i<l; ) {
            arr[i] = arr[i++] *= x;
            arr[i] = arr[i++] *= y;
            arr[i] = arr[i++] *= z;
        }
        this.reload(arr, attr.index ? attr.index.array : undefined);
        return this;
    }

    mirror() {
        return this.duplicate({ mirror: true });
    }

    // return a model containing just this model
    // translated into world coordinates (rebuilt from rotation matrix)
    // defaults to returning a new model in a new group
    // options to mirror, re-use a group, or update model in-place
    duplicate(opt = { select: true }) {
        return worker.model_duplicate({
            matrix: this.matrix,
            id: this.id,
            opt: { mirror: opt.mirror}
        }).then(data => {
            if (opt.append) data = [...data, ...opt.append].toFloat32();
            if (opt.reload) return this.reload(data);
            let model = new mesh.model({ file: `${this.file}`, mesh: data });
            let group = opt.group || mesh.api.group.new();
            group.add(model);
            model.wireframe(this.wireframe());
            model.normals(this.normals());
            if (opt.select) group.setSelected();
            if (opt.mirror) group.move(0, 0, group.bounds.dim.z);
            return model;
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

    load(vertices, indices) {
        let geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        if (indices) {
            // unroll indexed geometries
            geo.setIndex(new BufferAttribute(indices, 1));
            geo = geo.toNonIndexed();
        }
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

    reload(vertices, indices) {
        let was = this.wireframe(false);
        let geo = this.mesh.geometry;
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        if (indices) {
            geo.setIndex(new BufferAttribute(indices, 1));
        }
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

    // get, set, or toggle selection of model (coloring)
    select(bool, stool) {
        const cmat = this.mesh.material[0];
        const { normal, select, tool } = this.mats;
        if (bool === undefined) {
            return cmat !== normal;
        }
        if (bool.toggle) {
            return this.select(!this.select(), cmat === tool);
        }
        this.mesh.material[0] = bool ? (stool ? tool : select) : normal;
        return bool;
    }

    // return selected state
    selected() {
        return this.select();
    }

    tool(bool) {
        if (bool === undefined) {
            return this.mesh.material[0] === this.mats.tool;
        }
        return this.select(this.selected(), bool);
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

    highlight() {
        if (!this.wireframe().enabled) {
            this.opacity({temp: 0.5});
        }
    }

    unhighlight() {
        if (!this.wireframe().enabled) {
            this.opacity({restore: true});
        }
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
        if (bool === 'edges') {
            let edges = new THREE.EdgesGeometry(this.mesh.geometry, 5);
            this._wire = new THREE.LineSegments(edges, materials.wireframe);
            this.mesh.add(this._wire);
            this.opacity({temp: opt.opacity || 0.15});
        } else if (bool) {
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
            case modes.surface:
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

    // release from a group but remain in memory and storage
    // so it can be re-assigned to another group
    ungroup() {
        if (this.group) {
            this.group.remove(this, { free: false });
            this.group = undefined;
        }
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
        let groups = mesh.util.facesToGroups(this.sel.faces);
        let geo = this.mesh.geometry;
        geo.clearGroups();
        for (let group of groups) {
            geo.addGroup(group.start*3, group.count*3, group.mat || 0);
        }
    }

    selectFaces(list = [], action = {}) {
        let faces = this.sel.faces;
        let map = {};
        for (let f of list) {
            map[f] = f;
        }
        if (action.toggle) {
            faces = faces.filter(f => {
                if (map[f] !== undefined) {
                    map[f] = undefined;
                    return false;
                } else {
                    return true;
                }
            });
            faces.appendAll(Object.entries(map).filter(kv => {
                return kv[1] !== undefined;
            }).map(kv => {
                return kv[1];
            }));
            this.sel.faces = faces;
        } else if (action.clear) {
            this.sel.faces = faces.filter(f => map[f] === undefined);
        } else if (action.select) {
            for (let f of faces) {
                map[f] = undefined;
            }
            faces.appendAll(Object.values(map).filter(f => f !== undefined));
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
    find(int, action, surface) {
        let { point, face } = int;
        let { x, y, z } = point;
        let { a, b, c } = face;
        let timer = setTimeout(() => {
            timer = undefined;
            mesh.api.log.emit("matching surface").pin();
        }, 150);
        // let mark = Date.now();
        worker.model_select({
            id: this.id, x, y:-z, z:y, a, b, c, matrix: this.matrix, surface
        }).then(data => {
            // mesh.api.log.emit(`... data time = ${Date.now() - mark}`); mark = Date.now();
            if (timer) {
                clearTimeout(timer);
            }
            let { faces, edges, verts, point } = data;
            // console.log({data});
            // this.toggleSelectedVertices(verts);
            this.selectFaces(faces, action);
            // mesh.api.log.emit(`... select time = ${Date.now() - mark}`); mark = Date.now();
            this.updateSelections();
            if (!timer) {
                mesh.api.log.emit("surface match complete").unpin();
                moto.space.refresh();
            }
            // mesh.api.log.emit(`... paint time = ${Date.now() - mark}`);
        });
    }

};

});
