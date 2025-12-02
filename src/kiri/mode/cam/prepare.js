/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { base, util } from '../../../geo/base.js';
import { tip2tipEmit, poly2polyEmit } from '../../../geo/paths.js';
import { newPoint } from '../../../geo/point.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { render } from '../../core/render.js';
import { newPrint } from '../../core/print.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';

const debug = false;
const debug_push = false;

/**
 * DRIVER PRINT CONTRACT
 *
 * @param {Object} print state object
 * @param {Function} update incremental callback
 * @param {Number} [index] into widget array
 * @param {Object} [firstPoint] starting point
 */
export async function cam_prepare(widgets, settings, update) {
    const active = widgets
        .filter(w => !w.isSynth() && !w.track.ignore && !w.meta.disabled)
        .filter(w => w?.camops.length)
        ;
    const count = active.length;
    const weight = 1 / count;
    const print = self.kiri_worker.current.print = newPrint(settings, active);
    const { origin } = settings;

    // cam-specific storage
    print.output = [];

    // sort output by distance to origin
    if (origin) {
        let point = newPoint().move(origin);
        active.sort((w0,w1) =>
            newPoint().move(w0.track.pos).distTo2D(point) -
            newPoint().move(w1.track.pos).distTo2D(point)
        );
    }

    let startPoint;
    active.forEach((widget, index) => {
        startPoint = prepare_one(widget, settings, print, startPoint, (progress, msg) => {
            update((index * weight + progress * weight) * 0.75, msg || "prepare");
        });
    });

    // prune empty levels
    const output = print.output.filter(level => Array.isArray(level));

    // compute path display
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

// process `prepare` paths for a single widget
export function prepare_one(widget, settings, print, firstPoint, update) {

    let { device, process } = settings,
        { alignTop } = settings.controller,
        { camArcEnabled, camArcResolution, camArcTolerance } = process,
        { camDepthFirst, camEaseAngle, camEaseDown } = process,
        { camStockX, camStockY, camStockZ, camStockIndexed, camStockOffset } = process,
        { camForceZMax, camFullEngage, camInnerFirst, camOriginCenter } = process,
        { camOriginOffX, camOriginOffY, camOriginOffZ, camZClearance } = process,
        bounds = widget.getBoundingBox(),
        stock = camStockOffset ? {
            x: bounds.dim.x + camStockX,
            y: bounds.dim.y + camStockY,
            z: bounds.dim.z + camStockZ,
        } : {
            x: camStockX,
            y: camStockY,
            z: camStockZ
        },
        stockZ = stock.z * (camStockIndexed ? 0.5 : 1),
        stockZClear = stockZ + camZClearance,
        widgetTrackTop = widget.track.top,
        widgetTopToStock = stockZ - widgetTrackTop,
        boundsZ = camStockIndexed ? stock.z / 2 : bounds.max.z + widgetTopToStock,
        wmpos = widget.track.pos,
        wmx = wmpos.x,
        wmy = wmpos.y,
        wmz = !camStockIndexed ? stock.z - boundsZ : alignTop ? 0 : 0,
        zSafe = camStockIndexed ? Math.hypot(stock.y, stock.z) / 2 + camZClearance : stockZClear,
        originx = (camOriginCenter ? 0 : -stock.x / 2) + (camOriginOffX || 0),
        originy = (camOriginCenter ? 0 : -stock.y / 2) + (camOriginOffY || 0),
        origin = newPoint(originx, originy, zSafe),
        contouring = false,
        currentOp,
        drillDown = 0,
        drillLift = 0,
        drillDwell = 0,
        feedRate,
        isRough,
        isLathe,
        isIndex,
        layerOut = [],
        lastOp,
        lastTool,
        lasering = false,
        laserPower = 0,
        newOutput = print.output || [],
        nextIsMove = true,
        plungeRate = process.camFastFeedZ,
        printPoint,
        tool,
        toolType,
        toolDiam,
        toolDiamMove,
        spindle = 0,
        spindleMax = device.spindleMax,
        tolerance = 0,
        easeThrottle = (90 - Math.min(90, camEaseAngle)) / 180,
        easeDzPerMm = Math.tan(camEaseAngle * Math.PI / 180);

    if (debug) console.log({ zSafe, wmx, wmy, wmz });

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

    function setContouring(bool) {
        contouring = bool;
    }

    // non-zero means contouring
    function setTolerance(dist) {
        tolerance = dist;
        if (contouring) {
            // avoid moves to safe Z when contouring short steps
            toolDiamMove = currentOp.step * toolDiam * 1.5;
        }
    }

    function setSpindle(speed) {
        spindle = Math.min(speed, spindleMax);
    }

    function setTool(toolID, feed, plunge) {
        if (toolID !== lastTool) {
            tool = new Tool(settings, toolID);
            toolType = tool.getType();
            toolDiam = tool.fluteDiameter();
            toolDiamMove = toolType === 'endmill' ? toolDiam * 1.5 : tolerance * 2;
            lastTool = toolID;
        }
        feedRate = feed || feedRate || plunge;
        plungeRate = Math.min(feedRate || plunge, plunge || plungeRate || feedRate);
        if (debug) console.log({ setTool: toolID, feed, plunge, plungeRate });
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
        setNextIsMove();
        points.forEach(function (point, index) {
            newLayer();
            camOut(point);
            if (index > 0 && index < points.length - 1) {
                newLayer();
                if (dwell) camDwell(dwell);
                if (lift) camOut(point.clone().setZ(point.z + lift), 0);
            }
            newLayer();
        })
    }

    /**
     * @param {Point} point
     * @param {number} emit (0=move, 1=/laser on/cut mode)
     * @param {number} [speed] feed/plunge rate in mm/min
     * @param {number} [tool] tool number
     */
    function layerPush(point, emit, speed, tool, options) {
        const { type, center } = options ?? {};
        if (debug_push && options?.type !== 'lerp') {
            console.log(
                currentOp.type,
                emit | 0,
                speed | 0,
                ...[point.x,point.y,point.z,point.a??0].map(v => v.toFixed(3))
            );
        }
        layerOut.mode = currentOp;
        if (lasering) {
            let power = emit ? laserPower : 0;
            if (emit && lasering.adapt) {
                let { minz, maxz, minp, maxp, adaptrp } = lasering;
                maxz = maxz || widgetTrackTop;
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
                point.z = (stock && stock.z ? stock.z : widgetTrackTop) + lasering.flatz;
            }
            print.addOutput(layerOut, point, power, speed, tool, { type: 'laser' });
        } else {
            print.addOutput(layerOut, point, emit, speed, tool, { type, center });
        }
        printPoint = (point ?? printPoint).clone();
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

    function setNextIsMove() {
        nextIsMove = true;
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
            p.z + wmz
        )
        .setA(p.a ?? printPoint?.a)
        .annotate({ slice: p.slice });
    }

    /**
     * emit a cut or move operation from the current location to a new location
     * @param {Point} point destination for move in widget coordinate space
     * @param {-1|0|1|2|3} emit ignore, G0, G1, G2, G3
     * @param {number} opts.moveLen typically = tool diameter used to trigger terrain detection
     * @param {number} opts.factor speed scale factor
     * @param {Object} opts.center arc center parameter
     * @return {Point} translated emitted point
     */
    function camOut(point, emit = 1, opts) {
        let lop = lastOp;
        lastOp = currentOp;

        // translate widget point into workspace coordinates
        point = applyWidgetMovement(point);

        // on operation changes:
        // 1. move to safe z of current point preserving angle
        // 2. move to safe z of new point preserving old angle
        // 3. move to safe z of new point with new angle
        if (lop !== currentOp) {
            layerPush(printPoint.clone().setZ(zSafe).setA(printPoint.a), 0, feedRate, tool);
            layerPush(point.clone().setZ(zSafe).setA(printPoint.a), 0, feedRate, tool);
            layerPush(point.clone().setZ(zSafe), 0, feedRate, tool);
            newLayer();
        }

        if (nextIsMove) {
            emit = 0;
            nextIsMove = false;
        }

        let {
            factor = 1,
            feed = feedRate,
            moveLen = toolDiamMove,
            moveOnly = false,
            center,
        } = opts ?? {};
        let pointA = point.a;
        let rate = feed * factor;

        // carry rotation forward when not overridden
        if (pointA !== undefined && printPoint.a !== undefined) {
            let DA = printPoint.a - pointA;
            let MZ = Math.max(printPoint.z, point.z)
            // find rotary arc length
            let AL = (Math.abs(DA) / 360) * (2 * Math.PI * MZ);
            if (AL >= 1) {
                newLayer();
                let lerp = base.util.lerp(printPoint.a, pointA, 1);
                // create interpolated point set for rendering and animation
                if (debug) console.log({ DA, MZ, AL }, lerp.length);
                for (let a of lerp) {
                    let lp = point.clone().setA(a);
                    if (debug) console.log(lp.a, lp.x, lp.y, lp.z);
                    layerPush(
                        lp,
                        emit,
                        rate,
                        tool,
                        { type: "lerp" },
                    );
                }
                newLayer();
            }
        }

        // measure deltas from last point in XY and Z
        let deltaXY = printPoint.distTo2D(point),
            deltaZ = point.z - printPoint.z,
            absDeltaZ = Math.abs(deltaZ),
            isMove = (emit === 0 || emit === false),
            isCut = (emit !== 0),
            isArc = (emit > 1);

        // translate arc points into workspace coordinates
        if (isArc) {
            center = applyWidgetMovement(center);
        }

        // when rapid pluge could cut thru stock:
        //  * rapid to just above stock
        //  * continue plunge as cut
        if (deltaZ < 0 && printPoint.z > stockZ && point.z < stockZ && isMove) {
            if (debug) console.log('detected plunge cut as rapid move', printPoint.z, stockZ, point.z);
            layerPush(point.clone().setZ(zSafe), 0, 0, tool);
            // change to cutting move for remainder of plunge
            emit = 1;
            isCut = true;
            isMove = false;
            newLayer();
        }

        // drop points too close together
        if (!isArc && deltaXY < 0.001 && point.z === printPoint.z && point.a === printPoint.a) {
            // console.trace(["drop dup",printPoint,point]);
            return;
        }

        // no jump moves in contour mode to adjacent slice points
        let csteady = true
            && contouring
            && Math.abs(point.slice - printPoint.slice) < 4
            && absDeltaZ < moveLen
            ;

        if (isMove && contouring && deltaZ > moveLen) {
            if (debug) console.log('contouring Z step', deltaZ);
            layerPush(printPoint.clone().setZ(point.z), 0, 0, tool);
            newLayer();
        } else
        if (isMove && deltaXY <= moveLen && deltaZ <= 0 && !lasering) {
            // convert short planar moves to cuts in some cases
            if (absDeltaZ < 0.01 || (tolerance > 0 && absDeltaZ <= tolerance)) {
                emit = 1;
                isCut = true;
                isMove = false;
            } else
            // move over before descending
            if (deltaZ <= -tolerance) {
                if (debug) console.log('over before descend');
                layerPush(point.clone().setZ(printPoint.z), 0, 0, tool);
                newLayer();
            }
        } else
        if (isMove && isLathe) {
            if (point.z > printPoint.z) {
                layerPush(printPoint.clone().setZ(point.z), 0, 0, tool);
                newLayer();
            } else if (point.z < printPoint.z) {
                layerPush(point.clone().setZ(printPoint.z), 0, 0, tool);
                newLayer();
            }
        } else
        if (isMove && !csteady) {
            // for longer moves, check the terrain to see if we need to go up and over
            const bigXY = (deltaXY > moveLen && !lasering && !contouring);
            const bigZ = (absDeltaZ > toolDiam / 2 && deltaXY > tolerance);
            const midZ = (tolerance && absDeltaZ >= tolerance) && !contouring;
            if (bigXY || bigZ || midZ) {
                if (debug) console.log({ fromz: printPoint.z, toz: point.z });
                if (camForceZMax || printPoint.z < stockZ) {
                    if (debug) console.log('upNover', { camForceZMax });
                    layerPush(printPoint.clone().setZ(zSafe), 0, 0, tool);
                    layerPush(point.clone().setZ(zSafe), 0, 0, tool);
                    newLayer();
                    // when plunge goes below stock, convert to cut
                    if (point.z < stockZ) {
                        if (debug) console.log('emit === 0 && point.z < stockZ');
                        layerPush(point.clone().setZ(stockZ + 0.1), 0, 0, tool);
                        newLayer();
                        emit = 1;
                        rate = plungeRate;
                    }
                }
            } else
            if (isRough && deltaZ < 0) {
                if (debug) console.log('isRough && deltaZ < 0');
                layerPush(point.clone().setZ(printPoint.z), 0, 0, tool);
                newLayer();
            }
        }

        if (moveOnly) {
            return;
        }

        // plunge safety catch
        if (deltaZ < 0 && !contouring) {
            if (debug) console.log('deltaZ snap', rate, plungeRate);
            emit = 1;
            isCut = true;
            isMove = false;
            rate = plungeRate;
        }

        layerOut.mode = currentOp;
        layerOut.spindle = spindle;
        layerPush(
            point,
            emit,
            rate,
            tool,
            isArc ? { center } : undefined
        );

        return point;
    }

    /**
     * output an array of slices that form a pocket
     * used by rough and pocket ops
     *
     * @param {Slice[]} slices top-down Z stack of slices
     * @param {boolean} cutdir true=CW false=CCW
     * @param {boolean} depthFirst prioritize cut depth in pockets by nesting
     */
    function pocket({ slices, cutdir, depthFirst, easeDown, progress }) {
        let total = 0;
        let depthData = [];

        for (let slice of slices) {
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
                poly2polyEmit(polys, printPoint, polyEmit, { swapdir: false });
                newLayer();
            }
            progress(++total, slices.length);
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
            depthRoughPath(printPoint, 0, ins, itops, polyEmit, false, easeDown);
            depthRoughPath(printPoint, 0, outs, otops, polyEmit, false, easeDown);
        }
    }

    function emitTraces(camLines) {
        poly2polyEmit(camLines, printPoint, polyEmit, {
            swapdir: false,
            weight: camInnerFirst
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
     * @param {number} index - optional: starting point index
     * @returns {Point} - the last point emitted (in widget coordinates)
     */
    function polyEmit(poly, index) {
        let arcing = camArcEnabled && !contouring;
        let points = poly.points;
        if (index) {
            points = [...points.slice(index), ...points.slice(0,index)];
        }

        // run arc detection when enabled
        if (arcing) {
            poly = newPolygon(points).setOpenValue(poly.open).detectArcs({
                tolerance: camArcTolerance,
                arcRes: camArcResolution,
                minPoints: 5
            });
            points = poly.points;
        }

        // we skip ease-down logic in contouring mode
        if (!contouring) {
            let point0 = points[0];
            if (poly.isClosed()) {
                points.push(point0);
            }

            setNextIsMove();
            if (camEaseDown) {
                camOut(point0, 0, { moveOnly: true });
                setContouring(true);
            }

            // poly points are in untranslated widget space
            // so we need to translate printPoint into widget coordinates
            let startPoint = printPoint.clone().move({ x: -wmx, y: -wmy, z: -wmz });

            // calculate ease down for poly path output
            if (camEaseDown && startPoint.z > point0.z) {
                let easeFeed = plungeRate + ((feedRate - plungeRate) * easeThrottle);
                let zat = startPoint.z;
                let lp;
                for (let i=0; ; i++) {
                    let ii = i % points.length;
                    let pt = points[ii];
                    if (zat <= pt.z) {
                        break;
                    }
                    if (i > 0) {
                        let dd = lp.distTo2D(pt);
                        zat = Math.max(pt.z, zat - (dd * easeDzPerMm));
                    }
                    lp = pt.clone().setZ(zat);
                    camOut(lp, 1, { feed: easeFeed });
                }
            }
            setContouring(false);
        }

        let lastOut;

        if (arcing) {
            let skip = 0;
            let type;
            let center;
            for (let point of points) {
                lastOut = point.clone();
                if (type) {
                    skip = skip - 1;
                    camOut(lastOut, skip ? -1 : type, { center, factor: 0.2 });
                    if (!skip) center = type = undefined;
                    continue;
                } else if (point.arc) {
                    let { arc } = point;
                    skip = arc.skip;
                    type = arc.clockwise ? 2 : 3;
                    center = arc.center;
                }
                camOut(lastOut);
            }
        } else {
            for (let point of points) {
                camOut(lastOut = point.clone());
            }
        }

        if (camDepthFirst) {
            newLayer();
        }

        return lastOut;
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
        start = poly2polyEmit(level, start, (poly, index) => {
            poly.level_emit = true;
            let fromPoint = printPoint.clone();
            if (ease) {
                fromPoint.z += ease;
            }
            fromPoint = polyEmit(poly, index);
            if (ease) {
                fromPoint.z += ease;
            }
            fromPoint = depthOutlinePath(fromPoint, depth + 1, levels, radius, emitter, dir, ease);
            fromPoint = depthOutlinePath(fromPoint, depth + 1, levels, radius, emitter, !dir, ease);
            return fromPoint;
        }, {
            weight: camInnerFirst,
            swapdir: false
        });
        return start;
    }

    // coming from a previous widget, use previous last point as starting point
    // make top start offset configurable
    printPoint = firstPoint || origin;

    let ops = {
        addGCode,
        camOut,
        depthOutlinePath,
        depthRoughPath,
        emitDrills,
        emitTraces,
        newLayer,
        pocket,
        poly2polyEmit,
        polyEmit,
        printPoint,
        setContouring,
        setDrill,
        setLasering,
        setNextIsMove,
        setSpindle,
        setTolerance,
        setTool,
        tip2tipEmit,
        widget,
        zSafe,
    };

    let opSum = 0;
    let opTot = widget.camops.map(op => op.weight()).reduce((a, v) => a + v);

    for (let op of widget.camops) {
        contouring = false;
        lasering = false;
        setTolerance(0);
        setNextIsMove();
        currentOp = op.op;
        isIndex = currentOp.type === 'index';
        isLathe = currentOp.type === 'lathe';
        isRough = currentOp.type === 'rough';
        let weight = op.weight();
        newLayer(op.op);
        ops.printPoint = printPoint.clone().move({ x: -wmx, y: -wmy, z: -wmz });
        op.prepare(ops, (progress, message) => {
            update((opSum + (progress * weight)) / opTot, message || op.type(), message);
        });
        opSum += weight;
        if (tool && printPoint) {
            newLayer();
            if (!isIndex) {
                layerPush(printPoint.clone().setZ(stockZClear), 0, 0, tool);
                newLayer();
            }
        }
    }

    // last layer/move is to zSafe
    // re-inject that point into the last layer generated
    if (printPoint && newOutput.length) {
        let lastLayer = newOutput.filter(layer => Array.isArray(layer)).peek();
        if (Array.isArray(lastLayer)) {
            if (printPoint.z < stockZClear) printPoint.setZ(stockZClear);
            print.addOutput(lastLayer, printPoint, 0, 0, tool);
        }
    }

    // console.log("prepare output", newOutput);
    // replace output single flattened layer with all points
    print.output = newOutput;

    return printPoint;
}
