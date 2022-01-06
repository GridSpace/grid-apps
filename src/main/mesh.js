/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let broker = gapp.broker;
let call = broker.send;

function init() {
    let stores = data.open('mesh', { stores:[ "admin", "cache", "space" ] }).init(),
        moto = self.moto,
        api = mesh.api,
        sky = false,
        dark = false,
        ortho = false,
        zoomrev = true,
        zoomspd = 1,
        space = moto.Space,
        platform = space.platform,
        db = mesh.db = {
            admin: stores.promise('admin'),
            space: stores.promise('space'),
            cache: stores.promise('cache')
        };

    // mark init time and use count
    db.admin.put("init", Date.now());
    db.admin.get("uses").then(v => db.admin.put("uses", (v||0) + 1));

    // setup default workspace
    space.useDefaultKeys(false);
    space.sky.set({
        grid: sky,
        color: dark ? 0 : 0xffffff
    });
    space.init($('container'), delta => { }, ortho);
    platform.set({
        volume: false,
        round: false,
        zOffset: 0.1,
        opacity: 0.1,
        color: 0xdddddd,
        zoom: { reverse: true, speed: 1 },
        size: { width: 2000, depth: 2000, height: 1, maxz: 300 },
        grid: { major: 25, minor: 5,
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

    // start worker
    moto.client.start(`/code/mesh_work?${gapp.version}`);

    // trigger space event binding
    call.space_init({ space, platform });

    // trigger ui building
    call.ui_build();

    // reload stored space
    moto.client.on('ready', restore_space);
}

// restore space layout and view from previous session
function restore_space() {
    let space = moto.Space;
    mesh.db.admin.get("camera")
        .then(saved => {
            if (saved) {
                space.view.load(saved.place);
                space.view.setFocus(saved.focus);
            }
        });
    mesh.db.space.iterate({ map: true }).then(cached => {
        for (let [id, data] of Object.entries(cached)) {
            // restore group
            if (Array.isArray(data)) {
                let models = data.map(id => {
                    let md = cached[id];
                    return new mesh.model(md, id);
                });
                mesh.api.group.new(models, id)
                    .centerModels()
                    .centerXY()
                    .floor();
            }
        }
    })
    // hide loading curtain
    $d('curtain','none');
}

// create html elements
function ui_build() {
    // set app version
    $h('app-name', "Mesh:Tool");
    $h('app-vers', gapp.version);

    let bound = h.bind($('app-body'), [
        h.div({id: 'grouplist'}),
        h.div({id: 'selectlist'})
    ]);

    let { grouplist } = bound;
    let { api, util } = mesh;

    function grid(v1, v2, side = [ "pos", "rot"], top = [ "X", "Y", "Z" ]) {
        return h.div({ class: "grid"}, [
            h.div({ _: "" }),
            h.div({ _: top[0], class: "top" }),
            h.div({ _: top[1], class: "top" }),
            h.div({ _: top[2], class: "top" }),
            h.div({ _: side[0], class: "side" }),
            h.label({ _: v1[0] }),
            h.label({ _: v1[1] }),
            h.label({ _: v1[2] }),
            h.div({ _: side[1], class: "side" }),
            h.label({ _: v2[0] }),
            h.label({ _: v2[1] }),
            h.label({ _: v2[2] }),
        ]);
    }

    function update_all() {
        update_selector();
        update_selection();
    }

    function update_selector() {
        let selHas = api.selection.contains;
        // map groups to divs
        let groups = api.group.list()
            .map(g => h.div([
                h.button({ _: `group`, title: g.id,
                    class: [ "group", selHas(g) ? 'selected' : undefined ],
                    onclick() { api.selection.toggle(g); }
                }),
                h.div({ class: "vsep" }),
                h.div({ class: "models"},
                    // map models to buttons
                    g.models.map(m => h.button({ _: m.file || m.id,
                        class: selHas(m) ? [ 'selected' ] : [],
                        onclick(e) {
                            let sel = api.selection.list();
                            e.shiftKey || (sel.length === 1 && m === sel[0]) ?
                                api.selection.toggle(m) :
                                api.selection.set([m])
                        }
                    }))
                )
            ]));
        h.bind(grouplist, groups);
    }

    function update_selection() {
        let map = { fixed: 2 };
        let s_grp = api.selection.groups();
        let s_mdl = api.selection.models();
        if (s_mdl.length === 0) {
            return h.bind(selectlist, []);
        }
        // map selection to divs
        let g_pos = util.average(s_grp.map(g => g.object.position));
        let g_rot = util.average(s_grp.map(g => g.object.rotation));
        let g_id = s_grp.map(g => g.id).join(' ');
        let h_grp = [h.div([
                h.button({ _: `group`, title: g_id }),
                grid(
                    util.extract(g_pos, map),
                    util.extract(g_rot, map) )
            ])];
        let m_pos = util.average(s_mdl.map(m => m.object.position));
        let m_rot = util.average(s_mdl.map(m => m.object.rotation));
        let m_id = s_mdl.map(m => m.id).join(' ');
        let h_mdl = [h.div([
                h.button({ _: `model`, title: m_id }),
                grid(
                    util.extract(m_pos, map),
                    util.extract(m_rot, map) )
            ])];
        let bounds = util.bounds(s_mdl);
        let h_bnd = [h.div([
                h.button({ _: `box`, title: m_id }),
                grid(
                    util.extract(bounds.min, map),
                    util.extract(bounds.max, map),
                    [ "min", "max" ]
                )
            ])];
        let h_ara = [h.div([
                h.button({ _: `area`, title: m_id }),
                grid(
                    util.extract(bounds.center, map),
                    util.extract(bounds.size, map),
                    [ "center", "size" ]
                )
            ])];
        let t_vert = s_mdl.map(m => m.vertices).reduce((a,v) => a+v);
        let t_face = s_mdl.map(m => m.faces).reduce((a,v) => a+v);
        let h_msh = [h.div([
            h.button({ _: `mesh` }),
            h.div({ class: ["grid","grid2"]}, [
                h.div({ _: "" }),
                h.div({ _: "count", class: "top" }),
                h.div({ _: "vertex", class: "side" }),
                h.label({ _: t_vert }),
                h.div({ _: "face", class: "side" }),
                h.label({ _: t_face }),
            ])
        ])];
        h.bind(selectlist, [...h_grp, ...h_mdl, ...h_bnd, ...h_ara, ...h_msh]);
    }

    // listen for api calls
    // create a deferred wrapper to merge multiple rapid events
    let defer_all = mesh.util.deferWrap(update_all);
    let defer_selector = mesh.util.deferWrap(update_selector);
    let defer_selection = mesh.util.deferWrap(update_selection);
    broker.listeners({
        model_add: defer_all,
        group_add: defer_all,
        model_remove: defer_all,
        group_remove: defer_all,
        selection_update: defer_all,
        selection_move: defer_selection,
        selection_scale: defer_selection,
        selection_rotate: defer_selection,
        selection_qrotate: defer_selection,
    })
}

// add space event bindings
function space_init(data) {
    let { space, platform } = data;
    let platcolor = 0x00ff00;
    let api = mesh.api;
    let { selection } = api;

    // add file drop handler
    space.event.addHandlers(self, [
        'drop', (evt) => {
            estop(evt);
            platform.setColor(platcolor);
            load.File.load([...evt.dataTransfer.files])
                .then(data => {
                    call.space_load(data);
                })
                .catch(error => {
                    dbug.error(error);
                })
                .finally(() => {
                    // hide spinner
                });
        },
        'dragover', evt => {
            estop(evt);
            evt.dataTransfer.dropEffect = 'copy';
            let color = platform.setColor(0x00ff00);
            if (color !== 0x00ff00) platcolor = color;
        },
        'dragleave', evt => {
            platform.setColor(platcolor);
        },
        'keypress', evt => {
            let { shiftKey, metaKey, ctrlKey, code } = evt;
            switch (code) {
                case 'KeyC':
                    selection.centerXY().focus();
                    break;
                case 'KeyV':
                    selection.focus();
                    break;
                case 'KeyW':
                    api.wireframe({toggle:true}, {opacity:0.15});
                    break;
                case 'KeyB':
                    selection.boundsBox({toggle:true});
                    break;
                case 'KeyH':
                    space.view.home();
                    break;
                case 'KeyF':
                    for (let m of selection.models()) {
                        moto.client.fn.model_heal(m.id)
                            .then(data => {
                                if (data) {
                                    m.reload(
                                        data.vertices,
                                        data.indices,
                                        data.normals
                                    );
                                }
                            });
                    }
                    break;
                case 'KeyT':
                    space.view.top();
                    break;
                case 'KeyZ':
                    space.view.reset();
                    break;
            }
        },
        'keydown', evt => {
            let rv = Math.PI / 16;
            let { shiftKey, metaKey, ctrlKey, code } = evt;
            switch (code) {
                case 'KeyA':
                    if (metaKey || ctrlKey) {
                        selection.set(api.group.list());
                        estop(evt);
                    }
                    break;
                case 'KeyD':
                    if (shiftKey) {
                        for (let m of selection.models()) {
                            m.debug();
                        }
                    } else {
                        call.space_debug();
                    }
                    break;
                case 'Escape':
                    selection.clear();
                    estop(evt);
                    break;
                case 'Backspace':
                case 'Delete':
                    for (let s of selection.list(true)) {
                        selection.remove(s);
                        s.showBounds(false);
                        s.remove();
                    }
                    estop(evt);
                    break;
                case 'ArrowUp':
                    selection.rotate(-rv,0,0).floor();
                    break;
                case 'ArrowDown':
                    selection.rotate(rv,0,0).floor();
                    break;
                case 'ArrowLeft':
                    if (shiftKey) {
                        selection.rotate(0,-rv,0).floor();
                    } else {
                        selection.rotate(0,0,rv).floor();
                    }
                    break;
                case 'ArrowRight':
                    if (shiftKey) {
                        selection.rotate(0,rv,0).floor();
                    } else {
                        selection.rotate(0,0,-rv).floor();
                    }
                    break;
            }
        }
    ]);

    // mouse hover/click handlers
    space.mouse.downSelect((int, event) => {
        return event && event.shiftKey ? api.objects() : undefined;
    });

    space.mouse.upSelect((int, event) => {
        if (event && event.target.nodeName === "CANVAS") {
            let model = int && int.object.model ? int.object.model : undefined;
            if (model) {
                let group = model.group;
                let { ctrlKey, metaKey, shiftKey } = event;
                if (metaKey) {
                    // set focus on intersected face
                    let { x, y, z } = int.point;
                    api.focus({center: { x, y:-z, z:y }});
                } else if (ctrlKey) {
                    // lay flat when ctrl clicking a selected face
                    let q = new THREE.Quaternion();
                    // find intersecting point, look "up" on Z and rotate to face that
                    q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                    group.qrotation(q);
                    group.floor();
                } else {
                    selection.toggle(shiftKey ? model : model.group);
                }
            }
        } else {
            return api.objects();
        }
    });

    space.mouse.onDrag((delta, offset, up = false) => {
        if (delta && delta.event.shiftKey) {
            selection.move(delta.x, delta.y, 0);
        } else {
            return api.objects().length > 0;
        }
    });
}

// add object loader
function space_load(data) {
    mesh.api.group.new(data.flat().map(el => new mesh.model(el)))
        .centerModels()
        .centerXY()
        .floor()
        .focus();
}

// on debug key press
function space_debug() {
    for (let g of mesh.api.group.list()) {
        let { center, size } = g.bounds();
        console.group(g.id);
        console.log({
            center,
            size,
            pos: g.group.position
        });
        for (let m of g.models) {
            console.log(m.id, {
                box: m.mesh.getBoundingBox(),
                pos: m.mesh.position
            });
        }
        console.groupEnd();
    }
    moto.client.fn.debug();
}

// bind functions to topics
broker.listeners({
    ui_build,
    space_init,
    space_load,
    space_debug,
});

// remove version cache bust from url
window.history.replaceState({},'','/mesh/');

// setup init() trigger when dom + scripts complete
document.onreadystatechange = function() {
    if (document.readyState === 'complete') {
        init();
    }
}

// finalize modules
gapp.finalize("main.mesh", [
    "moto.license", // dep: moto.license
    "moto.webui",   // dep: moto.webui
    "moto.client",  // dep: moto.client
    "moto.broker",  // dep: moto.broker
    "moto.space",   // dep: moto.space
    "data.index",   // dep: data.index
    "mesh.api",     // dep: mesh.api
    "mesh.model",   // dep: mesh.model
    "load.file",    // dep: load.file
]);

})();
