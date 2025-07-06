/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../kiri/api.js';
import { env } from './client.js';
import { CAM } from './driver-fe.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export let surfaceOn = false;

let alert, lastWidget;

export function surfaceAdd(ev) {
    if (surfaceOn) {
        return surfaceDone();
    }
    env.clearPops();
    alert = api.show.alert("analyzing surfaces...", 1000);
    let surfaces = env.poppedRec.surfaces;
    let radians = env.poppedRec.follow * DEG2RAD;
    CAM.surface_prep(env.currentIndex * RAD2DEG, () => {
        api.hide.alert(alert);
        alert = api.show.alert("[esc] cancels surface selection");
        for (let [wid, arr] of Object.entries(surfaces)) {
            let widget = api.widgets.forid(wid);
            if (widget && arr.length)
                for (let faceid of arr) {
                    CAM.surface_toggle(widget, faceid, radians, faceids => {
                        // surfaces[widget.id] = faceids;
                    });
                }
        }
    });
    surfaceOn = env.hoveredOp;
    surfaceOn.classList.add("editing");
    api.feature.on_mouse_up = (obj, ev) => {
        let { face } = obj;
        let min = Math.min(face.a, face.b, face.c);
        let faceid = min / 3;
        let widget = lastWidget = obj.object.widget;
        CAM.surface_toggle(widget, faceid, radians, faceids => {
            surfaces[widget.id] = faceids;
        });
    };
}

export function surfaceDone() {
    if (!(surfaceOn && env.poppedRec && env.poppedRec.surfaces)) {
        return;
    }
    let surfaces = env.poppedRec.surfaces;
    for (let wid of Object.keys(surfaces)) {
        let widget = api.widgets.forid(wid);
        if (widget) {
            CAM.surface_clear(widget);
        } else {
            delete surfaces[wid];
        }
    }
    api.hide.alert(alert);
    api.feature.on_mouse_up = undefined;
    surfaceOn.classList.remove("editing");
    surfaceOn = false;
}
