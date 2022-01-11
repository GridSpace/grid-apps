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
    "data.index",   // dep: data.index
    "mesh.tool",    // dep: mesh.tool
    "add.array",    // dep: add.array
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.api) return;

let space = moto.Space;
let worker = moto.client.fn;
let groups = [];
let selected = [];

let selection = {
    // @returns {MeshObject[]} or all groups if not strict and no selection
    list(strict = false) {
        return selected.length || strict  ? selected.slice() : groups.slice();
    },

    groups(strict) {
        let all = selection.list(strict);
        let grp = all.filter(s => s instanceof mesh.group);
        let mdl = all.filter(s => s instanceof mesh.model);
        for (let m of mdl) {
            grp.addOnce(m.group);
        }
        return grp;
    },

    models(strict) {
        let all = selection.list(strict);
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
        for (let s of selection.list()) {
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
            s.scale(x * dx, y * dy, z * dz);
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
        api.focus(selection.list());
    },

    bounds() {
        return util.bounds(selected.map(s => s.object));
    }
};

let group = {
    // @returns {MeshGroup[]}
    list() {
        return groups.slice();
    },

    // @param group {MeshModel[]}
    new(models, id) {
        return group.add(new mesh.group(models, id));
    },

    // @param group {MeshGroup}
    add(group) {
        groups.addOnce(group);
        space.world.add(group.object);
        space.update();
        return group;
    },

    // @param group {MeshGroup}
    remove(group) {
        groups.remove(group);
        space.world.remove(group.object);
        space.update();
    }
};

let model = {
    // @returns {MeshModel[]}
    list() {
        return groups.map(g => g.models).flat();
    }
};

let file = {
    import() {
        // binding created in mesh.build
        $('import').click();
    },

    export() {
        let recs = selection.models().map(m => { return {
            id: m.id, matrix: m.matrix, file: m.file
        } });
        if (recs.length === 0) {
            return api.log.emit(`no models to export`);
        }
        function doit(ext = 'obj') {
            api.log.emit(`exporting ${recs.length} model(s)`);
            let file = api.modal.bound.filename.value || "export.obj";
            if (file.toLowerCase().indexOf(`.${ext}`) < 0) {
                file = `${file}.${ext}`;
            }
            worker.file_export({
                recs, format: ext
            }).then(data => {
                if (data.length) {
                    util.download(data, file);
                }
            }).finally( api.modal.hide );
        }
        api.modal.dialog({
            title: `export ${recs.length} model(s)`,
            body: [ h.div({ class: "export" }, [
                h.div([
                    h.div("filename"),
                    h.input({ id: "filename", value: "mesh_export" })
                ]),
                h.div([
                    h.button({ _: "download OBJ", onclick() { doit('obj') } }),
                    h.button({ _: "download STL", onclick() { doit('stl') } })
                ])
            ]) ]
        });
    },
};

let tool = {
    analyze() {
        api.log.emit('analyzing mesh(es)...').pin();
        for (let m of selection.models()) {
            worker.model_analyze(m.id).then(data => {
                console.log({data});
                api.log.emit('analysis complete').unpin();
            });
        }
    },

    repair() {
        api.log.emit('repairing mesh(es)...').pin();
        for (let m of selection.models()) {
            worker.model_heal(m.id).then(data => {
                if (data) {
                    m.reload(
                        data.vertices,
                        data.indices,
                        data.normals
                    );
                }
                api.log.emit('repair complete').unpin();
            });
        }
    }
};

// persisted preference map
let prefs = {
    map: {
        info: {},
        space: {
            grid: true,
            dark: false
        },
    },

    put(key, val) {
        prefs.map[key] = val;
        prefs.update();
    },

    // persist to data store
    save() {
        mesh.db.admin.put("prefs", prefs.map);
    },

    // reload from data store
    load() {
        return mesh.db.admin.get("prefs").then(data => {
            // handle/ignore incompatible older prefs
            if (data) Object.assign(prefs.map, data);
        });
    }
};

// api is augmented in mesh.build (log, modal, download)
let api = mesh.api = {
    help() {
        window.open("https://docs.grid.space/projects/mesh-tool");
    },

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

    grid(state = {toggle:true}) {
        let { platform } = space;
        let { map, save } = prefs;
        if (state.toggle) {
            platform.showGrid(!platform.isGridVisible());
        } else {
            platform.showGrid(state);
        }
        map.space.grid = platform.isGridVisible();
        save();
    },

    wireframe(state = {toggle:true}, opt = {opacity:0.15}) {
        for (let m of api.model.list()) {
            m.wireframe(state, opt);
        }
    },

    selection,

    group,

    model,

    file,

    tool,

    prefs,

    objects() {
        // return model objects suitable for finding ray intersections
        return group.list().map(o => o.models).flat().map(o => o.mesh);
    }
};

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
        let box = new THREE.Box3();
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
                position.applyMatrix4(new THREE.Matrix4().extractRotation(matrix));
                let bounds = new THREE.Box3().setFromBufferAttribute(position);
                // let scale = new THREE.Vector3().setFromMatrixScale(matrix);
                // bounds.min.multiply(scale);
                // bounds.max.multiply(scale);
                cached = boundsCache[object.id] = { bkey, bounds };
            }
            let bt = cached.bounds.clone();
            let m4 = new THREE.Matrix4();
            m4.setPosition(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld));
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

let broker = gapp.broker;
// publish messages when api functions are called
broker.wrapObject(selection, 'selection');
broker.wrapObject(model, 'model');
broker.wrapObject(group, 'group');

// optimize db writes by merging updates
prefs.save = util.deferWrap(prefs.save);

})();
