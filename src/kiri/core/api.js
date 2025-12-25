/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import alerts from '../ui/alerts.js';
import settings from './settings.js'
import STACKS from '../ui/stacks.js';

import { broker } from '../../moto/broker.js';
import { client as work } from './client.js';
import { consts, COLOR as color, LISTS as lists } from './consts.js';
import { device, devices } from '../ui/devices.js';
import { catalog, dialog, event, group, help, hide, image } from './main.js';
import { modal, mode, process, show, space, util, view } from './main.js';
import { local as dataLocal } from '../../data/local.js';
import { noop, ajax, o2js, js2o } from './utils.js';
import { functions } from './function.js';
import { platform } from './platform.js';
import { selection } from './selection.js';
import { stats } from '../ui/stats.js';
import { newWidget } from './widget.js';
import { widgets } from './widgets.js';
import { updateTool } from '../mode/cam/tools.js';
import { beta, version } from '../../moto/license.js';
import { space as SPACE } from '../../moto/space.js';
import { types as load } from '../../load/file.js';

import { LANG } from '../ui/lang.js';
import { LOCAL, SETUP, SECURE } from './main.js';
import { UI } from '../ui/component.js';

import web from '../../moto/webui.js';

let UC = UI.prefix('kiri').inputAction(settings.conf.update),
    und = undefined,
    clone = Object.clone,
    isHover = false,
    feature = {
        seed: true, // seed profiles on first use
        meta: true, // show selected widget metadata
        frame: true, // receive frame events
        alert_event: false, // emit alerts as events instead of display
        controls: true, // show or not side menus
        device_filter: und, // function to limit devices shown
        drop_group: und, // optional array to group multi drop
        drop_layout: true, // layout on new drop
        hoverAdds: false, // when true only searches widget additions
        on_key: und, // function override default key handlers
        on_key2: [], // allows for multiple key handlers
        on_load: und, // function override file drop loads
        on_add_stl: und, // legacy override stl drop loads
        on_mouse_up: und, // function intercepts mouse up select
        on_mouse_down: und, // function intercepts mouse down
        work_alerts: true, // allow disabling work progress alerts
        pmode: consts.PMODES.SPEED, // preview modes
        // hover: false, // when true fires mouse hover events
        get hover() {
            return isHover;
        },
        set hover(b) {
            isHover = b;
            broker.publish("feature.hover", b);
        }
    },
    busyVal = 0,
    busy = {
        val() { return busyVal },
        inc() { api.event.emit("busy", ++busyVal) },
        dec() { api.event.emit("busy", --busyVal) }
    },
    onkey = (fn) => {
        api.feature.on_key2.push(fn);
    },
    doit = {
        undo: noop, // do.js
        redo: noop  // do.js
    },
    devel = {
        get enabled() {
            return settings.ctrl().devel;
        },
        xray(layers, raw) {
            let proc = api.conf.get().process,
                size = proc.sliceHeight || proc.slaSlice || 1,
                base = (proc.firstSliceHeight || size);
            layers = Array.isArray(layers) ? layers : [layers];
            proc.xray = layers.map(l => raw ? l : base + l * size - size / 2);
            proc.xrayi = layers.slice();
            api.function.slice();
        }
    },
    local = {
        get: (key) => localGet(key),
        getItem: (key) => localGet(key),
        getInt: (key) => parseInt(localGet(key)),
        getFloat: (key) => parseFloat(localGet(key)),
        getBoolean: (key, def = true) => {
            let val = localGet(key);
            return val === true || val === 'true' || val === def;
        },
        toggle: (key, val, def) => localSet(key, val ?? !api.local.getBoolean(key, def)),
        put: (key, val) => localSet(key, val),
        set: (key, val) => localSet(key, val),
        setItem: (key, val) => localSet(key, val),
        removeItem: (key) => localRemove(key)
    },
    tweak = {
        line_precision(v) { api.work.config({ base: { clipperClean: v } }) },
        gcode_decimals(v) { api.work.config({ base: { gcode_decimals: v } }) }
    };

function clip(text) {
    navigator.clipboard
        .writeText(text)
        .catch(err => console.error('Clipboard Error:', err));
}

function localGet(key) {
    let sloc = api.conf.get().local;
    return sloc[key] || api.sdb[key];
}

function localSet(key, val) {
    let sloc = api.conf.get().local;
    sloc[key] = api.sdb[key] = val;
    return val;
}

function localRemove(key) {
    let sloc = api.conf.get().local;
    return delete sloc[key];
}

export const api = {
    ajax,
    beta,
    alerts,
    busy,
    catalog,
    client: work,
    clip,
    clone,
    color,
    conf: settings.conf,
    const: { LANG, LOCAL, SETUP, SECURE, STACKS, ...consts },
    devel,
    device,
    devices,
    dialog,
    doit,
    event,
    electron: navigator.userAgent.includes('Electron'),
    feature,
    function: functions,
    group,
    help,
    hide,
    image,
    js2o,
    language: LANG,
    lists,
    load,
    local,
    modal,
    mode,
    new: {
        widget: newWidget
    },
    noop,
    o2js,
    onkey,
    platform,
    process,
    sdb: dataLocal,
    selection,
    settings,
    show,
    space,
    SPACE,
    stacks: STACKS,
    stats,
    tool: {
        update: updateTool
    },
    tweak,
    uc: UC,
    ui: {},
    util,
    var: {
        layer_lo: 0,
        layer_hi: 0,
        layer_max: 0
    },
    version,
    view,
    web,
    widgets,
    work,
};

// allow widget to straddle client / worker FOR NOW
self.kiri_api = api;
