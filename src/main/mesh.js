/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.license
// dep: moto.webui
// dep: moto.client
// dep: moto.broker
// dep: moto.space
// dep: data.index
// dep: mesh.api
// dep: mesh.split
// dep: mesh.edges
// dep: mesh.model
// dep: mesh.build
// dep: load.file
// use: geo.polygons
gapp.main("main.mesh", [], (root) => {

const { Quaternion } = THREE;
const { mesh, moto } = root;
const { broker } = gapp;
const { space } = moto;

const version = mesh.version = '1.5.6';
const call = broker.send;
const dbindex = [ "admin", "space" ];

function log() {
    return mesh.api.log.emit(...arguments);
}

// set below. called once the DOM readyState = complete
// this is the main() entrypoint called after all dependents load
function init() {
    let stores = data.open('mesh', { stores: dbindex, version: 4 }).init(),
        dark = false,
        ortho = false,
        zoomrev = true,
        zoomspd = 1,
        platform = space.platform,
        db = mesh.db = {
            admin: stores.promise('admin'),
            space: stores.promise('space')
        };

    // mark init time and use count
    db.admin.put("init", Date.now());
    db.admin.get("uses").then(v => db.admin.put("uses", (v||0) + 1));

    // setup default workspace
    space.setAntiAlias(true);
    space.useDefaultKeys(false);
    space.init($('container'), delta => { }, ortho);
    space.sky.set({
        grid: false,
        color: dark ? 0 : 0xffffff
    });
    platform.set({
        volume: false,
        round: false,
        zOffset: 0,
        opacity: 0,
        color: 0xdddddd,
        zoom: { reverse: true, speed: 1 },
        size: { width: 2000, depth: 2000, height: 0.05, maxz: 2000 },
        grid: { major: 25, minor: 5, zOffset: 0,
            colorMajor: 0xcccccc, colorMinor: 0xeeeeee,
            colorX: 0xff7777, colorY: 0x7777ff },
    });
    platform.onMove(() => {
        // save last location and focus
        db.admin.put('camera', {
            place: space.view.save(),
            focus: space.view.getFocus()
        });
    }, 100);
    space.view.setZoom(zoomrev, zoomspd);

    // reload stored space when worker is ready
    moto.client.on('ready', restore_space);

    // start worker
    moto.client.start(`/code/mesh_work?${gapp.version}`);

    // trigger space event binding
    call.space_init({ space, platform });

    // trigger ui building
    call.ui_build();
}

// restore space layout and view from previous session
async function restore_space() {
    const { api } = mesh;
    const space = moto.space;
    const db_admin = mesh.db.admin;
    const db_space = mesh.db.space;
    // let mcache = {};
    await db_admin.get("camera")
        .then(saved => {
            if (saved) {
                space.view.load(saved.place);
                space.view.setFocus(saved.focus);
            }
        });
    const mcache = await db_admin.get("meta") || {};
    let count = 0;
    await db_space.iterate({ map: true }).then(cached => {
        const keys = [];
        const claimed = [];
        for (let [id, data] of Object.entries(cached)) {
            // console.log({ id, data });
            keys.push(id);
            if (count++ === 0) {
                log(`restoring workspace`);
            }
            // restore object based on type
            // group arrays load models they contain
            // sketches are loaded by type since they're not grouped
            if (Array.isArray(data)) {
                claimed.push(id);
                let models = data
                    .map(id => {
                        claimed.push(id);
                        return { id, md: cached[id] }
                    })
                    .filter(r => r.md) // filter cache misses
                    .map(r => new mesh.model(r.md, r.id).applyMeta(mcache[r.id]))
                if (models.length) {
                    log(`restored ${models.length} model(s)`);
                    mesh.api.group.new(models, id).applyMeta(mcache[id])
                } else {
                    log(`removed empty group ${id}`);
                    db_space.remove(id);
                }
            } else if (data.type === 'sketch') {
                claimed.push(id);
                mesh.api.add.sketch({ id, ...data });
            }
        }
        for (let id of claimed) {
            keys.remove(id);
        }
        if (keys.length) {
            log(`removing ${keys.length} unclaimed meshes`);
        }
        // clear out meshes left in the space db along with their meta-data
        for (let id of keys) {
            db_space.remove(id);
            delete mcache[id];
        }
        // restore global cache only after objects are restored
        // otherwise their setup will corrupt the cache for other restores
        metaCache = mcache;
        store_meta();
    }).then(() => {
        // restore preferences after models are restored
        return api.prefs.load().then(() => {
            let { map } = api.prefs;
            let { space, mode } = map;
            api.grid(space.grid);
            // restore selected state
            let selist = space.select || [];
            let smodel = api.model.list().filter(m => selist.contains(m.id));
            let sgroup = api.group.list().filter(m => selist.contains(m.id));
            let tolist = space.tools || [];
            let tmodel = api.model.list().filter(m => tolist.contains(m.id));
            let tgroup = api.group.list().filter(m => tolist.contains(m.id));
            let sklist = api.sketch.list().filter(s => selist.contains(s.id));
            api.selection.set([...smodel, ...sgroup, ...sklist], [...tmodel, ...tgroup]);
            // restore edit mode
            api.mode[mode]();
            // restore dark mode
            set_darkmode(map.space.dark);
        });
    }).finally(() => {
        // hide loading curtain
        $d('curtain','none');
        if (api.prefs.map.info.welcome !== false) {
            api.welcome(version);
        }
    });
}

// add space event bindings
function space_init(data) {
    let platcolor = 0x00ff00;
    let { space, platform } = data;
    let { api } = mesh;
    let { selection } = api;

    // add file drop handler
    space.event.addHandlers(self, [
        'drop', (evt) => {
            estop(evt);
            platform.set({ opacity: 0, color: platcolor });
            call.load_files([...evt.dataTransfer.files]);
        },
        'dragover', evt => {
            estop(evt);
            evt.dataTransfer.dropEffect = 'copy';
            let color = platform.setColor(0x00ff00);
            if (color !== 0x00ff00) platcolor = color;
            platform.set({ opacity: 0.1 });
        },
        'dragleave', evt => {
            platform.set({ opacity: 0, color: platcolor });
        },
        'keypress', evt => {
            if (api.modal.showing) {
                return;
            }
            if (evt.key === '?') {
                return api.welcome(version);
            }
            let { shiftKey, metaKey, ctrlKey, code } = evt;
            switch (code) {
                case 'Digit1':
                    return api.mode.sketch();
                case 'Digit2':
                    return api.mode.object();
                case 'Digit3':
                    return api.mode.tool();
                case 'Digit4':
                    return api.mode.surface();
                case 'Digit5':
                    return api.mode.face();
                case 'Digit6':
                    return api.mode.edge();
                case 'KeyQ':
                    return api.settings();
                case 'KeyI':
                    return shiftKey ? api.tool.invert() : api.file.import();
                case 'KeyX':
                    return api.file.export();
                case 'KeyD':
                    return shiftKey && api.tool.duplicate();
                case 'KeyC':
                    return selection.centerXY().focus();
                case 'KeyF':
                    return shiftKey ? selection.focus() : selection.floor().focus();
                case 'KeyM':
                    return shiftKey ? api.tool.merge() : api.tool.mirror();
                case 'KeyU':
                    return shiftKey && api.tool.union();
                case 'KeyA':
                    if (api.mode.is([ api.modes.edge ])) return mesh.edges.add();
                    return shiftKey && api.tool.analyze();
                case 'KeyE':
                    if (api.mode.is([ api.modes.sketch ])) {
                        estop(evt);
                        return api.sketch.extrude();
                    }
                    return;
                case 'KeyV':
                    return shiftKey ? selection.show() : selection.focus();
                case 'KeyN':
                    return shiftKey ? estop(evt, api.tool.rename()) : api.normals();
                case 'KeyW':
                    return api.wireframe();
                case 'KeyG':
                    return shiftKey ?
                        (api.mode.is([ api.modes.sketch ]) ? api.sketch.arrange.group() : api.tool.regroup()) :
                        api.grid();
                case 'KeyL':
                    return api.log.toggle({ spinner: false });
                case 'KeyS':
                    if (!api.mode.is([ api.modes.object ])) return;
                    return shiftKey ? selection.visible({toggle:true}) : mesh.split.start();
                case 'KeyB':
                    return selection.boundsBox({toggle:true});
                case 'KeyH':
                    return shiftKey ? selection.hide() : space.view.home();
                case 'KeyT':
                    return shiftKey ? api.tool.triangulate() : space.view.top();
                case 'KeyZ':
                    return space.view.reset();
            }
        },
        'keydown', evt => {
            let { shiftKey, metaKey, ctrlKey, code } = evt;
            let once = keyOnce[code];
            if (once) {
                delete keyOnce[code];
                return once(evt);
            }
            let rv = (Math.PI / 12);
            if (api.modal.showing) {
                if (code === 'Escape') {
                    api.modal.cancel();
                }
                return;
            }
            let rot, floor = api.prefs.map.space.floor !== false;
            switch (code) {
                case 'KeyA':
                    if (metaKey || ctrlKey) {
                        if (!selection.sketch()?.selection.all()) {
                            api.mode.object();
                            selection.set(api.group.list());
                        }
                        estop(evt);
                    }
                    break;
                case 'Escape':
                    if (selection.clear()) {
                        mesh.edges.clear();
                        mesh.split.end();
                    }
                    estop(evt);
                    break;
                case 'Backspace':
                case 'Delete':
                    let mode = api.mode.get();
                    if ([api.modes.object, api.modes.tool, api.modes.sketch].contains(mode)) {
                        selection.delete();
                    } else {
                        for (let m of api.model.list()) {
                            m.deleteSelections();
                            space.refresh()
                        }
                    }
                    estop(evt);
                    break;
                case 'ArrowUp':
                    rot = selection.rotate(-rv,0,0);
                    break;
                case 'ArrowDown':
                    rot = selection.rotate(rv,0,0);
                    break;
                case 'ArrowLeft':
                    if (shiftKey) {
                        rot = selection.rotate(0,-rv,0);
                    } else {
                        floor = false;
                        rot = selection.rotate(0,0,rv);
                    }
                    break;
                case 'ArrowRight':
                    if (shiftKey) {
                        rot = selection.rotate(0,rv,0);
                    } else {
                        floor = false;
                        rot = selection.rotate(0,0,-rv);
                    }
                    break;
            }
            if (rot && floor) {
                rot.floor();
            }
        }
    ]);

    // mouse hover/click handlers. required to enable model drag in space.js
    // called two ways:
    // without args to return a list of selectable targets
    // with args when a selection is made
    space.mouse.downSelect((int, event, ints) => {
        let obj = int?.object;
        if (obj) api.selection.drag({ start: int.object });
        if (obj) obj.sketch_item?.sketch.drag({ start: int.object });
        if (event?.shiftKey) {
            return api.objects();
        } else {
            return undefined;
        }
    });

    // called two ways:
    // without args to return a list of selectable targets
    // with args when a selection is made
    space.mouse.upSelect((int, event, ints) => {
        if (ints?.length > 1) {
            // ensure sketch items are returned before sketch plane / handles
            let els = ints.filter(i => i.object.sketch_item);
            int = els.length ? els[0] : int;
        }
        if (event?.target?.nodeName === "CANVAS") {
            // a selection was made
            const { model, sketch, sketch_item } = int?.object || {};
            const { altKey, ctrlKey, metaKey, shiftKey } = event;
            if (mesh.split.active()) {
                return mesh.split.select(model);
            }
            if (model) {
                const group = model.group;
                if (metaKey) {
                    // set focus on intersected face
                    const { x, y, z } = int.point;
                    const q = new Quaternion().setFromRotationMatrix(group.object.matrix);
                    // rotate normal using group's matrix
                    const normal = shiftKey ? int.face.normal.applyQuaternion(q) : undefined;
                    // y,z swap due to world rotation for orbit controls
                    api.focus({center: { x, y:-z, z:y }, normal});
                    let one = api.sketch.selected.one;
                    if (one && confirm('attach sketch to face?')) {
                        one.center = {
                            x, y: -z, z: y
                        };
                        one.normal = {
                            x: normal.x,
                            y: normal.y,
                            z: normal.z
                        };
                        one.render();
                    }
                } else if (ctrlKey) {
                    // rotate selected face towawrd z "floor"
                    group.rotateTowardZ(int.face.normal);
                    selection.update();
                } else {
                    const { modes } = api;
                    const { surface } = api.prefs.map;
                    const opt = { radians: 0, radius: surface.radius };
                    const mode = api.mode.get();
                    switch(mode) {
                        case modes.sketch:
                            api.mode.object();
                        case modes.object:
                        case modes.tool:
                            selection.toggle(shiftKey ? model : model.group, mode === modes.tool);
                            break;
                        case modes.surface:
                            opt.radians = surface.radians;
                        case modes.face:
                            // find faces adjacent to point/line clicked
                            model.find(int,
                                altKey ? { toggle: true } :
                                shiftKey ? { clear: true } : { select: true },
                                opt);
                            break;
                        case modes.edge:
                            mesh.edges.select();
                            break;
                    }
                }
            } else if (sketch) {
                if (metaKey) {
                    // set focus on intersected face
                    const { x, y, z } = int.point;
                    // rotate normal using group's matrix
                    const normal = shiftKey ? int.face.normal.clone(): undefined;
                    // ransform the normal to align with sketch group
                    normal?.transformDirection(int.object.sketch.group.matrix);
                    // y,z swap due to world rotation for orbit controls
                    api.focus({ center: { x, y:-z, z:y }, normal });
                } else {
                    selection.toggle(sketch);
                }
            } else if (sketch_item) {
                sketch_item.toggle();
            }
        } else {
            // return objects upSelect can choose from
            let visible = api.objects().filter(o => o.visible);
            let sketches = api.selection.sketches();
            if (sketches.length) {
                // when sketch selected, append sketch items, too
                visible.appendAll(sketches[0].object.children);
            };
            return visible;
        }
    });

    space.mouse.onDrag((delta, offset, up = false) => {
        let { mode, modes } = api;
        if (delta) {
            if (delta.event?.shiftKey && selection.count()) {
                selection.drag({ delta, offset });
            }
        } else if (up) {
            if (selection.count()) {
                selection.drag({ end: true });
            }
        } else if (mode.is([ modes.object, modes.tool, modes.sketch ])) {
            // return true if there are draggable elements
            return api.objects().length > 0 || api.selection.sketches().length;
        }
    });
}

function load_files(files) {
    log(`loading file...`);
    let api = mesh.api;
    let has_image = false;
    let has_svg = false;
    let has_gbr = false;
    let sketch = api.sketch.selected.one;
    for (let file of files) {
        has_image = has_image || file.type === 'image/png';
        has_svg = has_svg || file.name.toLowerCase().endsWith(".svg") > 0;
        has_gbr = has_gbr || file.name.toLowerCase().endsWith(".gbr") > 0;
    }
    if (sketch && has_gbr) {
        load.File.load([...files], { flat: true }).then(layers => {
            for (let layer of layers.flat()) {
                let { circs, closed, open, rects } = layer;
                open = open.map(poly => {
                    const diam = poly.tool?.shape?.diameter;
                    return diam ? poly.offset_open(diam / 2, 'round') : null;
                }).filter(p => p).flat();
                for (let set of [ closed, open, circs, rects ]) {
                    let group = mesh.util.uuid();
                    for (let poly of set) {
                        sketch.add.polygon({ poly, group });
                    }
                }
            }
        });
    } else
    if (sketch && has_svg) {
        load.File.load([...files], { flat: true })
            .then(polys => polys.forEach(set => {
                let group = mesh.util.uuid();
                set.forEach(poly => sketch.add.polygon({ poly, group }))
            }))
            .catch(error => dbug.error(error))
            .finally(() => mesh.api.log.hide());
    } else
    if (has_svg) {
        api.modal.dialog({
            title: `svg import`,
            body: [ h.div({ class: "image-import" }, [
                h.div([
                    h.label("extrude"),
                    h.input({ id: "extrude_height", value: 5, size: 4 })
                ]),
                h.div([
                    h.label("repair"),
                    h.input({ id: "svg_repair", type: "checkbox", checked: true })
                ]),
                h.div([
                    h.button({ _: "import", onclick() {
                        let { svg_repair, extrude_height } = api.modal.bound;
                        load_files_opt(files, {
                            soup: svg_repair.checked,
                            depth: extrude_height
                        });
                        api.modal.hide();
                    } }),
                ])
            ]) ]
        });
    } else
    if (has_image) {
        api.modal.dialog({
            title: `image import`,
            body: [ h.div({ class: "image-import" }, [
                h.div([
                    h.label("invert pixels"),
                    h.input({ id: "inv_image", type: "checkbox" })
                ]),
                h.div([
                    h.label("invert alpha"),
                    h.input({ id: "inv_alpha", type: "checkbox" })
                ]),
                h.div([
                    h.label("border size"),
                    h.input({ id: "img_border", value: 0, size: 4 })
                ]),
                h.div([
                    h.label("blur pixels"),
                    h.input({ id: "img_blur", value: 0, size: 4 })
                ]),
                h.div([
                    h.label("base pixels"),
                    h.input({ id: "img_base", value: 0, size: 4 })
                ]),
                h.div([
                    h.button({ _: "import", onclick() {
                        let { inv_image, inv_alpha, img_border, img_blur, img_base } = api.modal.bound;
                        load_files_opt(files, {
                            inv_image: inv_image.checked,
                            inv_alpha: inv_alpha.checked,
                            border: parseInt(img_border.value || 0),
                            blur: parseInt(img_blur.value || 0),
                            base: parseInt(img_base.value || 0),
                        });
                        api.modal.hide();
                    } }),
                ])
            ]) ]
        });
    } else {
        load_files_opt(files);
    }
}

function load_files_opt(files, opt) {
    return load.File.load([...files], opt)
        .then(data => call.space_load(data))
        .catch(error => log(error).pin({}) && dbug.error(error))
        // .finally(() => mesh.api.log.hide());
}

// add object loader
function space_load(data) {
    if (data && data.length && (data = data.flat()).length)
    mesh.api.group.new(data.map(el => new mesh.model(el)))
        .promote()
        .focus();
}

let metaCache = {};
let keyOnce = {};

function key_once(data) {
    const { code, fn } = data;
    keyOnce[code] = fn;
}

function key_once_cancel(code) {
    delete keyOnce[code];
}

function store_meta() {
    mesh.db.admin.put("meta", metaCache);
}

function update_meta(id, data) {
    let meta = metaCache[id] = metaCache[id] || {};
    Object.assign(meta, data);
    store_meta();
}

// cache model visibility for page restores
function object_visible(data) {
    let { id, visible } = data;
    update_meta(id, { visible });
}

// cache model matrices for page restores
function object_meta(data) {
    let { id, meta } = data;
    update_meta(id, meta);
}

function object_destroy(id) {
    delete metaCache[id];
    store_meta();
}

// listen for changes like dark mode toggle
function set_darkmode(dark) {
    let { prefs, model } = mesh.api;
    let { sky, platform } = moto.space;
    prefs.map.space.dark = dark;
    if (dark) {
        mesh.material.wireframe.color.set(0xaaaaaa);
        mesh.material.wireline.color.set(0xaaaaaa);
        $('app').classList.add('dark');
    } else {
        mesh.material.wireframe.color.set(0,0,0);
        mesh.material.wireline.color.set(0,0,0);
        $('app').classList.remove('dark');
    }
    sky.set({
        color: dark ? 0 : 0xffffff,
        ambient: { intensity: dark ? 0.55 : 1.1 }
    });
    platform.set({
        light: dark ? 0.08 : 0.08,
        grid: dark ? {
            colorMajor: 0x666666,
            colorMinor: 0x333333,
        } : {
            colorMajor: 0xcccccc,
            colorMinor: 0xeeeeee,
        },
    });
    mesh.api.updateFog();
    platform.setSize();
    for (let m of model.list()) {
        m.normals({ refresh: true });
    }
    prefs.save();
}

function set_normals_length(length) {
    let { prefs } = mesh.api;
    prefs.map.normals.length = length || 1;
    prefs.save();
}

function set_normals_color(color) {
    let { prefs } = mesh.api;
    let { map } = prefs;
    if (map.space.dark) {
        map.normals.color_dark = color || 0;
    } else {
        map.normals.color_lite = color || 0;
    }
    prefs.save();
}

function set_surface_radians(radians) {
    let { prefs } = mesh.api;
    prefs.map.surface.radians = parseFloat(radians || 0.1);
    prefs.save();
}

function set_surface_radius(radius) {
    let { prefs } = mesh.api;
    prefs.map.surface.radius = parseFloat(radius || 0.2);
    prefs.save();
}

function set_wireframe_opacity(opacity) {
    let { prefs } = mesh.api;
    prefs.map.wireframe.opacity = parseFloat(opacity || 0.15);
    prefs.save();
}

function set_wireframe_fog(fogx) {
    let { prefs } = mesh.api;
    prefs.map.wireframe.fog = parseFloat(fogx || 3);
    prefs.save();
}

function set_snap_value(snap) {
    let { prefs } = mesh.api;
    prefs.map.space.snap = parseFloat(snap || 1);
    prefs.save();
}

// bind functions to topics
broker.listeners({
    key_once,
    key_once_cancel,
    load_files,
    object_meta,
    object_destroy,
    object_visible,
    space_init,
    space_load,
    set_darkmode,
    set_normals_color,
    set_normals_length,
    set_surface_radians,
    set_surface_radius,
    set_wireframe_opacity,
    set_wireframe_fog,
    set_snap_value
});

// remove version cache bust from url
window.history.replaceState({},'','/mesh/');

// setup init() trigger when dom + scripts complete
document.onreadystatechange = function() {
    if (document.readyState === 'complete') {
        init();
    }
}

});
