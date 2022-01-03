/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// dep: ext.three
// dep: ext.three-bgu
gapp.register("mesh.api", [
    "moto.license", // dep: moto.license
    "moto.client",  // dep: moto.client
    "moto.broker",  // dep: moto.broker
    "moto.space",   // dep: moto.space
    "mesh.tool",    // dep: mesh.tool
    "add.array",    // dep: add.array
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.api) return;

let space = moto.Space;
let groups = [];
let selected = [];

let selection = {
    // @returns {MeshObject[]}
    list() {
        return selected.length ? selected.slice() : groups.slice();
    },

    groups() {
        let all = selection.list();
        let grp = all.filter(s => s instanceof mesh.group);
        let mdl = all.filter(s => s instanceof mesh.model);
        for (let m of mdl) {
            grp.addOnce(m.group);
        }
        return grp;
    },

    models() {
        let all = selection.list();
        let grp = all.filter(s => s instanceof mesh.group);
        let mdl = all.filter(s => s instanceof mesh.model);
        for (let g of grp) {
            for (let m of g.models) {
                mdl.addOnce(m);
            }
        }
        return mdl;
    },

    contains(object) {
        return selected.contains(object);
    },

    // @param group {MeshObject[]}
    set(objects) {
        selected = objects;
        util.defer(selection.update);
    },

    // @param group {MeshObject}
    add(object) {
        // pendantic code necessary to minimize re-entrant api calls
        if (object.models) {
            // if group, remove discrete selected members
            for (let m of object.models) {
                if (selected.contains(m)) {
                    selection.remove(m);
                }
            }
        } else {
            // if model, remove selcted group
            if (selected.contains(object.group)) {
                selection.remove(object.group);
            }
        }
        selected.addOnce(object);
        util.defer(selection.update);
    },

    // @param group {MeshObject}
    remove(object) {
        selected.remove(object);
        util.defer(selection.update);
    },

    // @param group {MeshObject}
    toggle(object) {
        if (selected.contains(object)) {
            selection.remove(object);
        } else {
            selection.add(object);
        }
    },

    clear() {
        for (let s of selected) {
            selection.remove(s);
        }
    },

    update() {
        for (let group of groups) {
            group.material(mesh.material.unselected);
        }
        // prevent selection of model and its group
        let mgsel = selected.filter(s => s instanceof mesh.model).map(m => m.group);
        selected = selected.filter(sel => !mgsel.contains(sel));
        for (let object of selected) {
            object.material(mesh.material.selected);
        }
        return selection;
    },

    move(dx = 0, dy = 0, dz = 0) {
        for (let s of selected) {
            s.move(dx, dy, dz);
        }
        return selection;
    },

    rotate(dx = 0, dy = 0, dz = 0) {
        for (let s of selected) {
            s.rotate(dx, dy, dz);
        }
        return selection;
    },

    qrotate(q) {
        for (let s of selected) {
            s.qrotate(q);
        }
        return selection;
    },

    scale(dx = 0, dy = 0, dz = 0) {
        for (let s of selected) {
            let { x, y, z } = s.scale();
            s.scale(x + dx, y + dy, z + dz);
        }
        return selection;
    },

    floor() {
        for (let s of selected) {
            s.floor(...arguments);
        }
        return selection;
    },

    centerXY() {
        for (let s of selected) {
            s.centerXY(...arguments);
        }
        return selection;
    },

    wireframe() {
        for (let m of selection.models()) {
            m.wireframe(...arguments);
        }
        return selection;
    },

    boundsBox() {
        for (let m of selection.groups()) {
            m.showBounds(...arguments);
        }
        return selection;
    },

    home() {
        return selection.centerXY().floor();
    },

    focus() {
        api.focus(selected);
    },

    bounds() {
        return util.bounds(selected.map(s => s.object()));
    }
};

let group = {
    // @returns {MeshGroup[]}
    list() {
        return groups.slice();
    },

    // @param group {MeshModel[]}
    new(models) {
        return group.add(new mesh.group(models));
    },

    // @param group {MeshGroup}
    add(group) {
        groups.addOnce(group);
        space.world.add(group.group);
        space.update();
        return group;
    },

    // @param group {MeshGroup}
    remove(group) {
        groups.remove(group);
        space.world.remove(group.group);
        space.update();
    }
};

let model = {
    // @returns {MeshModel[]}
    list() {
        return groups.map(g => g.models).flat();
    }
};

let api = mesh.api = {
    clear() {
        for (let group of group.list()) {
            group.remove(group);
        }
    },

    // @param object {THREE.Object3D | THREE.Object3D[] | Point}
    focus(object) {
        let { center } = object.center ? object : util.bounds(object);
        // when no valid objects supplied, set origin
        if (isNaN(center.x * center.y * center.z)) {
            center = { x: 0, y: 0, z: 0 };
        }
        // sets "home" views (front, back, home, reset)
        space.platform.setCenter(center.x, -center.y, center.z);
        // sets camera focus
        space.view.setFocus(new THREE.Vector3(
            center.x, center.z, -center.y
        ));
    },

    selection,

    group,

    model,

    objects() {
        // return model objects suitable for finding ray intersections
        return group.list().map(o => o.models).flat().map(o => o.object());
    }
};

let deferFn = [];

let util = mesh.util = {

    uuid(segs = 1) {
        let uid = [];
        while (segs-- > 0) {
            uid.push(Math.round(Math.random() * 0xffffffff).toString(36));
        }
        return uid.join('-');
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

    // @param object {THREE.Object3D | THREE.Object3D[] | MeshObject | MeshObject[]}
    // @returns bounds modified for moto.Space
    bounds(object) {
        let box = new THREE.Box3();
        if (Array.isArray(object)) {
            for (let o of object) {
                util.box3expand(box, o instanceof mesh.object ? o.object() : o);
            }
        } else if (object) {
            util.box3expand(box, object instanceof mesh.object ? object.object() : object);
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
        bnd.size = {
            x: bnd.max.x - bnd.min.x,
            y: bnd.max.y - bnd.min.y,
            z: bnd.max.z - bnd.min.z
        };
        bnd.center = {
            x: (bnd.max.x + bnd.min.x) / 2,
            y: -(bnd.max.y + bnd.min.y) / 2,
            z: (bnd.max.z + bnd.min.z) / 2
        };
        return bnd;
    },

    // bounding box workaround adapted from:
    // https://discourse.threejs.org/t/bounding-box-bigger-than-concave-object-extrudegeometry/26073/2
    box3expand(box3, object) {
        const geometry = object.geometry;
        object.updateWorldMatrix(geometry ? true : false, false);

        if (geometry) {
            let bounds = util.geoBounds(geometry, object.matrixWorld);
            let bt = new THREE.Box3().copy(bounds);
            let m4 = new THREE.Matrix4();
            m4.setPosition(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld));
            bt.applyMatrix4(m4);
            box3.union(bt);
        }

        const children = object.children;
        for (let i = 0, l = children.length; i < l; i++) {
            util.box3expand(box3, children[i]);
        }
    },

    // second half of bound box workaround (see above)
    // todo: cache, distribute in workers, or other mem/cpu optimization
    geoBounds(geometry, matrix) {
        const boundingBox = new THREE.Box3();
        const position = geometry.attributes.position.clone();

        if (matrix) {
            position.applyMatrix4(new THREE.Matrix4().extractRotation(matrix));
        }

        if (position.isGLBufferAttribute) {
            console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".', geometry);
        }

        boundingBox.setFromBufferAttribute(position);

        const morphAttributesPosition = geometry.morphAttributes.position;
        if (morphAttributesPosition) {
            for (let i = 0, il = morphAttributesPosition.length; i < il; i++) {
                const box3 = new THREE.Box3().setFromBufferAttribute(morphAttributesPosition[i]);

                if (geometry.morphTargetsRelative) {
                    let vector = new THREE.Vector3();
                    vector.addVectors(boundingBox.min, box3.min);
                    boundingBox.expandByPoint(vector);
                    vector.addVectors(boundingBox.max, box3.max);
                    boundingBox.expandByPoint(vector);
                } else {
                    boundingBox.expandByPoint(box3.min);
                    boundingBox.expandByPoint(box3.max);
                }
            }
        }

        if (isNaN(boundingBox.min.x) || isNaN(boundingBox.min.y) || isNaN(boundingBox.min.z)) {
            console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.', geometry);
        }

        return boundingBox;
    }

};

let broker = gapp.broker;
// publish messages when api functions are called
broker.wrapObject(selection, 'selection');
broker.wrapObject(model, 'model');
broker.wrapObject(group, 'group');

})();
