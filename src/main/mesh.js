/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let broker = gapp.broker;
let call = broker.send;

function init() {
    let stores = data.open('mesh', { stores:[ "admin", "cache", "space" ] }).init(),
        moto = self.moto,
        api = mesh.api,
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

    // reload preferences
    api.prefs.restore();

    // setup default workspace
    space.useDefaultKeys(false);
    space.sky.set({
        grid: false,
        color: dark ? 0 : 0xffffff
    });
    space.init($('container'), delta => { }, ortho);
    platform.set({
        volume: false,
        round: false,
        zOffset: 0.1,
        opacity: 0,
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
    let count = 0;
    let space = moto.Space;
    mesh.db.admin.get("camera")
        .then(saved => {
            if (saved) {
                space.view.load(saved.place);
                space.view.setFocus(saved.focus);
            }
        });
    mesh.db.admin.get("matrices")
        .then(data => {
            if (data) {
                matrixCache = data;
            }
        });
    mesh.db.space.iterate({ map: true }).then(cached => {
        for (let [id, data] of Object.entries(cached)) {
            if (count++ === 0) {
                mesh.api.log.emit(`restoring workspace...`);
            }
            // restore group
            if (Array.isArray(data)) {
                let models = data
                    .map(id => { return { id, md: cached[id] } })
                    .filter(r => r.md) // filter cache misses
                    .map(r => new mesh.model(r.md, r.id).applyMatrix(matrixCache[r.id]));
                mesh.api.log.emit(`restored ${models.length} model(s)`);
                let group = mesh.api.group.new(models, id);
                let matrix = matrixCache[id];
                if (matrix) {
                    group.applyMatrix(matrix);
                } else {
                    group
                        .centerModels()
                        .centerXY()
                        .floor();
                }
            }
        }
    })
    // hide loading curtain
    $d('curtain','none');
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
            call.load_files([...evt.dataTransfer.files]);
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
            if (api.modal.showing) {
                return;
            }
            let { shiftKey, metaKey, ctrlKey, code } = evt;
            switch (code) {
                case 'KeyD':
                    if (shiftKey) {
                        for (let m of selection.models()) {
                            m.debug();
                        }
                    }
                    break;
                case 'KeyC':
                    return selection.centerXY().focus();
                case 'KeyI':
                    return api.file.import();
                case 'KeyX':
                    return api.file.export();
                case 'KeyV':
                    return selection.focus();
                case 'KeyW':
                    return api.wireframe();
                case 'KeyG':
                    return api.grid();
                case 'KeyL':
                    return api.log.toggle();
                case 'KeyB':
                    return selection.boundsBox({toggle:true});
                case 'KeyH':
                    return space.view.home();
                case 'KeyR':
                    return api.tool.repair();
                case 'KeyT':
                    return space.view.top();
                case 'KeyZ':
                    return space.view.reset();
            }
        },
        'keydown', evt => {
            let rv = Math.PI / 16;
            let { shiftKey, metaKey, ctrlKey, code } = evt;
            if (api.modal.showing) {
                if (code === 'Escape') {
                    api.modal.hide();
                }
                return;
            }
            switch (code) {
                case 'KeyA':
                    if (metaKey || ctrlKey) {
                        selection.set(api.group.list());
                        estop(evt);
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

function load_files(files) {
    mesh.api.log.emit(`loading file...`);
    load.File.load([...files])
        .then(data => {
            call.space_load(data);
        })
        .catch(error => {
            dbug.error(error);
        })
        .finally(() => {
            mesh.api.log.hide();
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

let matrixCache = {};

// todo deferred with util
function store_matrices() {
    mesh.db.admin.put("matrices", matrixCache);
}

// cache model matrices for page restores
function object_matrix(data) {
    let { id, matrix } = data;
    matrixCache[id] = matrix.elements;
    store_matrices();
}

function object_destroy(id) {
    delete matrixCache[id];
    store_matrices();
}

// bind functions to topics
broker.listeners({
    load_files,
    space_init,
    space_load,
    object_matrix,
    object_destroy,
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
    "mesh.build",   // dep: mesh.build
    "load.file",    // dep: load.file
]);

})();
