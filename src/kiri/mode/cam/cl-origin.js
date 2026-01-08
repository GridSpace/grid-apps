/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../app/api.js';
import { env, clearPops } from './init-ui.js';
import { CAM } from './driver-fe.js';
import { addbox, clearboxes } from '../../app/boxes.js';

export let originSelectOn = false;

let { world } = api.const.SPACE;
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

    // less precise point key for hi-res meshes that leads to dups
    function updateKey(pt) {
        pt._key = [
            ((pt.x * 1000) | 0),
            ((pt.y * 1000) | 0),
            ((pt.z * 1000) | 0)
        ].join(' ');
        return pt;
    }

    CAM.traces((ids) => {
        api.hide.alert(alert);
        alert = api.show.alert("select origin<br>[esc] to cancel", 1000);
        let ends = {};
        let points = {};
        let color = new THREE.Color( 0xff0000 );
        function incpoint(widget, point) {
            let rec = ends[point.key];
            if (rec && rec.count++ === 2) {
                addpoint(widget, point);
            } else if (!rec) {
                rec = ends[point.key] = { count: 1 };
            }
        }
        function addpoint(widget, center) {
            let box = addbox(center, color, undefined, undefined, { opacity: 1 });
            widget.adds.push(box);
            world.add(box);
            box._origin = center;
            points[center.key] = { box, center };
        }
        api.widgets.for(widget => {
            let { pos, tzoff } = widget.track;
            let polys = widget.traces.map(trace => {
                return trace.fixClosed().clone().move(pos).move({ x:0, y:0, z: -tzoff });
            });
            for (let poly of polys) {
                if (poly.circularity() >= 0.99) {
                    let center = updateKey(poly.calcCircleCenter());
                    if (points[center.key]) {
                        continue;
                    }
                    addpoint(widget, center);
                } else if (poly.isOpen()) {
                    incpoint(widget, updateKey(poly.first()));
                    incpoint(widget, updateKey(poly.last()));
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
    process.camOriginOffX = x - stock.center.x;
    process.camOriginOffY = y - stock.center.y;
    process.camOriginOffZ = z;
    api.settings.update_fields(process);
    api.platform.update_origin();
    api.conf.save();
    originSelectDone();
}
