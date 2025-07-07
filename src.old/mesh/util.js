/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.license
// dep: add.array
// dep: add.three
gapp.register("mesh.util", [], (root, exports) => {

const { Matrix4, Matrix3, Vector3, Box3 } = THREE;
const { mesh } = root;

const deferFn = [];
const boundsCache = {};

// util functions augmented in build (download)
const util = exports({

    uuid(segs = 1) {
        let uid = [];
        while (segs-- > 0) {
            uid.push(Math.round(Math.random() * 0xffffffff).toString(36));
        }
        return uid.join('-');
    },

    toHexRGB(v) {
        return [
            ((v >> 16) & 0xff).toString(16).padStart(2,0),
            ((v >>  8) & 0xff).toString(16).padStart(2,0),
            ((v >>  0) & 0xff).toString(16).padStart(2,0)
        ].join('');
    },

    fromHexRGB(v) {
        return 0 +
            parseInt(v.substring(0,2), 16) << 16 |
            parseInt(v.substring(2,4), 16) <<  8 |
            parseInt(v.substring(4,6), 16);
    },

    // add comma separator to 1000s
    comma(val) {
        let str = val.toString().split(".");
        str[0] = str[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return str.join(".");
    },

    // merge repeated function calls like updates
    // that importantly take no arguments
    defer(fn, time = 50) {
        for (let rec of deferFn) {
            if (rec.fn === fn) {
                clearTimeout(rec.timer);
                deferFn.remove(rec);
                break;
            }
        }
        let rec = { fn };
        rec.timer = setTimeout(() => {
            deferFn.remove(rec);
            fn();
        }, time);
        deferFn.push(rec);
    },

    // return a function wrapper which can be re-used
    deferWrap(fn, time) {
        return function() {
            util.defer(fn, time);
        }
    },

    // @param object {THREE.Object3D | THREE.Object3D[] | MeshObject | MeshObject[]}
    // @returns bounds modified for moto.space
    bounds(object) {
        let box = new Box3();
        if (Array.isArray(object)) {
            for (let o of object) {
                util.box3expand(box, o instanceof mesh.object ? o.object : o);
            }
        } else if (object) {
            util.box3expand(box, object instanceof mesh.object ? object.object : object);
        } else {
            return box;
        }
        let bnd = {
            min: {
                x: box.min.x,
                y: box.min.z,
                z: box.min.y
                },
            max: {
                x: box.max.x,
                y: box.max.z,
                z: box.max.y
            }
        };
        bnd.size = bnd.dim = {
            x: bnd.max.x - bnd.min.x,
            y: bnd.max.y - bnd.min.y,
            z: bnd.max.z - bnd.min.z
        };
        bnd.center = bnd.mid = {
            x: (bnd.max.x + bnd.min.x) / 2,
            y: -(bnd.max.y + bnd.min.y) / 2,
            z: (bnd.max.z + bnd.min.z) / 2
        };
        return bnd;
    },

    // bounding box workaround adapted from:
    // https://discourse.threejs.org/t/bounding-box-bigger-than-concave-object-extrudegeometry/26073/2
    // https://discourse.threejs.org/t/invalid-bounds-generated-for-some-orientations/33205
    box3expand(box3, object) {
        if (object._no_bounds) {
            return;
        }

        let geometry = object.geometry;
        object.updateWorldMatrix(geometry ? true : false, false);

        if (geometry) {
            let matrix = object.matrixWorld;
            let bkey = [matrix.elements.map(v => v.round(5))].join(',')
            let cached = boundsCache[object.id];
            // geometry._model_invalid set on model.reload(), usually after a split
            if (!cached || cached.bkey !== bkey || geometry._model_invalid) {
                let position = geometry.attributes.position.clone();
                position.applyMatrix4(new Matrix4().extractRotation(matrix));
                let bounds = new Box3().setFromBufferAttribute(position);
                // let scale = new Vector3().setFromMatrixScale(matrix);
                // bounds.min.multiply(scale);
                // bounds.max.multiply(scale);
                cached = boundsCache[object.id] = { bkey, bounds };
                geometry._model_invalid = undefined;
            }
            let bt = cached.bounds.clone();
            let m4 = new Matrix4();
            m4.setPosition(new Vector3().setFromMatrixPosition(object.matrixWorld));
            bt.applyMatrix4(m4);
            box3.union(bt);
        }

        let children = object.children;
        for (let i = 0, l = children.length; i < l; i++) {
            util.box3expand(box3, children[i]);
        }
    },

    // extract object fields into an array with optional rounding
    extract(object, opt = {}) {
        let field = opt.fields || ['x', 'y', 'z'];
        let array = [];
        for (let k of field) {
            let v = object[k] || 0;
            if (opt.round !== undefined) v = v.round(opt.round);
            if (opt.fixed !== undefined) v = v.toFixed(opt.fixed);
            array.push(v);
        }
        return opt.map ?
            {
                [field[0]] : array[0],
                [field[1]] : array[1],
                [field[2]] : array[2],
            } :
            array;
    },

    // for an array of maps, return the average of all named fields in a new map
    average(array, opt = {}) {
        let fields = opt.fields || ['x', 'y', 'z'];
        let avg = {};
        for (let e of array) {
            for (let f of fields) {
                avg[f] = (avg[f] || 0) + e[f];
            }
        }
        for (let f of fields) {
            avg[f] = (avg[f] || 0) / array.length;
        }
        return avg;
    },

    faceNormals(obj, opt = { }) {
        const _va = new THREE.Vector3();
        const _vb = new THREE.Vector3();
        const _vc = new THREE.Vector3();
        const _v1 = new THREE.Vector3();
        const _v2 = new THREE.Vector3();
        const _normalMatrix = new THREE.Matrix3();
        const prefs = mesh.api.prefs.map;
        const norms = prefs.normals;
        const defcolor = prefs.space.dark ? norms.color_dark : norms.color_lite;
        const normlen = norms.length || 1;

        class FaceNormalsHelper extends THREE.LineSegments {
            constructor(object, size = opt.size || normlen, color = opt.color || defcolor) {
                const objGeometry = object.geometry;
                const nNormals = objGeometry.attributes.position.count / 3;
                const geometry = new THREE.BufferGeometry();
                const positions = new THREE.Float32BufferAttribute(nNormals * 3 * 2, 3);
                geometry.setAttribute('position', positions);
                super(geometry, new THREE.LineBasicMaterial({
                    color, toneMapped: false
                }));
                this.object = object;
                this.size = size;
                this.type = 'FaceNormalsHelper';
                this.matrixAutoUpdate = false;
                this._no_bounds = true;
                this.update();
            }

            update() {
                this.object.updateMatrixWorld(true);
                const position = this.geometry.attributes.position;
                const objGeometry = this.object.geometry;
                const objArr = objGeometry.attributes.position.array;
                let j=0;
                for (let idx = 0, xj = 0, jl = objArr.length; j < jl; ) {
                    _va.set(objArr[j++], objArr[j++], objArr[j++]);
                    _vb.set(objArr[j++], objArr[j++], objArr[j++]);
                    _vc.set(objArr[j++], objArr[j++], objArr[j++]);
                    let vn = THREE.computeFaceNormal(_va, _vb, _vc);
                    let vc = _va.add(_vb).add(_vc).divideScalar(3);
                    _v2.copy(vc).add(vn.multiplyScalar(this.size));
                    position.setXYZ(idx++, vc.x, vc.y, vc.z);
                    position.setXYZ(idx++, _v2.x, _v2.y, _v2.z);
                }
                position.needsUpdate = true;
            }
        }

        return new FaceNormalsHelper(obj);
    },

    vertexNormals(mesh) {
        const _v1 = new Vector3();
        const _v2 = new Vector3();
        const _normalMatrix = new Matrix3();

        class VertexNormalsHelper extends THREE.LineSegments {
            constructor(object, size = 1, color = 0xff0000) {
                const objGeometry = object.geometry;
                const nNormals = objGeometry.attributes.normal.count;
                const geometry = new THREE.BufferGeometry();
                const positions = new THREE.Float32BufferAttribute(nNormals * 2 * 3, 3);
                geometry.setAttribute('position', positions);
                super(geometry, new THREE.LineBasicMaterial({
                    color,toneMapped: false
                }));
                this.object = object;
                this.size = size;
                this.type = 'VertexNormalsHelper';
                this.matrixAutoUpdate = false;
                this.update();
            }

            update() {
                this.object.updateMatrixWorld(true);
                const position = this.geometry.attributes.position;
                const objGeometry = this.object.geometry;
                const objPos = objGeometry.attributes.position;
                const objNorm = objGeometry.attributes.normal;
                for (let idx = 0, j = 0, jl = objPos.count; j < jl; j++) {
                    _v1.set(objPos.getX(j), objPos.getY(j), objPos.getZ(j));
                    _v2.set(objNorm.getX(j), objNorm.getY(j), objNorm.getZ(j));
                    _v2.applyMatrix3(_normalMatrix).normalize().multiplyScalar(this.size).add(_v1);
                    position.setXYZ(idx++, _v1.x, _v1.y, _v1.z);
                    position.setXYZ(idx++, _v2.x, _v2.y, _v2.z);
                }
                position.needsUpdate = true;
            }
        }

        return new VertexNormalsHelper(mesh);
    },

    facesToGroups(faces) {
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
        return groups;
    },

    toSharedF32(float32) {
        if (float32.buffer instanceof SharedArrayBuffer) {
            return float32;
        }
        let { buffer } = float32;
        let shared = new Float32Array(new SharedArrayBuffer(buffer.byteLength));
        shared.set(float32);
        return shared;
    },

    toLocal32(shared32) {
        if (!(shared32.buffer instanceof SharedArrayBuffer)) {
            return shared32;
        }
        let local = new Float32Array(shared32.length);
        local.set(shared32);
        return local;
    },

    diagram(object, depth = 0) {
        let pre = '|'.padStart(depth * 3, '-');
        let ent = Object.entries(object).sort((a,b) => a[0] > b[0] ? 1 : -1);
        for (let [key, v] of ent) {
            console.log(pre, key);
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                util.diagram(v, depth + 1);
            }
        }
    }

});

});
