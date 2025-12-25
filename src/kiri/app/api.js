/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../../ext/base64.js';

import alerts from './alerts.js';
import settings from './config/manager.js';
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
import { newWidget } from '../core/widget.js';
import { noop, ajax, o2js, js2o, utils } from '../core/utils.js';
import { openFiles } from './files.js';
import { platform } from './platform.js';
import { selection } from './selected.js';
import { settingsUI } from './config/dialog.js';
import { showDevices } from './devices.js';
import { showTools } from '../mode/cam/tools.js';
import { space as SPACE } from '../../moto/space.js';
import { stats } from './stats.js';
import { types as load } from '../../load/file.js';
import { UI } from './inputs.js';
import { updateTool } from '../mode/cam/tools.js';
import { util as utilModule } from './util.js';
import { view as viewModule } from './viewmode.js';
import { visuals } from './visuals.js';
import { widgets } from '../core/widgets.js';
import { workspace } from './workspace.js';

// environment setup
let LOC = self.location,
    SETUP = utils.parseOpt(LOC.search.substring(1)),
    SECURE = utilModule.isSecure(LOC.protocol),
    LOCAL = self.debug && !SETUP.remote,
    EVENT = broker,
    FILES = openFiles(new Index(SETUP.d ? SETUP.d[0] : 'kiri'));

// todo: fix in widget.js b/c front-end and back-end do not share api
self.kiri_catalog = FILES;
FILES.show = () => modal.show('files');

// Broker compatibility patch
EVENT.on = (topic, listener) => {
    EVENT.subscribe(topic, listener);
    return EVENT;
};

let busyVal = 0,
    isHover = false,
    undef = undefined;

// the big kahuna
export const api = {
    ajax,
    beta,
    alerts,
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
    const: { LANG, LOCAL, SETUP, SECURE, SPACE, STACKS, ...consts },
    devel: {
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
        on(t,l) { return EVENT.on(t,l) },
        emit(t,m,o) { return EVENT.publish(t,m,o) },
        bind(t,m,o) { return EVENT.bind(t,m,o) },
        alerts(clr) { alerts.update(clr) },
        import: utilModule.loadFile,
        settings: settingsUI.trigger_event
    },
    electron: navigator.userAgent.includes('Electron'),
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
        // hover: false, // when true fires mouse hover events
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
        progress: utilModule.setProgress,
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
        isSecure: utilModule.isSecure,
        download: utilModule.download,
        ui2rec() { api.conf.update_from(...arguments) },
        rec2ui() { api.conf.update_fields(...arguments) },
        b64enc(obj) { return base64js.fromByteArray(new TextEncoder().encode(JSON.stringify(obj))) },
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
