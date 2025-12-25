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

/** Auto-save timer handle */
let autoSaveTimer = null;

/**
 * Reload the application page.
 * Emits 'reload' event and defers reload until busy count reaches zero.
 */
function reload() {
    api.event.emit('reload');
    do_reload(100);
}

/**
 * Perform page reload after ensuring async operations complete.
 * Checks busy state and defers reload until idle.
 * Retries with exponential backoff (100ms -> 250ms).
 * @param {number} [time=100] - Initial delay in milliseconds
 * @private
 */
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

/**
 * Trigger delayed auto-save if enabled.
 * Debounces saves with 1-second delay.
 * Only saves if controller.autoSave is enabled.
 */
function auto_save() {
    if (!settings.ctrl().autoSave) {
        return;
    }
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        api.space.save(true);
    }, 1000);
}

/**
 * Set camera focus on widgets or point.
 * If point provided, focuses on that point.
 * Otherwise calculates centroid of selection (or all widgets if sel undefined/empty).
 * For CAM indexed mode, uses Z=0 focus height. Otherwise uses half of top_z.
 * @param {Widget|Array<Widget>} [sel] - Widget(s) to focus on (defaults to all)
 * @param {object} [point] - Optional point {x, y, z} to focus on directly
 */
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

/**
 * Save workspace state to local storage.
 * Saves:
 * - Configuration settings
 * - Widget list and metadata
 * - Widget positions and states
 * Removes stale widget data for deleted widgets.
 * Shows alert unless quiet=true.
 * @param {boolean} [quiet] - Suppress "workspace saved" alert
 */
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

/**
 * Restore workspace from local storage.
 * Restores:
 * - Configuration settings
 * - Camera view position
 * - All saved widgets from storage
 * Clears existing platform widgets unless skip_widget_load=true.
 * Calls ondone callback when complete.
 * @param {Function} [ondone] - Callback when restore completes
 * @param {boolean} [skip_widget_load] - Skip loading widgets (config only)
 * @returns {boolean} True if widgets were queued for loading
 */
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

/**
 * Clear all widgets from workspace.
 * Clears worker cache/memory, selects all widgets, and deletes them.
 */
function clearWorkspace() {
    // free up worker cache/mem
    api.client.clear();
    platform.select_all();
    platform.delete(selection.meshes());
}

/**
 * Check if dark mode is enabled.
 * @returns {boolean} True if dark mode active
 */
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
