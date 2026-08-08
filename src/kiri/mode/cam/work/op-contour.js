/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { Tool } from '../core/tool.js';
import { generate as Topo } from './topo3.js';
import { newPoint } from '../../../../geo/point.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { newSlice } from '../../../core/slice.js';
import { tip2tipEmit } from '../../../../geo/paths.js';

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
                for (let slice of slices.filter(s => s.camLines)) {
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
                        } else if (axis === 'y') {
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
                        } else if (axis === 'radial') {
                            ok = true;
                            for (let p of slice.camLines) {
                                p.points = p.points.filter(p =>
                                    p.x - origin.x >= x[0] && p.x - origin.x <= x[1] &&
                                    p.y - origin.y >= y[0] && p.y - origin.y <= y[1] &&
                                    p.z - origin.z >= z[0] && p.z - origin.z <= z[1]
                                );
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

        let conTool = new Tool(settings, op.tool);
        let filter = createFilter(op, settings.origin, op.axis.toLowerCase());
        let toolDiam = this.toolDiam = conTool.fluteDiameter();
        this.toolStep = conTool.getStepSize(op.step);

        updateToolDiams(toolDiam);

        // we need topo for safe travel moves when roughing and outlining
        // not generated when drilling-only. then all z moves use bounds max.
        // also generates x and y contouring when selected
        let topo = this.topo = await Topo({
            // onupdate: (update, msg) => {
            onupdate: (index, total, msg) => {
                progress(index / total, msg);
            },
            ondone: (slices, topo) => {
                // If 'Omit Through' is enabled, post-process the generated toolpath slices
                // to cleanly snap coordinates crossing any through-hole onto the hole perimeter.
                if (op.omitthru && state.shadow && state.shadow.holes && state.shadow.holes.length) {
                    slices = cleanupContourSlices(slices, state.shadow.holes, topo, op, toolDiam);
                }
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
            state
        });

        if (this.debug && topo.coastline) {
            console.log('coastline', topo.coastline);
            const dbs = newSlice(-1);
            const dbo = dbs.output();
            dbo.setLayer("coastline", { line: 0x0000dd }).addPolys(topo.coastline);
            addSlices([ dbs ])
        }

        // computed if set to 0
        this.tolerance = topo.tolerance;
    }

    prepare(ops, progress) {
        let { op, sliceOut, state, toolStep, topo } = this;
        let { settings } = state;
        let { process } = settings;

        let { polyEmit, setContouring, setTolerance, setTool, setTravelBoundary } = ops;
        let { widget, newLayer, zmax } = ops;

        let bounds = widget.getBoundingBox();
        let depthData = [];

        setTool(op.tool, op.rate, process.camFastFeedZ);
        setContouring(true, toolStep * 1.5, topo.coastline);
        if (state.shadow && state.shadow.base) {
            setTravelBoundary(state.shadow.base);
        }
        setTolerance(this.tolerance);

        let printPoint = newPoint(bounds.min.x, bounds.min.y, zmax);

        // Helper to convert slice camLines to formatted polygons array for tip2tipEmit
        const sliceToPolys = (slice) => {
            let polys = [];
            slice.camLines.forEach((poly) => {
                poly = poly.clone(true).annotate({ slice: slice.index + 1 });
                polys.push({ first: poly.first(), last: poly.last(), poly: poly });
            });
            return polys;
        };

        // Shared callback function to emit toolpaths
        const emitSegment = (el, point) => {
            let poly = el.poly;
            if (poly.isClosed()) {
                // Closed concentric loops are set to CounterClockwise for standard milling direction
                poly.setCounterClockwise();
                polyEmit(poly, -999);
            } else {
                // Open concentric arcs: reverse traversal direction if the end point is closer
                if (poly.last() === point) {
                    poly.reverse();
                }
                polyEmit(poly);
            }
            newLayer();
        };

        const isRadial = op.axis.toLowerCase() === 'radial';
        const lshape = (op.shape || '').toLowerCase();
        const isSpiral = lshape === 'spiral' || lshape === 'concentric spiral' || lshape === 'contour spiral';

        if (isRadial) {
            // RADIAL FINISHING TOOLPATH EMISSION:
            // Radial axis mode finishes the surface concentric-loop by concentric-loop or turns of a spiral.
            // Unlike linear X/Y parallel finishing passes where all segments are accumulated together
            // and ordered globally, in Radial Concentric mode we emit loops slice-by-slice (from innermost
            // out) and run tip-to-tip path ordering per loop to minimize travel and prevent collisions.
            if (isSpiral) {
                // Group all chunk polygons by their spiralId (or group index)
                let groups = new Map();
                for (let slice of sliceOut) {
                    if (!slice.camLines) continue;
                    for (let poly of slice.camLines) {
                        let id = poly.spiralId || 0;
                        if (!groups.has(id)) {
                            groups.set(id, []);
                        }
                        groups.get(id).push(poly);
                    }
                }

                // For each group, merge them into a single continuous polygon
                let mergedPolys = [];
                for (let [id, polys] of groups.entries()) {
                    if (polys.length === 0) continue;
                    let mergedPoints = [];
                    for (let poly of polys) {
                        for (let pt of poly.points) {
                            if (mergedPoints.length > 0) {
                                let lastPt = mergedPoints[mergedPoints.length - 1];
                                if (lastPt.distTo2D(pt) < 0.0001) {
                                    // Skip duplicate overlap point
                                    continue;
                                }
                            }
                            mergedPoints.push(pt);
                        }
                    }
                    if (mergedPoints.length > 1) {
                        let mergedPoly = newPolygon(mergedPoints);
                        mergedPoly.setOpen();
                        mergedPoly.spiralId = id;
                        mergedPolys.push(mergedPoly);
                    }
                }

                // Now emit these merged polygons as a single tip2tipEmit call to preserve continuous milling
                let depthData = mergedPolys.map(poly => {
                    return { first: poly.first(), last: poly.last(), poly: poly };
                });
                printPoint = tip2tipEmit(depthData, printPoint, emitSegment);
            } else {
                for (let slice of sliceOut) {
                    if (!slice.camLines) {
                        continue;
                    }
                    let polys = sliceToPolys(slice);
                    // Find optimized path routing (tip2tip) on the loops within this slice
                    printPoint = tip2tipEmit(polys, printPoint, emitSegment);
                }
            }
        } else {
            // STANDARD LINEAR X/Y FINISHING EMISSION:
            // Accumulate all segments across all slices first, then run a single global tip-to-tip path optimizer.
            for (let slice of sliceOut) {
                if (!slice.camLines) {
                    continue;
                }
                depthData.appendAll(sliceToPolys(slice));
            }

            tip2tipEmit(depthData, printPoint, emitSegment);
        }
    }
}

// SLICE POST-PROCESSING HOLE PRUNING & RETRACT OPTIMIZATION (OMIT THROUGH option):
// Post-processes contour slice lines when 'Omit Through' is active so that toolpaths do not run inside the holes.
// For segments crossing through a hole, we check if the straight line shortcut crosses solid material (outside the hole
// or within the tool radius of the hole boundaries). If it does, we retract/split the toolpath. Otherwise, we keep the
// toolpath continuous so the tool feeds directly across the empty hole space, minimizing retracts.
function cleanupContourSlices(slices, holes, topo, op, toolDiam) {
    let holeBoxes = [];
    // Compute bounding boxes for each through-hole to accelerate polygon containment tests
    for (let hole of holes) {
        let bounds = hole.bounds;
        holeBoxes.push({
            min_x: bounds.minx,
            max_x: bounds.maxx,
            min_y: bounds.miny,
            max_y: bounds.maxy,
            hole
        });
    }

    const toolRadius = (toolDiam || 0) / 2;

    for (let slice of slices) {
        if (!slice.camLines) continue;
        let newPolys = [];
        for (let poly of slice.camLines) {
            let points = poly.points;
            let len = points.length;
            if (len < 2) {
                if (len > 0) newPolys.push(poly);
                continue;
            }

            let splitPolysPoints = [];
            let currentPoints = [];
            let lastSolidPt = null;
            let hasSkipped = false;

            for (let i = 0; i < len; i++) {
                let pt = points[i];
                let ptInHole = false;
                for (let hb of holeBoxes) {
                    if (pt.x >= hb.min_x && pt.x <= hb.max_x && pt.y >= hb.min_y && pt.y <= hb.max_y) {
                        if (pt.isInPolygon(hb.hole)) {
                            ptInHole = true;
                            break;
                        }
                    }
                }

                if (!ptInHole) {
                    if (hasSkipped && lastSolidPt) {
                        let crosses = segmentCrossesSolid(lastSolidPt, pt, holeBoxes, toolRadius);
                        if (crosses) {
                            if (currentPoints.length > 1) {
                                splitPolysPoints.push(currentPoints);
                            }
                            currentPoints = [];
                        }
                    }
                    currentPoints.push(pt);
                    lastSolidPt = pt;
                    hasSkipped = false;
                } else {
                    hasSkipped = true;
                }
            }

            if (currentPoints.length > 1) {
                splitPolysPoints.push(currentPoints);
            }

            for (let pts of splitPolysPoints) {
                let newPoly = newPolygon(pts).setOpen();
                if (poly.spiralId !== undefined) newPoly.spiralId = poly.spiralId;
                newPolys.push(newPoly);
            }
        }
        slice.camLines = newPolys;
    }
    return slices;
}

function segmentCrossesSolid(p1, p2, holeBoxes, toolRadius) {
    if (!p1 || !p2) return false;
    // Sample 25%, 50%, and 75% along the shortcut segment
    for (let pct of [0.25, 0.50, 0.75]) {
        let testPt = newPoint(
            p1.x + (p2.x - p1.x) * pct,
            p1.y + (p2.y - p1.y) * pct,
            p1.z + (p2.z - p1.z) * pct
        );
        let inAnyHole = false;
        for (let hb of holeBoxes) {
            if (testPt.x >= hb.min_x && testPt.x <= hb.max_x && testPt.y >= hb.min_y && testPt.y <= hb.max_y) {
                if (testPt.isInPolygon(hb.hole)) {
                    // Check if the tool center is at least one tool radius away from the hole perimeter
                    // to prevent the side of the tool from clipping/gouging the hole walls.
                    let edgePt = hb.hole.findClosestPointOnPerimeter(testPt);
                    if (edgePt) {
                        let dist = testPt.distTo2D(edgePt);
                        if (dist >= toolRadius) {
                            inAnyHole = true;
                            break;
                        }
                    }
                }
            }
        }
        // If the sample point is not inside any hole, or is too close to a hole wall,
        // we treat it as crossing/gouging solid material.
        if (!inAnyHole) {
            return true;
        }
    }
    return false;
}

export { OpContour };