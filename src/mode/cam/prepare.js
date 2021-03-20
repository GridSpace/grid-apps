/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        POLY = BASE.polygons,
        UTIL = BASE.util,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        newPoint = BASE.newPoint;

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Object} print state object
     * @param {Function} update incremental callback
     * @param {Number} [index] into widget array
     * @param {Object} [firstPoint] starting point
     */
    CAM.prepare = function(widgets, settings, update) {
        const count = widgets.length;
        const weight = 1/count;
        const print = self.worker.print = KIRI.newPrint(settings, widgets);
        print.output = [];

        let point;
        widgets.forEach((widget, index) => {
            point = prepEach(widget, settings, print, point, progress => {
                update((index * weight + progress * weight) * 0.5, "prepare");
            });
        });

        print.render = KIRI.driver.FDM.prepareRender(print.output, (progress, layer) => {
            update(0.5 + progress * 0.5, "render", layer);
        }, {
            thin: true,
            print: 0,
            move: 0x557799,
            speed: false,
            moves: true,
            other: "moving",
            action: "milling"
        });

        return print.render;
    };

    function prepEach(widget, settings, print, firstPoint, update) {

        if (widget.camops.length === 0) return;

        let device = settings.device,
            process = settings.process,
            stock = settings.stock,
            outer = settings.bounds,
            outerz = outer.max.z,
            slices = widget.slices,
            hasStock = stock.x && stock.y && stock.z && process.camStockOn,
            startCenter = process.outputOriginCenter,
            alignTop = settings.controller.alignTop,
            zclear = (process.camZClearance || 1),
            zmax_outer = hasStock ? stock.z + zclear : outerz + zclear,
            wztop = widget.track.top,
            ztOff = hasStock ? stock.z - wztop : 0,
            bounds = widget.getBoundingBox(),
            boundsz = bounds.max.z + ztOff,
            zadd = hasStock ? stock.z - boundsz : alignTop ? outerz - boundsz : 0,
            zmax = outerz + zclear,
            wmpos = widget.track.pos,
            wmx = wmpos.x,
            wmy = wmpos.y,
            originx = startCenter ? 0 : hasStock ? -stock.x / 2 : bounds.min.x,
            originy = startCenter ? 0 : hasStock ? -stock.y / 2 : bounds.min.y,
            origin = newPoint(originx + wmx, originy + wmy, zmax),
            output = print.output,
            easeDown = process.camEaseDown,
            depthFirst = process.camDepthFirst,
            tolerance = 0,
            drillDown = 0,
            drillLift = 0,
            drillDwell = 0,
            newOutput = print.output || [],
            layerOut = [],
            printPoint,
            isNewMode,
            tool,
            toolType,
            toolDiam,
            toolDiamMove,
            plungeRate,
            feedRate,
            lastTool,
            lastMode,
            lastPoint,
            nextIsMove = true,
            synthPlunge = false,
            spindle = 0,
            spindleMax = device.spindleMax,
            addOutput = print.addOutput,
            tip2tipEmit = print.tip2tipEmit,
            poly2polyEmit = print.poly2polyEmit,
            maxToolDiam = widget.maxToolDiam,
            terrain = widget.terrain ? widget.terrain.map(data => {
                return {
                    z: data.z,
                    tops: data.tops,
                };
            }) : zmax;

        function newLayer() {
            if (layerOut.length < 2) {
                return;
            }
            newOutput.push(layerOut);
            layerOut = [];
            layerOut.mode = lastMode;
            layerOut.spindle = spindle;
        }

        // non-zero means contouring
        function setTolerance(dist) {
            tolerance = dist;
        }

        function setPrintPoint(point) {
            printPoint = point;
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
            feedRate = feed || feedRate;
            plungeRate = plunge || plungeRate;
        }

        function setDrill(down, lift, dwell) {
            drillDown = down;
            drillLift = lift;
            drillDwell = dwell;
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
            camOut(point.clone().setZ(zmax));
            newLayer();
        }

        /**
         * @param {Point} point
         * @param {number} emit (0=move, !0=filament emit/laser on/cut mode)
         * @param {number} [speed] speed
         * @param {number} [tool] tool
         */
        function layerPush(point, emit, speed, tool) {
            layerOut.mode = lastMode;
            addOutput(layerOut, point, emit, speed, tool);
            return point;
        }

        function camDwell(time) {
            layerPush(
                null,
                0,
                time,
                tool.getNumber()
            );
        }

        function camOut(point, cut, moveLen = toolDiamMove) {
            point = point.clone();
            point.x += wmx;
            point.y += wmy;
            point.z += zadd;

            if (nextIsMove) {
                cut = 0;
                nextIsMove = false;
            }

            let rate = feedRate;

            // before first point, move cutting head to point above it
            // then set that new point as the lastPoint
            if (!lastPoint) {
                let above = point.clone().setZ(zmax + zadd + ztOff);
                lastPoint = layerPush(above, 0, 0, tool.getNumber());
            }

            // measure deltas to last point in XY and Z
            let deltaXY = lastPoint.distTo2D(point),
                deltaZ = point.z - lastPoint.z,
                absDeltaZ = Math.abs(deltaZ),
                isMove = !cut;

            // drop points too close together
            if (deltaXY < 0.001 && point.z === lastPoint.z) {
                // console.trace(["drop dup",lastPoint,point]);
                return;
            }

            // convert short planar moves to cuts in some cases
            if (isMove && deltaXY <= moveLen) {
                let iscontour = tolerance > 0;
                let isflat = absDeltaZ < 0.001;
                // restrict this to contouring
                if (isflat || (iscontour && absDeltaZ <= tolerance)) {
                    cut = 1;
                    isMove = false;
                } else if (deltaZ <= -tolerance) {
                    // move over before descending
                    layerPush(point.clone().setZ(lastPoint.z), 0, 0, tool.getNumber());
                    // new pos for plunge calc
                    deltaXY = 0;
                }
            } else if (isMove) {
                // for longer moves, check the terrain to see if we need to go up and over
                const bigXY = (deltaXY > moveLen);
                const bigZ = (deltaZ > toolDiam/2 && deltaXY > tolerance);
                const midZ = (absDeltaZ >= tolerance);
                if ((bigXY || bigZ) && (isMove || midZ)) {
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
                        ) + ztOff,
                        mustGoUp = Math.max(maxz - point.z, maxz - lastPoint.z) >= tolerance,
                        clearz = maxz;
                    // up if any point between higher than start/outline, go up first
                    if (mustGoUp) {
                        layerPush(lastPoint.clone().setZ(clearz), 0, 0, tool.getNumber());
                    }
                    // move to point above target point
                    if (mustGoUp || point.z < maxz) {
                        layerPush(point.clone().setZ(clearz), 0, 0, tool.getNumber());
                        // new pos for plunge calc
                        deltaXY = 0;
                    }
                }
            }

            // set new plunge rate
            if (deltaZ < -tolerance) {
                let threshold = Math.min(deltaXY / 2, absDeltaZ),
                    modifier = threshold / absDeltaZ;
                if (synthPlunge && threshold && modifier && deltaXY > tolerance) {
                    // use modifier to speed up long XY move plunge rates
                    rate = Math.round(plungeRate + ((feedRate - plungeRate) * modifier));
                } else {
                    rate = plungeRate;
                }
            }

            // todo synthesize move speed from feed / plunge accordingly
            layerOut.mode = lastMode;
            layerOut.spindle = spindle;
            lastPoint = layerPush(
                point,
                cut ? 1 : 0,
                rate,
                tool.getNumber()
            );
        }

        // coming from a previous widget, use previous last point
        lastPoint = firstPoint;

        // make top start offset configurable
        printPoint = firstPoint || origin;

        // accumulated data for depth-first optimiztions
        let depthData = {
            rough: [],
            outline: [],
            roughDiam: 0,
            outlineDiam: 0,
            contourx: [],
            contoury: [],
            trace: [],
            drill: [],
            layer: 0,
        };

        let ops = {
            setTool,
            setDrill,
            setSpindle,
            setTolerance,
            setPrintPoint,
            printPoint,
            newLayer,
            camOut,
            polyEmit,
            poly2polyEmit,
            tip2tipEmit,
            depthRoughPath,
            depthOutlinePath,
            emitDrills,
            emitTrace,
            bounds,
            zmax,
            lastPoint: () => { return lastPoint }
        };

        let opSum = 0;
        let opTot = widget.camops.map(op => op.weight()).reduce((a,v) => a + v);

        for (let op of widget.camops) {
            setTolerance(0);
            nextIsMove = true;
            lastMode = op.op.type;
            let weight = op.weight();
            op.prepare(ops, (progress, message) => {
                onupdate((opSum + (progress * weight)) / opTot, message || op.type());
            });
            opSum += weight;
        }

        function emitTrace(slice) {
            let { tool, rate, plunge } = slice.camTrace;
            setTool(tool, rate, plunge);
            let traceTool = new CAM.Tool(settings, tool);
            let traceToolDiam = traceTool.fluteDiameter();
            printPoint = poly2polyEmit(slice.camLines, printPoint, polyEmit);
            newLayer();
        }

        function polyEmit(poly, index, count, fromPoint) {
            let last = null;
            if (easeDown && poly.isClosed()) {
                last = poly.forEachPointEaseDown(function(point, offset) {
                    camOut(point.clone(), offset > 0);
                }, fromPoint);
            } else {
                poly.forEachPoint(function(point, pidx, points, offset) {
                    last = point;
                    camOut(point.clone(), offset !== 0);
                }, poly.isClosed(), index);
            }
            newLayer();
            return last;
        }

        function depthRoughPath(start, depth, levels, tops, emitter, fit, ease) {
            let level = levels[depth];
            if (!level) {
                return start;
            }
            let ltops = tops[depth];
            let fitted = fit ? ltops.filter(poly => poly.isInside(fit, 0.01)) : ltops;
            let ftops = fitted.filter(top => !top.level_emit);
            if (ftops.length > 1) {
                ftops = POLY.route(ftops, start);
            }
            ftops.forEach(top => {
                top.level_emit = true;
                let inside = level.filter(poly => poly.isInside(top));
                if (ease) {
                    start.z += ease;
                }
                start = poly2polyEmit(inside, start, emitter, { mark: "emark", perm: true });
                if (ease) {
                    start.z += ease;
                }
                start = depthRoughPath(start, depth + 1, levels, tops, emitter, top, ease);
            });
            return start;
        }

        function depthOutlinePath(start, depth, levels, radius, emitter, clr, ease) {
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
                fromPoint = depthOutlinePath(fromPoint, depth + 1, levels, radius, emitter, clr, ease);
                return fromPoint;
            }, {weight: true});
            return start;
        }

        // last layer/move is to zmax
        // injected into the last layer generated
        if (lastPoint)
        addOutput(newOutput[newOutput.length-1], printPoint = lastPoint.clone().setZ(zmax_outer), 0, 0, tool.getNumber());

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

})();
