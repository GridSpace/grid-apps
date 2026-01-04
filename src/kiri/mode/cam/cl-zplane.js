/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../app/api.js';
import { clearPops, hoverStart } from './init-ui.js';
import { showZTop, showZBottom, updateStock } from './cl-stock.js';

let alert;
let plane;
let ondone;
let lastY;

export function zPlaneStart(which, onselect) {
    plane = which;
    ondone = onselect;
    hoverStart(onHover, onHoverUp);
    alert = api.show.alert("[esc] cancels z plane selection", 1000);
}

export function zPlaneDone() {
    api.hide.alert(alert);
    updateStock();
    alert = undefined;
}

export function zPlaneSelecting() {
    return alert ? true : false;
}

function onHover(data) {
    const { int, point } = data;
    if (!int) return;
    if (plane === 'top') showZTop(lastY = point.y); else
    if (plane === 'bottom') showZBottom(lastY = point.y);
}

function onHoverUp(int) {
    if (int) {
        ondone(lastY);
        clearPops();
    }
}
