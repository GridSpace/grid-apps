/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';
import { env, opAdd, opRender } from './client.js';
import { CAM } from './driver-fe.js';
import { clearTabs, restoreTabs } from './cl-tab.js';
import { updateStock } from './cl-stock.js';

export function opFlip() {
    api.view.set_arrange();
    let widgets = api.widgets.all();
    let { process } = env.current;
    let { ops, op2 } = process;
    // add flip singleton to b-side
    let add2 = op2.length === 0;
    let axis = env.poppedRec.axis;
    env.flipping = true;
    process.camZAnchor = {
        top: "bottom",
        bottom: "top",
        middle: "middle"
    }[process.camZAnchor];
    // flip tabs
    for (let widget of widgets) {
        let anno = api.widgets.annotate(widget.id).tab || [];
        let wbm = widget.bounds.max.z;
        for (let tab of anno) {
            let box = widget.tabs[tab.id].box;
            let bpo = box.position;
            let xr = 0, yr = 0;
            let flz = wbm - bpo.z;
            if (axis === 'X') {
                tab.pos.y = -tab.pos.y;
                bpo.y = -bpo.y;
                xr = Math.PI / 2;
            }
            if (axis === 'Y') {
                tab.pos.x = -tab.pos.x;
                bpo.x = -bpo.x;
                yr = Math.PI / 2;
            }
            tab.pos.z = bpo.z = flz;
            let [rx, ry, rz, rw] = tab.rot;
            let qat = new THREE.Quaternion(rx, ry, rz, rw);
            let eul = new THREE.Euler().setFromQuaternion(qat);
            eul._z = -eul._z;
            tab.rot = new THREE.Quaternion().setFromEuler(eul);
        }
        clearTabs(widget, true);
        restoreTabs([widget]);
    }
    // flip widget
    if (axis === 'X') {
        api.selection.rotate(Math.PI, 0, 0);
    }
    if (axis === 'Y') {
        api.selection.rotate(0, Math.PI, 0);
    }
    // clear traces cache
    CAM.traces_clear();
    api.client.clear();
    env.flipping = false;
    process.ops = op2;
    process.op2 = ops;
    // flip camZBottom
    if (env.poppedRec.invert && process.camZBottom && env.camZBottom) {
        const maxZ = env.camZBottom._max.z
        process.camZBottom = maxZ - process.camZBottom;
        api.util.rec2ui(process);
        updateStock();
    }
    // keep flip operations in sync
    for (let op of op2) {
        if (op.type === 'flip') {
            op.axis = env.poppedRec.axis;
            op.invert = env.poppedRec.invert;
        }
    }
    if (add2) {
        opAdd(env.poppedRec);
    } else {
        opRender();
    }
}
