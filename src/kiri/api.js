/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function () {

const { kiri } = self;
const { consts } = kiri;

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

const api = kiri.api = {
    feature
};

})();
