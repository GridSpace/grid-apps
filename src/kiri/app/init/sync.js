/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../api.js';
import { beta, version } from '../../../moto/license.js';
import { fileOps } from '../file-ops.js';
import { local as sdb } from '../../../data/local.js';
import { preferences } from '../preferences.js';
import { settings as set_ctrl } from '../conf/manager.js';
import { settingsOps } from '../conf/settings.js';
import { space } from '../../../moto/space.js';
import { VIEWS } from '../consts.js';
import * as view_tools from '../face-tool.js';

const { SETUP, LOCAL } = api.const;
const { catalog, client, platform, selection, stats, ui } = api;

const DOC = self.document;
const WIN = self.window;
const LANG = api.language.current;
const STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null;

// SECOND STAGE INIT AFTER UI RESTORED
export async function init_sync() {
    const proto = location.protocol;

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

    // One-time migration: Initialize model.opacity from existing ghosting state
    if (api.local.getFloat('model.opacity') === null) {
        const wireframeOpacity = api.local.getFloat('model.wireframe.opacity');
        const wireframe = api.local.getBoolean('model.wireframe', false);

        // If ghosting was enabled (wireframe off, opacity < 1), preserve it
        if (!wireframe && wireframeOpacity !== null && wireframeOpacity < 1) {
            api.local.set('model.opacity', wireframeOpacity);
        } else {
            api.local.set('model.opacity', 1.0);
        }
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
    ui.sync = ui_sync;
    ui_sync();

    // clear alerts as they build up
    setInterval(api.event.alerts, 1000);

    // add hide-alerts-on-alert-click
    ui.alert.dialog.onclick = function() {
        api.event.alerts(true);
    };

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

    // Setup navigation button bindings
    setup_keybd_nav();

    // show topline separator when iframed
    try { if (WIN.self !== WIN.top) $('top-sep').style.display = 'flex' } catch (e) { console.log(e) }

    // warn users they are running a beta release
    if (beta && beta > 0 && sdb.kiri_beta != beta) {
        api.show.alert('<b style="color:red">caution:</b> beta code ahead', 10);
        sdb.kiri_beta = beta;
    }

    // warn users they are using a development server
    let devwarn = sdb.kiri_dev;
    if (location.host === 'dev.grid.space' && devwarn !== version) {
        api.alerts.show('this is a development server', 10);
        api.alerts.show('use <a href="https://grid.space/kiri">grid.space</a> for production', 10);
        sdb.kiri_dev = version;
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

function ui_sync() {
    const current = api.conf.get();
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
    api.visuals.update_stats();

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
}

function setup_keybd_nav() {
    // bind interface action elements
    ui.acct.help.onclick = (ev) => { ev.stopPropagation(); api.help.show() };
    ui.acct.don8.onclick = (ev) => { ev.stopPropagation(); api.modal.show('don8') };
    ui.acct.mesh.onclick = (ev) => { ev.stopPropagation(); WIN.location = "/mesh" };
    ui.acct.export.onclick = (ev) => { ev.stopPropagation(); settingsOps.export_profile() };
    ui.acct.export.title = LANG.acct_xpo;
    ui.func.slice.onclick = (ev) => { ev.stopPropagation(); api.function.slice() };
    ui.func.preview.onclick = (ev) => { ev.stopPropagation(); api.function.print() };
    ui.func.animate.onclick = (ev) => { ev.stopPropagation(); api.function.animate() };
    ui.func.export.onclick = (ev) => { ev.stopPropagation(); api.function.export() };
    // prevent modal input from propagating to parents
    ui.modalBox.onclick = (ev) => { ev.stopPropagation() };

    $('export-support-a').onclick = (ev) => { ev.stopPropagation(); api.modal.show('don8') };
    $('mode-device').onclick = api.show.devices;
    $('mode-profile').onclick = settingsOps.settings_load;
    $('mode-fdm').onclick = () => api.mode.set('FDM');
    $('mode-cam').onclick = () => api.mode.set('CAM');
    $('mode-sla').onclick = () => api.mode.set('SLA');
    $('mode-laser').onclick = () => api.mode.set('LASER');
    $('mode-drag').onclick = () => api.mode.set('DRAG');
    $('mode-wjet').onclick = () => api.mode.set('WJET');
    $('mode-wedm').onclick = () => api.mode.set('WEDM');
    $('set-device').onclick = (ev) => { ev.stopPropagation(); api.show.devices() };
    $('set-profs').onclick = (ev) => { ev.stopPropagation(); api.conf.show() };
    $('set-tools').onclick = (ev) => { ev.stopPropagation(); api.show.tools() };
    $('set-prefs').onclick = (ev) => { ev.stopPropagation(); api.modal.show('prefs') };
    $('file-new').onclick = (ev) => { ev.stopPropagation(); settingsOps.new_workspace() };
    $('file-recent').onclick = () => { api.modal.show('files') };
    $('file-import').onclick = (ev) => { api.event.import(ev); };
    $('view-arrange').onclick = api.platform.layout;
    $('view-top').onclick = space.view.top;
    $('view-home').onclick = space.view.home;
    $('view-front').onclick = space.view.front;
    $('view-back').onclick = space.view.back;
    $('view-left').onclick = space.view.left;
    $('view-right').onclick = space.view.right;
    $('unrotate').onclick = () => {
        api.widgets.for(w => w.unrotate());
        selection.update_info();
    };

    // attach button handlers to support targets
    for (let btn of ["don8pt","don8gh","don8pp"]) {
        $(btn).onclick = (ev) => {
            window.open(ev.target.children[0].href);
        }
    }

    // rotation buttons
    let d = (Math.PI / 180);
    $('rot_x_lt').onclick = () => { selection.rotate(-d * $('rot_x').value,0,0) };
    $('rot_x_gt').onclick = () => { selection.rotate( d * $('rot_x').value,0,0) };
    $('rot_y_lt').onclick = () => { selection.rotate(0,-d * $('rot_y').value,0) };
    $('rot_y_gt').onclick = () => { selection.rotate(0, d * $('rot_y').value,0) };
    $('rot_z_lt').onclick = () => { selection.rotate(0,0, d * $('rot_z').value) };
    $('rot_z_gt').onclick = () => { selection.rotate(0,0,-d * $('rot_z').value) };

    // rendering options
    $('render-edges').onclick = () => { api.view.set_edges({ toggle: true }); api.conf.save() };
    $('render-ghost').onclick = () => {
        const opacity = api.view.is_arrange() ? 0.4 : 0.25;
        api.view.set_wireframe(false);
        api.visuals.set_opacity(opacity);
        // Also save to old key for backwards compatibility
        api.local.set('model.wireframe.opacity', opacity);
        api.conf.save();
    };
    $('render-wire').onclick = () => {
        api.view.set_wireframe(true, 0, api.space.is_dark() ? 0.25 : 0.5);
        api.visuals.set_opacity(1.0);
        api.conf.save();
    };
    $('render-solid').onclick = () => {
        api.view.set_wireframe(false);
        api.visuals.set_opacity(1.0);
        // Also save to old key for backwards compatibility
        api.local.set('model.wireframe.opacity', 1.0);
        api.conf.save();
    };
    $('mesh-export-stl').onclick = () => { settingsOps.export_objects('stl') };
    $('mesh-export-obj').onclick = () => { settingsOps.export_objects('obj') };
    $('mesh-merge').onclick = selection.merge;
    $('mesh-split').onclick = selection.isolateBodies;
    $('context-duplicate').onclick = selection.duplicate;
    $('context-mirror').onclick = selection.mirror;
    $('context-layflat').onclick = view_tools.startLayFlat;
    $('context-lefty').onclick = view_tools.startLeftAlign;
    $('context-setfocus').onclick = () => {
        view_tools.startFocus(ev => api.space.set_focus(undefined, ev.object.point));
    };
    $('context-contents').onclick = api.const.SPACE.view.fit;
    $('view-fit').onclick = api.const.SPACE.view.fit;
    $('wassup').onmouseover = () => { $('suppopp').classList.remove('hide') };

    // enable modal hiding
    $('mod-x').onclick = api.modal.hide;

    // dismiss gdpr alert
    $('gotit').onclick = () => {
        $('gdpr').style.display = 'none';
        sdb.gdpr = Date.now();
    };

    // add app name hover info
    $('app-info').innerText = version;
}
