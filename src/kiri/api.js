/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: main.kiri
// dep: data.local
// dep: kiri.utils
// use: kiri.client
// use: kiri.settings
gapp.register("kiri.api", [], (root, exports) => {

const { data, kiri, noop } = self;
const { consts, utils } = kiri;
const { areEqual, parseOpt, encodeOpt, ajax, o2js, js2o } = utils;
const { LISTS } = consts;

const feature = {
    seed: true, // seed profiles on first use
    meta: true, // show selected widget metadata
    frame: true, // receive frame events
    alert_event: false, // emit alerts as events instead of display
    controls: true, // show or not side menus
    device_filter: undefined, // function to limit devices shown
    drop_group: undefined, // optional array to group multi drop
    drop_layout: true, // layout on new drop
    hover: false, // when true fires mouse hover events
    hoverAdds: false, // when true only searches widget additions
    on_key: undefined, // function override default key handlers
    on_load: undefined, // function override file drop loads
    on_add_stl: undefined, // legacy override stl drop loads
    work_alerts: true, // allow disabling work progress alerts
    modes: [ "fdm", "sla", "cam", "laser" ], // enable device modes
    pmode: consts.PMODES.SPEED // preview modes
};

const devel = {
    xray: (layers, raw) => {
        let proc = api.conf.get().process;
        let size = proc.sliceHeight || proc.slaSlice || 1;
        layers = Array.isArray(layers) ? layers : [ layers ];
        proc.xray = layers.map(l => raw ? l : l * size + size / 2);
        api.function.slice();
    }
};

const tweak = {
    line_precision(v) { api.work.config({base:{clipperClean: v}}) },
    gcode_decimals(v) { api.work.config({base:{gcode_decimals: v}}) }
};

const api = exports({
    clone: Object.clone,
    sdb: data.local,
    ajax: ajax,
    js2o: js2o,
    o2js: o2js,
    lists: LISTS,
    doit: {
        undo: noop, // set in do.js
        redo: noop  // set in do.js
    },
    var: {
        layer_lo: 0,
        layer_hi: 0,
        layer_max: 0
    },
    feature,
    devel,
    tweak,
});

});
