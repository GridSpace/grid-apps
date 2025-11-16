/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { base, util } from '../../../geo/base.js';
import { tip2tipEmit, poly2polyEmit, arcToPath } from '../../../geo/paths.js';
import { newPoint } from '../../../geo/point.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { render } from '../../core/render.js';
import { newPrint } from '../../core/print.js';
import { Tool } from './tool.js';

const { toRadians } = util

/**
 * DRIVER PRINT CONTRACT
 *
 * @param {Object} print state object
 * @param {Function} update incremental callback
 * @param {Number} [index] into widget array
 * @param {Object} [firstPoint] starting point
 */
export async function cam_prepare(widall, settings, update) {
    const widgets = widall.filter(w => !w.track.ignore && !w.meta.disabled);
    const count = widgets.length;
    const weight = 1 / count;
    const print = self.kiri_worker.current.print = newPrint(settings, widgets);
    print.output = [];

    let point;
    widgets.forEach((widget, index) => {
        point = prepEach(widget, settings, print, point, (progress, msg) => {
            update((index * weight + progress * weight) * 0.75, msg || "prepare");
        });
    });

    const output = print.output.filter(level => Array.isArray(level));

    if (render) // allows it to run from CLI
        return render.path(
            output,
            (progress, layer) => {
                update(0.75 + progress * 0.25, "render", layer);
            }, {
            thin: true,
            print: 0,
            move: 0x557799,
            speed: false,
            moves: true,
            other: "moving",
            action: "milling",
            maxspeed: settings.process.camFastFeed || 6000
        }
        );
};

export function prepEach(widget, settings, print, firstPoint, update) {

    if (widget.camops.length === 0 || widget.meta.disabled) return;

    let { device, process } = settings,
        isIndexed = process.camStockIndexed,
        startCenter = process.camOriginCenter,
        alignTop = settings.controller.alignTop,
        stock = settings.stock || {},
        stockz = stock.z * (isIndexed ? 0.5 : 1),
        outer = settings.bounds || widget.getPositionBox(),
        outerz = outer.max.z,
        zclear = (process.camZClearance || 1),
        zmax_force = process.camForceZMax || false,
        zmax_outer = stockz + zclear,
        wztop = widget.track.top,
        ztOff = stockz - wztop,
        bounds = widget.getBoundingBox(),
        boundsz = isIndexed ? stock.z / 2 : bounds.max.z + ztOff,
        zadd = !isIndexed ? stock.z - boundsz : alignTop ? outerz - boundsz : 0,
        zmax = outerz + zclear + (process.camOriginOffZ || 0),
        zsafe = isIndexed ? Math.hypot(bounds.dim.y, bounds.dim.z) / 2 + zclear : zmax,
        wmpos = widget.track.pos,
        wmx = wmpos.x,
        wmy = wmpos.y,
        originx = (startCenter ? 0 : -stock.x / 2) + (process.camOriginOffX || 0),
        originy = (startCenter ? 0 : -stock.y / 2) + (process.camOriginOffY || 0),
        origin = newPoint(originx + wmx, originy + wmy, zmax),
        easeDown = process.camEaseDown,
        easeAngle = process.camEaseAngle,
        depthFirst = process.camDepthFirst,
        innerFirst = process.camInnerFirst,
        engageFactor = process.camFullEngage,
        arcTolerance = process.camArcTolerance,
        arcRes = toRadians(process.camArcResolution),
        arcEnabled = process.camArcEnabled && arcTolerance > 0 && arcRes > 0,
        tolerance = 0,
        drillDown = 0,
        drillLift = 0,
        drillDwell = 0,
        lasering = false,
        laserPower = 0,
        newOutput = print.output || [],
        layerOut = [],
        printPoint,
        isPocket,
        isContour,
        isRough,
        isLathe,
        isIndex,
        tool,
        toolType,
        toolDiam,
        toolDiamMove,
        plungeRate = process.camFastFeedZ,
        feedRate,
        lastOp,
        lastTool,
        lastPush,
        lastPoint,
        currentOp,
        nextIsMove = true,
        synthPlunge = false,
        spindle = 0,
        spindleMax = device.spindleMax,
        maxToolDiam = widget.maxToolDiam,
        terrain = widget.terrain ? widget.terrain.map(data => {
            return {
                z: data.z,
                tops: data.tops,
            };
        }) : zmax;

    function newLayer(op) {
        if (layerOut.length || layerOut.mode) {
            newOutput.push(layerOut);
        }
        layerOut = [];
        layerOut.mode = op || currentOp;
        layerOut.spindle = spindle;
    }

    function addGCode(text) {
        if (!(text && text.length)) {
            return;
        }
        if (!Array.isArray(text)) {
            text = text.trim().split('\n');
        }
        newOutput.push([{ gcode: text }]);
        if (layerOut.length) {
            layerOut = [];
            layerOut.mode = currentOp;
            layerOut.spindle = spindle;
        }
    }

    // non-zero means contouring
    function setTolerance(dist) {
        tolerance = dist;
        if (isContour) {
            // avoid moves to safe Z when contouring short steps
            toolDiamMove = currentOp.step * toolDiam * 1.5;
        }
    }

    function setPrintPoint(point) {
        ops.printPoint = printPoint = point;
    }

    function setSpindle(speed) {
        spindle = Math.min(speed, spindleMax);
    }

    function setTool(toolID, feed, plunge) {
        if (toolID !== lastTool) {
            tool = new Tool(settings, toolID);
            toolType = tool.getType();
            toolDiam = tool.fluteDiameter();
            toolDiamMove = toolType === 'endmill' ? toolDiam : tolerance * 2;
            lastTool = toolID;
        }
        feedRate = feed || feedRate || plunge;
        plungeRate = Math.min(feedRate || plunge, plunge || plungeRate || feedRate);
        // console.log({ setTool: toolID, feed, plunge, plungeRate });
    }

    function setLasering(bool, power = 0) {
        lasering = bool ? currentOp : undefined;
        laserPower = power;
    }

    function setDrill(down, lift, dwell) {
        drillDown = down;
        drillLift = lift;
        drillDwell = dwell;
    }

    function emitDrills(polys) {
        polys = polys.slice();
        for (; ;) {
            let closestDist = Infinity,
                closestI,
                closest = null,
                dist;

            for (let i = 0; i < polys.length; i++) {
                if (!polys[i]) continue;
                if ((dist = polys[i].first().distTo2D(printPoint)) < closestDist) {
                    closestDist = dist;
                    closest = polys[i];
                    closestI = i;
                }
            }

            if (!closest) return;
            polys[closestI] = null;
            printPoint = closest.first();
            emitDrill(closest, drillDown, drillLift, drillDwell);
        }
    }

    function emitDrill(poly, down, lift, dwell) {
        let remain = poly.first().z - poly.last().z,
            points = [],
            point = poly.first();
        if (down <= 0) {
            down = remain;
        }
        for (; ;) {
            if (remain > down * 2) {
                points.push(point.clone());
                point.z -= down;
                remain -= down;
            } else if (remain < down) {
                points.push(point.clone());
                point.z -= remain;
                points.push(point.clone());
                break;
            } else {
                points.push(point.clone());
                point.z -= remain / 2;
                points.push(point.clone());
                point.z -= remain / 2;
                points.push(point.clone());
                break;
            }
        }
        camOut(point.clone().setZ(zmax_outer), 0);
        points.forEach(function (point, index) {
            camOut(point, 1);
            if (index > 0 && index < points.length - 1) {
                if (dwell) camDwell(dwell);
                if (lift) camOut(point.clone().setZ(point.z + lift), 0);
            }
        })
        camOut(point.clone().setZ(zmax_outer), 0);
        newLayer();
    }

    /**
     * @param {Point} point
     * @param {number} emit (0=move, 1=/laser on/cut mode, 2/3= G2/G3 arc)
     * @param {number} [speed] feed/plunge rate in mm/min
     * @param {number} [tool] tool number
     */
    function layerPush(point, emit, speed, tool, options) {
        const { type, center, arcPoints } = options ?? {};
        const dz = (point && lastPush?.point) ? point.z - lastPush.point.z : 0;
        if (dz < -0.05 && speed > plungeRate) {
            speed = plungeRate;
        }
        // if (options?.type !== 'lerp') console.log( point, currentOp.type );
        layerOut.mode = currentOp;
        if (lasering) {
            let power = emit ? laserPower : 0;
            if (emit && lasering.adapt) {
                let { minz, maxz, minp, maxp, adaptrp } = lasering;
                maxz = maxz || wztop;
                let deltaz = maxz - minz;
                let { z } = point;
                if (adaptrp) {
                    while (z > maxz) z -= deltaz;
                    while (z < minz) z += deltaz;
                } else if (z < minz || z > maxz) {
                    // skip outside of band
                    return point;
                }
                z -= minz;
                if (minp < maxp) {
                    power = minp + (z / deltaz) * (maxp - minp);
                } else {
                    power = minp - (z / deltaz) * (minp - maxp);
                }
            }
            if (lasering.flat) {
                point.z = (stock && stock.z ? stock.z : wztop) + lasering.flatz;
            }
            print.addOutput(layerOut, point, power, speed, tool, { type: 'laser' });
        } else {
            print.addOutput(layerOut, point, emit, speed, tool, { type, center, arcPoints });
        }
        lastPush = { point, emit, speed, tool };
        return point;
    }

    function camDwell(time) {
        layerPush(
            null,
            0,
            time,
            tool
        );
    }

    /**
     * Move a point by the widget's movement offset.
     * @param {Point} p - point to move
     * @return {Point} new point with offset applied
     */
    function applyWidgetMovement(p) {
        return newPoint(
            p.x + wmx,
            p.y + wmy,
            p.z + zadd
        ).setA(p.a ?? lastPoint?.a).annotate({ slice: p.slice });
    }

    /**
     * emit a cut, arc, or move operation from the current location to a new location
     * @param {Point} point destination for move
     * @param {0|1|2|3} emit G0, G1, G2, G3
     * @param {number} opts.radius arc radius; truthy values for arc move
     * @param {boolean} opts.clockwise arc direction
     * @param {number} opts.moveLen typically = tool diameter used to trigger terrain detection
     * @param {number} opts.factor speed scale factor
     */
    function camOut(point, emit = 1, opts) {
        let lop = lastOp;
        lastOp = currentOp;

        // on operation changes:
        // 1. move to safe z of current point preserving angle
        // 2. move to safe z of new point preserving old angle
        // 3. move to safe z of new point with new angle
        if (lop && lop !== currentOp && lastPoint) {
            // compensate for applyWidgetMovement() applied to lastPoint
            let lpo = lastPoint.clone().move({ x: -wmx, y: -wmy, z: -zadd });
            camOut(lpo.clone().setZ(zsafe).setA(lastPoint.a), 0);
            camOut(point.clone().setZ(zsafe).setA(lastPoint.a), 0);
            camOut(point.clone().setZ(zsafe), 0);
        }

        if (lop?.type === 'index' && lop !== currentOp ) {
            // console.log('post index first point', point);
            camOut(point.clone().setZ(lastPoint.z).setA(lastPoint.a), 1);
        }

        let {
            center = {},
            clockwise = true,
            arcPoints = [],
            moveLen = toolDiamMove,
            factor = 1,
        } = opts ?? {}

        const isArc = emit == 2 || emit == 3;
        const pointA = point.a;

        // apply widget movement pos
        point = applyWidgetMovement(point);

        if (nextIsMove) {
            emit = 0;
            nextIsMove = false;
        }

        let rate = feedRate * factor;

        // carry rotation forward when not overridden
        if (lastPoint && pointA !== undefined && lastPoint.a !== undefined) {
            let DA = lastPoint.a - pointA;
            let MZ = Math.max(lastPoint.z, point.z)
            // find arc length
            let AL = (Math.abs(DA) / 360) * (2 * Math.PI * MZ);
            if (AL >= 1) {
                let lerp = base.util.lerp(lastPoint.a, pointA, 1);
                // create interpolated point set for rendering and animation
                // console.log({ DA, MZ, AL }, lerp.length);
                for (let a of lerp) {
                    let lp = point.clone().setA(a);
                    // console.log(lp.a, lp.x, lp.y, lp.z);
                    layerPush(
                        lp,
                        emit,
                        rate,
                        tool,
                        { type: "lerp" },
                    );
                }
            }
        }

        // before first point, move cutting head to point above it
        // then set that new point as the lastPoint
        if (!lastPoint) {
            let above = point.clone().setZ(stockz + zclear);
            // let above = point.clone().setZ(zmax + zadd + ztOff);
            lastPoint = layerPush(above, 0, 0, tool);
        }

        // measure deltas to last point in XY and Z
        let deltaXY = lastPoint.distTo2D(point),
            deltaZ = point.z - lastPoint.z,
            absDeltaZ = Math.abs(deltaZ),
            hasDelta = deltaXY >= 0.001 && absDeltaZ >= 0,
            isMove = emit == 0;

        // when rapid pluge could cut thru stock, rapid to just above stock
        // then continue plunge as a plunge cut
        if (deltaZ < 0 && lastPoint.z > stockz && point.z < stockz && emit === 0) {
            // console.log('detected plunge cut as rapid move', lastPoint.z, stockz, point.z);
            layerPush(point.clone().setZ(stockz + 1), 0, 0, tool);
            // change to cutting move for remainder of plunge
            emit = 1;
            isMove = false;
        }

        // drop points too close together
        if (!isLathe && !isArc && deltaXY < 0.001 && point.z === lastPoint.z && point.a === lastPoint.a) {
            // console.trace(["drop dup",lastPoint,point]);
            return;
        }

        // no jump moves in contour mode to adjacent slice points
        let steady = lastPoint && currentOp.type === 'contour' && Math.abs(point.slice - lastPoint.slice) < 4;

        // convert short planar moves to cuts in some cases
        if (hasDelta && !isArc && isMove && deltaXY <= moveLen && deltaZ <= 0 && !lasering) {
            let iscontour = tolerance > 0;
            let isflat = absDeltaZ < 0.001;
            // restrict this to contouring
            if (isflat || (iscontour && absDeltaZ <= tolerance)) {
                emit = 1;
                isMove = false;
            } else if (deltaZ <= -tolerance) {
                // move over before descending
                layerPush(point.clone().setZ(lastPoint.z), 0, 0, tool);
                // new pos for plunge calc
                deltaXY = 0;
            }
        } else if (isMove && isLathe) {
            if (point.z > lastPoint.z) {
                layerPush(lastPoint.clone().setZ(point.z), 0, 0, tool);
            } else if (point.z < lastPoint.z) {
                layerPush(point.clone().setZ(lastPoint.z), 0, 0, tool);
            }
        } else if (isMove && !steady) {
            // for longer moves, check the terrain to see if we need to go up and over
            const bigXY = (deltaXY > moveLen && !lasering);
            const bigZ = (deltaZ > toolDiam / 2 && deltaXY > tolerance);
            const midZ = (tolerance && absDeltaZ >= tolerance) && !isContour;

            if (bigXY || bigZ || midZ) {
                let maxz = getZClearPath(
                    terrain,
                    lastPoint.x - wmx,
                    lastPoint.y - wmy,
                    point.x - wmx,
                    point.y - wmy,
                    Math.max(point.z, lastPoint.z),
                    zadd,
                    maxToolDiam / 2,
                    zclear
                ),
                    maxZdelta = Math.max(maxz - point.z, maxz - lastPoint.z),
                    mustGoUp = maxZdelta >= tolerance,
                    clearz = maxz;
                let zIsBelow = point.z <= maxz;
                if (zmax_force) {
                    clearz = maxz = zmax + zadd;
                    zIsBelow = true;
                }
                // up if any point between higher than start/outline, go up first
                if (mustGoUp || zIsBelow) {
                    const zClearance = clearz + (isIndexed ? 0 : ztOff);
                    if (zIsBelow) {
                        layerPush(lastPoint.clone().setZ(zClearance), 0, 0, tool);
                    }
                    layerPush(point.clone().setZ(zClearance), 0, 0, tool);
                    // new pos for plunge calc
                    deltaXY = 0;
                    // if plunge goes below stock, convert to cut
                    if (emit === 0 && point.z < stockz) {
                        lastPoint = layerPush(point.clone().setZ(stockz + 1), 0, 0, tool);
                        emit = 1;
                    }
                }
            } else if (isRough && deltaZ < 0) {
                layerPush(point.clone().setZ(lastPoint.z), 0, 0, tool);
            }
        }

        // set new plunge rate
        let tmprate;
        if (false)
        if (!lasering && !isLathe && deltaZ < -tolerance) {
            let threshold = Math.min(deltaXY / 2, absDeltaZ),
                modifier = threshold / absDeltaZ;
            if (synthPlunge && threshold && modifier && deltaXY > tolerance) {
                // use modifier to speed up long XY move plunge rates
                // console.log('modifier', modifier);
                tmprate = Math.max(
                    plungeRate,
                    Math.round(plungeRate + ((feedRate - plungeRate) * modifier))
                );
            } else {
                let L = Math.hypot(deltaXY, absDeltaZ);
                let limXY = feedRate * L / deltaXY;
                let limZ  = plungeRate  * L / Math.abs(deltaZ);
                tmprate = Math.min(feedRate, limXY, limZ);
                console.log({ rate_override: rate, was: rate });
                // let zps = len / absDeltaZ;
                // rate = Math.max(
                //     plungeRate,
                //     1 / Math.hypot(deltaXY / feedRate, absDeltaZ / plungeRate)
                // );
                // console.log({ rate, deltaXY, deltaZ });
            }
        }

        if (isArc) {
            layerOut.mode = currentOp;
            layerOut.spindle = spindle;
            lastPoint = layerPush(
                point,
                clockwise ? 2 : 3,
                tmprate ?? rate,
                tool,
                {
                    center,
                    arcPoints
                }
            );
        } else {
            // for g1 moves
            // TODO: synthesize move speed from feed / plunge accordingly
            layerOut.mode = currentOp;
            layerOut.spindle = spindle;
            lastPoint = layerPush(
                point,
                emit,
                tmprate ?? rate,
                tool
            );
        }
    }

    /**
     * output an array of slices that form a pocket
     * used by rough and pocket ops, does not support arcs
     *
     * @param {Slice[]} top-down Z stack of slices
     * @param {*} opts
     */
    function sliceOutput(sliceOut, opts = {}) {
        const { cutdir, depthFirst, easeDown, progress } = opts;

        let total = 0;
        let depthData = [];

        for (let slice of sliceOut) {
            let polys = [], t = [], c = [];
            POLY.flatten(slice.camLines).forEach(function (poly) {
                let child = poly.parent;
                if (depthFirst) { poly = poly.clone(); poly.parent = child ? 1 : 0 }
                if (child) c.push(poly); else t.push(poly);
                poly.layer = depthData.layer;
                polys.push(poly);
            });

            // set cut direction on outer polys
            POLY.setWinding(t, cutdir);
            // set cut direction on inner polys
            POLY.setWinding(c, !cutdir);

            if (depthFirst) {
                depthData.push(polys);
            } else {
                // if not depth first, output the polys in slice order
                printPoint = poly2polyEmit(polys, printPoint, function (poly, index, count) {
                    poly.forEachPoint(function (point, pidx, points, offset) {
                        // scale speed of first cutting poly since it engages the full bit
                        camOut(point.clone(), offset !== 0, undefined, count === 1 ? engageFactor : 1);
                    }, poly.isClosed(), index);
                }, { swapdir: false });
                newLayer();
            }
            progress(++total, sliceOut.length);
        }

        // crucially returns true for -0 as well as other negative #s
        function isNeg(v) {
            return v < 0 || (v === 0 && 1 / v === -Infinity);
        }

        if (depthFirst) {
            // get inside vals (the positive ones)
            let ins = depthData.map(a => a.filter(p => !isNeg(p.depth)));
            let itops = ins.map(level => {
                return POLY.nest(level.filter(poly => poly.depth === 0).clone());
            });
            // get outside vals (the negative ones)
            let outs = depthData.map(a => a.filter(p => isNeg(p.depth)));
            let otops = outs.map(level => {
                return POLY.nest(level.filter(poly => poly.depth === 0).clone());
            });
            printPoint = depthRoughPath(printPoint, 0, ins, itops, polyEmit, false, easeDown);
            printPoint = depthRoughPath(printPoint, 0, outs, otops, polyEmit, false, easeDown);
        }
    }
    /**
     * Ease down along the polygonal path.
     *
     * 1. Travel from fromPoint to closest point on polygon, to rampZ above that that point,
     * 2. ease-down starts, following the polygonal path, decreasing Z at a fixed slope until target Z is hit,
     */
    function generateEaseDown(fn, poly, fromPoint, degrees = 45) {
        let index = poly.findClosestPointTo(fromPoint).index,
            fromZ = fromPoint.z,
            offset = 0,
            points = poly.points,
            length = points.length,
            touch = -1, // first point to touch target z
            targetZ = points[0].z,
            dist2next,
            last,
            next,
            done;

        // Slope for computations.
        const slope = Math.tan((degrees * Math.PI) / 180);
        // Z height above polygon Z from which to start the ease-down.
        // Machine will travel from "fromPoint" to "nearest point x, y, z' => with z' = point z + rampZ",
        // then start the ease down along path.
        const rampZ = 2.0;
        while (true) {
            next = points[index % length];
            if (last && next.z < fromZ) {
                // When "in Ease-Down" (ie. while target Z not yet reached) - follow path while slowly decreasing Z.
                let deltaZ = fromZ - next.z;
                dist2next = last.distTo2D(next);
                let deltaZFullMove = dist2next * slope;

                if (deltaZFullMove > deltaZ) {
                    // Too long: easing along full path would overshoot depth, synth intermediate point at target Z.
                    //
                    // XXX: please check my super basic trig - this should follow from `last` to `next` up until the
                    //      intersect at the target Z distance.
                    fn(last.followTo(next, dist2next * deltaZ / deltaZFullMove).setZ(next.z), offset++);
                } else {
                    // Ok: execute full move at desired slope.
                    next = next.clone().setZ(fromZ - deltaZFullMove);
                }

                fromZ = next.z;
            } else if (offset === 0 && next.z < fromZ) {
                // First point, move to rampZ height above next.
                let deltaZ = fromZ - next.z;
                fromZ = next.z + Math.min(deltaZ, rampZ)
                next = next.clone().setZ(fromZ);
            }
            last = next;
            fn(next, offset++);
            if (touch < 0 && next.z <= targetZ) {
                // Save touch-down index so as to be able to "complete" the full cut at target Z,
                // i.e. keep following the path loop until the touch down point is reached again.
                touch = ((index + length) % length);
                break; //break after touch
            }
            index++;
        }

        return touch;
    }

    // coming from a previous widget, use previous last point
    lastPoint = firstPoint;

    // make top start offset configurable
    printPoint = firstPoint || origin;

    // accumulated data for depth-first optimizations
    // let depthData = {
    //     rough: [],
    //     outline: [],
    //     roughDiam: 0,
    //     outlineDiam: 0,
    //     contourx: [],
    //     contoury: [],
    //     trace: [],
    //     drill: [],
    //     layer: 0,
    // };

    let ops = {
        stock,
        setTool,
        setDrill,
        setSpindle,
        setTolerance,
        setPrintPoint,
        setLasering,
        getPrintPoint() { return printPoint },
        printPoint,
        newLayer,
        addGCode,
        camOut,
        polyEmit,
        poly2polyEmit,
        tip2tipEmit,
        depthRoughPath,
        depthOutlinePath,
        sliceOutput,
        emitDrills,
        emitTrace,
        bounds,
        zclear,
        zmax,
        zsafe,
        lastPoint: () => { return lastPoint }
    };

    let opSum = 0;
    let opTot = widget.camops.map(op => op.weight()).reduce((a, v) => a + v);

    for (let op of widget.camops) {
        setTolerance(0);
        nextIsMove = true;
        currentOp = op.op;
        isIndex = currentOp.type === 'index';
        isLathe = currentOp.type === 'lathe';
        isRough = currentOp.type === 'rough';
        isPocket = currentOp.type === 'pocket';
        isContour = currentOp.type === 'contour' || (isPocket && currentOp.contour);
        let weight = op.weight();
        newLayer(op.op);
        op.prepare(ops, (progress, message) => {
            update((opSum + (progress * weight)) / opTot, message || op.type(), message);
        });
        opSum += weight;
        if (tool && lastPoint) {
            newLayer();
            if (!isIndex) {
                layerPush(printPoint = lastPoint.clone().setZ(zmax_outer), 0, 0, tool);
                newLayer();
            }
        }
    }

    function emitTrace(slice) {
        let { tool, rate, plunge } = slice.camTrace;
        setTool(tool, rate, plunge);
        printPoint = poly2polyEmit(slice.camLines, printPoint, polyEmit, {
            swapdir: false,
            weight: innerFirst
        });
        newLayer();
    }

    /**
     * Output a single polygon as gcode. The polygon is walked in either the
     * clockwise or counter-clockwise direction depending on the winding of the
     * polygon. The first point of the polygon is assumed to be the starting
     * point, and the last point is assumed to be the ending point. If the
     * polygon is closed, the starting and ending points are the same. The
     * function will automatically output a rapid move to the first point of
     * the polygon if that point is not the current position.
     *
     * @param {Polygon} poly - the polygon to output
     * @param {number} index - unused
     * @param {number} count - 1 to set engage factor
     * @param {Point} fromPoint - the point to rapid move from
     * @param {boolean} ops.cutFromLast - whether to emit a 1 when moving from last point. Defaults to false
     * @returns {Point} - the last point of the polygon
     */
    function polyEmit(poly, index, count, fromPoint, ops) {
        let {
            cutFromLast,
        } = ops ?? {
            cutFromLast: false
        };
        let arcQ = [],
            arcMax = Infinity, // no max arc radius
            lineTolerance = 0.001, // do not consider points under 0.001mm for arcs
            zTolerance = 0.1; // allow zs of Points to be off by 0.001mm per radian of rotation

        fromPoint = fromPoint || printPoint;
        arcQ.angle = []

        let lastPoint = fromPoint;
        let startIndex = index;

        // console.log({poly, index, count, fromPoint, startIndex})

        // scale speed of first cutting poly since it engages the full bit
        let scale = ((isRough || isPocket) && count === 1) ? engageFactor : 1;

        // easeDown only allowed on closed polys (that we can continue around indefinitly)
        if (easeDown && poly.isClosed()) {
            let closest = poly.findClosestPointTo(fromPoint);
            lastPoint = closest.point;
            startIndex = closest.index;
            let last = generateEaseDown((point, offset) => { // generate ease-down points
                if (offset == 0) camOut(point.clone(), 0, { factor: engageFactor });
                camOut(point.clone(), 1, { factor: scale }); // and pass them to camOut
            }, poly, fromPoint, easeAngle);
            lastPoint = poly.points[last];
            startIndex = last;
        }

        // console.log(poly,poly.isClosed(),startIndex)
        // A is first point of segment, B is last
        poly.forEachSegment((pointA, pointB, indexA, indexB) => {
            // if(offset == 0) console.log("forEachPoint",point,pidx,points)
            // console.log({pointA, pointB, indexA, indexB,startIndex})
            if (indexA == startIndex) {
                //if cutFromLast is true, emit a 1 for a cutting move
                camOut(pointA.clone(), cutFromLast ? 1 : 0, { factor: engageFactor });
                // if first point, move to and call export function
                if (arcEnabled) arcQ.push(pointA);
            }
            lastPoint = arcExport(pointB, pointA);
        }, !poly.isClosed(), startIndex);

        // console.log("at end of arcExport",structuredClone(arcQ));
        if (arcQ.length > 3) {
            // if few points left, emit as lines
            drainQ();
        }
        while (arcQ.length) {
            camOut(arcQ.shift(), 1);
        }

        function arcExport(point, lastp) {
            let dist = lastp ? point.distTo2D(lastp) : 0;
            if (lastp) {
                if (arcEnabled && dist > lineTolerance && lastp) {
                    let rec = Object.assign(point, { dist });
                    arcQ.push(rec);

                    // ondebug({arcQ});
                    if (arcQ.length > 2) {
                        let el = arcQ.length;
                        let e1 = arcQ[0]; // first in arcQ
                        let e2 = arcQ[Math.floor(el / 2)]; // mid in arcQ
                        let e3 = arcQ[el - 1]; // last in arcQ
                        let e4 = arcQ[el - 2]; // second last in arcQ
                        let e5 = arcQ[el - 3]; // third last in arcQ
                        let cc = util.center2d(e1, e2, e3, 1); // find center
                        let lr = util.center2d(e3, e4, e5, 1); // find local radius
                        let dc = 0;

                        let radFault = false;
                        if (lr) {
                            let angle = 2 * Math.asin(dist / (2 * lr.r));
                            radFault = Math.abs(angle) > arcRes; // enforce arcRes(olution)
                        } else {
                            // console.log("too much angle")
                            radFault = true;
                        }

                        let endDelta = e1.distTo2D(e3)
                        if(endDelta < 0.01){
                            let last = arcQ.peek()
                            drainQ(true)
                            arcQ.push(last)
                            return e3
                        }

                        let ddz = Math.abs((e3.z - e4.z) - (e4.z - e5.z)) // take second derivitive of z
                        let zFault =  Math.abs(ddz) > zTolerance

                        if (cc) {
                            if ([cc.x, cc.y, cc.z, cc.r].hasNaN()) {
                                // console.log({cc, e1, e2, e3});
                            }
                            if (arcQ.length === 3) {
                                arcQ.center = [cc];
                                arcQ.xSum = cc.x;
                                arcQ.ySum = cc.y;
                                arcQ.rSum = cc.r;

                                // check if first angles should have caused radFault
                                let angle = toRadians(arcQ[0].slopeTo(cc).angleDiff(arcQ[1].slopeTo(cc)).angle)
                                radFault = Math.abs(angle) > arcRes
                                if (radFault) {
                                    // if so, remove first point
                                    console.log("secondary radfault,",structuredClone(arcQ),{angle,arcRes,a,b})
                                    camOut(arcQ.shift(), 1)
                                }

                            } else {
                                // check center point delta
                                arcQ.xSum = arcQ.center.reduce(function (t, v) { return t + v.x }, 0);
                                arcQ.ySum = arcQ.center.reduce(function (t, v) { return t + v.y }, 0);
                                arcQ.rSum = arcQ.center.reduce(function (t, v) { return t + v.r }, 0);
                                let dx = cc.x - arcQ.xSum / arcQ.center.length;
                                let dy = cc.y - arcQ.ySum / arcQ.center.length;
                                dc = Math.hypot(dx, dy); // delta center distance
                            }
                            // if new point is off the arc
                            // if point is off-center, or too far from center, or too large of a radius
                            if (dc * arcQ.center.length / arcQ.rSum > arcTolerance || dist > cc.r || cc.r > arcMax || radFault || zFault) {
                                // let debug = [ dc * arcQ.center.length / arcQ.rSum > arcTolerance, dist > cc.r, cc.r > arcMax, radFault];
                                // console.log("point off the arc,",structuredClone(arcQ),radFault,zFault,[dc * arcQ.center.length / arcQ.rSum > arcTolerance , dist > cc.r , cc.r > arcMax]);
                                if (arcQ.length === 4) {
                                    // not enough points for an arc, drop first point and recalc center
                                    camOut(arcQ.shift(), 1);
                                    let tc = util.center2d(arcQ[0], arcQ[1], arcQ[2], 1);
                                    // the new center is invalid as well. drop the first point
                                    if (!tc) {
                                        camOut(arcQ.shift(), 1);
                                    } else {
                                        arcQ.center = [tc];
                                        let angle = 2 * Math.asin(arcQ[1].dist / (2 * tc.r));
                                        if (Math.abs(angle) > arcRes) { // enforce arcRes on initial angle
                                            camOut(arcQ.shift(), 1);
                                        }
                                    }
                                } else {
                                    // enough to consider an arc, emit and start new arc
                                    let defer = arcQ.pop();
                                    drainQ();
                                    // re-add point that was off the last arc
                                    arcQ.push(defer);
                                }
                            } else {
                                // new point is on the arc
                                arcQ.center.push(cc);
                            }
                        } else {
                            // drainQ on invalid center
                            drainQ();
                        }
                    }
                } else {
                    // if dist to small, output as a cut
                    // console.trace('point too small', point,lastp,dist);
                    camOut(point, 1);
                }
            } else {
                // if first point, emit and set
                camOut(point, 1);
                // TODO disabling out of plane z moves until a better mechanism
                // can be built that doesn't rely on computed zpos from layer heights...
                // when making z moves (like polishing) allow slowdown vs fast seek
                // let moveSpeed = (lastp && lastp.z !== z) ? speedMMM : seekMMM;
                // moveTo({x:x, y:y, z:z}, moveSpeed);
            }
            return point;
        }

        /**
         * Emits arcs and/or lines from the arcQ to the current point set.
         * @param {boolean} forceCircle emits a single circle iven if poly is not closed.
         */
        function drainQ(forceCircle = false) {
            // console.trace("draining")
            let arcPreviewRes = 64

            if (!arcTolerance) {
                return;
            }

            if (arcQ.length > 4) {
                // ondebug({arcQ});
                let vec1 = new THREE.Vector2(arcQ[1].x - arcQ[0].x, arcQ[1].y - arcQ[0].y);
                let vec2 = new THREE.Vector2(arcQ.center[0].x - arcQ[0].x, arcQ.center[0].y - arcQ[0].y);
                let clockwise = vec1.cross(vec2) < 0
                let gc = clockwise ? 2 : 3
                let from = arcQ[0];
                let to = arcQ.peek();
                let delta = from.distTo2D(to)
                let closed = poly.isClosed()
                arcQ.xSum = arcQ.center.reduce((t, v) => t + v.x, 0);
                arcQ.ySum = arcQ.center.reduce((t, v) => t + v.y, 0);
                arcQ.rSum = arcQ.center.reduce((t, v) => t + v.r, 0);
                let cl = arcQ.center.length;
                let center = newPoint(
                    arcQ.xSum / cl,
                    arcQ.ySum / cl,
                )

                // console.log("draining")
                if (closed && arcQ.length == poly.points.length || forceCircle ) {
                    //if is a circle
                    // generate circle
                    // console.log("circle",{from, to,center});
                    to = forceCircle? from.clone().setZ(to.z) : from


                    let arcPoints = arcToPath(from, to, arcPreviewRes, { clockwise, center })
                        .map(applyWidgetMovement);

                    // console.log({arcPoints})

                    camOut(from, 1);
                    camOut(to, gc, { center: center.sub(from), clockwise, arcPoints });
                } else {
                    //if a non-circle arc
                    let arcPoints = arcToPath(from, to, arcPreviewRes, { clockwise, center })
                        .map(applyWidgetMovement);
                    // console.log("arc")
                    // first arc point
                    camOut(from, 1);
                    // rest of arc to final point
                    camOut(to, gc, { center: center.sub(from), clockwise, arcPoints });
                    lastPoint = to.clone();
                }
            } else {
                //if q too short, emit as lines
                for (let rec of arcQ) {
                    camOut(rec, 1);
                }
                lastPoint = arcQ.peek().clone();
            }
            arcQ.length = 0;
            arcQ.center = undefined;
        }

        if (depthFirst) {
            newLayer();
        }

        return lastPoint;
    }

    function depthRoughPath(start, depth, levels, tops, emitter, fit, ease) {
        let level = levels[depth];
        if (!(level && level.length)) {
            return start;
        }
        let ltops = tops[depth];
        let fitted = fit ? ltops.filter(poly => poly.isInside(fit, 0.05)) : ltops;
        let ftops = fitted.filter(top => !top.level_emit);
        if (ftops.length > 1) {
            ftops = POLY.route(ftops, start);
        }

        function roughTopEmit(top, index, count, start) {
            top.level_emit = true;
            let inside = level.filter(poly => poly.isInside(top));
            if (ease) {
                start.z += ease;
            }
            start = poly2polyEmit(inside, start, emitter, { mark: "emark", perm: true, swapdir: false });
            if (ease) {
                start.z += ease;
            }
            start = depthRoughPath(start, depth + 1, levels, tops, emitter, top, ease);
            return start;
        }

        // output fragments (due to tabs) last
        let frag = ftops.filter(p => p.open);
        let full = ftops.filter(p => !p.open);

        poly2polyEmit(full, start, roughTopEmit, { mark: "emark", swapdir: false });
        poly2polyEmit(frag, start, roughTopEmit, { mark: "emark", swapdir: false });

        return start;
    }

    function depthOutlinePath(start, depth, levels, radius, emitter, dir, ease) {
        let bottm = depth < levels.length - 1 ? levels[levels.length - 1] : null;
        let above = levels[depth - 1];
        let level = levels[depth];
        if (!level) {
            return start;
        }
        if (above) {
            level = level.filter(lp => {
                const conf = above.filter(ap => !ap.level_emit && lp.isNear(ap, radius, true));
                return conf.length === 0;
            });
        }
        // const thru = []; // match thru polys
        level = level.filter(lp => {
            if (lp.level_emit) {
                return false;
            }
            // if (bottm && !clr) {
            //     const tm = bottm.filter(bp => lp.isEquivalent(bp));
            //     thru.appendAll(tm);
            //     return tm.length === 0;
            // }
            return true;
        });
        // limit level search to polys matching winding (inside vs outside)
        level = level.filter(p => p.isClockwise() === dir);
        // omit polys that match bottom level polys unless level above is cleared
        start = poly2polyEmit(level, start, (poly, index, count, fromPoint) => {
            poly.level_emit = true;
            if (ease) {
                fromPoint.z += ease;
            }
            fromPoint = polyEmit(poly, index, count, fromPoint);
            if (ease) {
                fromPoint.z += ease;
            }
            fromPoint = depthOutlinePath(fromPoint, depth + 1, levels, radius, emitter, dir, ease);
            fromPoint = depthOutlinePath(fromPoint, depth + 1, levels, radius, emitter, !dir, ease);
            return fromPoint;
        }, {
            weight: innerFirst,
            swapdir: false
        });
        return start;
    }

    // last layer/move is to zmax
    // re-inject that point into the last layer generated
    if (lastPoint && newOutput.length) {
        let lastLayer = newOutput.filter(layer => Array.isArray(layer)).peek();
        if (Array.isArray(lastLayer)) {
            printPoint = lastPoint.clone();
            if (printPoint.z < zmax_outer) printPoint.setZ(zmax_outer);
            print.addOutput(lastLayer, printPoint, 0, 0, tool);
            // print.addOutput(lastLayer, printPoint = lastPoint.clone().setZ(zmax_outer), 0, 0, tool);
        }
    }
    // console.log("prepare output", newOutput);
    // replace output single flattened layer with all points
    print.output = newOutput;
    return printPoint;
};

/**
 * return tool Z clearance height for a line segment movement path
 */
function getZClearPath(terrain, x1, y1, x2, y2, z, zadd, off, over) {
    // when terrain skipped, top + pass used
    if (terrain > 0) {
        return terrain;
    }
    let maxz = z;
    let check = [];
    for (let i = 0; i < terrain.length; i++) {
        let data = terrain[i];
        check.push(data);
        if (data.z + zadd < z) {
            break;
        }
    }
    check.reverse();
    let p1 = newPoint(x1, y1);
    let p2 = newPoint(x2, y2);
    for (let i = 0; i < check.length; i++) {
        let data = check[i];
        let int = data.tops.map(p => p.intersections(p1, p2, true)).flat();
        if (int.length) {
            maxz = Math.max(maxz, data.z + zadd + over);
            continue;
        }
        let s1 = p1.slopeTo(p2).toUnit().normal();
        let s2 = p2.slopeTo(p1).toUnit().normal();
        let pa = p1.projectOnSlope(s1, off);
        let pb = p2.projectOnSlope(s1, off);
        int = data.tops.map(p => p.intersections(pa, pb, true)).flat();
        if (int.length) {
            maxz = Math.max(maxz, data.z + zadd + over);
            continue;
        }
        pa = p1.projectOnSlope(s2, off);
        pb = p2.projectOnSlope(s2, off);
        int = data.tops.map(p => p.intersections(pa, pb, true)).flat();
        if (int.length) {
            maxz = Math.max(maxz, data.z + zadd + over);
            continue;
        }
    }
    return maxz;
}
