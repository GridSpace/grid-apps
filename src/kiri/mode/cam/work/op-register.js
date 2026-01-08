/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { Tool } from '../core/tool.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { newSlice } from '../../../core/slice.js';
import { newPoint } from '../../../../geo/point.js';
import { util } from '../../../../geo/base.js';

class OpRegister extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices, bounds, color, settings, widget } = state;
        let { updateToolDiams } = state;

        let tool = new Tool(settings, op.tool);
        let sliceOut = this.sliceOut = [];
        let axis = op.axis.toLowerCase();

        updateToolDiams(tool.fluteDiameter());

        let { stock } = settings;
        let { pos } = widget.track;
        let toolZ = pos.z,
            boundMinX = bounds.min.x,
            boundMaxX = bounds.max.x,
            boundMinY = bounds.min.y,
            boundMaxY = bounds.max.y,
            toolOffset = tool.fluteDiameter() * 2,
            centerX = (boundMinX + boundMaxX) / 2,
            centerY = (boundMinY + boundMaxY) / 2,
            cutDepth = op.thru || 0,
            pathPoints = [],
            stockToSurfaceOffset = stock.z - bounds.max.z,
            startZ = bounds.max.z + stockToSurfaceOffset + toolZ,
            endZ = toolZ - cutDepth,
            cutOffset = op.offset;

        if (!(stock.x && stock.y && stock.z)) {
            return;
        }

        switch (axis) {
            case "x":
                if (op.points == 3) {
                    pathPoints.push(newPoint(boundMinX - cutOffset, centerY, 0));
                    pathPoints.push(newPoint(boundMaxX + cutOffset, centerY - toolOffset, 0));
                    pathPoints.push(newPoint(boundMaxX + cutOffset, centerY + toolOffset, 0));
                } else {
                    pathPoints.push(newPoint(boundMinX - cutOffset, centerY, 0));
                    pathPoints.push(newPoint(boundMaxX + cutOffset, centerY, 0));
                }
                break;
            case "y":
                if (op.points == 3) {
                    pathPoints.push(newPoint(centerX, boundMinY - cutOffset, 0));
                    pathPoints.push(newPoint(centerX - toolOffset, boundMaxY + cutOffset, 0));
                    pathPoints.push(newPoint(centerX + toolOffset, boundMaxY + cutOffset, 0));
                } else {
                    pathPoints.push(newPoint(centerX, boundMinY - cutOffset, 0));
                    pathPoints.push(newPoint(centerX, boundMaxY + cutOffset, 0));
                }
                break;
            case "-":
            case "=":
                let halfOffset = toolOffset / 2,
                    loopMinX = boundMinX - cutOffset,
                    loopMaxX = boundMaxX + cutOffset,
                    loopMinY = boundMinY - cutOffset - halfOffset,
                    loopMaxY = boundMaxY + cutOffset + halfOffset,
                    deltaX = (loopMaxX - loopMinX - halfOffset) / 4,
                    deltaY = (loopMaxY - loopMinY - halfOffset * 3) / 4,
                    poly, currentPoint, currentZ;
                function start(z) {
                    currentZ = z;
                    currentPoint = { x: loopMinX + halfOffset * 0.5, y: loopMinY + halfOffset * 1.5 };
                    poly = newPolygon().add(currentPoint.x, currentPoint.y, z);
                }
                function move(dx, dy) {
                    currentPoint.x += dx;
                    currentPoint.y += dy;
                    poly.add(currentPoint.x, currentPoint.y, currentZ);
                }
                function rept(count, step, fn) {
                    while (count-- > 0) {
                        fn(step, count);
                        step = -step;
                    }
                }
                for (let z of util.lerp(startZ, endZ, op.down)) {
                    let slice = newSlice(z);
                    addSlices(slice);
                    sliceOut.push(slice);
                    start(z);
                    rept(4, halfOffset, (oy, count) => {
                        move(0, -oy);
                        if (axis === '=' && count % 2 === 1) {
                            move(deltaX/2, 0);
                            move(0, oy/2);
                            move(0, -oy/2);
                            move(deltaX/2, 0);
                        } else {
                            move(deltaX, 0);
                        }
                    });
                    rept(4, halfOffset, ox => {
                        move(ox, 0);
                        move(0, deltaY);
                    });
                    rept(4, halfOffset, oy => {
                        move(0, oy);
                        move(-deltaX, 0);
                    });
                    rept(4, halfOffset, ox => {
                        move(-ox, 0);
                        move(0, -deltaY);
                    });
                    poly.points.pop();
                    slice.camTrace = { tool: tool.getID(), rate: op.feed, plunge: op.rate };
                    slice.camLines = [ poly ];
                    slice.output()
                        .setLayer("register", { line: color }, false)
                        .addPolys(slice.camLines)
                }
                break;
        }

        if (pathPoints.length) {
            let slice = newSlice(0,null), polys = [];
            pathPoints.forEach(point => {
                polys.push(newPolygon()
                    .append(point.clone().setZ(startZ))
                    .append(point.clone().setZ(endZ)));
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
        let { op } = this;
        let { emitDrills, setDrill, setTool, setTravelBoundary } = ops;

        setTravelBoundary();
        if (op.axis === '-' || op.axis === '=') {
            setTool(op.tool, op.feed, op.rate);
            for (let slice of this.sliceOut) {
                ops.emitTrace(slice);
            }
        } else {
            setTool(op.tool, undefined, op.rate);
            setDrill(op.down, op.lift, op.dwell);
            emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
        }
    }
}

export { OpRegister };
