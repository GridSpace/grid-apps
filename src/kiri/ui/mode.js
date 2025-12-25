/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { consts } from '../core/consts.js';
import { modal } from './modal.js';
import { platform } from './platform.js';
import { selection } from './select.js';
import { settings } from './config/manager.js';

const { MODES, VIEWS } = consts;
const clone = Object.clone;

let MODE = MODES.FDM;

function getMode() {
    return settings.mode();
}

function getModeLower() {
    return getMode().toLowerCase();
}

function switchMode(mode) {
    setMode(mode, null, platform.update_size);
}

function setMode(mode, lock, then) {
    if (!MODES[mode]) {
        console.log("invalid mode: "+mode);
        mode = 'FDM';
    }
    const current = settings.get();
    // change mode constants
    current.mode = mode;
    MODE = MODES[mode];
    // gcode edit area for any non-SLA mode
    api.uc.setVisible($('gcode-edit'), mode !== 'SLA');
    // highlight selected mode menu item
    ["FDM","CAM","SLA","LASER","DRAG","WJET","WEDM"].forEach(sm => {
        const cl = $(`mode-${sm.toLowerCase()}`).classList;
        if (sm === mode) {
            cl.add('selected');
        } else {
            cl.remove('selected');
        }
    });
    // restore cached device profile for this mode
    if (current.cdev[mode]) {
        current.device = clone(current.cdev[mode]);
        api.event.emit('device.select', api.device.get());
    }
    // hide/show
    api.uc.setVisible($('set-tools'), mode === 'CAM');
    // updates right-hand menu by enabling/disabling fields
    api.view.set(VIEWS.ARRANGE);
    api.uc.setMode(MODE);
    // sanitize and persist settings
    api.conf.load();
    api.conf.save();
    // trigger settings event
    api.event.emit('settings', settings.get());
    // other housekeeping
    platform.update_selected();
    selection.update_bounds(api.widgets.all());
    api.conf.update_fields();
    // because device dialog, if showing, needs to be updated
    if (modal.visible()) {
        api.show.devices();
    }
    api.space.restore(null, true);
    api.event.emit("mode.set", mode);
    if (then) {
        then();
    }
}

function currentProcessName() {
    return settings.get().cproc[getMode()];
}

function currentProcessCode() {
    return settings.get().sproc[getMode()][currentProcessName()];
}

export const mode = {
    get_id() { return MODE },
    get_lower: getModeLower,
    get: getMode,
    set: setMode,
    switch: switchMode,
    set_expert() {}, // noop
    is_fdm() { return MODE === MODES.FDM },
    is_cam() { return MODE === MODES.CAM },
    is_sla() { return MODE === MODES.SLA },
    is_drag() { return MODE === MODES.DRAG },
    is_wedm() { return MODE === MODES.WEDM },
    is_wjet() { return MODE === MODES.WJET },
    is_laser() { return MODE === MODES.LASER },
    is_2d() { return false ||
        mode.is_drag() ||
        mode.is_wedm() ||
        mode.is_wjet() ||
        mode.is_laser()
    }
};

export const process = {
    code: currentProcessCode,
    get: currentProcessName
};
