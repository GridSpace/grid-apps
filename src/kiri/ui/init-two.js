/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { beta, version } from '../../moto/license.js';
import { fileOps } from './file-ops.js';
import { local as sdb } from '../../data/local.js';
import { navigation } from './navigation.js';
import { preferences } from './preferences.js';
import { settings as set_ctrl } from './config/manager.js';
import { space } from '../../moto/space.js';
import { VIEWS } from '../core/consts.js';

const DOC = self.document;
const WIN = self.window;
const proto = location.protocol;
const { SETUP, LOCAL } = api;
const { platform, client, catalog, stats } = api;
const LANG = api.language.current;
const ui = api.ui;
const STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null;

function settings() {
    return api.conf.get();
}

// SECOND STAGE INIT AFTER UI RESTORED
export async function init_two() {
    api.event.emit('init.two');

    // load script extensions
    if (SETUP.s) SETUP.s.forEach(function(lib) {
        let scr = DOC.createElement('script');
        scr.setAttribute('async', true);
        scr.setAttribute('defer', true);
        scr.setAttribute('src',`/code/${lib}.js`);
        DOC.body.appendChild(scr);
        stats.add('load_'+lib);
        api.event.emit('load.lib', lib);
    });

    // override stored settings
    if (SETUP.v) SETUP.v.forEach(function(kv) {
        kv = kv.split('=');
        sdb.setItem(kv[0],kv[1]);
    });

    // import octoprint settings
    if (SETUP.ophost) {
        let ohost = api.const.OCTO = {
            host: SETUP.ophost[0],
            apik: SETUP.opkey ? SETUP.opkey[0] : ''
        };
        sdb['octo-host'] = ohost.host;
        sdb['octo-apik'] = ohost.apik;
        console.log({octoprint:ohost});
    }

    // load workspace from url
    if (SETUP.wrk) {
        set_ctrl.import_url(`${proto}//${SETUP.wrk[0]}`, false);
    }

    // load an object from url
    if (SETUP.load) {
        console.log({load:SETUP});
        api.platform.load_url(`${proto}//${SETUP.load[0]}`);
    }

    // bind this to UI so main can call it on settings import
    ui.sync = function() {
        const current = settings();
        const control = current.controller;

        if (!control.devel) {
            // TODO: hide thin type 3 during development
            api.const.LISTS.thin.length = 3;
        }

        platform.deselect();
        catalog.addFileListener(fileOps.updateCatalog);
        space.view.setZoom(control.reverseZoom, control.zoomSpeed);
        space.platform.setGridZOff(undefined);
        space.platform.setZOff(0.05);
        space.view.setProjection(control.ortho ? 'orthographic' : 'perspective');

        // restore UI state from settings
        ui.antiAlias.checked = control.antiAlias;
        ui.assembly.checked = control.assembly;
        ui.autoLayout.checked = control.autoLayout;
        ui.autoSave.checked = control.autoSave;
        ui.devel.checked = control.devel;
        ui.freeLayout.checked = control.freeLayout;
        ui.healMesh.checked = control.healMesh;
        ui.manifold.checked = control.manifold;
        ui.ortho.checked = control.ortho;
        ui.reverseZoom.checked = control.reverseZoom;
        ui.showOrigin.checked = control.showOrigin;
        ui.showRulers.checked = control.showRulers;
        ui.showSpeeds.checked = control.showSpeeds;
        ui.spaceRandoX.checked = control.spaceRandoX;
        // ui.threaded.checked = setThreaded(control.threaded);
        ui.webGPU.checked = control.webGPU;

        preferences.setThreaded(true);
        preferences.lineTypeSave();
        preferences.detailSave();
        preferences.updateStats();

        // optional set-and-lock mode (hides mode menu)
        let SETMODE = SETUP.mode ? SETUP.mode[0] : null;

        // optional set-and-lock device (hides device menu)
        let DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

        // setup default mode and enable mode locking, if set
        api.mode.set(SETMODE || STARTMODE || current.mode, SETMODE);

        // fill device list
        api.devices.refresh();

        // update ui fields from settings
        api.conf.update_fields();

        // default to ARRANGE view mode
        api.view.set(VIEWS.ARRANGE);

        // add ability to override (todo: restore?)
        // api.show.controls(api.feature.controls);

        // update everything dependent on the platform size
        platform.update_size();

        // load wasm if indicated
        client.wasm(control.assembly === true);
    };

    ui.sync();

    // clear alerts as they build up
    setInterval(api.event.alerts, 1000);

    // add hide-alerts-on-alert-click
    ui.alert.dialog.onclick = function() {
        api.event.alerts(true);
    };

    // enable modal hiding
    $('mod-x').onclick = api.modal.hide;

    if (!SETUP.s) console.log(`kiri | init main | ${version}`);

    // send init-done event
    api.event.emit('init-done', stats);

    // show gdpr if it's never been seen and we're not iframed
    const isLocal = LOCAL || WIN.location.host.split(':')[0] === 'localhost';
    if (!sdb.gdpr && WIN.self === WIN.top && !SETUP.debug && !isLocal) {
        $('gdpr').style.display = 'flex';
    }

    // warn of degraded functionality when SharedArrayBuffers are missing
    if (api.feature.work_alerts && !window.SharedArrayBuffer) {
        api.alerts.show("The security context of this", 10);
        api.alerts.show("Window blocks important functionality.", 10);
        api.alerts.show("Try a Chromium-base Browser instead", 10);
    }

    // add keyboard focus handler (must use for iframes)
    WIN.addEventListener('load', function () {
        WIN.focus();
        DOC.body.addEventListener('click', function() {
            WIN.focus();
        },false);
    });

    // dismiss gdpr alert
    $('gotit').onclick = () => {
        $('gdpr').style.display = 'none';
        sdb.gdpr = Date.now();
    };

    // Setup navigation button bindings
    navigation.setupNavigation(ui, WIN, LANG);

    // ui.modal.onclick = api.modal.hide;
    ui.modalBox.onclick = (ev) => { ev.stopPropagation() };

    // add app name hover info
    $('app-info').innerText = version;

    // show topline separator when iframed
    try { if (WIN.self !== WIN.top) $('top-sep').style.display = 'flex' } catch (e) { console.log(e) }

    // warn users they are running a beta release
    if (beta && beta > 0 && sdb.kiri_beta != beta) {
        api.show.alert("CAUTION");
        api.show.alert("this is a development release");
        api.show.alert("and may not function properly");
        sdb.kiri_beta = beta;
    }

    // hide url params but preserve version root (when present)
    let wlp = WIN.location.pathname;
    let kio = wlp.indexOf('/kiri/');
    if (kio >= 0) {
        history.replaceState({}, '', wlp.substring(0,kio + 6));
    }

    // lift curtain
    $('curtain').style.display = 'none';
}
