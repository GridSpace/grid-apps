/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { LASER, TYPE } from '../laser/driver.js';

const DEG2RAD = Math.PI / 180;

function init(worker) {
    // console.log({ WIREEDM_INIT: worker });
}

async function prepare(widgets, settings, update) {
    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);
    LASER.prepare(widgets, settings, update);
}

export const WEDM = Object.assign({}, LASER, {
    type: TYPE.WEDM,
    name: 'WireEDM',
    init,
    prepare
});
