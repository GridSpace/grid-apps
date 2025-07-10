/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';
import { env, clearPops } from './client.js';
import { CAM } from './driver-fe.js';
import { config } from '../../../geo/base.js';
import { addbox, clearboxes } from '../../core/boxes.js';

export let originSelectOn = false;

let { world } = api.SPACE;
let alert, lastHover, lastPoints;

export function originSelect() {
    if (originSelectOn) {
        return originSelectDone();
    }

    clearPops();

    alert = api.show.alert("analyzing parts...", 1000);
    originSelectOn = true;

    api.feature.hover = true;
    api.feature.hoverAdds = true;
    env.hover = pointHover;
    env.hoverUp = pointHoverUp;

    CAM.traces((ids) => {
        api.hide.alert(alert);
        alert = api.show.alert("select origin<br>[esc] to cancel", 1000);
        let points = {};
        let color = new THREE.Color( 0xff0000 );
        api.widgets.for(widget => {
            let { pos, tzoff } = widget.track;
            let { adds, traces } = widget;
            let polys = traces.map(trace => {
                return trace.fixClosed().clone().move(pos).move({ x:0, y:0, z: -tzoff });
            });
            for (let poly of polys) {
                if (poly.circularity() >= config.hint_min_circ) {
                    let center = poly.calcCircleCenter();
                    if (points[center.key]) {
                        continue;
                    }
                    let box = addbox(center, color, undefined, undefined, { opacity: 1 });
                    adds.push(box);
                    world.add(box);
                    box._origin = center;
                    points[center.key] = { box, center };
                }
            }
        });
        lastPoints = Object.values(points);
    });
}

export function originReset() {
    let { process} = api.conf.get();
    process.camOriginOffX = 0;
    process.camOriginOffY = 0;
    process.camOriginOffZ = 0;
    api.settings.update_fields(process);
    api.platform.update_origin();
    api.conf.save();
    originSelectDone();
}

export function originSelectDone() {
    if (!originSelectOn) {
        return;
    }
    api.hide.alert(alert);
    api.feature.hover = false;
    api.feature.hoverAdds = false;
    api.widgets.for(widget => {
        for (let box of widget.adds) {
            world.remove(box);
        }
        widget.adds.length = 0;
    });
    clearboxes();
    originSelectOn = false;
}

function pointHover(data) {
    if (lastHover) {
        let { color, colorSave } = lastHover.material[0] || lastHover.material;
        color.r = colorSave.r;
        color.g = colorSave.g;
        color.b = colorSave.b;
    }
    lastHover = null;
    if (data.type === 'platform') {
        return;
    }
    if (!data.int.object._origin) {
        return;
    }
    lastHover = data.int.object;
    let material = lastHover.material[0] || lastHover.material;
    let color = material.color;
    material.colorSave = color.clone();
    color.setHex(0x00ff00);
}

function pointHoverUp(int, ev) {
    if (!int?.object?._origin) return;
    let { _origin } = int.object;
    let { process, stock } = api.conf.get();
    let { x, y, z } = _origin;
    let { camOriginTop, camOriginCenter } = process;
    if (camOriginTop) {
        z = z - stock.z;
    }
    if (!camOriginCenter) {
        x += stock.x / 2;
        y += stock.y / 2;
    }
    process.camOriginOffX = x;
    process.camOriginOffY = y;
    process.camOriginOffZ = z;
    api.settings.update_fields(process);
    api.platform.update_origin();
    api.conf.save();
    originSelectDone();
}
