/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let broker = gapp.broker;
let call = broker.send;

function init() {
    let moto = self.moto,
        api = mesh.api,
        sky = false,
        dark = false,
        ortho = false,
        zoomrev = true,
        zoomspd = 1,
        space = moto.Space,
        platform = space.platform;

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
        grid: { major: 25, minor: 5, colorMajor: 0xcccccc, colorMinor: 0xeeeeee, colorX: 0xffaaaa, colorY: 0xaaaaff },
    });
    space.view.setZoom(zoomrev, zoomspd);

    // start worker
    moto.client.start(`/code/mesh_work?${gapp.version}`);

    // trigger space event binding
    call.space_init({ space, platform });

    // trigger ui building
    call.ui_build();

    // hide loading curtain
    $d('curtain','none');
}

function ui_build() {
    // set app version
    $h('app-name', "Mesh:Tool");
    $h('app-vers', gapp.version);

    let bound = h.bind($('app-body'), [
        h.div({id: 'grouplist'})
    ]);

    let { grouplist } = bound;
    let api = mesh.api;

    let maker = {
        update() {
            clearTimeout(maker.timer);
            maker.timer = setTimeout(maker.do, 10);
        },
        do() {
            let groups = api.group.list()
                // map groups to divs
                .map(g => h.div([
                    h.button({
                        _: `group`,
                        title: g.id,
                        class: [
                            "group",
                            api.selection.contains(g) ? 'selected' : undefined
                        ],
                        onclick() { api.selection.toggle(g); }
                    }),
                    h.div({ class: "vsep" }),
                    h.div({ class: "models"},
                        // map models to buttons
                        g.models.map(m => h.button({
                            _: m.file || m.id,
                            class: api.selection.contains(m) ? [ 'selected' ] : [],
                            onclick() { api.selection.toggle(m); }
                        }))
                    )
                ]));
            h.bind(grouplist, groups);
        }
    };

    function update(object, topic) {
        console.log({update: object, topic});
    }

    // listen for api calls
    // todo: switch to util.defer(fn)
    broker.listeners({
        model_add: maker.update,
        group_add: maker.update,
        model_remove: maker.update,
        group_remove: maker.update,
        selection_update: maker.update,
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
                    selection.wireframe({toggle:true}, {opacity:0.15});
                    break;
                case 'KeyB':
                    selection.boundsBox({toggle:true});
                    break;
                case 'KeyH':
                    space.view.home();
                    break;
                case 'KeyF':
                    space.view.front();
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
                    for (let s of selection.list()) {
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
    "mesh.api",     // dep: mesh.api
    "mesh.model",   // dep: mesh.model
    "load.file",    // dep: load.file
]);

})();
