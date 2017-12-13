/** Copyright 2014-2017 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_print = exports;

(function() {

    if (!self.kiri) self.kiri = {};

    var KIRI = self.kiri,
        DRIVERS = KIRI.driver,
        CAM = DRIVERS.CAM,
        FDM = DRIVERS.FDM,
        LASER = DRIVERS.LASER,
        BASE = self.base,
        UTIL = BASE.util,
        DBUG = BASE.debug,
        POLY = BASE.polygons,
        SQRT = Math.sqrt,
        PI = Math.PI,
        PRO = Print.prototype,
        Polygon = BASE.Polygon,
        newPoint = BASE.newPoint,
        lastPoint = null,
        lastEmit = null;

    KIRI.newPrint = function(settings, widgets, id) { return new Print(settings, widgets, id) };

    /**
     * @param {Object} settings
     * @param {Widget[]} widgets
     * @constructor
     */
    function Print(settings, widgets, id) {
        this.id = id || new Date().getTime().toString(36);
        this.settings = settings;
        this.widgets = widgets;
        this.group = new THREE.Group();
        this.layerView = [];

        this.time = 0;
        this.lines = 0;
        this.bytes = 0;
        this.output = [];
        this.distance = 0;
        this.bounds = null;
    }

    PRO.addOutput = addOutput;
    PRO.tip2tipEmit = tip2tipEmit;
    PRO.extrudePerMM = extrudePerMM;
    PRO.constReplace = constReplace;
    PRO.poly2polyEmit = poly2polyEmit;
    PRO.addPrintPoints = addPrintPoints;
    PRO.poly2polyDepthFirstEmit = poly2polyDepthFirstEmit;

    PRO.parseGCode = function(gcode, offset) {
        var lines = gcode
            .toUpperCase()
            .replace("X", " X")
            .replace("Y", " Y")
            .replace("Z", " Z")
            .replace("E", " E")
            .replace("F", " F")
            .replace("  ", " ")
            .split("\n");

        var scope = this,
            output = scope.output = [],
            bounds = scope.bounds = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            },
            seq = [],
            move = false,
            E0G0 = false,
            G0 = function() {
                move = true;
                if (seq.length > 0) {
                    output.push(seq);
                    seq = [];
                }
            },
            LZ = 0.0,
            pos = {
                X: 0.0,
                Y: 0.0,
                Z: 0.0,
                F: 0.0,
                E: 0.0
            },
            off = {
                x: offset ? offset.x || 0 : 0,
                y: offset ? offset.y || 0 : 0,
                z: offset ? offset.z || 0 : 0
            };

        lines.forEach(function(line) {
            line = line.split(";")[0].split(" ");
            if (line.length < 2) return;
            switch (line.shift()) {
                case 'G0':
                    G0();
                case 'G1':
                    line.forEach(function(tok) {
                        pos[tok.charAt(0)] = parseFloat(tok.substring(1));
                    });
                    if (pos.X) bounds.min.x = Math.min(bounds.min.x, pos.X);
                    if (pos.X) bounds.max.x = Math.max(bounds.max.x, pos.X);
                    if (pos.Y) bounds.min.y = Math.min(bounds.min.y, pos.Y);
                    if (pos.Y) bounds.max.y = Math.max(bounds.max.y, pos.Y);
                    if (pos.Z) bounds.min.z = Math.min(bounds.min.z, pos.Z);
                    if (pos.Z) bounds.max.z = Math.max(bounds.max.z, pos.Z);
                    if (pos.E) E0G0 = true;
                    if (E0G0 && pos.E === 0.0) {
                        if (LZ != pos.Z) G0();
                        else move = true;
                    }
                    addOutput(
                        seq,
                        {x:pos.X + off.x, y:pos.Y + off.y, z:pos.Z + off.z},
                        !move,
                        pos.F
                    );
                    break;
                case 'M6':
                    break;
            }
            move = false;
            pos.E = 0.0;
            LZ = pos.Z;
        });

        G0();

        scope.lines = lines.length;
        scope.bytes = gcode.length;
    };

    PRO.setup = function(remote, onupdate, ondone) {
        var scope = this,
            settings = scope.settings,
            mode = settings.mode;

        if (remote) {

            // executed from kiri.js
            KIRI.work.printSetup(settings, function(reply) {
                if (reply.done) {
                    scope.output = reply.output;
                    ondone();
                } else {
                    onupdate(reply.update, reply.updateStatus)
                }
            });

        } else {

            // executed from kiri-worker.js
            var driver = KIRI.driver[mode];
            if (driver) driver.printSetup(scope, onupdate);
            else console.log({missing_print_driver: mode});
            ondone();

        }
    };

    PRO.exportGCode = function(remote, ondone, online) {
        var scope = this,
            settings = scope.settings,
            mode = settings.mode;

        if (remote) {

            // executed from kiri.js
            KIRI.work.printGCode(function(reply) {
                scope.lines = reply.lines;
                scope.bytes = reply.bytes;
                scope.bounds = reply.bounds;
                scope.distance = reply.distance;
                scope.time = reply.time;
                ondone(reply.gcode);
            });
            return;

        } else {

            // executed from kiri-worker.js
            var driver = KIRI.driver[mode];
            if (driver && driver.printExport) {
                ondone(driver.printExport(scope, online));
            } else {
                console.log({missing_export_driver: mode});
                ondone(null);
            }

        }
    };

    PRO.exportLaserGCode = function() {
        return KIRI.driver.LASER.exportGCode(this);
    };

    PRO.exportSVG = function(cut_color) {
        return KIRI.driver.LASER.exportSVG(this, cut_color);
    };

    PRO.exportDXF = function() {
        return KIRI.driver.LASER.exportDXF(this);
    };

    PRO.encodeOutput = function() {
        var newout = [], newlayer;

        this.output.forEach(function(layerout) {
            newlayer = [];
            newout.push(newlayer);
            layerout.forEach(function(out) {
                if (out.point) {
                    // used for presentation only. can drop non-essential
                    // data to speed up worker -> browser transfer
                    newlayer.push({
                        emit: out.emit,
                        speed: out.speed,
                        // retract: out.retract,
                        point: {x: out.point.x, y: out.point.y, z: out.point.z}
                    });
                }
            });
        });
        return newout;
    };

    PRO.render = function() {
        var scope = this,
            mode = scope.settings.mode;

        switch (mode) {
            case 'CAM':
            case 'FDM':
                scope.renderMoves(true, 0x777777);
                break;
            case 'LASER':
                scope.renderMoves(false, 0x0088aa);
                break;
        }
    };

    // hsv values all = 0 to 1
    function hsv2rgb(hsv) {
        var seg  = Math.floor(hsv.h * 6);
        var rem  = hsv.h - (seg * (1/6));
        var out = {};

        var p = hsv.v * (1.0 - (hsv.s)              );
        var q = hsv.v * (1.0 - (hsv.s * rem)        );
        var t = hsv.v * (1.0 - (hsv.s * (1.0 - rem)));

        switch (seg) {
            case 0:
                out.r = hsv.v;
                out.g = t;
                out.b = p;
                break;
            case 1:
                out.r = q;
                out.g = hsv.v;
                out.b = p;
                break;
            case 2:
                out.r = p;
                out.g = hsv.v;
                out.b = t;
                break;
            case 3:
                out.r = p;
                out.g = q;
                out.b = hsv.v;
                break;
            case 4:
                out.r = t;
                out.g = p;
                out.b = hsv.v;
                break;
            case 5:
                out.r = hsv.v;
                out.g = p;
                out.b = q;
                break;
        }

        return out;
    }

    PRO.renderMoves = function(showMoves, moveColor) {
        var scope = this, last, view;
        // render layered output
        scope.lines = 0;
        scope.output.forEach(function(layerout) {
            var move = [], print = {}, z;
            layerout.forEach(function(out, index) {
                if (last) {
                    if (UTIL.distSq(last, out.point) < 0.001 && out.point.z === last.z) {
                        return;
                    }
                    if (out.emit > 0) {
                        var spd = out.speed || 4000;
                        var arr = print[spd] || [];
                        print[spd] = arr;
                        arr.push(last);
                        arr.push(out.point);
                    } else {
                        move.push(last);
                        move.push(out.point);
                    }
                } else {
                    if (out.emit) DBUG.log("first point is emit");
                    z = out.point.z;
                }
                last = out.point;
            });
            view = KIRI.newLayer(scope.group);
            scope.layerView.push(view);
            if (showMoves) view.lines(move, moveColor);
            for (var speed in print) {
                var sint = Math.min(6000, parseInt(speed));
                var rgb = hsv2rgb({h:sint/6000, s:1, v:0.6});
                view.lines(print[speed],
                    ((rgb.r * 0xff) << 16) |
                    ((rgb.g * 0xff) <<  8) |
                    ((rgb.b * 0xff) <<  0)
                );
            }
            view.render();
            scope.lines += print.length;
        });
    }

    PRO.getLayerCount = function() {
        return this.output.length;
    }

    PRO.hide = function() {
        this.layerView.forEach(function(layer) {
            layer.setVisible(false);
        })
    };

    PRO.showLayer = function(index, show) {
        if (this.layerView[index]) this.layerView[index].setVisible(show);
    };

    /**
     * @constructor
     */
    function Output(point, emit, speed, tool) {
        this.point = point; // point to emit
        this.emit = emit; // emit (feed for printers, power for lasers, cut for cam)
        this.speed = speed;
        this.tool = tool;
    }

    /**
     * @param {Point[]} array of points
     * @param {Point} point
     * @param {number} emit (0=move, !0=filament emit/laser on/cut mode)
     * @param {number} [speed] speed
     * @param {number} [tool] tool
     */
    function addOutput(array, point, emit, speed, tool) {
        // drop duplicates (usually intruced by FDM bisections)
        if (lastPoint && point.x == lastPoint.x && point.y == lastPoint.y && point.z == lastPoint.z && lastEmit == emit) {
            return;
        }
        // if (lastPoint && UTIL.round(point.x,4) == UTIL.round(lastPoint.x,4) && UTIL.round(point.y,4) == UTIL.round(lastPoint.y,4)) {
        //     console.log(({dup:point, last:lastPoint}));
        // }
        lastPoint = point;
        lastEmit = emit;
        array.push(new Output(point, emit, speed, tool));
    }

    /**
     * FDM only. add points in polygon to an output array (print path)
     *
     * @param {Polygon} poly
     * @param {Point} startPoint
     * @param {Array} output
     * @param {number} [extrude] multiplier
     * @param {Function} [onfirst] optional fn to call on first point
     * @return {Point} last output point
     */
    PRO.polyPrintPath = function(poly, startPoint, output, extrude, onfirst) {
        poly.setClockwise();

        var closest = poly.findClosestPointTo(startPoint),
            first = true,
            settings = this.settings,
            shellMult = extrude || settings.process.outputShellMult,
            shellSpeed = settings.process.outputFinishrate || 0;

        poly.forEachPoint(function(point) {
            if (first) {
                if (onfirst) onfirst(point);
                // move from startPoint to point
                addOutput(output, point, 0, 0);
                first = false;
            } else {
                addOutput(output, point, shellMult, poly.depth == 0 ? shellSpeed : 0);
            }
        }, true, closest.index);

        return output[output.length - 1].point;
    };

    /**
     * FDM only. create 3d print output path for this slice
     *
     * @parma {Slice} slice
     * @param {Point} startPoint start as close as possible to startPoint
     * @param {THREE.Vector3} offset
     * @param {Point[]} output points
     * @param {Number} layer from 0 to # of layers (slices) in model
     * @return {Point} last output point
     */
    PRO.slicePrintPath = function(slice, startPoint, offset, output, layer) {
        var i,
            preout = [],
            scope = this,
            settings = this.settings,
            process = settings.process,
            nozzle = settings.device.nozzleSize,
            minSeek = nozzle * 1.5,
            thinWall = nozzle * 1.75,
            fillSkip = nozzle * 3,
            fillMult = process.outputFillMult,
            shellMult = process.outputShellMult || (process.laserSliceHeight >= 0 ? 1 : 0),
            sparseMult = process.outputSparseMult,
            wipeDistance = process.outputWipeDistance,
            wipeSpeed = process.outputWipeSpeed || 20,
            origin = startPoint.add(offset),
            z = slice.z;

        function retract() {
            if (preout.length) preout.last().retract = true;
        }

        function outputWipe(poly) {
            if (!poly) return;

            var closest = poly.findClosestPointTo(startPoint),
                distance = wipeDistance,
                last = startPoint,
                steps = 0;

            if (!distance) return;

            while (distance > 0) poly.forEachPoint(function(point) {
                if (distance > 0) {
                    var len = last.distTo2D(point);
                    if (len > distance) {
                        addOutput(preout, point.offsetPointFrom(last, distance), 0, wipeSpeed);
                        distance = 0;
                    } else {
                        addOutput(preout, point, 0, wipeSpeed);
                        distance -= last.distTo2D(point);
                    }
                    last = point;
                    if (steps++ === 0) retract();
                }
            }, true, closest.index);

            startPoint = preout[preout.length - 1].point;
        }

        function outputTraces(poly, bounds, last) {
            if (!poly) return;
            if (Array.isArray(poly)) {
                var lastPoly = null;
                outputOrderClosest(poly, function(next) {
                    outputTraces(next, bounds, lastPoly);
                    lastPoly = next;
                });
            } else {
                startPoint = scope.polyPrintPath(poly, startPoint, preout, shellMult, function(point) {
                    if (startPoint.distTo2D(point) > fillSkip) {
                        if (last) {
                            outputWipe(last)
                        } else {
                            retract();
                        }
                    }
                    checkBisect(startPoint, point, bounds);
                });
            }
        }

        function checkBisect(p1, p2, bounds) {
            if (!bounds || p1.distTo2D(p2) < minSeek) return;
            var routes = [];
            // find bisections and choose shortest
            bounds.forEach(function(bp) {
                var paths = bp.bisect(p1, p2);
                if (!paths || paths.length !== 2) return;
                var path = paths[0].perimeter() < paths[1].perimeter() ? paths[0] : paths[1];
                if (p1.distTo2D(path.first() > p1.distTo2D(path.last()))) path.reverse();
                // cull phantom and short paths
                if (path.perimeter() > 0.1) routes.push(path);
            });
            // sort bisecting paths by those closest to start point (p1)
            routes.sort((function(o1, o2) {
                var d1 = Math.min(
                    o1.first().distTo2D(p1),
                    o1.last().distTo2D(p1)
                );
                var d2 = Math.min(
                    o2.first().distTo2D(p1),
                    o2.last().distTo2D(p1)
                );
                return d1 - d2;
            }));
            // output non-printing bisecting paths
            routes.forEach(function(path) {
                path.forEachPoint(function(p) {
                    addOutput(preout, p, 0);
                });
            });
        }

        /**
         * @param {Polygon[]} polys
         */
        function outputSparse(polys, bounds) {
            if (!polys) return;
            var proxy = polys.map(function(poly) {
                return {poly: poly, first: poly.first(), last: poly.last()};
            });
            var lp = startPoint;
            startPoint = tip2tipEmit(proxy, startPoint, function(el, point, count) {
                var poly = el.poly;
                if (poly.last() === point) poly.reverse();
                poly.forEachPoint(function(p, i) {
                    if (i === 0 && lp) checkBisect(lp, p, bounds);
                    addOutput(preout, p, i === 0 ? 0 : sparseMult);
                    lp = p;
                });
            });
        }

        function outputFills(lines, bounds) {
            var mindist, p1, p2, dist, point, find, find2, list, len, lastout, pass = 0;
            while (lines) {
                list = [];
                mindist = Infinity;
                // order all points by distance to last point
                for (i=0; i<lines.length; i++) {
                    point = lines[i];
                    if (point.del) continue;
                    dist = startPoint.distTo2D(point);
                    list.push({i:i, p:point, d:dist});
                }
                if (list.length > 0) {
                    list.sort(function(a,b) { return a.d - b.d });
                    find = list[0];
                    find2 = list[4] || list[3] || list [2] || list[1];

                    // do 2nd closest fill lines within bigger fill areas
                    // if (layer === 0 && pass > 0 && find2 && lastout === 2 && len > thinWall) {//} && find2.d <= fillSkip) {
                    //     find = find2;
                    // }

                    // order segment by closest to farthest point
                    if (find.i % 2 === 0) {
                        p1 = find.p;
                        p2 = lines[find.i + 1];
                    } else {
                        p1 = find.p;
                        p2 = lines[find.i - 1];
                    }

                    // mark as used (temporary)
                    p1.del = true;
                    p2.del = true;
                    dist = startPoint.distTo2D(p1);
                    len = p1.distTo2D(p2);

                    // if dist to new segment is less than thinWall
                    // and segment length is less than thinWall then
                    // just extrude to midpoint of next segment. this is
                    // to avoid shaking printer to death.
                    if (find.d <= thinWall && len <= thinWall) {
                        p2 = p1.midPointTo(p2);
                        addOutput(preout, p2, fillMult * (find.d / thinWall));
                        lastout = 1;
                    } else {
                        // check for intersection with bounds and if found
                        // follow the shortest path around that bounding poly
                        if (bounds && startPoint && dist > minSeek) {
                            checkBisect(startPoint, p1, bounds);
                        }

                        addOutput(preout, p1, 0);
                        addOutput(preout, p2, fillMult);
                        lastout = 2;
                    }

                    startPoint = p2;
                } else {
                    break;
                }
                pass++;
            }
            // clear delete marks so we can re-print later
            if (lines) lines.forEach(function(p) { p.del = false });
        }

        /**
         * given array of polygons, emit them in next closest order
         * @param {Array} array of Polygon or Polygon wrappers
         * @param {Function} fn
         * @param {Function} fnp convert 'next' object into a Polygon
         */
        function outputOrderClosest(array, fn, fnp) {
            array = array.slice();
            var closest, find, next, poly;
            for (;;) {
                closest = null;
                for (i=0; i<array.length; i++) {
                    next = array[i];
                    if (!next) continue;
                    poly = fnp ? fnp(next) : next;
                    find = poly.findClosestPointTo(startPoint);
                    if (!closest || find.distance < closest.distance) {
                        closest = find;
                        closest.i = i;
                        closest.next = next;
                    }
                }
                if (!closest) return;
                array[closest.i] = null;
                fn(closest.next);
            }
        }

        var all = [].appendAll(slice.supports || []).appendAll(slice.tops || []);
        var wipe = null;
        var lastTop = null;
        outputOrderClosest(all || [], function(next) {
            if (next instanceof Polygon) {
                // support polygon
                next.setZ(z);
                outputTraces([next].appendAll(next.inner || []));
                if (next.fills) {
                    next.fills.forEach(function(p) { p.z = z });
                    outputFills(next.fills, next.inner);
                }
                // lastTop = null;
            } else {
                if (lastTop && lastTop !== next && wipe) {
                    outputWipe(wipe);
                    wipe = null;
                }
                // top object
                var bounds = POLY.flatten(next.gatherOuter([]));
                outputTraces([].appendAll(next.traces).appendAll(next.innerTraces() || []), bounds);
                outputFills(next.fill_lines, bounds);
                outputSparse(next.fill_sparse, bounds);
                if (next.inner) {
                    wipe = next.inner.last();
                    // best to use inner offset for wipe
                    // outputWipe(next.inner.last());
                } else {
                    wipe = next.traces.last();
                    // otherwise fall back to innermost trace
                    // outputWipe(next.traces.last());
                }
                lastTop = next;
            }
        }, function(obj) {
            return obj instanceof Polygon ? obj : obj.poly;
        });

        // offset print points
        for (i=0; i<preout.length; i++) {
            preout[i].point = preout[i].point.add(offset);
        }

        // add offset points to total print
        addPrintPoints(preout, output, origin);

        return startPoint.add(offset);
    };

    /**
     *
     * @param {Output[]} input
     * @param {Point[]} output
     * @param {Point} [startPoint]
     */
    function addPrintPoints(input, output, startPoint) {
        if (startPoint && input.length > 0) {
            addOutput(output, startPoint, 0);
        }
        output.appendAll(input);
    }

    /**
     * emit each element in an array based on
     * the next closest endpoint.
     * todo replace outputFills() with this
     */
    function tip2tipEmit(array, startPoint, emitter) {
        var mindist, dist, found, count = 0;

        for (;;) {
            found = null;
            mindist = Infinity;
            array.forEach(function(el) {
                if (el.delete) return;
                dist = startPoint.distTo3D(el.first);
                if (dist < mindist) {
                    found = {el:el, first:el.first, last:el.last};
                    mindist = dist;
                }
                dist = startPoint.distTo3D(el.last);
                if (dist < mindist) {
                    found = {el:el, first:el.last, last:el.first};
                    mindist = dist;
                }
            });
            if (found) {
                found.el.delete = true;
                startPoint = found.last;
                emitter(found.el, found.first, ++count);
            } else {
                break;
            }
        }

        return startPoint;
    }

    /**
     * like tip2tipEmit but accepts an array of
     * polygons and the next closest point can
     * be anywhere in the adjacent polygon
     */
    function poly2polyEmit(array, startPoint, emitter) {
        var mindist, dist, found, count = 0;
        for (;;) {
            found = null;
            mindist = Infinity;
            array.forEach(function(poly) {
                if (poly.delete) return;
                if (poly.isOpen()) {
                    const d2f = startPoint.distTo2D(poly.first());
                    const d2l = startPoint.distTo2D(poly.first());
                    if (d2f > mindist && d2l > mindist) return;
                    if (d2l < mindist && d2l < d2f) {
                        poly.reverse();
                        found = {poly:poly, index:0, point:poly.first()};
                    } else if (d2f < mindist) {
                        found = {poly:poly, index:0, point:poly.first()};
                    }
                    return;
                }
                poly.forEachPoint(function(point, index) {
                    dist = startPoint.distTo3D(point);
                    if (dist < mindist) {
                        found = {poly:poly, index:index, point:point};
                        mindist = dist;
                    }
                });
            });
            if (found) {
                found.poly.delete = true;
                startPoint = emitter(found.poly, found.index, ++count, startPoint) || found.point;
            } else {
                break;
            }
        }

        // undo delete marks
        array.forEach(function(poly) { poly.delete = false });

        return startPoint;
    }

    /**
     * @param {Polygon[][]} array of array of polygons representing each layer (top down)
     * @param {Point} startPoint entry point for algorithm
     * @param {Function} emitter called to emit each polygon
     * @param {number} offset tool diameter used for this depth-first cut
     *
     * used for CAM depth first layer output
     */
    function poly2polyDepthFirstEmit(array, startPoint, emitter, offset) {
        var layers = [],
            pools;

        array.forEach(function(layerPolys, layerIndex) {
            pools = [];
            layers.push(pools);

            // flattening but preserving inner relationships
            // allows iterating over all layer polys to determine
            // if they deserve their own pool
            flattenPolygons(POLY.nest(layerPolys, true, true)).sort(function(p1,p2) {
                // sort by area descending
                return p2.area() - p1.area();
            }).forEach(function (poly) {
                // a polygon should be made into a pool if:
                // - it is open
                // - it has more than one sibling
                // - it has no parent (top/outer most)
                // - it is offset from its parent by more than diameter
                if (poly.isOpen() || !poly.parent || poly.parent.innerCount() > 1 || !polygonWithinOffset(poly, poly.parent, offset)) {
                    pools.push(poly);
                    poly.pool = [];
                    poly.poolsDown = [];
                } else {
                    // otherwise walk up the parent tree to find a pool to join
                    var search = poly.parent;
                    // walk up until pool found
                    while (search && !search.pool) {
                        search = search.parent;
                    }
                    // open polygons can be unparented and without a pool
                    if (!search) {
                        console.log({orphan:poly});
                        return;
                    }
                    // add to pool
                    search.pool.push(poly);
                }
            });

            // sort pools increasing in size to aid fitting from below
            pools.sort(function (p1, p2) {
                return p1.area() - p2.area();
            });

            // add add pools to smallest enclosing pool in layer above
            const poolsAbove = layers[layerIndex - 1];

            if (layerIndex > 0)
            pools.forEach(function(pool) {
                for (var i=0; i<poolsAbove.length; i++) {
                    const above = poolsAbove[i];
                    // can only add open polys to open polys
                    if (above.isOpen() && pool.isClosed()) {
                        // console.log({skip_open_above:above});
                        continue;
                    }
                    // if pool fits into smallest above pool, add it and break
                    if (polygonFitsIn(pool, above, 0.1)) {
                        above.poolsDown.push(pool);
                        return;
                    }
                }
            });
        });

        const emitPool = function(poolPoly) {
            if (poolPoly.mark) return;
            poolPoly.mark = true;
            const polys = poolPoly.pool.slice().append(poolPoly);
            startPoint = poly2polyEmit(polys, startPoint, emitter);
            poolPoly.poolsDown.forEach(function(downPool) {
                emitPool(downPool);
            });
        };

        // from the top layer, iterate and descend through all connected pools
        // pools are sorted smallest to largest. pools are polygons with an
        // attached 'pool' array of polygons
        layers.forEach(function(pools) {
            pools.forEach(function(poolPoly) {
                emitPool(poolPoly);
            });
        })
        return startPoint;
    }

    /**
     * flatten deeply nested polygons preserving inner arrays
     *
     * @param {Polygon | Polygon[]} poly or array to flatten
     * @param {Polygon[]} to
     * @returns {Polygon[]}
     */
    function flattenPolygons(poly, to) {
        if (!poly) return;
        if (!to) to = [];
        if (Array.isArray(poly)) {
            poly.forEach(function(p) {
                flattenPolygons(p, to);
            })
        } else {
            to.push(poly);
            flattenPolygons(poly.inner, to);
        }
        return to;
    }

    function polygonFitsIn(inside, outside, tolerance) {
        return inside.isInside(outside, tolerance);
        // return inside.area() <= outside.area() + tolerance &&
        //     (polygonWithinOffset(inside, outside, tolerance) || inside.isInside(outside, tolerance));
    }

    function polygonWithinOffset(poly1, poly2, offset) {
        return polygonMinOffset(poly1, poly2, offset) <= offset;
    }

    function polygonMinOffset(poly1, poly2, offset) {
        var mindist = Infinity;
        poly1.forEachPoint(function(p) {
            const nextdist = p.distToPolySegments(poly2, offset);
            mindist = Math.min(mindist, nextdist);
            // returning true terminates forEachPoint()
            if (mindist <= offset) return true;
        });
        return mindist;
    }

    /**
     * @param noz nozzle diameter
     * @param fil filament diameter
     * @param slice height in mm
     * @returns filament extruded per mm
     */
    function extrudePerMM(noz, fil, slice) {
        return ((PI * UTIL.sqr(noz/2)) /
            (PI * UTIL.sqr(fil/2))) *
            (slice / noz);
    }

    function constOp(tok, consts, opch, op) {
        var pos, v1, v2;
        if ((pos = tok.indexOf(opch)) > 0) {
            v1 = consts[tok.substring(0,pos)] || 0;
            v2 = parseInt(tok.substring(pos+1)) || 0;
            return op(v1,v2);
        } else {
            return null;
        }
    }

    function constReplace(str, consts, start) {
        var cs = str.indexOf("{", start || 0),
            ce = str.indexOf("}", cs),
            tok, nutok, nustr;
        if (cs >=0 && ce > cs) {
            tok = str.substring(cs+1,ce);
            nutok =
                constOp(tok, consts, "-", function(v1,v2) { return v1-v2 }) ||
                constOp(tok, consts, "+", function(v1,v2) { return v1+v2 }) ||
                constOp(tok, consts, "/", function(v1,v2) { return v1/v2 }) ||
                constOp(tok, consts, "*", function(v1,v2) { return v1*v2 }) ||
                consts[tok] || 0;
            nustr = str.replace("{"+tok+"}",nutok);
            return constReplace(nustr, consts, ce+1+(nustr.length-str.length));
        } else {
            return str;
        }
    }

})();
