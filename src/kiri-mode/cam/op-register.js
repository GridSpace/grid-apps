/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../geo/polygon.js';
import { newSlice } from '../../kiri/slice.js';
import { newPoint } from '../../geo/point.js';
import { util as base_util } from '../../geo/base.js';

class OpRegister extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, widget, bounds, addSlices, zMax, zThru, color } = state;
        let { updateToolDiams } = state;

        let tool = new Tool(settings, op.tool);
        let sliceOut = this.sliceOut = [];

        updateToolDiams(tool.fluteDiameter());

        let { stock } = settings,
            tz = widget.track.pos.z,
            lx = bounds.min.x,
            hx = bounds.max.x,
            ly = bounds.min.y,
            hy = bounds.max.y,
            o3 = tool.fluteDiameter() * 2,
            mx = (lx + hx) / 2,
            my = (ly + hy) / 2,
            mz = op.thru || zThru || 0,
            dx = (stock.x - (hx - lx)) / 4,
            dy = (stock.y - (hy - ly)) / 4,
            dz = stock.z,
            points = [],
            wo = stock.z - bounds.max.z,
            z1 = bounds.max.z + wo + tz,
            z2 = tz - mz;

        if (!(stock.x && stock.y && stock.z)) {
            return;
        }

        switch (op.axis) {
            case "X":
            case "x":
                if (op.points == 3) {
                    points.push(newPoint(lx - dx, my, 0));
                    points.push(newPoint(hx + dx, my - o3, 0));
                    points.push(newPoint(hx + dx, my + o3, 0));
                } else {
                    points.push(newPoint(lx - dx, my, 0));
                    points.push(newPoint(hx + dx, my, 0));
                }
                break;
            case "Y":
            case "y":
                if (op.points == 3) {
                    points.push(newPoint(mx, ly - dy, 0));
                    points.push(newPoint(mx - o3, hy + dy, 0));
                    points.push(newPoint(mx + o3, hy + dy, 0));
                } else {
                    points.push(newPoint(mx, ly - dy, 0));
                    points.push(newPoint(mx, hy + dy, 0));
                }
                break;
            case "-":
                let o2 = o3 / 2,
                    x0 = lx - dx,
                    x1 = hx + dx,
                    y0 = ly - dy - o2,
                    y1 = hy + dy + o2,
                    x4 = (x1 - x0 - o2) / 4,
                    y4 = (y1 - y0 - o2 * 3) / 4,
                    poly, cp, cz;
                function start(z) {
                    cz = z;
                    cp = {x:x0 + o2 * 0.5, y:y0 + o2 * 1.5};
                    poly = newPolygon().add(cp.x, cp.y, z);
                }
                function move(dx, dy) {
                    cp.x += dx;
                    cp.y += dy;
                    poly.add(cp.x, cp.y, cz);
                }
                function rept(count, tv, fn) {
                    while (count-- > 0) {
                        fn(tv, count === 0);
                        tv = -tv;
                    }
                }
                for (let z of base_util.lerp(z1, z2, op.down)) {
                    let slice = newSlice(z);
                    addSlices(slice);
                    sliceOut.push(slice);
                    start(z);
                    rept(4, o2, oy => {
                        move(0, -oy);
                        move(x4, 0);
                    });
                    rept(4, o2, ox => {
                        move(ox, 0);
                        move(0, y4);
                    });
                    rept(4, o2, oy => {
                        move(0, oy);
                        move(-x4, 0);
                    });
                    rept(4, o2, ox => {
                        move(-ox, 0);
                        move(0, -y4);
                    });
                    poly.points.pop();
                    slice.camTrace = { tool: tool.getID(), rate: op.feed, plunge: op.rate };
                    slice.camLines = [ poly ];
                    slice.output()
                        .setLayer("register", {line: color}, false)
                        .addPolys(slice.camLines)
                }
                break;
        }

        if (points.length) {
            let slice = newSlice(0,null), polys = [];
            points.forEach(point => {
                polys.push(newPolygon()
                    .append(point.clone().setZ(z1))
                    .append(point.clone().setZ(z2)));
            });
            slice.camLines = polys;
            slice.output()
                .setLayer("register", {face: color, line: color})
                .addPolys(polys);
            addSlices(slice);
            sliceOut.push(slice);
        }
    }

    prepare(ops, progress) {
        let { op, state } = this;
        let { settings, widget, addSlices, updateToolDiams } = state;
        let { setTool, setSpindle, setDrill, emitDrills } = ops;

        if (op.axis === '-') {
            setTool(op.tool, op.feed, op.rate);
            setSpindle(op.spindle);
            for (let slice of this.sliceOut) {
                ops.emitTrace(slice);
            }
        } else {
            setTool(op.tool, undefined, op.rate);
            setDrill(op.down, op.lift, op.dwell);
            setSpindle(op.spindle);
            emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
        }
    }
}

export { OpRegister };
