/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.license
// dep: moto.client
// dep: moto.broker
// dep: moto.space
// dep: mesh.util
// dep: mesh.edges
// dep: mesh.group
// dep: mesh.model
// dep: mesh.sketch
// dep: add.three
// use: add.array
gapp.register("mesh.api", [], (root, exports) => {

const { Matrix4, Vector3 } = THREE;
const { base, mesh, moto } = root;
const { space } = moto;
const { util } = mesh;
const { newPolygon } = base;

const worker = moto.client.fn
const groups = [];
const sketches = [];

let selected = [];
let tools = [];

const selection = {
    count() {
        return selected.length;
    },

    // @returns {MeshObject[]} or all groups if not strict and no selection
    list(strict) {
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
    set(objects, toolist) {
        // flatten groups into model lists when present
        selected = objects.map(o => o.models ? o.models : o).flat();
        tools = toolist || [];
        util.defer(selection.update);
    },

    // @param group {MeshObject}
    add(object, tool = mode.is([ modes.tool ])) {
        // when group added, add group models instead
        if (object.models) {
            for (let m of object.models) {
                selected.addOnce(m);
                if (tool) {
                    tools.addOnce(m);
                }
            }
        } else {
            selected.addOnce(object);
            if (tool) {
                tools.addOnce(object);
            }
        }
        util.defer(selection.update);
    },

    // @param group {MeshObject}
    remove(object) {
        if (object.models) {
            for (let m of object.models) {
                selected.remove(m);
                tools.remove(m);
            }
        } else {
            selected.remove(object);
            tools.remove(object);
        }
        util.defer(selection.update);
    },

    // remove all
    delete() {
        for (let s of selection.list(true)) {
            selection.remove(s);
            tools.remove(s);
            s.showBounds(false);
            s.remove();
        }
    },

    // @param group {MeshObject}
    toggle(object, tool = mode.is([ modes.tool ])) {
        if (object.models) {
            for (let m of object.models) {
                if (selected.contains(m)) {
                    return selection.remove(object);
                }
            }
            return selection.add(object, tool);
        }
        if (selected.contains(object)) {
            selection.remove(object);
        } else {
            selection.add(object, tool);
        }
    },

    clear() {
        for (let s of selection.list()) {
            selection.remove(s);
            tools.remove(s);
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
            group.normals(prefs.map.space.norm || false);
            group.wireframe(prefs.map.space.wire || false, {
                opacity: prefs.map.wireframe.opacity}
            );
        }
        for (let sketch of sketches) {
            sketch.select(false);
        }
        api.updateFog();
        // prevent selection of model and its group
        let mgsel = selected.filter(s => s instanceof mesh.model).map(m => m.group);
        selected = selected.filter(sel => !mgsel.contains(sel)).filter(v => v);
        // highlight selected
        for (let object of selected) {
            object.select(true, tools.contains(object));
        }
        // update saved selection id list
        prefs.save( prefs.map.space.select = selected.map(s => s.id) );
        prefs.save( prefs.map.space.tools = tools.map(s => s.id) );
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
    },

    show() {
        for (let m of selection.models()) {
            m.visible(true);
        }
    },

    hide() {
        for (let m of selection.models()) {
            m.visible(false);
        }
    }
};

const pattern = {
    /**
     * @param {int} count number of entities
     * @param {float[]} center [x,y,z]
     */
    circle(count, center) {
        async function doit(count, center = [0,0]) {
            api.modal.hide();
            let models = selection.models();
            let [ cx, cy ] = center;
            for (let model of models) {
                await api.tool.regroup([ model ]);
                let pos = model.group.position().clone();
                let stepr = (Math.PI * 2) / count;
                let modnu = [ model ];
                for (let i=1; i<count; i++) {
                    let clone = await model.duplicate();
                    let [x, y] = base.util.rotate(pos.x - cx, pos.y - cy, stepr * i);
                    clone.group.rotate(0, 0, stepr * i);
                    clone.group.position(x + cx, y + cy, pos.z);
                    modnu.push(clone);
                }
                await api.tool.regroup(modnu);
            }
        }
        if (!count) {
            api.modal.dialog({
                title: "object pattern",
                body: [ h.div({ class: "addgear" }, [
                    h.label('total count'),
                    h.input({ value: 3, size: 5, id: "_count" }),
                    h.label('center x,y'),
                    h.input({ value: "0,0", size: 5, id: "_center" }),
                    h.button({ _: "create", onclick() {
                        doit(
                            parseInt(api.modal.bound._count.value) || 3,
                            api.modal.bound._center.value.split(',').map(v => parseFloat(v))
                        );
                    } })
                ]) ]
            });
            api.modal.bound._count.focus();
        } else {
            doit(count, origin);
        }
    },

    grid(x, y, xs, ys) {
        async function doit(x = 3, y = 3, xs = 10, ys = 10) {
            api.modal.hide();
            let models = selection.models();
            for (let model of models) {
                await api.tool.regroup([ model ]);
                let pos = model.group.position().clone();
                let modnu = [ model ];
                for (let i=0; i<x; i++) {
                    for (let j=0; j<y; j++) {
                        if (i === 0 && j === 0) continue;
                        let clone = await model.duplicate();
                        clone.group.position(i * xs + pos.x, -j * ys + pos.y, pos.z);
                        modnu.push(clone);
                    }
                }
                await api.tool.regroup(modnu);
            }
        }
        if (!(x && y)) {
            api.modal.dialog({
                title: "grid pattern",
                body: [ h.div({ class: "addgear" }, [
                    h.label('x count'),
                    h.input({ value: 3, size: 5, id: "_x" }),
                    h.label('y count'),
                    h.input({ value: 3, size: 5, id: "_y" }),
                    h.label('x spacing'),
                    h.input({ value: 20, size: 5, id: "_xs" }),
                    h.label('y spacing'),
                    h.input({ value: 20, size: 5, id: "_ys" }),
                    h.button({ _: "create", onclick() {
                        doit(
                            parseInt(api.modal.bound._x.value) || 3,
                            parseInt(api.modal.bound._y.value) || 3,
                            parseFloat(api.modal.bound._xs.value) || 3,
                            parseFloat(api.modal.bound._ys.value) || 3,
                        );
                    } })
                ]) ]
            });
            api.modal.bound._x.focus();
        } else {
            doit(x, y, xs, ys);
        }
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

let sketch = {
    add(sk) {
        sketches.addOnce(sk);
        space.world.add(sk.object);
        api.selection.update();
        return sk;
    },

    remove(sk) {
        sketches.remove(sk);
        space.world.remove(sk.object);
        space.update();
    },

    list() {
        return sketches;
    }
};

let add = {
    sketch(opt) {
        sketch.add(new mesh.sketch(opt));
    },

    input() {
        api.modal.dialog({
            title: "vertices",
            body: [ h.div({ class: "addact" }, [
                h.textarea({ value: '', size: 5, id: "genvrt" }),
                h.button({ _: "create", onclick() {
                    const vert = (api.modal.bound.genvrt.value)
                        .split(',').map(v => parseFloat(v)).toFloat32();
                    const nmdl = new mesh.model({ file: "input", mesh: vert });
                    const ngrp = group.new([ nmdl ]);
                    api.modal.hide();
                } })
            ]) ]
        });
        api.modal.bound.genvrt.focus();
    },

    cube() {
        const box = new THREE.BoxGeometry(1,1,1).toNonIndexed();
        const vert = box.attributes.position.array;
        const nmdl = new mesh.model({ file: "box", mesh: vert });
        const ngrp = group.new([ nmdl ]);
        ngrp.scale(10, 10, 10).floor();
    },

    cylinder(opt = {}) {
        function gencyl(opt = {}) {
            let { diameter, height, facets, chamfer, bore } = opt;
            api.modal.hide();
            if (diameter && height) {
                const center = { x:0, y:0, z:0 };
                api.log.emit(`add cylinder faces=${facets} height=${height} diameter=${diameter}`);
                facets = Math.max(3, facets || diameter * 3)
                const cyl = newPolygon().centerCircle(center, diameter/2, facets);
                if (bore && bore < diameter) {
                    cyl.addInner(newPolygon().centerCircle(center, bore/2, facets));
                }
                const vert = cyl.extrude(height, { chamfer }).toFloat32();
                const nmdl = new mesh.model({ file: "cylinder", mesh: vert });
                const ngrp = group.new([ nmdl ]);
                ngrp.floor();
            }
        }
        if (opt.facets && opt.diameter && opt.height) {
            gencyl(opt.diameter, opt.height, opt.facets);
        } else {
            api.modal.dialog({
                title: "cylinder",
                body: [ h.div({ class: "addgear" }, [
                    h.label('diameter'),
                    h.input({ value: opt.diameter || 20, size: 5, id: "_diameter" }),
                    h.label('height'),
                    h.input({ value: opt.height || 10, size: 5, id: "_height" }),
                    h.hr(),
                    h.label('bore'),
                    h.input({ value: opt.facets || 0, size: 5, id: "_bore" }),
                    h.label('facets'),
                    h.input({ value: opt.facets || 0, size: 5, id: "_facets" }),
                    h.label('chamfer'),
                    h.input({ value: opt.chamfer || 0, size: 5, id: "_chamfer" }),
                    h.button({ _: "create", onclick() {
                        const { _diameter, _facets, _height, _chamfer, _bore } = api.modal.bound;
                        gencyl({
                            diameter: parseFloat(_diameter.value),
                            height: parseFloat(_height.value),
                            facets: parseInt(_facets.value),
                            bore: parseFloat(_bore.value),
                            chamfer: parseFloat(_chamfer.value),
                        });
                    } })
                ]) ]
            });
            api.modal.bound._diameter.focus();
        }
    },

    gear(opt = {}) {
        function gengear(bound) {
            const { _teeth, _module, _angle, _twist, _shaft, _offset, _height, _chamfer } = bound;
            api.modal.hide();
            let params;
            worker.model_gen_gear(params = {
                teeth: parseInt(_teeth.value),
                module: parseFloat(_module.value),
                angle: parseFloat(_angle.value),
                twist: parseFloat(_twist.value),
                shaft: parseFloat(_shaft.value),
                offset: parseFloat(_offset.value),
                height: parseFloat(_height.value),
                chamfer: parseFloat(_chamfer.value),
            }).then(gear => {
                const nmdl = new mesh.model({ file: "gear", mesh: gear.toFloat32() });
                const ngrp = group.new([ nmdl ]);
                ngrp.floor();
                Object.assign(last, params);
                api.prefs.save();
            });
        }
        let last = api.prefs.map.gear = (api.prefs.map.gear || {});
        api.modal.dialog({
            title: "gear generator",
            body: [ h.div({ class: "addgear" }, [
                h.label('number of teeth'),
                h.input({ value: opt.teeth || last.teeth || 20, size: 5, id: "_teeth" }),
                h.label('shaft diameter'),
                h.input({ value: opt.shaft || last.shaft || 5, size: 5, id: "_shaft" }),
                h.label('z height'),
                h.input({ value: opt.height || last.height || 15, size: 5, id: "_height" }),
                h.label({ _:'chamfer', title:"negative values apply chamfer to the bottom only" }),
                h.input({ value: opt.chamfer || last.chamfer || 0, size: 5, id: "_chamfer" }),
                h.hr(),
                h.code("all other settings must"),
                h.code("match for gears to mesh"),
                h.hr(),
                h.label('module (diam / teeth)'),
                h.input({ value: opt.module || last.module || 3, size: 5, id: "_module" }),
                h.label('pressure angle'),
                h.input({ value: opt.angle || last.angle || 20, size: 5, id: "_angle" }),
                h.label('twist angle (helix)'),
                h.input({ value: opt.twist || last.twist || 0, size: 5, id: "_twist" }),
                h.label('tooth offset (play)'),
                h.input({ value: opt.offset || last.offset || 0.1, size: 5, id: "_offset" }),
                h.button({ _: "create", onclick() { gengear(api.modal.bound) } })
            ]) ]
        });
        api.modal.bound._teeth.focus();
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
        if (models.length < 2) {
            return api.log.emit('nothing to merge');
        }
        api.log.emit(`merging ${models.length} models`).pin();
        worker.model_merge(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            api.selection.visible(false);
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
        if (models.length < 2) {
            return api.log.emit('nothing to union');
        }
        api.log.emit(`union ${models.length} models`).pin();
        worker.model_union(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            api.selection.visible(false);
            let group = api.group.new([new mesh.model({
                file: `union`,
                mesh: data
            })]).promote();
            api.selection.set([group]);
        })
        .catch(error => {
            api.log.emit(`union error: ${error}`);
        })
        .finally(() => {
            api.log.emit('union complete').unpin();
        });
    },

    difference(models) {
        models = fallback(models);
        if (models.length < 2) {
            return api.log.emit('nothing to diff');
        }
        api.log.emit(`diff ${models.length} models`).pin();
        worker.model_difference(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            api.selection.visible(false);
            let group = api.group.new([new mesh.model({
                file: `diff`,
                mesh: data
            })]).promote();
            api.selection.set([group]);
        })
        .catch(error => {
            api.log.emit(`diff error: ${error}`);
        })
        .finally(() => {
            api.log.emit('diff complete').unpin();
        });
    },

    intersect(models) {
        models = fallback(models);
        if (models.length < 2) {
            return api.log.emit('nothing to intersect');
        }
        api.log.emit(`intersect ${models.length} models`).pin();
        worker.model_intersect(models.map(m => {
            return { id: m.id, matrix: m.matrix }
        }))
        .then(data => {
            let group = api.group.new([new mesh.model({
                file: `intersect`,
                mesh: data
            })]).promote();
            api.selection.visible(false);
            api.selection.set([group]);
        })
        .catch(error => {
            api.log.emit(`intersect error: ${error}`);
        })
        .finally(() => {
            api.log.emit('intersect complete').unpin();
        });
    },

    subtract(models) {
        models = fallback(models);
        if (models.length < 2) {
            return api.log.emit('nothing to subtract');
        }
        api.log.emit(`subtract ${models.length} models`).pin();
        worker.model_subtract(models.map(m => {
            return { id: m.id, matrix: m.matrix, tool: m.tool() }
        }))
        .then(data => {
            let group = api.group.new([new mesh.model({
                file: `subtract`,
                mesh: data
            })]).promote();
            api.selection.visible(false);
            api.selection.set([group]);
        })
        .catch(error => {
            api.log.emit(`subtract error: ${error}`);
        })
        .finally(() => {
            api.log.emit('subtract complete').unpin();
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

    rename(models, type = 'model') {
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
        let { tempedit } = api.modal.show(`rename ${type}`, h.div({ class: "rename"}, [
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
        return Promise.all(models.map(m => m.ungroup())).then(() => {
            return mesh.api.group.new(models)
                .centerModels()
                .position(mid.x, mid.y, mid.z)
                .setSelected();
        });
    },

    analyze(models, opt = { compound: true }) {
        models = fallback(models);
        api.log.emit('analyzing mesh(es)').pin();
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
        return Promise.all(promises).then(() => {
            api.log.emit('analysis complete').unpin();
        });
    },

    isolate(models) {
        models = fallback(models);
        api.log.emit('isolating bodies').pin();
        let promises = [];
        let mcore = new Matrix4().makeRotationX(Math.PI / 2);
        let mark = Date.now();
        for (let m of models) {
            let p = worker.model_isolate({ id: m.id }).then(bodies => {
                bodies = bodies.map(vert => new mesh.model({
                    file: m.file,
                    mesh: vert.toFloat32()
                })).map( nm => nm.applyMatrix4(mcore.clone().multiply(m.mesh.matrixWorld)) );
                mesh.api.group.new(bodies, undefined, "isolate").setSelected();
            });
            promises.push(p);
        }
        return Promise.all(promises).then(() => {
            api.log.emit('isolation complete').unpin();
            // api.log.emit(`... isolate time = ${Date.now() - mark}`);
        });
    },

    indexFaces(models, opt = {}) {
        models = fallback(models);
        api.log.emit('mapping faces').pin();
        let promises = [];
        let mark = Date.now();
        for (let m of models) {
            let p = worker.model_indexFaces({ id: m.id, opt }).then(data => {
                // console.log({map_info: data});
            });
            promises.push(p);
        }
        Promise.all(promises).then(() => {
            api.log.emit('mapping complete').unpin();
            // api.log.emit(`... index time = ${Date.now() - mark}`);
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
        api.log.emit('repairing mesh(es)').pin();
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

const modes = {
    object: "object",   // mesh or group
    tool: "tool",       // mesh or group for subtraction
    face: "face",       // facet / triangle
    surface: "surface", // normal aligned & adjacent faces
    edge: "edge",       // edge of a face
};

// edit mode
const mode = {
    set(mode) {
        prefs.save(prefs.map.mode = mode);
        for (let key of Object.values(modes)) {
            $(`mode-${key}`).classList.remove('selected');
        }
        $(`mode-${mode}`).classList.add('selected');
        api.mode.check();
        mesh.edges?.end();
    },

    get() {
        return prefs.map.mode;
    },

    is(modelist) {
        for (let m of modelist) {
            if (prefs.map.mode === m) return true;
        }
        return false;
    },

    check() {
        if (prefs.map.mode === modes.surface) {
            tool.indexFaces();
        }
    },

    object() {
        if (!mode.is([ modes.object, modes.tool ])) {
            selection.clear();
        }
        mode.set(modes.object);
    },

    tool() {
        if (!mode.is([ modes.object, modes.tool ])) {
            selection.clear();
        }
        mode.set(modes.tool);
    },

    face() {
        if (!mode.is([ modes.face, modes.surface ])) {
            selection.clear();
        }
        mode.set(modes.face);
    },

    surface() {
        if (!mode.is([ modes.face, modes.surface ])) {
            selection.clear();
        }
        mode.set(modes.surface);
    },

    edge() {
        if (!mode.is([ modes.edge ])) {
            selection.clear();
        }
        mode.set(modes.edge);
        mesh.edges.start();
    }
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
            length: 0.25,
            color_lite: 0xffff00,
            color_dark: 0xffff00,
        },
        surface: {
            radians: 0.1,
            radius: 0.2
        },
        wireframe: {
            opacity: 0.4,
            fog: 3
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

    version() {
        window.location = "/choose?back";
    },

    donate() {
        window.open("https://www.paypal.com/paypalme/gridspace3d");
    },

    kirimoto() {
        window.location = "/kiri";
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
            left = new Vector3(x,y,z).angleTo(new Vector3(0,-1,0));
            up = new Vector3(x,y,z).angleTo(new Vector3(0,0,1));
            if (x < 0) left = -left;
        }
        // sets "home" views (front, back, home, reset)
        space.platform.setCenter(center.x, -center.y, center.z);
        // sets camera focus
        space.view.panTo(center.x, center.z, -center.y, left, up);
    },

    grid(state = { toggle:true }) {
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

    wireframe(state = { toggle:true }, opt = { opacity: prefs.map.wireframe.opacity }) {
        const mspace = prefs.map.space;
        let wire = mspace.wire;
        if (state.toggle) {
            wire = !wire;
        } else {
            wire = state;
        }
        for (let m of model.list()) {
            m.wireframe(wire, opt);
        }
        prefs.save( mspace.wire = wire );
        api.updateFog();
    },

    updateFog() {
        const mspace = prefs.map.space;
        const mwire = prefs.map.wireframe;
        if (mspace.wire) {
            space.scene.setFog(mwire.fog, mspace.dark ? 0 : 0xffffff);
        } else {
            space.scene.setFog(false);
        }
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

    pattern,

    group,

    model,

    sketch,

    add,

    file,

    tool,

    prefs,

    objects() {
        // return model objects suitable for finding ray intersections
        return group.list().map(o => o.models).flat().map(o => o.mesh);
    },

    isDebug: self.debug === true
});

const { broker } = gapp;
const call = broker.send;

// publish messages when api functions are called
broker.wrapObject(selection, 'selection');
broker.wrapObject(model, 'model');
broker.wrapObject(group, 'group');

// optimize db writes by merging updates
prefs.save = util.deferWrap(prefs.save, 100);

});
