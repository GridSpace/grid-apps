/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// dep: ext.three
// dep: ext.three-bgu
gapp.register("mesh.util", [
    "moto.license", // dep: moto.license
    "add.array",    // dep: add.array
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.util) return;

let { Matrix4, Vector3, Box3 } = THREE;

let deferFn = [];
let boundsCache = {};

// util functions augmented in build (download)
let util = mesh.util = {
    uuid(segs = 1) {
        let uid = [];
        while (segs-- > 0) {
            uid.push(Math.round(Math.random() * 0xffffffff).toString(36));
        }
        return uid.join('-');
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
        });
        deferFn.push(rec);
    },

    // return a function wrapper which can be re-used
    deferWrap(fn, time) {
        return function() {
            util.defer(fn, time);
        }
    },

    // @param object {THREE.Object3D | THREE.Object3D[] | MeshObject | MeshObject[]}
    // @returns bounds modified for moto.Space
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
        let geometry = object.geometry;
        object.updateWorldMatrix(geometry ? true : false, false);

        if (geometry) {
            let matrix = object.matrixWorld;
            let bkey = [matrix.elements.map(v => v.round(5))].join(',')
            let cached = boundsCache[object.id];
            if (!cached || cached.bkey !== bkey) {
                let position = geometry.attributes.position.clone();
                position.applyMatrix4(new Matrix4().extractRotation(matrix));
                let bounds = new Box3().setFromBufferAttribute(position);
                // let scale = new Vector3().setFromMatrixScale(matrix);
                // bounds.min.multiply(scale);
                // bounds.max.multiply(scale);
                cached = boundsCache[object.id] = { bkey, bounds };
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

    extract(object, opt = {}) {
        let field = opt.fields || ['x', 'y', 'z'];
        let array = [];
        for (let k of field) {
            let v = object[k] || 0;
            if (opt.round !== undefined) v = v.round(opt.round);
            if (opt.fixed !== undefined) v = v.toFixed(opt.fixed);
            array.push(v);
        }
        return array;
    },

    average(array, opt = {}) {
        let fields = opt.fields || ['x', 'y', 'z'];
        let avg = {};
        for (let e of array) {
            for (let f of fields) {
                avg[f] = (avg[f] || 0) + e[f];
            }
        }
        for (let f of fields) {
            avg[f] = (avg[f] || 0)  / array.length;
        }
        return avg;
    }
};

})();
