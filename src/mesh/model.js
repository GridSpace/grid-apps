/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: add.three
// dep: geo.polygon
// dep: geo.polygons
// dep: moto.license
// dep: moto.client
// dep: mesh.object
// use: mesh.api
// use: mesh.util
// use: mesh.group
gapp.register("mesh.model", [], (root, exports) => {

const { MeshPhongMaterial, MeshBasicMaterial, LineBasicMaterial } = THREE;
const { BufferGeometry, BufferAttribute, DoubleSide, Mesh } = THREE;
const { Box3, Vector3, Triangle } = THREE;
const { base, mesh, moto } = root;
const { space } = moto;
const { api } = mesh;
const { newBounds, newPolygon, polygons } = base;

const mapp = mesh;
const worker = moto.client.fn;
const zero = new Vector3(0,0,0);

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
    }),
};

/** 3D model rendered on plaform **/
mesh.model = class MeshModel extends mesh.object {
    constructor(data, id) {
        super(id);
        let { file, mesh, vertices } = data;

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
        this.load(mesh || vertices);
    }

    get type() {
        return "model";
    }

    get object() {
        return this.mesh;
    }

    get bounds() {
        return this.geometry.boundingBox.clone();
    }

    get world_bounds() {
        return this.bounds.translate(this.position());
    }

    // get world_positions() {
    //     let pos = this.position();
    //     return this.geometry
    //         .clone()
    //         .translate(pos.x,pos.y,pos.z)
    //         .attributes.position.array;
    // }

    get positions() {
        return this.geometry.attributes.position.array;
    }

    // get matrix() {
    //     return this.matrixWorld.elements;
    // }

    get matrixWorld() {
        return this.mesh.matrixWorld;
    }

    drag(opt = {}) {
        let { start, delta, offset, end } = opt;
        let { snap, snapon } = api.prefs.map.space;
        if (start) {
            let mid = this.bounds.mid;
            this._save = {
                pos: Object.assign({}, mid),
                start: Object.assign({}, mid),
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

    qrotate(quaternion) {
        this.log('model-rotate', quaternion.toArray());
        this.geometry.applyQuaternion(quaternion);
        this.geometry._model_invalid = true;
        this.updateBounds();
    }

    scale(x = 1, y = 1, z = 1) {
        if (x === 1 && y === 1 && z === 1) return;
        this.log('model-scale', ...arguments, this.bounds);
        this.geometry.scale(x, y, z);
        this.geometry._model_invalid = true;
        this.updateBounds();
    }

    translate(x = 0, y = 0, z = 0) {
        if (!(x || y || z)) return;
        this.log('model-translate', ...arguments);
        this.geometry.translate(x, y, z);
        this.geometry._model_invalid = true;
        this.updateBounds();
    }

    move(x = 0, y = 0, z = 0) {
        if (!(x || y || z)) return;
        this.log('model-move', ...arguments);
        let pos = this.position();
        return this.position(pos.x + x, pos.y + y, pos.z + z);
    }

    position() {
        let pos = this.object.position;
        if (arguments.length === 0) {
            return pos;
        }
        pos.set(...arguments);
        this.metaChanged({ pos: pos.toArray() });
        return this;
    }

    // preserves world location while updating mesh for rotation and scaling
    // moves mesh center to 0,0,0 via translation then
    // moves mesh object to former bounds center
    reCenter() {
        this.log('model-recenter');
        let pos = this.position();
        let { mid } = this.bounds;
        this.translate(-mid.x, -mid.y, -mid.z);
        this.position(mid.x + pos.x, mid.y + pos.y, mid.z + pos.z);
        return this;
    }

    // preserves world location while updating mesh for rotation and scaling
    // moves mesh center to current target offset via translation then
    // moves mesh object center to target
    centerTo(to) {
        this.log('model-centerto', to);
        let { mid } = this.bounds;
        let abs = this.world_bounds.mid;
        this.translate(
            -mid.x + (abs.x - to.x),
            -mid.y + (abs.y - to.y),
            -mid.z + (abs.z - to.z),
        );
        this.position(to.x, to.y, to.z);
        return this;
    }

    // when geometry updates, recompute bounds for ray intersections
    // and sync data to worker and indexed db
    updateBounds() {
        if (this._wire)
        this._wire.geometry.attributes.position.needsUpdate = true;
        this.attributes.position.needsUpdate = true;
        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();
        this.log('update-bounds', this.geometry.boundingBox);
        this.normals({ refresh: true });
        this.updateBoundsBox();
        moto.space.update();
        this.sync();
    }

    updateBoundsBox() {
        this.group?.updateBoundsBox();
    }

    mirror() {
        return this.duplicate({ mirror: true });
    }

    // return a model containing just this model
    // translated into world coordinates (rebuilt from rotation matrix)
    // defaults to returning a new model in a new group
    // options to mirror, re-use a group, or update model in-place
    duplicate(opt = { select: true }) {
        let pos = this.position();
        let data = this.attributes.position.clone().array;
        if (opt.append) data = [...data, ...opt.append].toFloat32();
        if (opt.x) return this.reload(data);
        let model = new mesh.model({ file: `${this.file}`, mesh: data });
        let group = opt.group || mesh.api.group.new();
        let bounds = this.group.bounds;
        group.add(model);
        model.position(pos.x, pos.y, pos.z);
        model.wireframe(this.wireframe());
        if (opt.select) {
            api.selection.add(model);
        }
        if (opt.mirror) {
            group.move(0, 0, bounds.dim.z);
        } else if (opt.shift) {
            group.move(bounds.dim.x, 0, 0);
        }
        return model;
    }

    load(vertices) {
        this.log('load');
        let geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
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
        // sync worker, allows raycasting to work
        this.updateBounds();
    }

    reload(vertices) {
        this.log('reload');
        let was = this.wireframe(false);
        let geo = this.mesh.geometry;
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        // signal util.box3expand that geometry changed
        geo._model_invalid = true;
        geo.computeVertexNormals();
        // restore wireframe state
        this.wireframe(was);
        // fixup normals
        this.normals({refresh: true});
        // sync worker, allows raycasting to work
        this.updateBounds();
        // re-gen face index in surface mode
        mesh.api.mode.check();
    }

    rename(file) {
        this.file = file;
        this.sync();
    }

    // sync to worker and indexeddb for page restoration or worker ops
    sync() {
        // sync to worker
        worker.model_load({ id: this.id, name: this.file, vertices: this.positions });
        // persist in db so it can be restored on page load
        mapp.db.space.put(this.id, {
            file: this.file,
            mesh: this.attributes.position.array
        });
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

    get geometry() {
        return this.mesh.geometry;
    }

    get attributes() {
        return this.geometry.attributes;
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

    // toggle whether this is a boolean subtraction tool or not
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

    render() {
        // TODO
    }

    // invert normals for entire mesh or selected faces depending on mode
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
        let { id, group } = this;
        return new Promise((resolve,reject) => {
            worker.model_split({ id, z }).then(data => {
                let { o1, o2 } = data;
                if (!(o1 || o2)) {
                    return resolve(group);
                }
                if (o1?.length)
                group.add(new mesh.model({
                    file: `${this.file}-bot`,
                    mesh: o1
                }).reCenter());
                if (o2?.length)
                group.add(new mesh.model({
                    file: `${this.file}-top`,
                    mesh: o2
                }).reCenter());
                this.remove();
                resolve(group);
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
        return this;
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

    collectFacesByMaterialIndex(index) {
        let { geometry } = this.mesh;
        let { groups } = geometry;
        let { array } = geometry.attributes.position;
        let newtot = 0;
        // filter to unselected groups
        groups = groups.filter(g => g.materialIndex === index);
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
        return newverts;
    }

    clearSelections() {
        // clear face selections (since they've been deleted);
        this.sel.faces = [];
        this.updateSelections();
    }

    selectionToSketch() {
        let { polys, quaternion } = this.selectionToRotationPolys();
        if (!polys) {
            return;
        }
        quaternion.invert();
        // center points, move to Z=0
        let bounds = new Box3().setFromArray(polys.map(p => p.points.map(p => p.toArray())).flat().flat());
        let center = bounds.getCenter(new Vector3);
        polys.forEach(p => p.move({ x: -center.x, y: -center.y, z: -center.z }));
        let normal = new Vector3(0,0,1).applyQuaternion(quaternion);
        let sketch = mesh.api.add.sketch({
            normal,
            center: center.applyQuaternion(quaternion).add(this.position())
        });
        for (let poly of polys) {
            sketch.add.polygon({ poly });
        }
        return sketch;
    }

    selectionToRotationPolys() {
        let selverts = this.collectFacesByMaterialIndex(1);
        if (selverts?.length) {
            let points = [...selverts].group(3).map(a => new Vector3().fromArray(a));
            let tris = points.group(3).map(a => new Triangle(...a));
            let norms = tris.map(t => t.getNormal(new Vector3()));
            let norm = norms.reduce((a,b) => a.add(b)).normalize();
            // compute quaternion and rotate triangles to face Z up
            let targetNorm = new THREE.Vector3(0, 0, 1);
            let rotato = new THREE.Quaternion().setFromUnitVectors(norm, targetNorm);
            points.forEach(p => p.applyQuaternion(rotato));
            // union / nest result
            let polys = tris.map(t => newPolygon().fromVectors([ t.a, t.b, t.c ]));
            let union = polygons.union(polys,0,true);
            return { polys: union, quaternion: rotato };
        } else {
            return {};
        }
    }

    selectionFlatten() {
        let faces = this.sel.faces;
        if (faces.length) {
            worker.model_flatten({ id: this.id, faces }).then(data => {
                if (data.vertices) {
                    this.reload(data.vertices);
                    this.sel.faces = [];
                    this.updateSelections();
                }
            });
        }
    }

    triangulateSelections() {
        let { polys, quaternion } = this.selectionToRotationPolys();
        if (polys) {
            let ears = polys.map(p => p.earcut()).flat();
            let nupoints = ears.map(p => p.points).flat().map(p => p.toVector3());
            // invert quaternion to restore points alignment to original face
            quaternion.invert();
            nupoints.forEach(p => p.applyQuaternion(quaternion));
            let nuverts = nupoints.map(p => p.toArray()).flat().toFloat32();
            // remove selection and append nuverts
            this.deleteSelections(nuverts);
        }
    }

    deleteSelections(append) {
        if (!this.sel.faces.length) {
            return;
        }
        let newverts = this.collectFacesByMaterialIndex(0);
        if (newverts) {
            if (append) {
                let all = new Float32Array(newverts.length + append.length);
                all.set(newverts);
                all.set(append, newverts.length);
                newverts = all;
            }
            this.reload(newverts);
            // clear face selections (since they've been deleted);
            this.sel.faces = [];
            this.updateSelections();
        }
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
            id: this.id, x, y:-z, z:y, a, b, c, surface
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
