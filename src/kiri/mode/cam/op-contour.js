/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { generate as Topo } from './topo3.js';
import { newPoint } from '../../../geo/point.js';
import { tip2tipEmit } from '../../../geo/paths.js';

function createFilter(op) {
    let filter = slices => slices;
    let filterString = op.filter?.map(l => l.trim()).join('\n');
    if (filterString) {
        try {
            const obj = eval(`( ${filterString} )`);
            let idx = 0;
            if (obj && obj.slices) {
                const nadd = [];
                filter = function (slices) {
                    for (let slice of slices) {
                        if (obj.slices(slice, idx++)) {
                            nadd.push(slice);
                        }
                    }
                    return nadd;
                };
            }
        } catch (e) {
            console.log('filter parse error', e, op.filter);
        }
    }
    return filter;
}

class OpContour extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices } = state;
        let filter = createFilter(op);
        // we need topo for safe travel moves when roughing and outlining
        // not generated when drilling-only. then all z moves use bounds max.
        // also generates x and y contouring when selected
        let topo = await Topo({
            // onupdate: (update, msg) => {
            onupdate: (index, total, msg) => {
                progress(index / total, msg);
            },
            ondone: (slices) => {
                slices = filter(slices);
                this.sliceOut = slices;
                addSlices(slices);
            },
            contour: op,
            state: state
        });
        // computed if set to 0
        this.tolerance = topo.tolerance;
    }

    prepare(ops, progress) {
        let { op, state, sliceOut } = this;
        let { settings, widget } = state;
        let { process } = settings;

        let { setTolerance, setTool, setSpindle, setPrintPoint } = ops;
        let { camOut, polyEmit, newLayer, printPoint, lastPoint } = ops;
        let { bounds, zmax } = ops;

        let toolDiam = this.toolDiam = new Tool(settings, op.tool).fluteDiameter();
        let stepover = toolDiam * op.step * 2;
        let depthFirst = process.camDepthFirst;
        let depthData = [];

        setTool(op.tool, op.rate, process.camFastFeedZ);
        setSpindle(op.spindle);
        setTolerance(this.tolerance);

        printPoint = newPoint(bounds.min.x, bounds.min.y, zmax);

        for (let slice of sliceOut) {
            // ignore debug slices
            if (!slice.camLines) {
                continue;
            }
            let polys = [], poly, emit;
            slice.camLines.forEach(function (poly) {
                if (depthFirst) poly = poly.clone(true);
                polys.push({ first: poly.first(), last: poly.last(), poly: poly });
            });
            if (depthFirst) {
                depthData.appendAll(polys);
            } else {
                printPoint = tip2tipEmit(polys, printPoint, function (el, point, count) {
                    poly = el.poly;
                    if (poly.last() === point) {
                        poly.reverse();
                    }
                    poly.forEachPoint(function (point, pidx) {
                        camOut(point.clone(), pidx > 0, stepover);
                    }, false);
                });
                newLayer();
            }
        }

        if (depthFirst) {
            printPoint = tip2tipEmit(depthData, printPoint, function (el, point, count) {
                let poly = el.poly;
                if (poly.last() === point) {
                    poly.reverse();
                }
                poly.forEachPoint(function (point, pidx) {
                    camOut(point.clone(), pidx > 0, stepover);
                }, false);
                newLayer();
                return lastPoint();
            });
        }

        setPrintPoint(printPoint);
    }
}

export { OpContour };