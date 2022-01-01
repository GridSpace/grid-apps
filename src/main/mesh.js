/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let broker = gapp.broker;

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
    space.sky.set({
        grid: sky,
        color: dark ? 0 : 0xffffff
    });
    space.init($('container'), delta => { }, ortho);
    platform.onClick(click => {
        // api.selection.clear();
    });
    platform.onMove(delta => { });
    platform.set({
        volume: false,
        round: false,
        zOffset: 0.2,
        opacity: 0.3,
        color: 0xcccccc,
        zoom: { reverse: true, speed: 1 },
        size: { width: 300, depth: 300, height: 2.5, maxz: 2.5 },
        grid: { major: 25, minor: 5, majorColor: 0x999999, minorColor: 0xcccccc },
    });
    space.view.setZoom(zoomrev, zoomspd);
    space.useDefaultKeys(false);

    // trigger space event binding
    broker.send.space_init({ space, platform });

    // start worker
    moto.client.start(`/code/mesh_work?${gapp.version}`);

    // set app version
    $h('app-name', "Mesh:Tool");
    $h('app-vers', gapp.version);

    // hide loading curtain
    $d('curtain','none');
}

// add space event bindings
broker.subscribe('space_init', data => {
    let { space, platform } = data;
    let platcolor = 0x00ff00;
    let api = mesh.api;

    // add file drop handler
    space.event.addHandlers(self, [
        'drop', (evt) => {
            estop(evt);
            platform.setColor(platcolor);
            load.File.load([...evt.dataTransfer.files])
                .then(data => {
                    broker.send.space_load(data);
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
            switch (evt.code) {
                case 'KeyC':
                    api.selection.centerXY();
                    break;
                case 'KeyV':
                    api.selection.focus();
                    break;
                case 'KeyW':
                    api.selection.wireframe({toggle:true});
                    break;
                case 'KeyB':
                    api.selection.boundsBox({toggle:true});
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
                        api.selection.set(api.group.list());
                        estop(evt);
                    }
                    break;
                case 'KeyD':
                    broker.send.space_debug();
                    break;
                case 'Escape':
                    api.selection.clear();
                    estop(evt);
                    break;
                case 'Backspace':
                case 'Delete':
                    for (let s of api.selection.list()) {
                        s.showBounds(false);
                        s.remove();
                    }
                    estop(evt);
                    break;
                case 'ArrowUp':
                    api.selection.rotate(-rv,0,0).floor();
                    break;
                case 'ArrowDown':
                    api.selection.rotate(rv,0,0).floor();
                    break;
                case 'ArrowLeft':
                    if (shiftKey) {
                        api.selection.rotate(0,-rv,0).floor();
                    } else {
                        api.selection.rotate(0,0,rv).floor();
                    }
                    break;
                case 'ArrowRight':
                    if (shiftKey) {
                        api.selection.rotate(0,rv,0).floor();
                    } else {
                        api.selection.rotate(0,0,-rv).floor();
                    }
                    break;
            }
        }
    ]);

    // mouse hover/click handlers
    space.mouse.downSelect((int, event) => {
        return api.objects();
    });

    space.mouse.upSelect((int, event) => {
        if (event && event.target.nodeName === "CANVAS") {
            let model = int && int.object.model ? int.object.model : undefined;
            if (model) {
                let group = model.group;
                // lay flat with meta or ctrl clicking a selected face
                if ((event.ctrlKey || event.metaKey)) {
                    let q = new THREE.Quaternion();
                    // find intersecting point, look "up" on Z and rotate to face that
                    q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                    group.qrotation(q);
                    group.floor();
                } else {
                    api.selection.toggle(model.group);
                }
            }
        } else {
            return api.objects();
        }
    });

    space.mouse.onDrag((delta, offset, up = false) => {
        if (delta) {
            api.selection.move(delta.x, delta.y, 0);
        } else {
            return api.objects().length > 0;
        }
    });

});

// add object loader
broker.subscribe('space_load', data => {
    mesh.api.group.new(data.flat().map(el => new mesh.model(el)))
        .centerModels()
        .centerXY()
        .floor()
        .focus();
});

// on debug key press
broker.subscribe('space_debug', () => {
    for (let g of mesh.api.group.list()) {
        let { center, size } = g.bounds();
        console.group('group', {
            center,
            size,
            pos: g.group.position
        });
        for (let m of g.models) {
            console.log('model', {
                box: m.mesh.getBoundingBox(),
                pos: m.mesh.position
            });
        }
        console.groupEnd();
    }
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
