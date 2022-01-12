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
    "mesh.util",    // dep: mesh.util
    "add.array",    // dep: add.array
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.api) return;

let space = moto.Space;
let worker = moto.client.fn;
let util = mesh.util;

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

    duplicate() {
        for (let m of selection.models()) {
            m.duplicate();
        }
    },

    analyze() {
        tool.analyze(selection.models());
    },

    repair() {
        tool.repair(selection.models());
    },

    merge() {
        tool.merge(selection.models());
    },

    // update material selections
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
        for (let s of selection.groups()) {
            s.move(dx, dy, dz);
        }
        return selection;
    },

    rotate(dx = 0, dy = 0, dz = 0) {
        for (let s of selection.groups()) {
            s.rotate(dx, dy, dz);
        }
        return selection;
    },

    qrotate(q) {
        for (let s of selection.groups()) {
            s.qrotate(q);
        }
        return selection;
    },

    scale(dx = 0, dy = 0, dz = 0) {
        for (let s of selection.groups()) {
            let { x, y, z } = s.scale();
            s.scale(x * dx, y * dy, z * dz);
        }
        return selection;
    },

    floor() {
        for (let s of selection.groups()) {
            s.floor(...arguments);
        }
        return selection;
    },

    centerXY() {
        for (let s of selection.groups()) {
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
    new(models, id, name) {
        return group.add(new mesh.group(models, id, name));
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
    merge(models) {
        api.log.emit(`merging ${models.length} models`).pin();
        worker.model_merge(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            let group = api.group.new([new mesh.model({
                file: `merged`,
                mesh: data
            })]).centerModels();
            api.selection.set([group]);
            api.log.emit('merge complete').unpin();
        });
    },

    analyze(models) {
        api.log.emit('analyzing mesh(es)...').pin();
        let promises = [];
        let newmdl = [];
        let mcore = new THREE.Matrix4().makeRotationX(Math.PI / 2);
        for (let m of models) {
            let p = worker.model_analyze(m.id).then(data => {
                let { areas, edges } = data.mapped;
                let nm = areas.map(area => new mesh.model({
                    file: (area.length/3).toString(),
                    mesh: area.toFloat32()
                })).map( nm => nm.applyMatrix4(mcore.multiply(m.mesh.matrixWorld)) );
                newmdl.appendAll(nm);
            });
            promises.push(p);
        }
        Promise.all(promises).then(() => {
            if (newmdl.length) {
                mesh.api.group.new(newmdl, undefined, "patch");
            }
            api.log.emit('analysis complete').unpin();
        });
    },

    repair(models) {
        api.log.emit('repairing mesh(es)...').pin();
        let promises = [];
        for (let m of models) {
            let p = worker.model_heal(m.id).then(data => {
                if (data) {
                    m.reload(
                        data.vertices,
                        data.indices,
                        data.normals
                    );
                }
            });
            promises.push(p);
        }
        Promise.all(promises).then(() => {
            api.log.emit('repair complete').unpin();
        });
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

let broker = gapp.broker;
// publish messages when api functions are called
broker.wrapObject(selection, 'selection');
broker.wrapObject(model, 'model');
broker.wrapObject(group, 'group');

// optimize db writes by merging updates
prefs.save = util.deferWrap(prefs.save);

})();
