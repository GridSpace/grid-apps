/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.paths
// dep: geo.point
// dep: geo.polygons
// dep: kiri.render
// dep: kiri-mode.cam.driver
// use: kiri-mode.cam.ops
gapp.register("kiri-mode.cam.prepare", (root, exports) => {

const { base, kiri } = root;
const { paths, polygons, newPoint, util} = base;
const { tip2tipEmit, poly2polyEmit } = paths;
const { driver, render } = kiri;
const { CAM } = driver;

const POLY = polygons;

/**
 * DRIVER PRINT CONTRACT
 *
 * @param {Object} print state object
 * @param {Function} update incremental callback
 * @param {Number} [index] into widget array
 * @param {Object} [firstPoint] starting point
 */
CAM.prepare = async function(widall, settings, update) {
    const widgets = widall.filter(w => !w.track.ignore && !w.meta.disabled);
    const count = widgets.length;
    const weight = 1/count;
    const print = self.worker.print = kiri.newPrint(settings, widgets);
    print.output = [];

    let point;
    widgets.forEach((widget, index) => {
        point = prepEach(widget, settings, print, point, (progress, msg) => {
            update((index * weight + progress * weight) * 0.75, msg || "prepare");
        });
    });

    const output = print.output.filter(level => Array.isArray(level));

    if (render) // allows it to run from CLI
    return render.path(output, (progress, layer) => {
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
    });
};

function prepEach(widget, settings, print, firstPoint, update) {

    if (widget.camops.length === 0 || widget.meta.disabled) return;

    let device = settings.device,
        process = settings.process,
        isIndexed = process.camStockIndexed,
        startCenter = process.camOriginCenter,
        alignTop = settings.controller.alignTop,
        stock = settings.stock || {},
        stockz = stock.z * (isIndexed ? 0.5 : 1),
        outer = settings.bounds || widget.getPositionBox(),
        outerz = outer.max.z,
        slices = widget.slices,
        zclear = (process.camZClearance || 1),
        zmax_force = process.camForceZMax || false,
        zmax_outer = stockz + zclear,
        wztop = widget.track.top,
        ztOff = stockz - wztop,
        bounds = widget.getBoundingBox(),
        boundsz = isIndexed ? stock.z / 2 : bounds.max.z + ztOff,
        zadd = !isIndexed ? stock.z - boundsz : alignTop ? outerz - boundsz : 0,
        zmax = outerz + zclear + process.camOriginOffZ,
        wmpos = widget.track.pos,
        wmx = wmpos.x,
        wmy = wmpos.y,
        originx = (startCenter ? 0 : -stock.x / 2) + process.camOriginOffX,
        originy = (startCenter ? 0 : -stock.y / 2) + process.camOriginOffY,
        origin = newPoint(originx + wmx, originy + wmy, zmax),
        output = print.output,
        easeDown = process.camEaseDown,
        easeAngle = process.camEaseAngle,
        depthFirst = process.camDepthFirst,
        engageFactor = process.camFullEngage,
        tolerance = 0,
        drillDown = 0,
        drillLift = 0,
        drillDwell = 0,
        drillThru = 0,
        lasering = false,
        laserPower = 0,
        newOutput = print.output || [],
        layerOut = [],
        printPoint,
        isNewMode,
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
            tool = new CAM.Tool(settings, toolID);
            toolType = tool.getType();
            toolDiam = tool.fluteDiameter();
            toolDiamMove = toolType === 'endmill' ? toolDiam : tolerance * 2;
            lastTool = toolID;
        }
        feedRate = feed || feedRate || plunge;
        plungeRate = Math.min(feedRate || plunge, plunge || plungeRate || feedRate);
    }

    function setLasering(bool, power = 0) {
        lasering = bool ? currentOp : undefined;
        laserPower = power;
    }

    function setDrill(down, lift, dwell, thru) {
        drillDown = down;
        drillLift = lift;
        drillDwell = dwell;
        drillThru = thru;
    }

    function emitDrills(polys) {
        polys = polys.slice();
        for (;;) {
            let closestDist = Infinity,
                closestI,
                closest = null,
                dist;

            for (let i=0; i<polys.length; i++) {
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
        for (;;) {
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
        camOut(point.clone().setZ(zmax));
        points.forEach(function(point, index) {
            camOut(point, 1);
            if (index > 0 && index < points.length - 1) {
                if (dwell) camDwell(dwell);
                if (lift) camOut(point.clone().setZ(point.z + lift), 0);
            }
        })
        camOut(point.clone().setZ(zmax),0);
        newLayer();
    }

    /**
     * @param {Point} point
     * @param {number} emit (0=move, !0=filament emit/laser on/cut mode)
     * @param {number} [speed] speed
     * @param {number} [tool] tool
     */
    function layerPush(point, emit, speed, tool, type) {
        const dz = (point && lastPush && lastPush.point) ? point.z - lastPush.point.z : 0;
        if (dz < 0 && speed > plungeRate) {
            speed = plungeRate;
        }
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
            print.addOutput(layerOut, point, power, speed, tool, 'laser');
        } else {
            print.addOutput(layerOut, point, emit, speed, tool, type);
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
     * emit a cut or move operation from the current location to a new location
     * @param {Point} point destination for move
     * @param {1|0|boolean} cut 1/true = cut, 0/false = move
     * @param {number} opts.radius arc radius; truthy values for arc move
     * @param {boolean} opts.clockwise arc direction
     * @param {number} opts.moveLen typically = tool diameter used to trigger terrain detection
     * @param {number} opts.factor speed scale factor
     */
    function camOut(point, cut,opts) {

        let {
            radius = null,
            clockwise = true,
            moveLen = toolDiamMove,
            factor = 1,
        } = opts ?? {}

        point = point.clone();
        point.x += wmx;
        point.y += wmy;
        point.z += zadd;

        // console.log(point.z);
        if (nextIsMove) {
            cut = 0;
            nextIsMove = false;
        }

        let rate = feedRate * factor;

        // carry rotation forward when not overridden
        if (point.a === undefined && lastPoint) {
            point.a = lastPoint.a;
        } else if (lastPoint && point.a !== undefined && lastPoint.a !== undefined) {
            let DA = lastPoint.a - point.a;
            let MZ = Math.max(lastPoint.z, point.z)
            // find arc length
            let AL = (Math.abs(DA) / 360) * (2 * Math.PI * MZ);
            if (AL >= 1) {
                let lerp = base.util.lerp(lastPoint.a, point.a, 1);
                // create interpolated point set for rendering and animation
                // console.log({ DA, MZ, AL }, lerp.length);
                for (let a of lerp) {
                    let lp = point.clone().setA(a);
                    // console.log(lp.a, lp.x, lp.y, lp.z);
                    lastPoint = layerPush(
                        lp,
                        cut ? 1 : 0,
                        rate,
                        tool,
                        "lerp"
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
            isMove = !cut;

        // drop points too close together
        if (!isLathe && deltaXY < 0.001 && point.z === lastPoint.z) {
            // console.trace(["drop dup",lastPoint,point]);
            return;
        }

        // convert short planar moves to cuts in some cases
        if (!isRough && isMove && deltaXY <= moveLen && deltaZ <= 0 && !lasering) {
            let iscontour = tolerance > 0;
            let isflat = absDeltaZ < 0.001;
            // restrict this to contouring
            if (isflat || (iscontour && absDeltaZ <= tolerance)) {
                cut = 1;
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
        } else if (isMove) {
            // for longer moves, check the terrain to see if we need to go up and over
            const bigXY = (deltaXY > moveLen && !lasering);
            const bigZ = (deltaZ > toolDiam/2 && deltaXY > tolerance);
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
                        maxToolDiam/2,
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
                }
            } else if (isRough && deltaZ < 0) {
                layerPush(point.clone().setZ(lastPoint.z), 0, 0, tool);
            }
        }

        // set new plunge rate
        if (!lasering && deltaZ < -tolerance && !isLathe) {
            let threshold = Math.min(deltaXY / 2, absDeltaZ),
                modifier = threshold / absDeltaZ;
            if (synthPlunge && threshold && modifier && deltaXY > tolerance) {
                // use modifier to speed up long XY move plunge rates
                rate = Math.round(plungeRate + ((feedRate - plungeRate) * modifier));
                cut = 1;
            } else {
                rate = Math.min(feedRate, plungeRate);
            }
        }

        // todo synthesize move speed from feed / plunge accordingly
        layerOut.mode = currentOp;
        layerOut.spindle = spindle;
        lastPoint = layerPush(
            point,
            cut ? 1 : 0,
            rate,
            tool
        );
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
                printPoint = poly2polyEmit(polys, printPoint, function(poly, index, count) {
                    poly.forEachPoint(function(point, pidx, points, offset) {
                        // scale speed of first cutting poly since it engages the full bit
                        camOut(point.clone(), offset !== 0,{ factor: count === 1 ? engageFactor : 1});
                    }, poly.isClosed(), index);
                }, { swapdir: false });
                newLayer();
            }
            progress(++total, sliceOut.length);
        }

        // crucially returns true for -0 as well as other negative #s
        function isNeg(v) {
            return v < 0 || (v === 0 && 1/v === -Infinity);
        }

        if (depthFirst) {
            let ins = depthData.map(a => a.filter(p => !isNeg(p.depth)));
            let itops = ins.map(level => {
                return POLY.nest(level.filter(poly => poly.depth === 0).clone());
            });
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

    function generateEaseDown(fn,poly, fromPoint, degrees = 45){
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
        lastPoint: () => { return lastPoint }
    };

    let opSum = 0;
    let opTot = widget.camops.map(op => op.weight()).reduce((a,v) => a + v);

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
        let traceTool = new CAM.Tool(settings, tool);
        let traceToolDiam = traceTool.fluteDiameter();
        printPoint = poly2polyEmit(slice.camLines, printPoint, polyEmit, { swapdir: false });
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
     * @param {number} index - the index of the polygon in its containing array
     * @param {number} count - the total number of polygons in the array
     * @param {Point} fromPoint - the point to rapid move from
     * @returns {Point} - the last point of the polygon
     */
    function polyEmit(poly, index, count, fromPoint) {

        const arcDist = 1,
            arcRes = 2, //2 degs max
            arcMax = Infinity; // no max arc radius

        // console.log('polyEmit', poly, index, count);

        let arcQ = [];

        function arcExport(point,lastp){

            let dist = lastp? point.distTo2D(lastp) : 0;

            if (lastp)  {
                if (arcDist) {
                    let rec = Object.assign(point,{dist});
                    arcQ.push(rec);
                    let desp = false; // do arcQ[0] and rec have differing move speeds?
                    if (arcQ.length > 1) {
                        let el = arcQ.length;
                        desp = arcQ[0].speedMMM !== rec.speedMMM;
                    }
                    // ondebug({arcQ});
                    if (arcQ.length > 2) {
                        let el = arcQ.length;
                        let e1 = arcQ[0]; // first in arcQ
                        let e2 = arcQ[Math.floor(el/2)]; // mid in arcQ
                        let e3 = arcQ[el-1]; // last in arcQ
                        let e4 = arcQ[el-2]; // second last in arcQ
                        let e5 = arcQ[el-3]; // third last in arcQ
                        let cc = util.center2d(e1, e2, e3, 1); // find center
                        let lr = util.center2d(e3, e4, e5, 1); // find local radius
                        let dc = 0;
    
                        let radFault = false;
                        if (lr) {
                            let angle = 2 * Math.asin(dist/(2*lr.r));
                            radFault = Math.abs(angle) > Math.PI * 2 / arcRes; // enforce arcRes(olution)
                            // if (arcQ.center) {
                            //     arcQ.rSum = arcQ.center.reduce( function (t, v) { return t + v.r }, 0 );
                            //     let avg = arcQ.rSum / arcQ.center.length;
                            //     radFault = radFault || Math.abs(avg - lr.r) / avg > arcDev; // eliminate sharps and flats when local rad is out of arcDev(iation)
                            // }
                        } else {
                            radFault = true;
                        }
    
                        if (cc) {
                            if ([cc.x,cc.y,cc.z,cc.r].hasNaN()) {
                                console.log({cc, e1, e2, e3});
                            }
                            if (arcQ.length === 3) {
                                arcQ.center = [ cc ];
                                arcQ.xSum = cc.x;
                                arcQ.ySum = cc.y;
                                arcQ.rSum = cc.r;
                            } else {
                                // check center point delta
                                arcQ.xSum = arcQ.center.reduce( function (t, v) { return t + v.x }, 0 );
                                arcQ.ySum = arcQ.center.reduce( function (t, v) { return t + v.y }, 0 );
                                arcQ.rSum = arcQ.center.reduce( function (t, v) { return t + v.r }, 0 );
                                let dx = cc.x - arcQ.xSum / arcQ.center.length;
                                let dy = cc.y - arcQ.ySum / arcQ.center.length;
                                dc = Math.sqrt(dx * dx + dy * dy);
                            }
    
                            // if new point is off the arc
                            // if (deem || depm || desp || dc > arcDist || cc.r < arcMin || cc.r > arcMax || dist > cc.r) {
                            if ( desp || dc * arcQ.center.length / arcQ.rSum > arcDist || dist > cc.r || cc.r > arcMax || radFault ) {
                                // let debug = [deem, depm, desp, dc * arcQ.center.length / arcQ.rSum > arcDist, dist > cc.r, cc.r > arcMax, radFault];
                                console.log("point off the arc,",structuredClone(arcQ));
                                if (arcQ.length === 4) {
                                    // not enough points for an arc, drop first point and recalc center
                                    camOut(arcQ.shift(),1);
                                    let tc = util.center2d(arcQ[0], arcQ[1], arcQ[2], 1);
                                    // the new center is invalid as well. drop the first point
                                    if (!tc) {
                                        camOut(arcQ.shift(),1);
                                    } else {
                                        arcQ.center = [ tc ];
                                        let angle = 2 * Math.asin(arcQ[1].dist/(2*tc.r));
                                        if (Math.abs(angle) > Math.PI * 2 / arcRes) { // enforce arcRes on initial angle
                                            camOut(arcQ.shift(),1);
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
                    // emitMM = emitPerMM * out.emit * dist;
                    emitMM = extrudeMM(dist, emitPerMM, out.emit);
                    camOut({x, y, e:emitMM}, true,);
                    emitted += emitMM;
                }
            } else {
                // if no last point, emit and set
                drainQ();
                camOut({x, y},1 );
                // TODO disabling out of plane z moves until a better mechanism
                // can be built that doesn't rely on computed zpos from layer heights...
                // when making z moves (like polishing) allow slowdown vs fast seek
                // let moveSpeed = (lastp && lastp.z !== z) ? speedMMM : seekMMM;
                // moveTo({x:x, y:y, z:z}, moveSpeed);
            }
            return point;
        }


    
        function drainQ() {

            console.log("drainQ called",structuredClone(arcQ));

            if (!arcDist) {
                return;
            }
            if (arcQ.length > 4) {
                // ondebug({arcQ});
                let vec1 = new THREE.Vector2(arcQ[1].x - arcQ[0].x, arcQ[1].y - arcQ[0].y);
                let vec2 = new THREE.Vector2(arcQ.center[0].x - arcQ[0].x, arcQ.center[0].y - arcQ[0].y);
                let clockwise = vec1.cross(vec2) < 0 ? 'G2' : 'G3';
                let from = arcQ[0];
                let to = arcQ.peek();
                arcQ.xSum = arcQ.center.reduce( (t, v) => t + v.x , 0 );
                arcQ.ySum = arcQ.center.reduce( (t, v) => t + v.y , 0 );
                arcQ.rSum = arcQ.center.reduce( (t, v) => t + v.r , 0 );
                let cl = arcQ.center.length;
                let cc;
    
                let angle = util.thetaDiff(
                    Math.atan2((from.y - arcQ.ySum / cl), (from.x - arcQ.xSum / cl)),
                    Math.atan2((to.y - arcQ.ySum / cl), (to.x - arcQ.xSum / cl)),
                    clockwise
                );
    
                if (Math.abs(angle) <= 3 * Math.PI / 4) {
                    cc = util.center2pr(from, to, arcQ.rSum / cl, !clockwise);
                }
    
                if (!cc) {
                    cc = {x:arcQ.xSum/cl, y:arcQ.ySum/cl, z:arcQ[0].z, r:arcQ.rSum/cl};
                }
    
                // first arc point
                camOut(from,true);
                // rest of arc to final point

                // XYR form
                // let pre = `${clockwise? 'G2' : 'G3'} X${to.x.toFixed(decimals)} Y${to.y.toFixed(decimals)} R${cc.r.toFixed(decimals)} `;
                camOut(to,1,{radius:cc.r, clockwise});
                // XYIJ form
                // let pre = `${clockwise? 'G2' : 'G3'} X${to.x.toFixed(decimals)} Y${to.y.toFixed(decimals)} I${(cc.x - pos.x).toFixed(decimals)} J${(cc.y - pos.y).toFixed(decimals)} E${emit.toFixed(decimals)}`;
                
                // let add = pos.f !== from.speedMMM ? ` E${from.speedMMM}` : '';
                // append(`${pre}${add} ; merged=${cl-1} len=${dist.toFixed(decimals)} cp=${cc.x.round(2)},${cc.y.round(2)}`);
            } else {
                //if q too short, emit as lines
                for (let rec of arcQ) {
                    camOut(rec,1);
                }
            }
            arcQ.length = 0;
            arcQ.center = undefined;
        }
        


        let last = null;
        // scale speed of first cutting poly since it engages the full bit
        let scale = ((isRough || isPocket) && count === 1) ? engageFactor : 1;

        if (easeDown && poly.isClosed()) { //if doing ease-down
            last = generateEaseDown((point, )=>{ //generate ease-down points
                camOut(point.clone(), 1, {factor:scale}); // and pass them to camOut
            }, poly, fromPoint, easeAngle);
        } 

        poly.forEachPoint(function(point, pidx, points, offset) {
            arcExport(point,last)
            // camOut(point.clone(), offset !== 0, {factor:scale});
            last = point;
        }, poly.isClosed(), last);

        // console.log("at end of arcExport",structuredClone(arcQ));
        drainQ();
        // console.log("at end of arcExport",structuredClone(arcQ));

        
        newLayer();
        return last;
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
        let above = levels[depth-1];
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
        }, { weight: false, swapdir: false });
        return start;
    }

    // last layer/move is to zmax
    // re-inject that point into the last layer generated
    if (lastPoint && newOutput.length) {
        let lastLayer = newOutput.filter(layer => Array.isArray(layer)).peek();
        if (Array.isArray(lastLayer)) {
            print.addOutput(lastLayer, printPoint = lastPoint.clone().setZ(zmax_outer), 0, 0, tool);
        }
    }
    console.log("prepare output", newOutput);
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
    for (let i=0; i<terrain.length; i++) {
        let data = terrain[i];
        check.push(data);
        if (data.z + zadd < z) {
            break;
        }
    }
    check.reverse();
    for (let i=0; i<check.length; i++) {
        let data = check[i];
        let p1 = newPoint(x1, y1);
        let p2 = newPoint(x2, y2);
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

});
