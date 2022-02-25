/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.license
// dep: moto.client
// dep: moto.broker
// dep: moto.space
// dep: mesh.util
// dep: ext.three
// dep: ext.three-bgu
// use: add.array
gapp.register("mesh.api", [], (root, exports) => {

const { Matrix4, Vector3 } = THREE;
const { mesh, moto } = root;
const { space } = moto;
const { util } = mesh;

const worker = moto.client.fn
const groups = [];

let selected = [];

const selection = {
    // @returns {MeshObject[]} or all groups if not strict and no selection
    list(strict = false) {
        return selected.length || strict ? selected.slice() : groups.slice();
    },

    // return selected groups + groups from selected models
    groups(strict) {
        let all = selection.list(strict);
        let grp = all.filter(s => s instanceof mesh.group);
        let mdl = all.filter(s => s instanceof mesh.model);
        for (let m of mdl) {
            grp.addOnce(m.group);
        }
        return grp;
    },

    // return selected models + models from selected groups
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
        for (let m of api.model.list()) {
            m.clearSelections();
        }
    },

    visible() {
        for (let m of selection.models()) {
            m.visible(...arguments);
        }
        util.defer(selection.update);
    },

    // update selection and wireframe for all objects
    update() {
        for (let group of groups) {
            group.select(false);
            group.wireframe(prefs.map.space.wire || false);
            group.normals(prefs.map.space.norm || false);
        }
        // prevent selection of model and its group
        let mgsel = selected.filter(s => s instanceof mesh.model).map(m => m.group);
        selected = selected.filter(sel => !mgsel.contains(sel)).filter(v => v);
        // highlight selected
        for (let object of selected) {
            object.select(true);
        }
        // update saved selection id list
        prefs.save( prefs.map.space.select = selected.map(s => s.id) );
        // force repaint in case of idle
        space.update();
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

const group = {
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
        api.selection.update();
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

// return selection if models are invalid. can happen when called from
// even bound to a button which delivers a PointEvent argument
function fallback(models, strict) {
    return Array.isArray(models) ? models : selection.models(strict);
}

const tool = {
    merge(models) {
        models = fallback(models);
        if (models.length <= 1) {
            return api.log.emit('nothing to merge');
        }
        api.log.emit(`merging ${models.length} models`).pin();
        worker.model_merge(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            let group = api.group.new([new mesh.model({
                file: `merged`,
                mesh: data
            })]).promote();
            api.selection.set([group]);
            api.log.emit('merge complete').unpin();
        });
    },

    union(models) {
        models = fallback(models);
        api.log.emit(`union ${models.length} model(s)`).pin();
        worker.model_union(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            let group = api.group.new([new mesh.model({
                file: `unioned`,
                mesh: data
            })]).promote();
            api.selection.set([group]);
            api.log.emit('union complete').unpin();
        });
    },

    duplicate() {
        for (let m of selection.models()) {
            m.duplicate();
        }
    },

    mirror() {
        for (let m of selection.models()) {
            m.mirror();
        }
    },

    invert() {
        for (let m of selection.models()) {
            m.invert(api.mode.get());
        }
    },

    rename(models) {
        models = fallback(models, true);
        let model = models[0];
        if (!model) {
            return;
        }
        if (models.length > 1) {
            return api.log.emit('rename requires a single selection');
        }
        let onclick = onkeydown = (ev) => {
            if (ev.code && ev.code !== 'Enter') {
                return;
            }
            model.rename( $('tempedit').value.trim() );
            selection.update();
            api.modal.hide();
        };
        let { tempedit } = api.modal.show(`rename model`, h.div({ class: "rename"}, [
            h.input({ id: "tempedit", value: model.file, onkeydown }),
            h.button({ _: 'ok', onclick })
        ]));
        tempedit.setSelectionRange(0,1000);
        tempedit.focus();
    },

    regroup(models) {
        models = fallback(models, true);
        if (models.length === 0) {
            return;
        }
        api.log.emit(`regrouping ${models.length} model(s)`);
        let bounds = util.bounds(models);
        let { mid } = bounds;
        Promise.all(models.map(m => m.ungroup())).then(() => {
            mesh.api.group.new(models)
                .centerModels()
                .position(mid.x, mid.y, mid.z)
                .setSelected();
        });
    },

    analyze(models, opt = { compound: true }) {
        models = fallback(models);
        api.log.emit('analyzing mesh(es)...').pin();
        let promises = [];
        let mcore = new Matrix4().makeRotationX(Math.PI / 2);
        for (let m of models) {
            // todo - translate vertices with source model's matrix
            let p = worker.model_analyze({ id: m.id, opt }).then(data => {
                let { areas, edges } = data.mapped;
                let nm = areas.map(area => new mesh.model({
                    file: (area.length/3).toString(),
                    mesh: area.toFloat32()
                })).map( nm => nm.applyMatrix4(mcore.clone().multiply(m.mesh.matrixWorld)) );
                if (nm.length) {
                    mesh.api.group.new(nm, undefined, "patch").setSelected();
                }
            });
            promises.push(p);
        }
        Promise.all(promises).then(() => {
            api.log.emit('analysis complete').unpin();
        });
    },

    heal(models, opt = {}) {
        models = fallback(models);
        let promises = [];
        for (let m of models) {
            let p = worker.model_heal({
                id: m.id, opt
            }).then(data => {
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
        return new Promise((resolve, reject) => {
            Promise.all(promises).then(() => {
                resolve();
            });
        });
    },

    repair(models) {
        models = fallback(models);
        api.log.emit('repairing mesh(es)...').pin();
        tool.heal(models, { merge: true }).then(() => {
            api.log.emit('repair commplete').unpin();
            api.selection.update();
        });
    },

    clean(models) {
        models = fallback(models);
        tool.heal(models, { merge: false }).then(() => {
            api.log.emit('cleaning complete').unpin();
            api.selection.update();
        });
    },

    rebuild(models) {
        Promise.all(fallback(models).map(m => m.rebuild()));
    }
};

const modes = { object: "object", face: "face", line: "line", vertex: "vertex" };

// edit mode
const mode = {
    set(mode) {
        prefs.save(prefs.map.mode = mode);
        for (let key of Object.values(modes)) {
            $(`mode-${key}`).classList.remove('selected');
        }
        $(`mode-${mode}`).classList.add('selected');
    },

    get() {
        return prefs.map.mode;
    },

    object() {
        mode.set(modes.object);
    },

    face() {
        mode.set(modes.face);
    },

    line() {
        mode.set(modes.line);
    },

    vertex() {
        mode.set(modes.vertex);
    },
};

// cache pref signature so we know when it changes
let prefsig;
let prefsignew;

// persisted preference map
const prefs = {
    map: {
        info: {
            group: "show",
            span: "show"
        },
        mode: modes.object,
        edit: {
            scale_group_X: true,
            scale_group_Y: true,
            scale_group_Z: true
        },
        space: {
            center: true,
            floor: true,
            wire: false,
            grid: true,
            dark: false,
            select: []
        },
        normals: {
            length: 0.5,
            color_lite: 0xff0000,
            color_dark: 0x00ffff
        }
    },

    // look for changes in pref signature
    changed() {
        prefsignew = JSON.stringify(prefs.map);
        return prefsignew !== prefsig;
    },

    // persist to data store
    save() {
        if (prefs.changed()) {
            mesh.db.admin.put("prefs", prefs.map);
            prefsig = prefsignew;
        }
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
const api = exports({
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
        let { normal } = object;
        let left, up;
        if (normal) {
            let { x, y, z } = normal;
            left = new Vector3(x,y,0).angleTo(new Vector3(0,-1,0));
            up = new Vector3(0,y,z).angleTo(new Vector3(0,0,1));
            if (x < 0) left = -left;
        }
        // sets "home" views (front, back, home, reset)
        space.platform.setCenter(center.x, -center.y, center.z);
        // sets camera focus
        space.view.panTo(center.x, center.z, -center.y, left, up);
        // space.view.setFocus(new Vector3(
        //     center.x, center.z, -center.y
        // ));
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

    wireframe(state = {toggle:true}, opt = { }) {
        let wire = prefs.map.space.wire;
        if (state.toggle) {
            wire = !wire;
        } else {
            wire = state;
        }
        for (let m of model.list()) {
            m.wireframe(wire, opt);
        }
        prefs.save( prefs.map.space.wire = wire );
    },

    normals(state = {toggle:true}) {
        let norm = prefs.map.space.norm;
        if (state.toggle) {
            norm = !norm;
        } else {
            norm = state;
        }
        for (let m of model.list()) {
            m.normals(norm);
        }
        prefs.save( prefs.map.space.norm = norm );
    },

    mode,

    modes,

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
});

const { broker } = gapp;
// publish messages when api functions are called
broker.wrapObject(selection, 'selection');
broker.wrapObject(model, 'model');
broker.wrapObject(group, 'group');

// optimize db writes by merging updates
prefs.save = util.deferWrap(prefs.save, 100);

});
