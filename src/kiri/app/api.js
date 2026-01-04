/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../../ext/base64.js';

import alerts from './alerts.js';
import settings from './conf/manager.js';
import STACKS from './stacks.js';
import web from '../../moto/webui.js';

import { beta, version } from '../../moto/license.js';
import { broker } from '../../moto/broker.js';
import { client as workers } from './workers.js';
import { consts, COLOR as color, LISTS as lists } from '../core/consts.js';
import { device, devices } from './devices.js';
import { functions } from './function.js';
import { group as groupModule } from './groups.js';
import { help as helpModule } from './help.js';
import { image as imageModule } from './image.js';
import { Index } from '../../data/index.js';
import { LANG } from './language.js';
import { local } from './local.js';
import { local as dataLocal } from '../../data/local.js';
import { modal } from './modal.js';
import { mode as modeModule, process as processModule } from './mode.js';
import { newWidget } from './widget.js';
import { noop, ajax, o2js, js2o, utils } from '../core/utils.js';
import { openFiles } from './files.js';
import { platform } from './platform.js';
import { selection } from './selected.js';
import { settingsUI } from './conf/dialog.js';
import { showDevices } from './devices.js';
import { showTools } from '../mode/cam/tools.js';
import { space as SPACE } from '../../moto/space.js';
import { stats } from './stats.js';
import { types as load } from '../../load/file.js';
import { UI } from './inputs.js';
import { updateTool } from '../mode/cam/tools.js';
import { view as viewModule } from './view-mode.js';
import { visuals } from './visuals.js';
import { widgets } from '../core/widgets.js';
import { workspace } from './workspace.js';

// environment setup
let LOC = self.location,
    EVENT = broker,
    SETUP = utils.parseOpt(LOC.search.substring(1)),
    FILES = openFiles(new Index(SETUP.d ? SETUP.d[0] : 'kiri')),
    LOCAL = self.debug && !SETUP.remote,
    SECURE = isSecure(LOC.protocol);

// todo: fix in widget.js b/c front-end and back-end do not share api
self.kiri_catalog = FILES;
FILES.show = () => modal.show('files');

/**
 * Broker compatibility patch - adds 'on' method as alias for subscribe
 */
EVENT.on = (topic, listener) => {
    EVENT.subscribe(topic, listener);
    return EVENT;
};

/**
 * Check if protocol is secure (HTTPS).
 * @param {string} proto - Protocol string (e.g., "https:", "http:")
 * @returns {boolean} True if protocol starts with "https"
 */
function isSecure(proto) {
    return proto.toLowerCase().indexOf("https") === 0;
}

/**
 * Download data as a file using browser download mechanism.
 * Creates temporary object URL and triggers download via hidden link click.
 * @param {Blob|ArrayBuffer|string} data - Data to download
 * @param {string} filename - Filename for download
 */
function download(data, filename) {
    let url = window.URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
    $('mod-any').innerHTML = `<a id="_dexport_" href="${url}" download="${filename}">x</a>`;
    $('_dexport_').click();
}

/** Busy state counter for tracking active operations */
let busyVal = 0,
    /** Hover feature flag */
    isHover = false,
    /** Explicit undefined for object defaults */
    undef = undefined;

/**
 * organize modules for easy use in other modules
 * without having to know the paths to all of them
 */
export const api = {
    ajax,
    beta,
    alerts,
    /**
     * Busy state management for tracking active operations.
     * Emits 'busy' events when state changes.
     */
    busy: {
        val() { return busyVal },
        inc() { api.event.emit("busy", ++busyVal) },
        dec() { api.event.emit("busy", --busyVal) }
    },
    catalog: FILES,
    client: workers,
    clip(text) {
        navigator.clipboard
            .writeText(text)
            .catch(err => console.error('Clipboard Error:', err));
    },
    clone: Object.clone,
    color,
    conf: settings.conf,
    const: {
        LANG, LOCAL, SETUP, SECURE, SPACE, STACKS,
        ...consts,
        URL: {
            path: LOC.pathname,
            hash: LOC.hash.substring(1),
            query: LOC.search.substring(1)
        }
    },
    /**
     * Development/debug utilities
     */
    devel: {
        get enabled() {
            return settings.ctrl().devel;
        },
        /**
         * Enable X-ray view of specific layers for debugging slicing.
         * Converts layer indices to Z-heights and triggers re-slice.
         * @param {number|number[]} layers - Layer index or array of indices to view
         * @param {boolean} [raw] - If true, use raw values without height calculation
         */
        xray(layers, raw) {
            let proc = api.conf.get().process,
                size = proc.sliceHeight || proc.slaSlice || 1,
                base = (proc.firstSliceHeight || size);
            layers = Array.isArray(layers) ? layers : [layers];
            proc.xray = layers.map(l => raw ? l : base + l * size - size / 2);
            proc.xrayi = layers.slice();
            api.function.slice(
                // () => SPACE.platform.showGrid(false)
            );
        }
    },
    device,
    devices,
    dialog: {
        show: (which) => modal.show(which),
        hide: () => modal.hide(),
        update_process_list: settingsUI.update_list
    },
    doit: {
        undo: noop, // do.js
        redo: noop  // do.js
    },
    event: {
        alerts(clr) { alerts.update(clr) },
        bind(t,m,o) { return EVENT.bind(t,m,o) },
        emit(t,m,o) { return EVENT.publish(t,m,o) },
        import() { api.ui.load.click() },
        listeners(topic) { return EVENT.targets(topic) },
        on(t,l) { EVENT.on(t,l); return api.event },
        settings: settingsUI.trigger_event,
        topics() { return EVENT.topics() }
    },
    electron: navigator.userAgent.includes('Electron'),
    /**
     * Feature flags and hook functions for customizing application behavior.
     * Many of these are hook points for external integrations or plugins.
     */
    feature: {
        seed: true, // seed profiles on first use
        meta: true, // show selected widget metadata
        frame: true, // receive frame events
        alert_event: false, // emit alerts as events instead of display
        controls: true, // show or not side menus
        device_filter: undef, // function to limit devices shown
        drop_group: undef, // optional array to group multi drop
        drop_layout: true, // layout on new drop
        hoverAdds: false, // when true only searches widget additions
        on_key: undef, // function override default key handlers
        on_key2: [], // allows for multiple key handlers
        on_load: undef, // function override file drop loads
        on_add_stl: undef, // legacy override stl drop loads
        on_mouse_up: undef, // function intercepts mouse up select
        on_mouse_down: undef, // function intercepts mouse down
        work_alerts: true, // allow disabling work progress alerts
        pmode: consts.PMODES.SPEED, // preview modes
        /**
         * Hover feature flag. Setting this publishes a "feature.hover" event.
         */
        get hover() {
            return isHover;
        },
        set hover(b) {
            isHover = b;
            broker.publish("feature.hover", b);
        }
    },
    function: functions,
    group: groupModule,
    help: helpModule,
    hide: {
        alert(rec, recs) { alerts.hide(...arguments) },
        import: noop,
        slider: visuals.hide_slider
    },
    image: imageModule,
    js2o,
    language: LANG,
    lists,
    load,
    local,
    modal,
    mode: modeModule,
    new: {
        widget: newWidget
    },
    noop,
    o2js,
    onkey(fn) {
        api.feature.on_key2.push(fn);
    },
    platform,
    process: processModule,
    sdb: dataLocal,
    selection,
    settings,
    show: {
        alert() { return alerts.show(...arguments) },
        controls() { console.trace('deprecated') },
        devices: showDevices,
        import() { api.ui.import.style.display = '' },
        layer: visuals.set_visible_layer,
        local() { console.trace('deprecated') },
        progress: visuals.set_progress,
        slices: visuals.show_slices,
        tools: showTools
    },
    space: workspace,
    stacks: STACKS,
    stats,
    tool: {
        update: updateTool
    },
    tweak: {
        line_precision(v) { api.work.config({ base: { clipperClean: v } }) },
        gcode_decimals(v) { api.work.config({ base: { gcode_decimals: v } }) }
    },
    uc: UI.prefix('kiri').inputAction(settings.conf.update),
    ui: {},
    util: {
        isSecure,
        download,
        ui2rec() { api.conf.update_from(...arguments) },
        rec2ui() { api.conf.update_fields(...arguments) },
        /**
         * Encode object to base64 string via JSON serialization
         * @param {*} obj - Object to encode
         * @returns {string} Base64 encoded string
         */
        b64enc(obj) { return base64js.fromByteArray(new TextEncoder().encode(JSON.stringify(obj))) },
        /**
         * Decode base64 string to object via JSON parsing
         * @param {string} obj - Base64 encoded string
         * @returns {*} Decoded object
         */
        b64dec(obj) { return JSON.parse(new TextDecoder().decode(base64js.toByteArray(obj))) }
    },
    // var: {
    //     layer_lo: 0,
    //     layer_hi: 0,
    //     layer_max: 0
    // },
    version,
    view: {
        ...viewModule,
        ...visuals,
        snapshot: null
    },
    visuals,
    web,
    widgets,
    work: workers,
};

// allow widget to straddle client / worker FOR NOW
self.kiri_api = api;
