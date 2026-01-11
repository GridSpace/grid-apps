/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $c } from '../../moto/webui.js';
import { api } from './api.js';
import { base } from '../../geo/base.js';
import { space } from '../../moto/space.js';

let { client, platform } = api;

// Lazy initialization to avoid circular dependencies
function getUI() {
    return api.ui;
}

function settings() {
    return api.conf.get();
}

function unitsSave() {
    api.conf.update({ controller: true });
    platform.update_size();
}

function aniMeshSave() {
    api.conf.update({ controller: true });
    api.conf.save();
}

function lineTypeSave() {
    const ui = getUI();
    const sel = ui.lineType.options[ui.lineType.selectedIndex];
    if (sel) {
        settings().controller.lineType = sel.value;
        api.conf.save();
    }
}

function detailSave() {
    const ui = getUI();
    let level = ui.detail.options[ui.detail.selectedIndex];
    if (level) {
        level = level.value;
        let rez = base.config.clipperClean;
        switch (level) {
            case '100': rez = 50; break;
            case '75': rez = base.config.clipperClean; break;
            case '50': rez = 500; break;
            case '25': rez = 1000; break;
        }
        client.config({
            base: { clipperClean: rez }
        });
        settings().controller.detail = level;
        api.conf.save();
    }
}

function speedSave() {
    const ui = getUI();
    settings().controller.showSpeeds = ui.showSpeeds.checked;
    api.view.update_speeds();
}

function setThreaded(bool) {
    if (bool) {
        client.pool.start();
    } else {
        client.pool.stop();
    }
    return bool;
}

function booleanSave() {
    const ui = getUI();
    let control = settings().controller;
    if (control.assembly != ui.assembly.checked) {
        client.wasm(ui.assembly.checked);
    }
    if (control.antiAlias != ui.antiAlias.checked) {
        api.show.alert('Page Reload Required to Change Aliasing');
    }
    control.antiAlias = ui.antiAlias.checked;
    control.assembly = ui.assembly.checked;
    control.autoLayout = ui.autoLayout.checked;
    control.autoSave = ui.autoSave.checked;
    control.dark = ui.dark.checked;
    control.devel = ui.devel.checked;
    control.drawer = ui.drawer.checked;
    control.exportOcto = ui.exportOcto.checked;
    control.exportPreview = ui.exportPreview.checked;
    control.exportThumb = ui.exportThumb.checked;
    control.freeLayout = ui.freeLayout.checked;
    control.healMesh = ui.healMesh.checked;
    control.ortho = ui.ortho.checked;
    control.manifold = ui.manifold.checked;
    control.reverseZoom = ui.reverseZoom.checked;
    control.scrolls = ui.scrolls.checked;
    control.shiny = ui.shiny.checked;
    control.showOrigin = ui.showOrigin.checked;
    control.showRulers = ui.showRulers.checked;
    control.spaceRandoX = ui.spaceRandoX.checked;
    // control.threaded = setThreaded(ui.threaded.checked);
    control.webGPU = ui.webGPU.checked;
    space.view.setZoom(control.reverseZoom, control.zoomSpeed);
    // platform.layout();
    api.conf.save();
    api.platform.update_size();
    api.visuals.update_stats();
    updateDrawer();
    api.event.emit('boolean.update');
    space.view.setProjection(control.ortho ? 'orthographic' : 'perspective');
}

function updateDrawer() {
    const { drawer, scrolls } = settings().controller;
    $c('app', drawer  ? 'slideshow' : '',   drawer  ? '' : 'slideshow');
    $c('app', scrolls ? '' : 'hide-scroll', scrolls ? 'hide-scroll' : '');
}

export const preferences = {
    unitsSave,
    aniMeshSave,
    lineTypeSave,
    detailSave,
    speedSave,
    setThreaded,
    booleanSave,
    updateDrawer
};
