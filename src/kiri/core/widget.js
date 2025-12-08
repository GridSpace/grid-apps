/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { base } from '../../geo/base.js';
import { avgc } from './utils.js';
import { util as mesh_util } from '../../mesh/util.js';
import { verticesToPoints } from '../../geo/points.js';
import { newPoint } from '../../geo/point.js';
import { newPolygon } from '../../geo/polygon.js';
import { polygons as POLY } from '../../geo/polygons.js';
import { checkOverUnderOn, intersectPoints } from '../../geo/slicer.js';

const { inRange, time } = base.util;
const solid_opacity = 1.0;
const groups = [];

const sharedArrayClass = self.SharedArrayBuffer || undefined;
const hasSharedArrays = sharedArrayClass ? true : false;

let nextId = 0;

function newWidget(id,group) { return new Widget(id,group) }

function catalog() { return self.kiri_catalog };

function index() { return self.kiri_catalog.index }

class Widget {
    constructor(id, group) {
        this.api = self.kiri_api;

        this.id = id || Date.now().toString(36)+(nextId++);
        this.grouped = group ? true : false;
        this.group = group || [];
        this.group.push(this);
        if (!this.group.id) {
            this.group.id = this.id;
        }
        if (groups.indexOf(this.group) < 0) {
            groups.push(this.group);
        }
        // rotation stack (for undo)
        this.roto = [];
        // added meshes (supports, tabs, etc)
        this.adds = [];
        // persisted client annotations (cam tabs, fdm supports)
        this.anno = {};
        // THREE Mesh and points
        this.mesh = null;
        this.points = null;
        // todo resolve use of this vs. mesh.bounds
        this.bounds = null;
        // wireframe
        this.wire = null;
        this.slices = null;
        this.settings = null; // used??
        this.modified = true;
        this.boundingBoxNeedsUpdate = true
        this.track = {
            // box size for packer
            box: {
                w: 0,
                h: 0,
                d: 0
            },
            scale: {
                x: 1.0,
                y: 1.0,
                z: 1.0
            },
            rot: {
                x: 0,
                y: 0,
                z: 0
            },
            pos: {
                x: 0,
                y: 0,
                z: 0
            },
            top: 0, // z top
            mirror: false,
            indexed: false
        },
        // used to cache shadow geo
        this.cache = {};
        this.stats = {
            slice_time: 0,
            load_time: 0,
            progress: 0
        };
        this.meta = {
            url: null,
            file: null,
            saved: false
        };
        // if this is a synthesized support widget
        this.support = false;
    }

    saveToCatalog(filename) {
        if (this.grouped) {
            return this;
        }
        const widget = this;
        const mark = time();
        const vertices = widget.getGeoVertices({ unroll: true }).slice();
        widget.meta.file = filename;
        widget.meta.save = mark;
        catalog().putFile(filename, vertices, () => {
            console.log("saved mesh ["+(vertices.length/3)+"] time ["+(time()-mark)+"]");
        });
        return this;
    }

    saveState(ondone) {
        if (!ondone) {
            clearTimeout(this._save_timer);
            this._save_timer = setTimeout(() => {
                this._save_timer = undefined;
                this.saveState(() => {});
            }, 1500);
            return;
        }
        const widget = this;
        index().put('ws-save-'+this.id, {
            geo: widget.getGeoVertices({ unroll: false }).slice(),
            track: widget.track,
            group: this.group.id,
            meta: this.meta,
            anno: this.annotations()
        }, result => {
            widget.meta.saved = time();
            if (ondone) ondone();
        });
    }

    annotations() {
        let o = Object.clone(this.anno);
        if (o.support) {
            // clear out THREE.Box temps
            for (let s of o.support) {
                delete s.box;
            }
        }
        return o;
    }

    #newBuffer(length) {
        if (hasSharedArrays) {
            return new SharedArrayBuffer(length);
        } else {
            return new ArrayBuffer(length);
        }
    }

    /**
     *
     * @param {Float32Array} vertices
     * @returns {Widget}
     */
    loadVertices(data, options = { index: false }) {
        // console.trace({ loadVertices: this.id, worker: this.inWorker, data });
        let vertices,
            autoscale = false;
        if (ArrayBuffer.isView(data) || typeof(data) != 'object') {
            vertices = data;
        } else {
            vertices = data.vertices;
            throw "deprecated vertex data format";
        }
        if (vertices.buffer) {
            if (hasSharedArrays && vertices.buffer instanceof sharedArrayClass) {
                // console.log('converting to shared vertices');
                let newvert = new Float32Array(this.#newBuffer(vertices.buffer.byteLength));
                newvert.set(vertices);
                vertices = newvert;
            }
        }
        switch (typeof(autoscale)) {
            case 'boolean':
                autoscale = options;
                break;
            case 'object':
                autoscale = options.autoscale;
                break;
        }
        if (!vertices) {
            console.log('missing vertices', {data, options});
            return;
        }
        if (autoscale === true) {
            // onshape exports obj in meters by default :/
            let maxv = 0;
            for (let i=0; i<vertices.length; i++) {
                maxv = Math.max(maxv,Math.abs(vertices[i]));
            }
            if (maxv < 1) {
                for (let i=0; i<vertices.length; i++) {
                    vertices[i] *= 1000;
                }
            }
        }
        if (this.mesh) {
            let geo = this.mesh.geometry;
            geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geo.attributes.position.needsUpdate = true;
            // geo.computeVertexNormals();
            this.meta.vertices = vertices.length / 3;
            this.points = null;
            return this;
        } else {
            let geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            // geo.computeVertexNormals();
            this.meta.vertices = vertices.length / 3;
            this.points = null;
            return this.loadGeometry(geo);
        }
    }

    loadData() {
        return this.loadVertices(...arguments);
    }

    setModified() {
        this.modified = true;
        this.boundingBoxNeedsUpdate = true;
        if (this.mesh && this.mesh.geometry) {
            // this fixes ray intersections after the mesh is modified
            this.mesh.geometry.boundingSphere = null;
        }
    }

    // should go away and be replaced by getGeoVertices
    getVertices() {
        return this.mesh.geometry.attributes.position;
    }

    /**
     * @param {THREE.Geometry} geometry
     * @returns {Widget}
     */
    loadGeometry(geometry) {
        const mesh = new THREE.Mesh(
            geometry, [
            new THREE.MeshPhongMaterial({
                side: THREE.DoubleSide,
                color: 0xffff00,
                specular: 0x202020,
                shininess: 120,
                transparent: true,
                opacity: solid_opacity,
                clipIntersection: false,
                flatShading: true
            }),
            new THREE.MeshPhongMaterial({
                side: THREE.DoubleSide,
                color: 0x0088ee,
                specular: 0x202020,
                shininess: 100,
                transparent: true,
                opacity: solid_opacity,
                flatShading: true
            }),
        ]);
        mesh.renderOrder = 1;
        // geometry.computeVertexNormals();
        geometry.addGroup(0, Infinity, 0);
        // mesh.castShadow = true;
        // mesh.receiveShadow = true;
        mesh.widget = this;
        this.mesh = mesh;
        // invalidates points cache (like any scale/rotation)
        this.center(true);
        return this;
    }

    groupBounds() {
        return Group.bounds(this.group);
    }

    /**
     * @param {Point[]} points
     * @returns {Widget}
     */
    setPoints(points) {
        this.points = points || null;
        return this;
    }

    /**
     * remove slice data and their views
     */
    clearSlices() {
        let slices = this.slices,
            mesh = this.mesh;
        if (slices && mesh && mesh.remove) {
            slices.forEach(function(slice) {
                mesh.remove(slice.view);
            });
        }
        this.slices = null;
    }

    /**
     * @param {number} color
     */
    setColor(color, settings, save = true) {
        if (settings) {
            console.trace('legacy call with settings');
        }
        if (Array.isArray(color)) {
            color = color[this.getExtruder() % color.length];
        }
        if (save) {
            this.color = color;
        }
        let material = this.getMaterial();
        material.color.set(this.meta.disabled ? avgc(0x888888, color, 3) : color);
    }

    getColor() {
        return this.color;
    }

    getMaterial() {
        return this.mesh.material[0];
    }

    setZClip(from, to) {
        let mat = this.getMaterial();
        mat.clippingPlanes = (from >= 0 && to >= 0) ? [
            new THREE.Plane(new THREE.Vector3(0, 1, 0), -from),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), to),
        ] : null;
        moto.space.refresh();
    }

    isSynth() {
        return this.track.synth ?? false;
    }

    isVisible() {
        return this.getMaterial().visible;
    }

    selectFaces(faces) {
        let groups = mesh_util.facesToGroups(faces || []);
        let geo = this.mesh.geometry;
        geo.clearGroups();
        for (let group of groups) {
            geo.addGroup(group.start*3, group.count*3, group.mat || 0);
        }
    }

    getVisualState() {
        return {
            edges: this.outline ? true : false,
            wires: this.wire ? true : false,
            opacity: this.getMaterial().opacity
        };
    }

    setVisualState({ edges, wires, opacity}) {
        this.cache.vizstate = this.getVisualState();
        this.setEdges(edges ?? false);
        this.setWireframe(wires ?? false);
        this.setOpacity(opacity ?? 1);
    }

    refreshVisualState() {
        this.setVisualState(this.getVisualState());
    }

    restoreVisualState() {
        if (this.cache.vizstate) {
            this.setVisualState(this.cache.vizstate);
        }
    }

    /**
     * @param {number} value
     */
    setOpacity(value) {
        const mesh = this.mesh;
        const mat = this.getMaterial();
        if (value <= 0.0) {
            mat.transparent = solid_opacity < 1.0;
            mat.opacity = solid_opacity;
            mat.visible = false;
        } else if (inRange(value, 0.0, solid_opacity)) {
            mat.transparent = value < 1.0;
            mat.opacity = value;
            mat.visible = true;
        }
    }

    toggleVisibility(bool) {
        const mat = this.getMaterial();
        mat.visible = bool ?? !mat.visible;
    }

    /**
     * center geometry bottom (on platform) at 0,0,0
     */
    center(init) {
        let bb = init ? this.mesh.getBoundingBox(true) : this.groupBounds(),
            bm = bb.min.clone(),
            bM = bb.max.clone(),
            bd = bM.sub(bm).multiplyScalar(0.5),
            dx = bm.x + bd.x,
            dy = bm.y + bd.y,
            dz = bm.z;
        if (this.track.indexed) {
            dz += bd.z;
        }
        this.track.center = { dx, dy, dz };
        // move mesh for each widget in group
        if (!init) {
            this.group.forEach(w => {
                w.moveMesh(dx,dy,dz);
            });
        }
        return this;
    }

    /**
     * called by center() and Group.center()
     * todo use new prototype.moveMesh()
     */
    moveMesh(x, y, z) {
        // if (!(x || y || z)) {
        //     return;
        // }
        let gap = this.mesh.geometry.attributes.position,
            pa = gap.array;
        // center point array on 0,0,0
        if (x || y || z) {
            for (let i=0; i < pa.length; i += 3) {
                pa[i    ] -= x;
                pa[i + 1] -= y;
                pa[i + 2] -= z;
            }
            gap.needsUpdate = true;
        }
        let bb = this.groupBounds();
        // critical to layout and grouping
        this.track.box = {
            w: (bb.max.x - bb.min.x),
            h: (bb.max.y - bb.min.y),
            d: (bb.max.z - bb.min.z)
        };
        // for use with the packer
        // invalidate cached points
        if (x || y || z) {
            this.points = null;
            this.setModified();
        }
    }

    get isIndexed() {
        return this.track.indexed ? true : false;
    }

    setIndexed(z) {
        if (z !== this.track.indexed) {
            this.track.indexed = z;
            this.center(false);
            this._updateMeshPosition();
        }
    }

    setAxisIndex(deg) {
        let rad = deg * (Math.PI / 180);
        if (rad !== this.track.indexRad) {
            this.track.indexRad = rad;
            this.setModified();
            this._updateMeshPosition();
        }
    }

    /**
     * moves top of widget to given Z
     * only non-zero in CAM mode
     *
     * @param {number} z position
     * @param {boolean} cam mode
     */
    setTopZ(z, cam) {
        let mesh = this.mesh,
            track = this.track,
            mbb = mesh.getBoundingBox(),
            mbz = mbb.max.z,
            idx = this.isIndexed;
        if ((idx && z != undefined) || (!idx && z)) {
            track.top = z;
        } else {
            track.top = mbz;
        }
        // difference between top of stock/bounds and top of widget (cam mode)
        track.tzoff = cam ? mbz - z : 0;
        this._updateMeshPosition();
    }

    move(x, y, z, abs) {
        this.group.forEach(w => {
            w._move(x, y, z, abs);
        });
        // allow for use in engine / cli
        if ((x || y || z) && this.api && this.api.event) {
            this.api.event.emit('widget.move', {widget: this, pos: {x, y, z}, abs});
        }
    }

    _move(x, y, z, abs) {
        let mat = this.getMaterial(),
            pos = this.track.pos;
        // do not allow moves in pure slice view
        if (!mat.visible) return;
        if (abs) {
            pos.x = (x || 0);
            pos.y = (y || 0);
            pos.z = (z || 0);
        } else {
            pos.x += (x || 0);
            pos.y += (y || 0);
            pos.z += (z || 0);
        }
        if (x || y || z) {
            this.setModified();
            this._updateMeshPosition();
        }
    }

    _updateMeshPosition() {
        let mesh = this.mesh,
            track = this.track,
            tzoff = track.tzoff,
            top = track.top,
            tz = -tzoff,
            { x, y, z } = track.pos;
        if (track.indexed) {
            let rad = track.indexRad;
            this.mesh.rotation.x = -rad;
            z = top;
        } else {
            this.mesh.rotation.x = 0;
            z += tz;
        }
        mesh.position.set(x, y, z);
    }

    scale(x, y, z) {
        this.group.forEach(w => {
            w._scale(x, y, z);
        });
        this.center(false);
        if (this.api && this.api.event) {
            this.api.event.emit('widget.scale', {widget: this, x, y, z});
        }
    }

    _scale(x, y, z) {
        let mesh = this.mesh,
            scale = this.track.scale;
        this.bounds = null;
        this.setWireframe(false);
        this.clearSlices();
        mesh.geometry.applyMatrix4(new THREE.Matrix4().makeScale(x, y, z));
        if (this.outline) {
            this.setEdges(true);
        }
        scale.x *= (x || 1.0);
        scale.y *= (y || 1.0);
        scale.z *= (z || 1.0);
        this.setModified();
    }

    rotate(x, y, z, temp, center = true) {
        this.group.forEach(w => {
            w._rotate(x, y, z, temp);
        });
        if (center) {
            this.center(false);
        }
        if (this.outline) {
            this.setEdges(true);
        }
        if ((x || y || z) && this.api && this.api.event) {
            this.api.event.emit('widget.rotate', {widget: this, x, y, z});
        }
    }

    _rotate(x, y, z, temp) {
        if (!temp) {
            this.bounds = null;
            this.setWireframe(false);
            this.clearSlices();
        }
        let m4 = new THREE.Matrix4();
        let euler = typeof(x) === 'number';
        if (euler) {
            m4 = m4.makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
        } else {
            m4 = m4.makeRotationFromQuaternion(x);
        }
        this.roto.push(m4);
        this.mesh.geometry.applyMatrix4(m4);
        if (!temp && euler) {
            let rot = this.track.rot;
            rot.x += (x || 0);
            rot.y += (y || 0);
            rot.z += (z || 0);
        }
        this.setModified();
    }

    // undo all accumulated rotations
    unrotate() {
        this.roto.reverse().forEach(m => {
            this.mesh.geometry.applyMatrix4(m.clone().invert());
        });
        this.roto = [];
        this.center();
        this.setModified();
        this.refreshVisualState();
    }

    mirror() {
        this.group.forEach(w => {
            w._mirror();
        });
        this.center();
        if (this.api && this.api.event) {
            this.api.event.emit('widget.mirror', {widget: this});
        }
    }

    _mirror() {
        this.clearSlices();
        this.setWireframe(false);
        let geo = this.mesh.geometry, ot = this.track;
        let pos = geo.attributes.position;
        let arr = pos.array;
        let count = pos.count;
        // invert x
        for (let i=0; i<count; i++) {
            arr[i*3] = -arr[i*3];
        }
        // invert face vertex order
        for (let i=0; i<count; i+=3) {
            let x = arr[i*3+0];
            let y = arr[i*3+1];
            let z = arr[i*3+2];
            arr[i*3+0] = arr[i*3+6];
            arr[i*3+1] = arr[i*3+7];
            arr[i*3+2] = arr[i*3+8];
            arr[i*3+6] = x;
            arr[i*3+7] = y;
            arr[i*3+8] = z;
        }
        pos.needsUpdate = true;
        ot.mirror = !ot.mirror;
        this.setModified();
        this.points = null;
    }

    getTabVertices() {
        const vert = [];
        if (this.anno && this.anno.tab) {
            for (let tab of this.anno.tab) {
                const { pos, dim, rot } = tab;
                const box = new THREE.BoxGeometry(dim.x, dim.y, dim.z).toNonIndexed();
                const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
                box.applyMatrix4(
                    new THREE.Matrix4().makeRotationFromQuaternion(quat)
                );
                box.translate(pos.x, pos.y, pos.z);
                vert.appendAll(box.attributes.position.array);
            }
        }
        return vert;
    }

    getGeoVertices(opt = {}) {
        const { unroll, translate } = opt;
        let geo = this.mesh.geometry;
        let pos = geo.getAttribute('position');
        // if indexed, return points rotated about X and then offset
        let track = this.track;
        if (translate && track.indexed) {
            pos = pos.clone()
                .applyMatrix4( new THREE.Matrix4().makeRotationX(-track.indexRad) );
        }
        pos = pos.array;
        if (geo.index && unroll !== false) {
            let idx = geo.index.array;
            let len = idx.length;
            let pp2 = new Float32Array(len * 3);
            let inc = 0;
            for (let i=0; i<len; i++) {
                let iv = idx[i];
                let ip = iv * 3;
                pp2[inc++] = pos[ip++];
                pp2[inc++] = pos[ip++];
                pp2[inc++] = pos[ip];
            }
            pos = pp2;
        } else if (translate) {
            pos = pos.slice();
        }
        // used by CAM.shadowAt()
        this.cache.geo = pos;
        delete this.cache.shadow;
        return pos;
    }

    getPoints() {
        if (!this.points) {
            // convert and cache points from geometry vertices
            this.points = verticesToPoints(this.getGeoVertices(), {
                maxpass: 0 // disable decimation
            });
        }
        return this.points;
    }

    getBoundingBox(refresh) {
        if (!this.bounds || refresh || this.boundingBoxNeedsUpdate) {
            this.bounds = new THREE.Box3().setFromArray(this.getGeoVertices({
                translate: true,
                unroll: false
            }));
            this.boundingBoxNeedsUpdate = false;
        }
        return this.bounds;
    }

    getPositionBox() {
        let bounds = this.getBoundingBox().clone();
        let pos = this.track.pos;
        bounds.min.x += pos.x;
        bounds.max.x += pos.x;
        bounds.min.y += pos.y;
        bounds.max.y += pos.y;
        return bounds;
    }

    getExtruder(settings) {
        if (settings) {
            console.trace('legacy call with settings');
        }
        return this.anno.extruder || 0;
    }

    // allow worker code to run in same memspace as client
    setInWorker() {
        this.inWorker = true;
        return this;
    }

    /**
     * render to provided stack
     */
    render(stack) {
        const mark = Date.now();
        for (let slice of this.slices || []) {
            if (slice.layers) {
                stack.add(slice.layers);
            }
        }
        return Date.now() - mark;
    }

    setEdges(set) {
        if (!(this.api && this.api.conf)) {
            // missing api features in engine mode
            return;
        }
        let mesh = this.mesh;
        if (set && set.toggle) {
            set = this.outline ? false : true;
        }
        if (this.outline) {
            mesh.remove(this.outline);
            this.outline = null;

        }
        if (set) {
            let dark = this.api.space.is_dark();
            let cam = this.api.mode.is_cam();
            let color = dark && !cam ? 0xffffff : 0;
            let angle = this.api.conf.get().controller.edgeangle || 20;
            let edges = new THREE.EdgesGeometry(mesh.geometry, angle);
            let material = new THREE.LineBasicMaterial({ color });
            this.outline = new THREE.LineSegments(edges, material);
            this.outline.renderOrder = -20;
            mesh.add(this.outline);
        }
    }

    setWireframe(set, color, opacity) {
        if (!(this.api && this.api.conf)) {
            // missing api features in engine mode
            return;
        }
        let mesh = this.mesh,
            widget = this;
        if (this.wire) {
            this.setOpacity(solid_opacity);
            mesh.remove(this.wire);
            this.wire = null;
        }
        if (set) {
            let dark = this.api.space.is_dark();
            let mat = new THREE.MeshBasicMaterial({
                wireframe: true,
                color: dark ? 0xaaaaaa : 0,
                opacity: 0.5,
                transparent: true
            })
            let wire = widget.wire = new THREE.Mesh(mesh.geometry.shallowClone(), mat);
            mesh.add(wire);
        }
        if (this.api.view.is_arrange()) {
            this.setColor(this.color);
        } else {
            this.setColor(0x888888,undefined,false);
        }
        if (opacity !== undefined) {
            widget.setOpacity(opacity);
        }
    }

    show() {
        this.mesh.visible = true;
    }

    hide() {
        this.mesh.visible = false;
    }

    async shadowAt(z) {
        let shadows = this.cache.shadows;
        if (!shadows) {
            shadows = this.cache.shadows = {};
        }
        let cached = shadows[z];
        if (cached) {
            return cached;
        }
        // find closest shadow above and use to speed up delta shadow gen
        let zover = Object.keys(shadows).map(v => parseFloat(v)).filter(v => v > z);
        let minZabove = Math.min(Infinity, ...zover);
        let shadow = this.#computeShadowAt(z, minZabove);
        if (minZabove < Infinity) {
            shadow = POLY.union([...shadow, ...shadows[minZabove]], 0.001, true);
        }
        return shadows[z] = POLY.setZ(shadow, z);
    }

    #ensureShadowCache() {
        // cache faces with normals up
        if (this.cache.shadow) {
            return;
        }
        const geo = this.cache.geo;
        const length = geo.length;
        const bounds = this.getBoundingBox();
        const stack = {};
        // const faces = [];
        for (let i = Math.floor(bounds.min.z); i <= Math.ceil(bounds.max.z); i++) {
            stack[i] = [];
        }
        for (let i = 0, ip = 0; i < length; i += 3) {
            const a = new THREE.Vector3(geo[ip++], geo[ip++], geo[ip++]);
            const b = new THREE.Vector3(geo[ip++], geo[ip++], geo[ip++]);
            const c = new THREE.Vector3(geo[ip++], geo[ip++], geo[ip++]);
            const n = THREE.computeFaceNormal(a, b, c);
            if (n.z < 0.001) {
                continue;
                // faces.push(a, b, c);
            }
            const minZ = Math.floor(Math.min(a.z, b.z, c.z));
            const maxZ = Math.ceil(Math.max(a.z, b.z, c.z));
            for (let z = minZ; z <= maxZ; z++) {
                stack[z].push(a, b, c);
            }
        }
        this.cache.shadow = stack;
    }

    // union triangles > z (opt cap < ztop) into polygon(s)
    #computeShadowAt(z, ztop) {
        this.#ensureShadowCache();
        const found = [];
        const stack = this.cache.shadow;
        let minZ = Math.floor(z);
        let maxZ = Math.ceil(z);
        let slices = [];
        for (let sz = minZ; sz <= maxZ; sz++) {
            slices.push(stack[sz] ?? []);
        }
        for (let faces of slices)
        for (let i = 0; i < faces.length; ) {
            const a = faces[i++];
            const b = faces[i++];
            const c = faces[i++];
            if (ztop && a.z > ztop && b.z > ztop && c.z > ztop) {
                // skip faces over top threshold
                continue;
            }
            if (a.z < z && b.z < z && c.z < z) {
                // skip faces under threshold
                continue;
            } else if (a.z >= z && b.z >= z && c.z >= z) {
                found.push([a, b, c]);
            } else {
                // check faces straddling threshold
                const where = { under: [], over: [], on: [] };
                checkOverUnderOn(newPoint(a.x, a.y, a.z), z, where);
                checkOverUnderOn(newPoint(b.x, b.y, b.z), z, where);
                checkOverUnderOn(newPoint(c.x, c.y, c.z), z, where);
                if (where.on.length === 0 && (where.over.length === 2 || where.under.length === 2)) {
                    // compute two point intersections and construct line
                    let line = intersectPoints(where.over, where.under, z);
                    if (line.length === 2) {
                        if (where.over.length === 2) {
                            found.push([where.over[1], line[0], line[1]]);
                            found.push([where.over[0], where.over[1], line[0]]);
                        } else {
                            found.push([where.over[0], line[0], line[1]]);
                        }
                    } else {
                        console.log({ msg: "invalid ips", line: line, where: where });
                    }
                }
            }
        }

        let polys = found.map(a => {
            return newPolygon()
                .add(a[0].x, a[0].y, a[0].z)
                .add(a[1].x, a[1].y, a[1].z)
                .add(a[2].x, a[2].y, a[2].z);
        });
        polys = POLY.union(polys, 0, true);

        // for a more perfect union, pump shadows to merge very close lines
        // todo: create clipper only version that avoids round trip thru geo classes
        polys = POLY.offset(polys, 0.01);
        polys = POLY.offset(polys, -0.01);

        return polys;
    }
}

// Widget Grouping API
const Group = Widget.Groups = {
    list() {
        return groups.slice()
    },

    merge(widgets) {
        let grps = widgets.map(w => w.group).uniq();
        if (grps.length > 1) {
            let root = grps.shift();
            let rpos = root[0].track.pos;
            for (let grp of grps) {
                for (let w of grp) {
                    let wpos = w.track.pos;
                    w.group = root;
                    w.moveMesh(rpos.x - wpos.x, rpos.y - wpos.y, rpos.z - wpos.z);
                    w._move(rpos.x, rpos.y, rpos.z, true);
                    root.push(w);
                }
                groups.splice(groups.indexOf(grp),1);
            }
        }
    },

    split(widgets) {
        for (let group of widgets.map(w => w.group).uniq()) {
            groups.splice(groups.indexOf(group),1);
            for (let widget of group) {
                let nugroup = Group.forid(widget.id);
                nugroup.push(widget);
                widget.group = nugroup;
            }
        }
    },

    forid(id) {
        for (let i=0; i<groups.length; i++) {
            if (groups[i].id === id) return groups[i];
        }
        let group = [];
        group.id = id;
        groups.push(group);
        return group;
    },

    remove(widget) {
        groups.slice().forEach(group => {
            let pos = group.indexOf(widget);
            if (pos >= 0) {
                group.splice(pos,1);
            }
            if (group.length === 0) {
                pos = groups.indexOf(group);
                groups.splice(pos,1);
            }
        });
    },

    blocks() {
        return groups.map(group => {
            return {
                w: group[0].track.box.w,
                h: group[0].track.box.h,
                move: (x,y,z,abs) => {
                    group.forEach(widget => {
                        widget.getMaterial().visible = true;
                        widget._move(x, y, z, abs);
                    });
                }
            };
        });
    },

    loadDone() {
        groups.forEach(group => {
            if (!group.centered) {
                group[0].center();
                group.centered = true;
            }
        });
    },

    bounds(group) {
        let bounds = null;
        group.forEach(widget => {
            let wb = widget.mesh.getBoundingBox(true);
            if (bounds) {
                bounds = bounds.union(wb);
            } else {
                bounds = wb;
            }
        });
        return bounds;
    },

    clear() {
        groups.length = 0;
    }
};

Widget.loadFromCatalog = function(filename, ondone) {
    catalog().getFile(filename, function(data) {
        let widget = newWidget().loadVertices(data);
        widget.meta.file = filename;
        ondone(widget);
    });
};

Widget.loadFromState = function(id, ondone, move) {
    index().get('ws-save-'+id, function(data) {
        if (data) {
            let vertices = data.geo || data,
                track = data.track || undefined,
                group = data.group || id,
                anno = data.anno || undefined,
                widget = newWidget(id, Group.forid(group)),
                meta = data.meta || widget.meta,
                ptr = widget.loadVertices(vertices);
            widget.meta = meta;
            widget.anno = anno || widget.anno;
            // restore widget position if specified
            if (move && track && track.pos) {
                widget.track = track;
                widget.move(track.pos.x, track.pos.y, track.pos.z, true);
            }
            ondone(ptr);
        } else {
            ondone(null);
        }
    });
};

Widget.deleteFromState = function(id,ondone) {
    index().remove('ws-save-'+id, ondone);
};

export { Widget, newWidget };
