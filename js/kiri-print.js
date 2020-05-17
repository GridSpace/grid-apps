/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_print = exports;

(function() {

    if (!self.kiri) self.kiri = {};

    let KIRI = self.kiri,
        DRIVERS = KIRI.driver,
        LASER = DRIVERS.LASER,
        CAM = DRIVERS.CAM,
        FDM = DRIVERS.FDM,
        BASE = self.base,
        UTIL = BASE.util,
        DBUG = BASE.debug,
        POLY = BASE.polygons,
        SQRT = Math.sqrt,
        SQR = UTIL.sqr,
        PI = Math.PI,
        PRO = Print.prototype,
        Polygon = BASE.Polygon,
        newPoint = BASE.newPoint,
        lastPoint = null,
        lastEmit = null;

    KIRI.newPrint = function(settings, widgets, id) {
        return new Print(settings, widgets, id);
    };

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
        this.printView = [];
        this.movesView = [];

        this.time = 0;
        this.lines = 0;
        this.bytes = 0;
        this.output = [];
        this.distance = 0;
        this.bounds = null;
        this.imported = null;
    }

    PRO.addOutput = addOutput;
    PRO.tip2tipEmit = tip2tipEmit;
    PRO.extrudePerMM = extrudePerMM;
    PRO.constReplace = constReplace;
    PRO.poly2polyEmit = poly2polyEmit;
    PRO.addPrintPoints = addPrintPoints;
    PRO.poly2polyDepthFirstEmit = poly2polyDepthFirstEmit;

    PRO.parseSVG = function(code, offset) {
        let scope = this,
            svg = new DOMParser().parseFromString(code, 'text/xml'),
            lines = [...svg.getElementsByTagName('polyline')],
            output = scope.output = [],
            bounds = scope.bounds = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            };
        lines.forEach(line => {
            let seq = [];
            let points = [...line.points];
            points.forEach(point => {
                if (offset) {
                    point.x += offset.x;
                    point.y += offset.y;
                }
                if (point.x) bounds.min.x = Math.min(bounds.min.x, point.x);
                if (point.x) bounds.max.x = Math.max(bounds.max.x, point.x);
                if (point.y) bounds.min.y = Math.min(bounds.min.y, point.y);
                if (point.y) bounds.max.y = Math.max(bounds.max.y, point.y);
                if (point.z) bounds.min.z = Math.min(bounds.min.z, point.z);
                if (point.z) bounds.max.z = Math.max(bounds.max.z, point.z);
                addOutput(seq, point, seq.length > 0);
            });
            output.push(seq);
        });
        scope.imported = code;
        scope.lines = lines.length;
        scope.bytes = code.length;
    };

    PRO.parseGCode = function(gcode, offset) {
        let lines = gcode
            .toUpperCase()
            .replace("X", " X")
            .replace("Y", " Y")
            .replace("Z", " Z")
            .replace("E", " E")
            .replace("F", " F")
            .replace("  ", " ")
            .split("\n");

        let scope = this,
            output = scope.output = [],
            bounds = scope.bounds = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            },
            seq = [],
            abs = true,
            move = false,
            tool = 0,
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
                X: offset ? offset.x || 0 : 0,
                Y: offset ? offset.y || 0 : 0,
                Z: offset ? offset.z || 0 : 0
            },
            xoff = {
                X: 0,
                Y: 0,
                Z: 0
            };

        lines.forEach(function(line) {
            line = line.split(";")[0].split(" ");
            let cmd = line.shift();
            if (cmd.charAt(0) === 'T') {
                let ext = scope.settings.device.extruders;
                let pos = parseInt(cmd.charAt(1));
                if (ext && ext[pos]) {
                    xoff.X = -ext[pos].extOffsetX;
                    xoff.Y = -ext[pos].extOffsetY;
                }
            }
            switch (cmd) {
                case 'G90':
                    // absolute positioning
                    abs = true;
                    break;
                case 'G91':
                    // relative positioning
                    abs = false;
                    break;
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
                        {
                            x:pos.X + off.X + xoff.X,
                            y:pos.Y + off.Y + xoff.Y,
                            z:pos.Z + off.Z + xoff.Z
                        },
                        !move,
                        pos.F,
                        tool
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

        scope.imported = gcode;
        scope.lines = lines.length;
        scope.bytes = gcode.length;
    };

    PRO.setup = function(remote, onupdate, ondone) {
        let scope = this,
            settings = scope.settings,
            mode = settings.mode;

        lastPoint = null;
        lastEmit = null;

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
            let driver = KIRI.driver[mode];
            if (driver) driver.printSetup(scope, onupdate);
            else console.log({missing_print_driver: mode});
            ondone();

        }
    };

    // more generic. only used by SLA at the moment
    PRO.export = function(remote, online, ondone) {
        let driver = KIRI.driver[this.settings.mode];

        if (!(driver && driver.printExport)) {
            console.log({missing_export_driver: mode});
            ondone(null);
            return;
        }

        if (remote) {
            // executed from kiri.js
            KIRI.work.printExport(this.settings, online, ondone);
        } else {
            // executed from kiri-worker.js
            driver.printExport(this, online, ondone);
        }
    };

    PRO.exportGCode = function(remote, ondone, online) {
        let scope = this,
            settings = scope.settings,
            mode = settings.mode;

        if (scope.imported) {
            return ondone(scope.imported);
        }

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
            let driver = KIRI.driver[mode];
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
        let newout = [], newlayer;

        this.output.forEach(function(layerout) {
            newlayer = [];
            newout.push(newlayer);
            layerout.forEach(function(out) {
                if (out.point) {
                    // used for renderMoves client side. can drop non-essential
                    // data to speed up worker -> browser transfer. perhaps a
                    // more compact encoding (arrays, etc)
                    newlayer.push({
                        emit: out.emit,
                        speed: out.speed * 60,
                        retract: out.retract,
                        point: {x: out.point.x, y: out.point.y, z: out.point.z}
                    });
                }
            });
        });

        return newout;
    };

    PRO.render = function() {
        let scope = this,
            settings = scope.settings,
            process = settings.process,
            origin = settings.origin,
            mode = settings.mode,
            driver = KIRI.driver[mode];

        switch (mode) {
            case 'SLA':
                driver.printRender(scope);
                break;
            case 'CAM':
            case 'FDM':
                scope.renderMoves(true, 0x888888);
                break;
            case 'LASER':
                scope.renderMoves(false, 0x0088aa);
                break;
        }
    };

    function pref(a,b) {
        return a !== undefined ? a : b;
    }

    function rgb2hsv(ir, ig, ib) {
        let H = 0,
            S = 0,
            V = 0,
            r = ir / 255,
            g = ig / 255,
            b = ib / 255;

        let minRGB = Math.min(r, Math.min(g, b)),
            maxRGB = Math.max(r, Math.max(g, b));

        // Black-gray-white
        if (minRGB == maxRGB) {
            V = minRGB;
            return [0, 0, V];
        }

        // Colors other than black-gray-white:
        let d = (r == minRGB) ? g - b : ((b == minRGB) ? r - g : b - r),
            h = (r == minRGB) ? 3 : ((b == minRGB) ? 1 : 5);

        H = 60 * (h - d / (maxRGB - minRGB));
        S = (maxRGB - minRGB) / maxRGB;
        V = maxRGB;

        return [H, S, V];
    }

    // hsv values all = 0 to 1
    function hsv2rgb(hsv) {
        let seg  = Math.floor(hsv.h * 6),
            rem  = hsv.h - (seg * (1/6)),
            p = hsv.v * (1.0 - (hsv.s)),
            q = hsv.v * (1.0 - (hsv.s * rem)),
            t = hsv.v * (1.0 - (hsv.s * (1.0 - rem))),
            out = {};

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

    PRO.renderMoves = function(showMoves, moveColor, firstPoint) {
        let debug = KIRI.api.const.LOCAL;
        let scope = this, emits, moves, last = firstPoint;
        // render layered output
        scope.lines = 0;
        scope.output.forEach(function(layerout) {
            let move = [], print = {}, z;
            layerout.forEach(function(out, index) {
                let point = out.point;
                if (last) {
                    if (UTIL.distSq(last, point) < 0.001 && point.z === last.z) {
                        return;
                    }
                    if (out.emit > 0) {
                        let spd = out.speed || 4000;
                        let arr = print[spd] || [];
                        print[spd] = arr;
                        arr.push(last);
                        arr.push(point);
                    } else {
                        move.push(last);
                        move.push(point);
                    }
                    if (debug && showMoves && last.z == point.z) {
                        let rs = BASE.newSlope(
                            {x: point.x, y: point.y},
                            {x: last.x, y: last.y}
                        );
                        let ao1 = BASE.newSlopeFromAngle(rs.angle + 25);
                        let ao2 = BASE.newSlopeFromAngle(rs.angle - 25);
                        let sp = BASE.newPoint(point.x, point.y, point.z);
                        move.push(sp);
                        move.push(sp.projectOnSlope(ao1, 0.5));
                        move.push(sp);
                        move.push(sp.projectOnSlope(ao2, 0.5));
                    }
                } else {
                    z = point.z;
                }
                last = point;
            });
            emits = KIRI.newLayer(scope.group);
            scope.printView.push(emits);
            if (showMoves) {
                moves = KIRI.newLayer(scope.group);
                moves.lines(move, moveColor);
                scope.movesView.push(moves);
                moves.render();
            }
            for (let speed in print) {
                let sint = Math.min(6000, parseInt(speed));
                let rgb = hsv2rgb({h:sint/6000, s:1, v:0.6});
                emits.lines(print[speed],
                    ((rgb.r * 0xff) << 16) |
                    ((rgb.g * 0xff) <<  8) |
                    ((rgb.b * 0xff) <<  0)
                );
            }
            emits.render();
            scope.lines += print.length;
        });
    }

    PRO.getLayerCount = function() {
        return this.output.length;
    }

    PRO.hide = function() {
        this.printView.forEach(function(layer) {
            layer.setVisible(false);
        })
        this.movesView.forEach(function(layer) {
            layer.setVisible(false);
        })
    };

    PRO.showLayer = function(index, show, moves) {
        if (this.printView[index]) this.printView[index].setVisible(show);
        if (this.movesView[index]) this.movesView[index].setVisible(show && moves);
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
     * @param {number} [tool] tool # or nozzle #
     */
    function addOutput(array, point, emit, speed, tool) {
        // drop duplicates (usually intruced by FDM bisections)
        if (lastPoint && point) {
            // nested due to uglify confusing browser
            if (point.x == lastPoint.x && point.y == lastPoint.y && point.z == lastPoint.z && lastEmit == emit) {
                return;
            }
        }
        lastPoint = point;
        lastEmit = emit;
        array.push(new Output(point, emit, speed, tool));
    }

    // function segmentedOutput(output, p1, p2, s1, s2, steps, mult) {
    //     let sd = (s2 - s1) / (steps + 1);
    //     let dd = p1.distTo2D(p2) / steps;
    //     let dist = dd;
    //     let spd = s1;
    //     while (steps-- > 0) {
    //         spd += sd;
    //         p1 = p1.offsetPointTo(p2, dd);
    //         addOutput(output, p1, mult, spd);
    //     }
    // }

    /**
     * FDM & Laser. add points in polygon to an output array (print path)
     *
     * @param {Polygon} poly
     * @param {Point} startPoint
     * @param {Array} output
     * @param {number} [extrude] multiplier
     * @param {Function} [onfirst] optional fn to call on first point
     * @return {Point} last output point
     */
    PRO.polyPrintPath = function(poly, startPoint, output, opt) {
        poly.setClockwise();

        let options = opt || {},
            process = this.settings.process,
            shortDist = process.outputShortDistance,
            shellMult = pref(options.extrude, process.outputShellMult),
            printSpeed = options.rate || process.outputFeedrate,
            moveSpeed = process.outputSeekrate,
            minSpeed = process.outputMinSpeed,
            closest = options.simple ? poly.first() : poly.findClosestPointTo(startPoint),
            perimeter = poly.perimeter(),
            first = true,
            close = !options.open,
            last = startPoint,
            wipeDist = options.wipe || 0,
            coastDist = options.coast || 0,
            tool = options.tool;

        // if short, use calculated print speed based on sliding scale
        if (perimeter < process.outputShortPoly) {
            printSpeed = minSpeed + (printSpeed - minSpeed) * (perimeter / process.outputShortPoly);
        }

        poly.forEachPoint(function(point, pos, points, count) {
            if (first) {
                if (options.onfirst) {
                    options.onfirst(point);
                }
                // move from startPoint to point
                addOutput(output, point, 0, moveSpeed, tool);
                first = false;
            } else {
                let seglen = last.distTo2D(point);
                if (coastDist && shellMult && perimeter - seglen <= coastDist) {
                    let delta = perimeter - coastDist;
                    let offset = seglen - delta;
                    let offPoint = last.offsetPointFrom(point, offset)
                    addOutput(output, offPoint, shellMult, printSpeed, tool);
                    shellMult = 0;
                }
                perimeter -= seglen;
                addOutput(output, point, shellMult, printSpeed, tool);
            }
            last = point;
        }, close, closest.index);

        return output.last().point;
    };

    /**
     * FDM only. create 3d print output path for this slice
     *
     * @parma {Slice} slice
     * @param {Point} startPoint start as close as possible to startPoint
     * @param {THREE.Vector3} offset
     * @param {Point[]} output points
     * @param {Object} [options] object
     * @return {Point} last output point
     */
    PRO.slicePrintPath = function(slice, startPoint, offset, output, options) {
        // console.log({slicePrintPath: slice.index, ext:slice.extruder});

        let i,
            opt = options || {},
            preout = [],
            scope = this,
            settings = this.settings,
            process = settings.process,
            extruder = slice.extruder || 0,
            nozzleSize = settings.device.extruders[extruder].extNozzle,
            firstLayer = opt.first || false,
            minSeek = nozzleSize * (opt.minSeek || 1.5),
            thinWall = nozzleSize * (opt.thinWall || 1.75),
            retractDist = opt.retractOver || 2,
            fillMult = opt.mult || process.outputFillMult,
            shellMult = opt.mult || process.outputShellMult || (process.laserSliceHeight >= 0 ? 1 : 0),
            sparseMult = process.outputSparseMult,
            coastDist = process.outputCoastDist || 0,
            finishSpeed = opt.speed || process.outputFinishrate,
            firstShellSpeed = process.firstLayerRate,
            firstFillSpeed = process.firstLayerFillRate,
            firstPrintMult = process.firstLayerPrintMult,
            printSpeed = opt.speed || (firstLayer ? firstShellSpeed : process.outputFeedrate),
            fillSpeed = opt.speed || opt.fillSpeed || (firstLayer ? firstFillSpeed || firstShellSpeed : process.outputFeedrate),
            moveSpeed = process.outputSeekrate,
            origin = startPoint.add(offset),
            zhop = process.zHopDistance || 0,
            antiBacklash = process.antiBacklash,
            doSupport = opt.support,
            z = slice.z;

        // apply first layer extrusion multipliers
        if (firstLayer) {
            fillMult *= firstPrintMult;
            shellMult *= firstPrintMult;
            sparseMult *= firstPrintMult;
        }

        function retract() {
            if (preout.length) preout.last().retract = true;
        }

        function intersectsTop(p1, p2) {
            let int = false;
            POLY.flatten(slice.gatherTopPolys([])).forEach(function(poly) {
                if (!int) poly.forEachSegment(function(s1, s2) {
                    if (UTIL.intersect(p1,p2,s1,s2,BASE.key.SEGINT)) {
                        int = true;
                        return int;
                    }
                });
            });
            return int;
        }

        function outputTraces(poly, extrude) {
            if (!poly) return;
            if (Array.isArray(poly)) {
                outputOrderClosest(poly, function(next) {
                    outputTraces(next, extrude);
                }, null);
            } else {
                let finishShell = poly.depth === 0 && !firstLayer;
                startPoint = scope.polyPrintPath(poly, startPoint, preout, {
                    tool: extruder,
                    rate: finishShell ? finishSpeed : printSpeed,
                    accel: finishShell,
                    wipe: process.outputWipeDistance || 0,
                    coast: firstLayer ? 0 : coastDist,
                    extrude: pref(extrude, shellMult),
                    onfirst: function(firstPoint) {
                        if (startPoint.distTo2D(firstPoint) > retractDist) {
                            retract();
                        }
                    }
                });
            }
        }

        /**
         * @param {Polygon[]} polys
         */
        function outputSparse(polys, extrude, speed) {
            if (!polys) return;
            let proxy = polys.map(function(poly) {
                return {poly: poly, first: poly.first(), last: poly.last()};
            });
            let lp = startPoint;
            startPoint = tip2tipEmit(proxy, startPoint, function(el, point, count) {
                let poly = el.poly;
                if (poly.last() === point) {
                    poly.reverse();
                }
                poly.forEachPoint(function(p, i) {
                    // retract if dist trigger and crosses a slice top polygon
                    if (i === 0 && lp && lp.distTo2D(p) > retractDist && intersectsTop(lp,p)) {
                        retract();
                    }
                    addOutput(preout, p, i === 0 ? 0 : extrude, speed || printSpeed, extruder);
                    lp = p;
                });
                return lp;
            });
        }

        function outputFills(lines, options) {
            let p, p1, p2, dist, len, found, group, mindist, t1, t2,
                marked = 0,
                start = 0,
                skip = false,
                lastIndex = -1,
                opt = options || {},
                fast = opt.fast || false,
                fill = opt.fill >= 0 ? opt.fill : fillMult;

            while (lines && marked < lines.length) {
                found = false;
                group = null;
                mindist = Infinity;

                // order all points by distance to last point
                for (i=start; i<lines.length; i += 2) {
                    p = lines[i];
                    if (p.del) continue;
                    if (group === null && p.index > lastIndex) {
                        group = p.index;
                    }
                    if (group !== null) {
                        if (p.index !== group) break;
                        if (p.index % 2 === 0) {
                            t1 = lines[i];
                            t2 = lines[i+1];
                        } else {
                            t2 = lines[i];
                            t1 = lines[i+1];
                        }
                        dist = Math.min(t1.distTo2D(startPoint), t2.distTo2D(startPoint));
                        if (dist < mindist) {
                            p1 = t1;
                            p2 = t2;
                            mindist = dist;
                        }
                        start = i;
                        found = true;
                    }
                }

                // go back to start and try again
                if (!found) {
                    if (start === 0 && lastIndex === -1) {
                        console.log('infinite loop', lines, {
                            marked, options, i, group, start, lastIndex,
                            points: lines.map(p => p.index).join(', ')
                        });
                        break;
                    }
                    start = 0;
                    lastIndex = -1;
                    continue;
                }

                dist = startPoint.distTo2D(p1);
                len = p1.distTo2D(p2);

                // go back to start when dist > retractDist
                if (!fast && !skip && dist > retractDist) {
                    skip = true;
                    start = 0;
                    lastIndex = -1;
                    continue;
                }
                skip = false;

                // mark as used (temporarily)
                p1.del = true;
                p2.del = true;
                marked += 2;
                lastIndex = p1.index;

                // if dist to new segment is less than thinWall
                // and segment length is less than thinWall then
                // just extrude to midpoint of next segment. this is
                // to avoid shaking the printer to death.
                if (dist <= thinWall && len <= thinWall) {
                    p2 = p1.midPointTo(p2);
                    addOutput(preout, p2, fill * (dist / thinWall), fillSpeed, extruder);
                } else {
                    // retract if dist trigger or crosses a slice top polygon
                    if (!fast && dist > retractDist && (zhop || intersectsTop(startPoint, p1))) {
                        retract();
                    }

                    // anti-backlash on longer move
                    if (!fast && antiBacklash && dist > retractDist) {
                        addOutput(preout, p1.add({x:antiBacklash,y:-antiBacklash,z:0}), 0, moveSpeed, extruder);
                    }

                    // bridge ends of fill when they're close together
                    if (dist < thinWall) {
                        addOutput(preout, p1, fill, fillSpeed, extruder);
                    } else {
                        addOutput(preout, p1, 0, moveSpeed, extruder);
                    }

                    addOutput(preout, p2, fill, fillSpeed, extruder);
                }

                startPoint = p2;
            }

            // clear delete marks so we can re-print later
            if (lines) lines.forEach(function(p) { p.del = false });
        }

        /**
         * given array of polygons, emit them in next closest order with
         * the special exception that depth is considered into distance
         * so that inner polygons are emitted first.
         *
         * @param {Array} array of Polygon or Polygon wrappers
         * @param {Function} fn
         * @param {Function} fnp convert 'next' object into a Polygon
         */
        function outputOrderClosest(array, fn, fnp, newTop) {
            if (array.length === 1) {
                return fn(array[0]);
            }
            array = array.slice();
            let closest, find, next, order, poly, lastDepth = 0;
            for (;;) {
                order = [];
                closest = null;
                for (i=0; i<array.length; i++) {
                    next = array[i];
                    if (!next) continue;
                    poly = fnp ? fnp(next) : next;
                    find = poly.findClosestPointTo(startPoint);
                    order.push({
                        i: i,
                        n: next,
                        d: find.distance - (poly.depth * thinWall),
                    });
                }
                newTop = false;
                if (order.length === 0) {
                    return;
                }
                order.sort(function(a,b) {
                    return a.d - b.d;
                });
                array[order[0].i] = null;
                fn(order[0].n);
            }
        }

        let out = [];
        if (slice.tops) {
            out.appendAll(slice.tops);
        };
        if (opt.support && slice.supports) {
            out.appendAll(slice.supports);
        }

        let lastTop = null;
        outputOrderClosest(out, function(next) {
            if (next instanceof Polygon) {
                // support polygon
                next.setZ(z);
                outputTraces([next].appendAll(next.inner || []));
                if (next.fills) {
                    next.fills.forEach(function(p) { p.z = z });
                    outputFills(next.fills, {fast: true});
                }
            } else {
                // top object
                let bounds = POLY.flatten(next.gatherOuter([]));

                let dir = -1; // 1 == inside out, -1 == outside-in

                // output inner polygons
                if (dir === 1)
                outputTraces([].appendAll(next.innerTraces() || []));

                // sort perimeter polygon by length to go out-to-in or in-to-out
                (next.traces || []).sort(function(a,b) {
                    return a.perimeter() > b.perimeter() ? dir : -dir;
                }).forEach(function(poly, index) {
                    outputTraces(poly);
                });

                // output inner polygons
                if (dir === -1)
                outputTraces([].appendAll(next.innerTraces() || []));

                // then output solid and sparse fill
                outputFills(next.fill_lines);
                outputSparse(next.fill_sparse, sparseMult);

                lastTop = next;
            }
        }, function(obj) {
            return obj instanceof Polygon ? obj : obj.poly;
        });

        // produce polishing paths when present
        if (slice.tops.length && slice.tops[0].polish) {
            let {x,y} = slice.tops[0].polish;
            if (x) {
                outputSparse(x, 0, process.polishSpeed);
            }
            if (y) {
                outputSparse(y, 0, process.polishSpeed);
            }
        }

        // offset print points
        for (i=0; i<preout.length; i++) {
            preout[i].point = preout[i].point.add(offset);
        }

        // add offset points to total print
        addPrintPoints(preout, output, origin, extruder);

        return startPoint.add(offset);
    };

    /**
     *
     * @param {Output[]} input
     * @param {Point[]} output
     * @param {Point} [startPoint]
     */
    function addPrintPoints(input, output, startPoint, tool) {
        if (startPoint && input.length > 0) {
            addOutput(output, startPoint, 0, undefined, tool);
        }
        output.appendAll(input);
    }

    /**
     * emit each element in an array based on
     * the next closest endpoint.
     */
    function tip2tipEmit(array, startPoint, emitter) {
        let mindist, dist, found, count = 0;
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
                // startPoint = found.last;
                startPoint = emitter(found.el, found.first, ++count);
            } else {
                break;
            }
        }

        return startPoint;
    }

    /**
     * like tip2tipEmit but accepts an array of polygons and the next closest
     * point can be anywhere in the adjacent polygon. should be re-written
     * to be more like outputOrderClosest() and have the option to account for
     * depth in determining distance
     */
    function poly2polyEmit(array, startPoint, emitter, mark) {
        let mindist, dist, found, count = 0, marker = mark || 'delete';
        for (;;) {
            found = null;
            mindist = Infinity;
            array.forEach(function(poly) {
                if (poly[marker]) {
                    return;
                }
                if (poly.isOpen()) {
                    const d2f = startPoint.distTo2D(poly.first());
                    const d2l = startPoint.distTo2D(poly.last());
                    if (d2f > mindist && d2l > mindist) {
                        return;
                    }
                    if (d2l < mindist && d2l < d2f) {
                        poly.reverse();
                        found = {poly:poly, index:0, point:poly.first()};
                    } else if (d2f < mindist) {
                        found = {poly:poly, index:0, point:poly.first()};
                    }
                    return;
                }
                let area = poly.area();
                poly.forEachPoint(function(point, index) {
                    dist = startPoint.distTo3D(point) * area * area;
                    if (dist < mindist) {
                        found = {poly:poly, index:index, point:point};
                        mindist = dist;
                    }
                });
            });
            if (found) {
                found.poly[marker] = true;
                startPoint = emitter(found.poly, found.index, ++count, startPoint) || found.point;
            } else {
                break;
            }
        }

        // undo delete marks
        array.forEach(function(poly) { poly[marker] = false });

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
        let layers = [],
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
                    let search = poly.parent;
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
                for (let i=0; i<poolsAbove.length; i++) {
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
            startPoint = poly2polyEmit(poolPoly.poolsDown, startPoint, emitPool, "del_pdown");
            return startPoint;
        };

        // from the top layer, iterate and descend through all connected pools
        // pools are sorted smallest to largest. pools are polygons with an
        // attached 'pool' array of polygons
        layers.forEach(function(pools) {
            startPoint = poly2polyEmit(pools, startPoint, emitPool, "del_ptop");
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
        let mindist = Infinity;
        poly1.forEachPoint(function(p) {
            const nextdist = p.distToPolySegments(poly2, offset);
            mindist = Math.min(mindist, nextdist);
            // returning true terminates forEachPoint()
            if (mindist <= offset) return true;
        });
        return mindist;
    }

    /**
     * calculate mm of filament required for a given extrusion length and layer height.
     *
     * @param noz nozzle diameter
     * @param fil filament diameter
     * @param slice height in mm
     * @returns mm of filament extruded per mm of length on the layer
     */
    function extrudePerMM(noz, fil, slice) {
        return ((PI * SQR(noz/2)) / (PI * SQR(fil/2))) * (slice / noz);
    }

    function constOp(tok, consts, opch, op) {
        let pos, v1, v2;
        if ((pos = tok.indexOf(opch)) > 0) {
            v1 = consts[tok.substring(0,pos)] || 0;
            v2 = parseInt(tok.substring(pos+1)) || 0;
            return op(v1,v2);
        } else {
            return null;
        }
    }

    function constReplace(str, consts, start) {
        let cs = str.indexOf("{", start || 0),
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
