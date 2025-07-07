/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { LASER, TYPE } from '../laser/driver.js';

function init(worker) {
    // console.log({ DRAGKNIFE_INIT: worker });
}

export const DRAG = Object.assign({}, LASER, {
    type: TYPE.DRAG,
    name: 'DragKnife',
    init
});
