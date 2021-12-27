// required for license and other grid app dependencies
self.gapp = self.gapp || {};

function $(id) {
    return document.getElementById(id);
}

function $d(id, v) {
    $(id).style.display = v;
}

function $h(id, h) {
    $(id).innerHTML = h;
}

(function() {

let DOC = document,
    WIN = window;

function init() {
    let moto = self.moto,
        sky = false;
        dark = false,
        ortho = false,
        zoomrev = true;
        zoomspd = 1,
        space = moto.Space,
        platform = space.platform;

    // setup default workspace
    space.showSkyGrid(sky);
    space.setSkyColor(dark ? 0 : 0xffffff);
    space.init($('container'), delta => { }, ortho);
    platform.onMove(delta => { } );
    platform.setRound(false);
    platform.setZOff(0.2);
    platform.setGZOff(1.24); // half platform thickness - 0.1
    platform.setSize(300,300,2.5,300);
    platform.setGrid(25,5,0x999999,0xcccccc);
    platform.setColor(0xcccccc);
    platform.opacity(0.3);
    space.view.setZoom(zoomrev, zoomspd);
    space.useDefaultKeys(true);

    // start worker
    moto.client.start(`/code/mesh_work?${gapp.version}`);

    // set app version
    $h('app-name', "Mesh:Tool");
    $h('app-vers', gapp.version);

    // hide loading curtain
    $d('curtain','none');
}

// remove version cache bust from url
WIN.history.replaceState({},'','/mesh/');

// setup init() trigger when dom + scripts complete
DOC.onreadystatechange = function() {
    if (DOC.readyState === 'complete') {
        init();
    }
}

})();
