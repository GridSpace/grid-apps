// required for license and other grid app dependencies
self.gapp = {};

function $(id) {
    return document.getElementById(id);
}

function init() {
    let container = $('container'),
        moto = self.moto,
        sky = false;
        dark = false,
        ortho = false,
        zoomrev = true;
        zoomspd = 1,
        Space = moto.Space;

    // setup default workspace
    Space.showSkyGrid(sky);
    Space.setSkyColor(dark ? 0 : 0xffffff);
    Space.init(container, delta => { }, ortho);
    Space.platform.onMove(delta => { } );
    Space.platform.setRound(false);
    Space.platform.setZOff(0.2);
    Space.platform.setSize(500,500,2.5);
    Space.platform.setGrid(25,5);
    Space.view.setZoom(zoomrev, zoomspd);
    Space.useDefaultKeys(true);

    // hide loading curtain
    $('curtain').style.display = 'none';

    // remove version cache bust from url
    window.history.replaceState({},'','/mesh/');
}

document.onreadystatechange = function() {
    if (document.readyState === 'complete') {
        init();
    }
}
