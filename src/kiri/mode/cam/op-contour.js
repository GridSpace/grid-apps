/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { generate as Topo } from './topo3.js';
import { newPoint } from '../../../geo/point.js';
import { newPolygon } from '../../../geo/polygon.js';
import { tip2tipEmit } from '../../../geo/paths.js';

function createFilter(op, origin, axis) {
    // console.log({ origin, axis });
    let ok = () => true;
    let filter = slices => slices;
    let filterString = op.filter?.map(l => l.trim()).join('\n');
    if (filterString) {
        try {
            const obj = eval(`( ${filterString} )`);
            let box = obj?.box;
            let slice_fn = obj?.slices;
            let index = 0;
            const accept = [];
            filter = function (slices) {
                for (let slice of slices) {
                    if (slice_fn && slice_fn(slice, index++)) {
                        accept.push(slice);
                    } else if (box) {
                        // slice.z = x when axis = y
                        // slice.z = y when axis = x
                        let { x, y, z } = box;
                        x = x ?? [ -Infinity, Infinity ];
                        y = y ?? [ -Infinity, Infinity ];
                        z = z ?? [ -Infinity, Infinity ];
                        let ok = false;
                        if (axis === 'x') {
                            let sy = slice.z + origin.y;
                            if (sy >= y[0] && sy <= y[1]) {
                                ok = true;
                                for (let p of slice.camLines) {
                                    p.points = p.points.filter(p =>
                                        p.x - origin.x >= x[0] && p.x - origin.x <= x[1] &&
                                        p.z - origin.z >= z[0] && p.z - origin.z <= z[1]
                                    );
                                }
                            }
                        } else {
                            let sx = slice.z - origin.x;
                            if (sx >= x[0] && sx <= x[1]) {
                                ok = true;
                                for (let p of slice.camLines) {
                                    p.points = p.points.filter(p =>
                                        p.y + origin.y >= y[0] && p.y + origin.y <= y[1] &&
                                        p.z - origin.z >= z[0] && p.z - origin.z <= z[1]
                                    );
                                }
                            }
                        }
                        if (ok) {
                            slice.camLines = slice.camLines.map(p => {
                                if (p.points.length > 1) {
                                    return newPolygon(p.points).setOpen(true);
                                } else {
                                    return undefined;
                                }
                            }).filter(p => p);
                            accept.push(slice);
                        }
                    }
                }
                return accept;
            };
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
        let { color, addSlices, settings, updateToolDiams } = state;
        let filter = createFilter(op, settings.origin, op.axis.toLowerCase());
        let toolDiam = this.toolDiam = new Tool(settings, op.tool).fluteDiameter();
        updateToolDiams(toolDiam);
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
                for (let slice of slices) {
                    slice.output()
                        .setLayer(`contour ${op.axis}`, { face: color, line: color })
                        .addPolys(slice.camLines);
                }
            },
            contour: op,
            state: state
        });
        // computed if set to 0
        this.tolerance = topo.tolerance;
    }

    prepare(ops, progress) {
        let { op, state, sliceOut } = this;
        let { settings } = state;
        let { process } = settings;

        let { setTolerance, setTool, setSpindle, setPrintPoint } = ops;
        let { camOut, newLayer, printPoint, lastPoint } = ops;
        let { bounds, zmax } = ops;

        let toolDiam = this.toolDiam;
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
            let polys = [], poly;
            slice.camLines.forEach(function (poly) {
                if (depthFirst) poly = poly.clone(true).annotate({ slice: slice.index + 1 });
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
                        camOut(point.clone(), pidx > 0, { moveLen: stepover });
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
                    camOut(point.clone().annotate({ slice: poly.slice }), pidx > 0, { moveLen: stepover });
                }, false);
                newLayer();
                return lastPoint();
            });
        }

        setPrintPoint(printPoint);
    }
}

export { OpContour };