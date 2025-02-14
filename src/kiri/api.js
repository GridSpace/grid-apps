/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.broker
// dep: data.local
// dep: kiri.utils
// dep: kiri.consts
gapp.register("kiri.api", (root, exports) => {

let { data, kiri, moto, noop } = root,
    { consts, utils } = kiri,
    { ajax, o2js, js2o } = utils,
    lists = consts.LISTS,
    clone = Object.clone,
    isHover = false,
    feature = {
        seed: true, // seed profiles on first use
        meta: true, // show selected widget metadata
        frame: true, // receive frame events
        alert_event: false, // emit alerts as events instead of display
        controls: true, // show or not side menus
        device_filter: undefined, // function to limit devices shown
        drop_group: undefined, // optional array to group multi drop
        drop_layout: true, // layout on new drop
        hoverAdds: false, // when true only searches widget additions
        on_key: undefined, // function override default key handlers
        on_key2: [], // allows for multiple key handlers
        on_load: undefined, // function override file drop loads
        on_add_stl: undefined, // legacy override stl drop loads
        on_mouse_up: undefined, // function intercepts mouse up select
        on_mouse_down: undefined, // function intercepts mouse down
        work_alerts: true, // allow disabling work progress alerts
            pmode: consts.PMODES.SPEED, // preview modes
        // hover: false, // when true fires mouse hover events
        get hover() {
            return isHover;
        },
        set hover(b) {
            isHover = b;
            moto.broker.publish("feature.hover", b);
        }
    },
    onkey = (fn) => {
        api.feature.on_key2.push(fn);
    },
    doit = {
        undo: noop, // do.js
        redo: noop  // do.js
    },
    devel = {
        xray(layers, raw) {
            let proc = api.conf.get().process,
                size = proc.sliceHeight || proc.slaSlice || 1,
                base = (proc.firstSliceHeight || size);
            layers = Array.isArray(layers) ? layers : [ layers ];
            proc.xray = layers.map(l => raw ? l : base + l * size - size / 2);
            proc.xrayi = layers.slice();
            api.function.slice();
        }
    },
    local = {
        get: (key) => localGet(key),
        getInt: (key) => parseInt(localGet(key)),
        getFloat: (key) => parseFloat(localGet(key)),
        getBoolean: (key, def = true) => {
            let val = localGet(key);
            return val === true || val === 'true' || val === def;
        },
        toggle: (key, val, def) => localSet(key, val ?? !api.local.getBoolean(key, def)),
        put: (key, val) => localSet(key, val),
        set: (key, val) => localSet(key, val),
    },
    tweak = {
        line_precision(v) { api.work.config({base:{clipperClean: v}}) },
        gcode_decimals(v) { api.work.config({base:{gcode_decimals: v}}) }
    },
    und = undefined,
    api = exports({
        ajax,           // via utils
        alerts: {},     // alerts.js
        busy: {},       // main.js
        catalog: und,   // main.js
        clip,           // <--
        clone,          // <--
        color: und,     // main.js
        conf: {},       // settings.js
        const: {},      // main.js
        devel,          // <--
        device: {},     // devices.js
        devices: {},    // devices.js
        dialog: {},     // main.js
        doit,           // <--
        event: {},      // main.js
        feature,        // <--
        function: {},   // function.js
        group: {},      // main.js
        help: {},       // main.js
        hide: {},       // main.js
        image: {},      // main.js
        js2o,           // via utils
        language: und,  // main.js
        lists,          // <--
        local,          // <--
        modal: {},      // main.js
        mode: {},       // main.js
        o2js,           // via utils
        onkey,          // <--
        platform: {},   // platform.js
        probe: {},      // main.js
        process: {},    // main.js
        sdb: data.local,
        selection: {},  // selection.js
        settings: {},   // settings.js
        show: {},       // main.js
        space: {},      // main.js
        tool: {},       // kiri-mode/cam/tools.js
        tweak,          // <--
        uc: {},         // main.js
        ui: {},         // main.js
        util: {},       // main.js
        var: {
            layer_lo: 0,
            layer_hi: 0,
            layer_max: 0
        },
        view: {},       // main.js
        widgets: {},    // widgets.js
        work: und,      // main.js
    });

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

});
