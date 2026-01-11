/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { LASER, TYPE } from '../laser/init-work.js';

function init(worker) {
    // console.log({ WATERJET_INIT: worker });
}

export const WJET = Object.assign({}, LASER, {
    type: TYPE.WJET,
    name: 'WaterJet',
    init
});
