/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { api } from './api.js';
import { local as SDB } from '../../data/local.js';
import { openFiles } from './files.js';
import { platform } from './platform.js';
import { selection } from './selected.js';
import { settings } from './conf/manager.js';
import { space as SPACE } from '../../moto/space.js';
import { utils } from '../core/utils.js';
import { Widget } from '../core/widget.js';
import { Index } from '../../data/index.js';

const { o2js, js2o, ls2o, parseOpt } = utils;
const LOC = self.location;
const SETUP = parseOpt(LOC.search.substring(1));
const FILES = openFiles(new Index(SETUP.d ? SETUP.d[0] : 'kiri'));

let autoSaveTimer = null;

function reload() {
    api.event.emit('reload');
    do_reload(100);
}

function do_reload(time) {
    // allow time for async saves to complete and busy to to to zero
    setTimeout(() => {
        if (api.busy.val() === 0) {
            LOC.reload();
        } else {
            console.log(`reload deferred on busy=${api.busy.val()}`);
            do_reload(250);
        }
    }, time || 100);
}

function auto_save() {
    if (!settings.ctrl().autoSave) {
        return;
    }
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        api.space.save(true);
    }, 1000);
}

function setFocus(sel, point) {
    if (point) {
        SPACE.platform.setCenter(point.x, point.z, point.y);
        SPACE.view.setFocus(new THREE.Vector3(point.x, point.y, point.z));
        return;
    }
    if (sel === undefined) {
        sel = api.widgets.all();
    } else if (!Array.isArray) {
        sel = [ sel ];
    } else if (sel.length === 0) {
        sel = api.widgets.all();
    }
    let pos = { x:0, y:0, z:0 };
    for (let widget of sel) {
        pos.x += widget.track.pos.x;
        pos.y += widget.track.pos.y;
        pos.z += widget.track.pos.z;
    }
    if (sel.length) {
        pos.x /= sel.length;
        pos.y /= sel.length;
        pos.z /= sel.length;
    }
    let cam_index = api.conf.get().process.camStockIndexed || false;
    let focus_z = cam_index ? 0 : platform.top_z() / 2;
    SPACE.platform.setCenter(pos.x, -pos.y, focus_z);
    SPACE.view.setFocus(new THREE.Vector3(pos.x, focus_z, -pos.y));
}

function saveWorkspace(quiet) {
    api.conf.save();
    const newWidgets = [];
    const oldWidgets = js2o(SDB.getItem('ws-widgets'), []);
    api.widgets.each(function(widget) {
        if (widget.synth) return;
        newWidgets.push(widget.id);
        oldWidgets.remove(widget.id);
        widget.saveState();
        let ann = api.widgets.annotate(widget.id);
        ann.file = widget.meta.file;
        ann.url = widget.meta.url;
    });
    SDB.setItem('ws-widgets', o2js(newWidgets));
    oldWidgets.forEach(wid => {
        Widget.deleteFromState(wid);
    });
    // eliminate dangling saved widgets
    FILES.deleteFilter(key => newWidgets.indexOf(key.substring(8)) < 0, "ws-save-", "ws-savf");
    if (!quiet) {
        api.show.alert("workspace saved", 1);
    }
}

function restoreWorkspace(ondone, skip_widget_load) {
    let newset = api.conf.restore(false),
        camera = newset.controller.view,
        toload = ls2o('ws-widgets',[]),
        loaded = 0,
        position = true;

    api.conf.update_fields();
    platform.update_size();

    SPACE.view.reset();
    if (camera) {
        SPACE.view.load(camera);
    } else {
        SPACE.view.home();
    }

    if (skip_widget_load) {
        if (ondone) {
            ondone();
        }
        return;
    }

    // remove any widgets from platform
    api.widgets.each(function(widget) {
        platform.delete(widget);
    });

    // load any widget by name that was saved to the workspace
    toload.forEach(function(widgetid) {
        Widget.loadFromState(widgetid, function(widget) {
            if (widget) {
                platform.add(widget, 0, position, true);
                let ann = api.widgets.annotate(widgetid);
                widget.meta.file = ann.file;
                widget.meta.url = ann.url;
            }
            if (++loaded === toload.length) {
                platform.deselect();
                if (ondone) {
                    ondone();
                    setTimeout(() => {
                        platform.update_bounds();
                        SPACE.update();
                    }, 1);
                }
            }
        }, position);
    });

    return toload.length > 0;
}

function clearWorkspace() {
    // free up worker cache/mem
    api.client.clear();
    platform.select_all();
    platform.delete(selection.meshes());
}

function is_dark() {
    return settings.ctrl().dark;
}

export const workspace = {
    reload,
    auto_save,
    restore: restoreWorkspace,
    clear: clearWorkspace,
    save: saveWorkspace,
    set_focus: setFocus,
    update: SPACE.update,
    is_dark
};
