/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../app/api.js';
import { clearPops, hoverStart } from './init-ui.js';
import { showZTop, showZBottom, updateStock } from './cl-stock.js';

let alert;
let plane;
let ondone;
let lastY;

export function zPlaneStart(which, onselect) {
    alert = api.show.alert("[esc] cancels z plane selection");
    plane = which;
    ondone = onselect;
    hoverStart(onHover, onHoverUp);
}

export function zPlaneDone() {
    api.hide.alert(alert);
    updateStock();
}

function onHover(data) {
    const { int, type, point } = data;
    if (plane === 'top') showZTop(lastY = point.y); else
    if (plane === 'bottom') showZBottom(lastY = point.y);
}

function onHoverUp(int) {
    ondone(lastY);
    clearPops();
}
