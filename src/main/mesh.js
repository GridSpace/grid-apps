/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let broker = gapp.broker;

function init() {
    let moto = self.moto,
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
    platform.onMove(delta => { });
    platform.set({
        volume: false,
        round: false,
        zOffset: 0.2,
        opacity: 0.3,
        color: 0xcccccc,
        zoom: { reverse: true, speed: 1 },
        size: { width: 300, depth: 300, height: 2.5, maxz: 2.5 },
        grid: { major: 25, minor: 5, majorColor: 0x999999, minorColor: 0xcccccc }
    });
    space.view.setZoom(zoomrev, zoomspd);
    space.useDefaultKeys(true);

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
    // add file drop handler
    space.event.addHandlers(self, [
        'drop', (evt) => {
            estop(evt);
            platform.setColor(platcolor);
            load.File.load(evt.dataTransfer.files[0])
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
        }
    ]);
});

// add object loader
broker.subscribe('space_load', data => {
    for (let od of data) {
        mesh.api.models.add(new mesh.model(od));
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
