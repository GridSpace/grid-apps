/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_cam = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.CAM) return;

    var KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        CAM = KIRI.driver.CAM = {
            slice: slice,
            printSetup: printSetup,
            printExport: printExport,
            getToolDiameter: getToolDiameter
        },
        CPRO = CAM.process = {
            ROUGH: 1,
            FINISH: 2,
            FINISH_X: 3,
            FINISH_Y: 4,
            FACING: 5,
            DRILL: 6
        },
        MODES = [
            "unset",
            "roughing",
            "finishing",
            "linear-x",
            "linear-y",
            "facing",
            "drilling"
        ],
        MIN = Math.min,
        MAX = Math.max,
        PI = Math.PI,
        HPI = PI/2,
        SLICER = KIRI.slicer,
        newLine = BASE.newLine,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        time = UTIL.time;

    function getToolById(settings, id) {
        for (var i=0, t=settings.tools; i<t.length; i++) {
            if (t[i].id === id) return t[i];
        }
        return null;
    };

    function getToolDiameter(settings, id) {
        var tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.flute_diam;
    };

    function getToolShaftDiameter(settings, id) {
        var tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.shaft_diam;
    };

    function getToolShaftOffset(settings, id) {
        var tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.flute_len;
    };

    function createToolProfile(settings, id, topo) {
        // generate tool profile
        var tool = getToolById(settings, id),
            ball = tool.type === "ballmill",
            shaft_diameter = getToolShaftDiameter(settings, id),
            shaft_radius = shaft_diameter / 2,
            shaft_pix_float = shaft_diameter / topo.resolution,
            shaft_pix_int = Math.round(shaft_pix_float),
            shaft_radius_pix_float = shaft_pix_float / 2,
            shaft_offset = getToolShaftOffset(settings, id),
            flute_diameter = getToolDiameter(settings, id),
            flute_radius = flute_diameter / 2,
            flute_pix_float = flute_diameter / topo.resolution,
            flute_pix_int = Math.round(flute_pix_float),
            flute_radius_pix_float = flute_pix_float / 2,
            profile_pix_iter = shaft_pix_int + (1 - shaft_pix_int % 2),
            toolCenter = (shaft_pix_int - (shaft_pix_int % 2)) / 2,
            toolOffset = [],
            larger_shaft = shaft_diameter - flute_diameter > 0.001;

        // console.log({id:tool.id, diam:flute_diameter, pix:flute_pix_float, tocks:profile_pix_iter});

        // for each pixel in tool profile, check inside radius
        for (var x = 0; x < profile_pix_iter; x++) {
            for (var y = 0; y < profile_pix_iter; y++) {
                var dx = x - toolCenter,
                    dy = y - toolCenter,
                    dist_from_center = Math.sqrt(dx * dx + dy * dy);

                if (dist_from_center <= flute_radius_pix_float) {
                    var z_offset = ball ? (1 - Math.cos((dist_from_center / flute_radius_pix_float) * HPI)) * -flute_radius : 0;
                    toolOffset.push([dx, dy, z_offset]);
                } else if (larger_shaft && dist_from_center <= shaft_radius_pix_float) {
                    toolOffset.push([dx, dy, -shaft_offset]);
                }
            }
        }

        return toolOffset;
    };

    /**
     * find highest z on a line segment
     * x,y are in platform coodinates
     */
    function getTopoZPathMax(widget, profile, x1, y1, x2, y2) {

        var topo = widget.topo,
            rez = topo.resolution,
            bounds = widget.getBoundingBox(),
            dx = x2-x1,
            dy = y2-y1,
            md = Math.max(Math.abs(dx),Math.abs(dy)),
            mi = md / rez,
            ix = dx / mi,
            iy = dy / mi,
            zmax = 0;

        while (mi-- > 0) {
            var tx1 = Math.round((x1 - bounds.min.x) / rez),
                ty1 = Math.round((y1 - bounds.min.y) / rez);
            zmax = Math.max(zmax, getMaxTopoToolZ(topo, profile, tx1, ty1, true));
            x1 += ix;
            y1 += iy;
        }

        return zmax;
    };

    /**
     * x,y are in topo grid int coordinates
     */
    function getMaxTopoToolZ(topo, profile, x, y, floormax) {
        var tv, tx, ty, tz, gv,
            i = 0, mz = -1,
            sx = topo.stepsx, sy = topo.stepsy,
            data = topo.data;

        while (i < profile.length) {
            tv = profile[i++];
            tx = tv[0] + x;
            ty = tv[1] + y;
            if (tx < 0 || tx >= sx || ty < 0 || ty >= sy) continue;
            gv = data[tx * sy + ty];
            if (gv === undefined) {
                continue;
            }
            if (floormax && gv === 0) {
                return topo.bounds.max.z;
            }
            tz = tv[2] + gv;
            mz = Math.max(tz, mz);
        }

        return mz >= 0.0 ? mz : topo.bounds.max.z;
    };

    /**
     * call out to slicer
     */
    function doSlicing(widget, options, ondone, onupdate) {
        SLICER.sliceWidget(widget, options, ondone, onupdate);
    }

    /**
     * top down progressive union for CAM
     */
    function pancake(slices, onupdate) {
        var union, tops, last;

        slices.forEach(function(slice,index) {
            tops = slice.gatherTopPolys([]).clone(true);
            if (!union) {
                union = tops;
            } else {
                tops.appendAll(union);
                union = POLY.union(tops);
                slice.tops = [];
                union.forEach(function(poly) {
                    slice.addTop(poly);
                    poly.setZ(slice.z);
                });
            }
            last = slice;
            if (onupdate) onupdate(index/slices.length);
        });

        return last.clone(false);
    }

    /**
     * @param {Slice[]} slices
     * @param {number} z position
     *
     * return slice closest to specified z
     */
    function closestSliceToZ(slices, z) {
        var selected = null,
            distance = Infinity,
            nextdist;
        slices.forEach(function(slice) {
            nextdist = Math.abs(slice.z - z);
            if (nextdist < distance) {
                selected = slice;
                distance = nextdist;
            }
        });
        return selected;
    }

    /**
     * select from pancaked layers
     */
    function selectSlices(slices, step, mode, output) {
        var last, zlastout, emitted = [];

        function emit(slice) {
            // prevent double emit at end
            if (last === slice) return;
            last = slice;
            if (slice.camMode) {
                // clone to prevent double emit
                var nuslice = newSlice(slice.z);
                slice.tops.forEach(function(top) {
                    nuslice.addTop(top.poly.clone(true));
                });
                slice = nuslice;
            }
            slice.camMode = mode;
            zlastout = slice.z;
            emitted.push(slice);
        }

        // - find mandatory slices
        // - divide space between by step
        // - select closes spaces for divisible gap
        var forced = [];
        slices.forEach(function(slice) {
            if (slice.hasFlats) forced.push(slice);
        })

        var mid = [];
        forced.forEachPair(function(s1, s2) {
            // skip last to first pair
            if (s2.z > s1.z) return;
            var delta = Math.abs(s2.z - s1.z),
                inc = delta / step,
                nstep = step,
                dec = inc - Math.floor(inc),
                slop = step * 0.02; // allow 2% over/under on step alignment
            // skip if delta close to step
            if (Math.abs(delta - step) < slop) return;
            // add another step if decimal too high
            if (dec > slop) nstep = delta / Math.ceil(inc);
            // find closest slices in-between
            for (var zv = s1.z - nstep; zv >= s2.z + nstep/2; zv -= nstep) {
                mid.push(closestSliceToZ(slices, zv));
            }
        }, 1);

        forced.appendAll(mid);
        forced.sort(function(s1, s2) { return s2.z - s1.z; });
        // drop first/top slice (because it's not an actual cut)
        //forced = forced.slice(1);
        forced.forEach(function(slice) {
            emit(slice);
        });

        // add to output array
        emitted.forEach(function(slice) {
            output.push(slice);
        });
    }

    /**
     * merge collinear points
     * remove floor lead-in, lead-out
     * remove collinear points (todo)
     */
    function cleanupTopoSlice(slice, diameter, curvesOnly) {
        var poly = slice.tops[0].traces[0],
            nupoly = newPolygon().setOpen(),
            points = poly.points,
            start = 0,
            end = points.length - 1,
            latent, point, last, i;

        // find start
        for (i = start; i < points.length; i++)
            if (points[i].z > 0) { start = i; break; }
        // find end
        for (i = end; i > 0; i--)
            if (points[i].z > 0) { end = i; break; }
        // merge collinear
        for (i = start; i <= end; i++) {
            point = points[i];
            if (last) {
                if (last.z === point.z && (last.x === point.x || last.y === point.y)) {
                    latent = point;
                    continue
                } else {
                    if (latent) {
                        nupoly.push(latent);
                        latent = null;
                    }
                }
            }
            nupoly.push(point);
            last = point;
        }
        if (latent) nupoly.push(latent);

        if (nupoly.length < 2) return false;

        // limit cleanup to curved features
        var traces = [],
            trace = newPolygon().setOpen();

        slice.tops[0].traces = traces;
        points = nupoly.points;
        last = points[0];
        latent = null;
        for (i = 1; i < points.length; i++) {
            point = points[i];
            var use = curvesOnly ?
                (last.z != point.z && (last.x !== point.x || last.y !== point.y)) :
                last.z && point.z;
            if (use) {
                // join to previous trace if not too far away
                if (trace.length === 0 && traces.length > 0 && point.distTo3D(traces.peek().last()) <= diameter) {
                    trace = traces.peek();
                }
                if (latent !== last) trace.push(last);
                trace.push(point);
                latent = point;
            } else {
                if (trace.length > 1) {
                    // don't re-push a joined trace
                    if (traces.length === 0 || traces.peek() !== trace) traces.push(trace);
                    trace = newPolygon().setOpen();
                    latent = null;
                } else if (trace.length === 1) {
                    trace = newPolygon().setOpen();
                }
            }
            last = point;
        }

        if (trace.length > 1) traces.push(trace);

        return traces.length > 0;
    }

    /**
     * @param {Widget} widget
     * @param {Object} settings
     * @param {Function} ondone
     * @param {Function} onupdate
     */
    function generateTopoMap(widget, settings, ondone, onupdate) {
        var mesh = widget.mesh,
            proc = settings.process,
            outp = settings.process,
            resolution = outp.camTolerance,
            diameter = getToolDiameter(settings, proc.finishingTool),
            tool = getToolById(settings, proc.finishingTool),
            toolStep = diameter * proc.finishingOver,
            traceJoin = diameter / 2,
            bounds = widget.getBoundingBox().clone(),
            boundsX = bounds.max.x - bounds.min.x,
            boundsY = bounds.max.y - bounds.min.y,
            maxangle = proc.finishingAngle,
            curvesOnly = proc.finishCurvesOnly,
            R2A = 180 / Math.PI,
            stepsx = Math.ceil(boundsX / resolution),
            stepsy = Math.ceil(boundsY / resolution),
            data = new Float32Array(stepsx * stepsy),
            topo = widget.topo = {
                data: data,
                stepsx: stepsx,
                stepsy: stepsy,
                bounds: bounds,
                diameter: diameter,
                resolution: resolution
            },
            toolOffset = createToolProfile(settings, proc.finishingTool, topo),
            newslices = [],
            newlines,
            newtop,
            newtrace,
            slice, lx, ly, lv,
            startTime = time();

        // return highest z within tools radius
        function maxzat(x,y) {
            return getMaxTopoToolZ(topo, toolOffset, x, y);
        }

        function topoSlicesDone(slices) {
            var gridx = 0,
                gridy,
                gridi, // index
                gridv, // value
                miny = bounds.min.y,
                maxy = bounds.max.y,
                maxx = bounds.max.x,
                zMin = MAX(bounds.min.z, outp.camZBottom) + 0.0001,
                x, y, tv, ltv;

            // for each Y slice, find z grid value (x/z swapped)
            for (var j=0; j<slices.length; j++) {
                var slice = slices[j],
                    lodata = data,
                    lines = slice.lines;
                gridy = 0;
                // slices have x/z swapped
                x = slice.z - maxx;
                for (y = miny; y <= maxy; y += resolution) {
                    gridi = gridx * stepsy + gridy;
                    gridv = lodata[gridi] || 0;
                    // strategy using raw lines (faster slice, but more lines)
                    for (var i=0; i<lines.length; i++) {
                        var line = lines[i],
                            p1 = line.p1,
                            p2 = line.p2;//,
                        if (
                            (p1.z > zMin || p2.z > zMin) && // one endpoint above 0
                            (p1.z > gridv || p2.z > gridv) && // one endpoint above gridv
                            ((p1.y <= y && p2.y >= y) || // one endpoint left
                             (p2.y <= y && p1.y >= y)) // one endpoint right
                        ) {
                            var dy = p1.y - p2.y,
                                dz = p1.z - p2.z,
                                pct = (p1.y - y) / dy,
                                nz = p1.z - (dz * pct);
                            if (nz > gridv) gridv = lodata[gridi] = Math.max(nz, zMin);
                        }
                    }
                    gridy++;
                }
                gridx++;
                onupdate(0.20 + (gridx/stepsx) * 0.50, "topo tracing");
            }

            // do x linear finishing
            if (proc.finishingXOn) {
                startTime = time();

                // emit slice per X
                gridx = 0;
                for (x = bounds.min.x; x <= bounds.max.x; x += toolStep) {
                // for (x = bounds.min.x; x <= bounds.max.x; x += resolution) {
                    ly = gridy = 0;
                    slice = newSlice(gridx, mesh.newGroup ? mesh.newGroup() : null);
                    slice.camMode = CPRO.FINISH_X;
                    slice.lines = newlines = [];
                    newtop = slice.addTop(newPolygon().setOpen()).poly;
                    newtrace = newPolygon().setOpen();
                    slice.tops[0].traces = [ newtrace ];
                    for (y = bounds.min.y; y < bounds.max.y; y += resolution) {
                        gridv = data[gridx * stepsy + gridy];
                        tv = maxzat(gridx, gridy);
                        if (ly) {
                            if (mesh) newlines.push(newLine(
                                newPoint(x,ly,lv),
                                newPoint(x,y,gridv)
                            ));
                            var ang = Math.abs((Math.atan2(ltv - tv, resolution) * R2A) % 90);
                            // over max angle, turn into square edge (up or down)
                            if (ang > maxangle) {
                                if (ltv > tv) {
                                    // down = forward,down
                                    newtrace.push(newPoint(x,y,ltv));
                                } else {
                                    // up = up,forward
                                    newtrace.push(newPoint(x,ly,tv));
                                }
                            }
                        }
                        newtrace.push(newPoint(x,y,tv));
                        ly = y;
                        lv = gridv;
                        ltv = tv;
                        gridy++;
                    }
                    if (cleanupTopoSlice(slice,diameter,curvesOnly)) newslices.push(slice);
                    gridx = Math.round(((x - bounds.min.x + toolStep) / boundsX) * stepsx);
                    onupdate(0.70 + (gridx/stepsx) * 0.15, "linear x");
                }
            }

            // do y linear finishing
            if (proc.finishingYOn) {
                startTime = time();

                // emit slice per Y
                gridy = 0;
                for (y = bounds.min.y; y < bounds.max.y; y += toolStep) {
                    lx = gridx = 0;
                    slice = newSlice(gridy, mesh.newGroup ? mesh.newGroup() : null);
                    slice.camMode = CPRO.FINISH_Y;
                    slice.lines = newlines = [];
                    newtop = slice.addTop(newPolygon().setOpen()).poly;
                    newtrace = newPolygon().setOpen();
                    slice.tops[0].traces = [ newtrace ];
                    for (x = bounds.min.x; x <= bounds.max.x; x += resolution) {
                        gridv = data[gridx * stepsy + gridy];
                        tv = maxzat(gridx, gridy);
                        if (lx) {
                            if (mesh) newlines.push(newLine(
                                newPoint(lx,y,lv),
                                newPoint(x,y,gridv)
                            ));
                            var ang = Math.abs((Math.atan2(ltv - tv, resolution) * R2A) % 90);
                            // over max angle, turn into square edge (up or down)
                            if (ang > maxangle) {
                                if (ltv > tv) {
                                    // down = forward,down
                                    newtrace.push(newPoint(x,y,ltv));
                                } else {
                                    // up = up,forward
                                    newtrace.push(newPoint(lx,y,tv));
                                }
                            }
                        }
                        newtrace.push(newPoint(x,y,tv));
                        lx = x;
                        lv = gridv;
                        ltv = tv;
                        gridx++;
                    }
                    if (cleanupTopoSlice(slice,diameter,curvesOnly)) newslices.push(slice);
                    gridy = Math.round(((y - bounds.min.y + toolStep) / boundsY) * stepsy);
                    onupdate(0.85 + (gridy/stepsy) * 0.15, "linear y");
                }
            }

            ondone(newslices);
        }

        // slices progress left-to-right along the X axis
        doSlicing(widget, {height:resolution, swapX:true, topo:true}, topoSlicesDone, function(update) {
            onupdate(0.0 + update * 0.20, "topo slicing");
        });
    }

    /**
     * Create facing passes in CAM mode
     *
     * @param {Slice} slice target
     * @param {Polygon[]} shell enclosing slice tops
     * @param {number} diameter of tool
     * @param {number} overlap % on each pass
     * @param {boolean} true for pocket only mode
     * @param {number} bounds shell offset
     * @returns {Object} shell
     */
    function createFacingSlices(slice, shell, diameter, overlap, pocket) {
        var outer = [],
            offset = [];

        // clone and flatten the shell with tops to offset array
        shell.clone(true).forEach(function(poly) { poly.setZ(slice.z).flattenTo(offset) });

        // re-nest offset array
        offset = POLY.nest(offset);

        // inset offset array by 1/2 diameter then by tool overlap %
        POLY.expand(offset, - (diameter / 2), slice.z, outer, 0, -diameter * overlap);

        if (!pocket) {
            // re-flatten offset polys
            offset = POLY.flatten(outer.slice(), []);
            // re-clone shell to offset polys (because it was lost in the offset)
            shell.clone(true).forEach(function(poly) { poly.setZ(slice.z).flattenTo(offset) });
            // re-nest offset polys
            outer = POLY.nest(offset);
        }

        if (!slice.tops.length) { console.log({no_top: slice.z}); slice.addTop() }

        slice.tops[0].traces = outer;
    };

    /**
     * Create roughing offsets in CAM mode
     *
     * @param {Slice} slice target
     * @param {Polygon[]} shell enclosing slice tops
     * @param {number} diameter of tool (mm)
     * @param {number} stock to leave (mm)
     * @param {number} percent overlap on each pass
     * @param {boolean} true for pocket only mode
     * @returns {Object} shell or newly generated shell
     */
    function createRoughingSlices(slice, shell, diameter, stock, overlap, pocket) {
        var tops = slice.gatherTopPolys([]).clone(true),
            outer = [],
            offset = [];

        // clone and flatten the shell with tops to offset array
        shell.clone(true).forEach(function(poly) { poly.setZ(slice.z).flattenTo(offset) });
        POLY.flatten(tops, offset, true);

        // only tab cut polys should be open
        offset.forEach(function(trace) {
            trace.setClosed();
        });

        // re-nest offset array
        offset = POLY.nest(offset);

        // inset offset array by 1/2 diameter then by tool overlap %
        POLY.expand(offset, - (diameter / 2 + stock), slice.z, outer, 0, -diameter * overlap);

        if (!pocket) {
            // re-flatten offset polys
            offset = POLY.flatten(outer.slice(), [], true);
            // re-clone shell to offset polys (because it was lost in the offset)
            shell.clone(true).forEach(function(poly) {
                poly.setZ(slice.z).flattenTo(offset);
                poly.setClosed();
            });
            // re-nest offset polys
            // outer = POLY.nest(offset);
            outer = offset;
        }

        slice.tops[0].traces = outer;
    };

    /**
     * Create CAM finishing offsets
     *
     * @param {Slice} slice target
     * @param {Polygon[]} outermost pancacked shells for fill
     * @param {number} tool diameter
     * @param {boolean} pocket only
     */
    function createFinishingSlices(slice, shell, diameter, pocket) {
        if (slice.tops.length === 0) return shell;

        var tops = slice.gatherTopPolys([]).clone(true),
            offset = POLY.expand(tops, diameter / 2, slice.z);

        // when pocket only, drop first outer poly
        // if it matches the shell and promote inner polys
        if (pocket) {
            offset = POLY.filter(POLY.diff(shell, offset, slice.z), [], function(poly) {
                if (poly.area() < 1) return null;
                for (var sp=0; sp<shell.length; sp++) {
                    // eliminate shell only polys
                    if (poly.isEquivalent(shell[sp])) {
                        if (poly.inner) return poly.inner;
                        return null;
                    }
                }
                return poly;
            });
        }

        const output = POLY.flatten(offset, [], true);

        slice.tops[0].inner = output;
        slice.tops[0].traces = output;
    };

    /**
     * DRIVER SLICE CONTRACT
     *
     * @param {Object} settings
     * @param {Widget} widget
     * @param {Function} output
     */
    function slice(settings, widget, onupdate, ondone) {
        var conf = settings,
            proc = conf.process,
            outp = conf.process,
            sliceAll = widget.slices = [],
            roughToolDiam = getToolDiameter(conf, proc.roughingTool),
            finishToolDiam = getToolDiameter(conf, proc.finishingTool),
            drillToolDiam = getToolDiameter(conf, proc.drillTool),
            procRough = proc.roughingOn && proc.roughingDown && roughToolDiam,
            procFinish = proc.finishingOn && proc.finishingDown && finishToolDiam,
            procFacing = proc.roughingOn && proc.camZTopOffset,
            procDrill = proc.drillingOn && proc.drillDown && proc.drillDownSpeed,
            sliceDepth = MAX(0.1, MIN(proc.roughingDown, proc.finishingDown) / 3),
            pocketOnly = outp.camPocketOnly,
            addTabs = proc.camTabsOn && !pocketOnly,
            tabWidth = proc.camTabsWidth,
            tabHeight = proc.camTabsHeight,
            mesh = widget.mesh,
            bounds = widget.getBoundingBox(),
            zMin = MAX(bounds.min.z, outp.camZBottom),
            shellRough,
            shellFinish;

        if (sliceDepth <= 0.05) {
            return ondone("invalid slice depth");
        }

        if (!(procRough || procFinish || procFacing || procDrill)) {
            return ondone("no processes selected");
        }

        // cut outside traces at the right points
        const addCutoutTabs = function(slice, toolDiam) {
            // too high
            if (slice.z > zMin + tabHeight) return;
            // no tops / traces
            if (slice.tops.length === 0) return;

            var trace, index, maxArea = 0, tmpArea;

            // find trace with greatest area
            slice.tops[0].traces.forEach(function(trc, idx) {
                if ((tmpArea = trc.area()) > maxArea) {
                    maxArea = tmpArea;
                    index = idx;
                    trace = trc;
                }
            });

            // for tracing out intersections
            trace.setClockwise();

            const outside = 10000,
                width = (tabWidth + toolDiam) / 2,
                // horizontal top cut
                htl = { x: -outside, y: tabWidth / 2 },
                htr = { x: -htl.x, y: htl.y },
                // horizontal bottom cut
                hbl = { x: htl.x, y: -htl.y },
                hbr = { x: -htl.x, y: -htl.y },
                // vertical left cut
                vtl = { x: -width, y: outside },
                vbl = { x: vtl.x, y: -vtl.y },
                // vertical right cut
                vtr = { x: -vtl.x, y: vtl.y },
                vbr = { x: -vtl.x, y: -vtl.y },
                nutraces = [];

            var lrtop = trace.intersections(htl, htr),
                lrbot = trace.intersections(hbl, hbr),
                tblt = trace.intersections(vtl, vbl),
                tbrt = trace.intersections(vtr, vbr),
                tr1 = trace.emitSegment(lrtop[0], tblt[0]),
                tr2 = trace.emitSegment(tbrt[0], lrtop[lrtop.length-1]),
                tr3 = trace.emitSegment(lrbot[lrbot.length-1], tbrt[tbrt.length-1]),
                tr4 = trace.emitSegment(tblt[tblt.length-1], lrbot[0]);

            // remove cut trace and replace with open polys
            slice.tops[0].traces.splice(index, 1, tr1, tr2, tr3, tr4);
        }

        // called when horizontal slicing complete
        const camSlicesDone = function(slices) {

            const camShell = pancake(slices, function(update) {
                onupdate(0.25 + update * 0.15, "shelling");
            });

            const camShellPolys = shellRough = camShell.gatherTopPolys([]);

            if (procRough && !pocketOnly) {
                // expand shell by half tool diameter + stock to leave
                shellRough = POLY.expand(shellRough, (roughToolDiam / 2) + proc.roughingStock, 0);
            }

            if (procFinish && pocketOnly) {
                shellFinish = POLY.expand(camShellPolys, -finishToolDiam/2, 0);
            }

            // hollow area from top of stock to top of part
            if (procFacing) {
                var ztop = bounds.max.z,
                    zpos = ztop + outp.camZTopOffset,
                    zstep = proc.roughingDown;

                while (zpos >= ztop) {
                    zpos = zpos - MIN(zstep, zpos - ztop);

                    const slice = newSlice(zpos, mesh.newGroup ? mesh.newGroup() : null);
                    slice.camMode = CPRO.FACING;
                    sliceAll.append(slice);

                    shellRough.clone().forEach(function(poly) {
                        slice.addTop(poly);
                    })

                    if (Math.abs(zpos - ztop) < 0.001) break;
                }
            }

            if (procRough) {
                var selected = [];
                selectSlices(slices, proc.roughingDown, CPRO.ROUGH, selected);
                sliceAll.appendAll(selected);
            }

            if (procFinish) {
                var selected = [];
                selectSlices(slices, proc.finishingDown, CPRO.FINISH, selected);
                sliceAll.appendAll(selected);
            }

            if (procDrill) {
                var drills = [],
                    centerDiff = drillToolDiam * 0.1,
                    area = (drillToolDiam/2) * (drillToolDiam/2) * Math.PI,
                    areaDelta = area * 0.05;

                slices.forEach(function(slice) {
                    var inner = slice.gatherTopPolyInners([]);
                    inner.forEach(function(poly) {
                        if (poly.circularity() >= 0.99 && Math.abs(poly.area() - area) <= areaDelta) {
                            var center = poly.circleCenter(),
                                merged = false,
                                closest = Infinity,
                                dist;
                            // TODO reject if inside camShellPolys (means there is material above)
                            // if (center.isInPolygon(camShellPolys)) return;
                            drills.forEach(function(drill) {
                                if (merged) return;
                                if ((dist = drill.last().distTo2D(center)) <= centerDiff) {
                                    merged = true;
                                    drill.push(center);
                                }
                                closest = Math.min(closest,dist);
                            });
                            if (!merged) {
                                drills.push(newPolygon().append(center));
                            }
                        }
                    });
                });

                // force all drill poly points to use center (average) point
                drills.forEach(function(drill) {
                    var center = drill.center(true),
                        slice = newSlice(0,null);
                    drill.points.forEach(function(point) {
                        point.x = center.x;
                        point.y = center.y;
                    });
                    slice.camMode = CPRO.DRILL;
                    slice.addTop(null).traces = [ drill ];
                    sliceAll.append(slice);
                });
            }
        }

        // horizontal slices for rough/finish
        doSlicing(widget, {height: sliceDepth, cam:true, zmin:outp.camZBottom}, camSlicesDone, function(update) {
            onupdate(0.0 + update * 0.25, "slicing");
        });

        // for each final slice, do post-processing
        sliceAll.forEach(function(slice, index) {
            // re-index
            slice.index = index;
            switch (slice.camMode) {
                case CPRO.FACING:
                    createFacingSlices(slice, shellRough, roughToolDiam, proc.roughingOver, pocketOnly);
                    break;
                case CPRO.ROUGH:
                    createRoughingSlices(slice, shellRough, roughToolDiam, proc.roughingStock, proc.roughingOver, pocketOnly);
                    if (addTabs) addCutoutTabs(slice, roughToolDiam);
                    break;
                case CPRO.FINISH:
                    createFinishingSlices(slice, shellFinish, finishToolDiam, pocketOnly);
                    if (addTabs) addCutoutTabs(slice, finishToolDiam);
                    break;
            }
            onupdate(0.40 + (index / sliceAll.length) * 0.10, "finishing")
        }, "cam post");

        // we need topo for safe travel moves
        generateTopoMap(widget, settings, function(slices) {
            sliceAll.appendAll(slices);
            // todo union rough / finish shells
            // todo union rough / finish tabs
            // todo append to generated topo map
        }, function(update, msg) {
            onupdate(0.50 + update * 0.50, msg || "create topo");
        });

        ondone();
    };

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Object} print state object
     * @param {Function} update incremental callback
     * @param {Number} [index] into widget array
     * @param {Object} [firstPoint] starting point
     */
    function printSetup(print, update, index, firstPoint) {
        var getTool = getToolById,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            widgetIndex = index || 0,
            widgetArray = print.widgets,
            widgetCount = widgetArray.length,
            widget = widgetArray[widgetIndex];

        if (widgetIndex >= widgetCount || !widget) return;

        var slices = widget.slices,
            bounds = widget.getCamBounds(settings),
            hasStock = process.camStockZ && process.camStockX && process.camStockY,
            startCenter = process.outputOriginCenter,
            zclear = process.camZClearance || 1,
            zadd = hasStock ? process.camStockZ - bounds.max.z : 0,
            zmax = hasStock ? process.camStockZ + zclear : bounds.max.z + zclear,
            originx = startCenter ? 0 : hasStock ? -process.camStockX / 2 : bounds.min.x,
            originy = startCenter ? 0 : hasStock ? -process.camStockY / 2 : bounds.min.y,
            origin = hasStock ? newPoint(originx, originy, process.camStockZ) : newPoint(originx, originy, bounds.max.z + zclear),
            output = print.output,
            modes = CPRO,
            depthFirst = process.camDepthFirst,
            easeDown = false && process.camEaseDown,
            tolerance = process.camTolerance,
            drillDown = process.drillDown,
            drillLift = process.drillLift,
            drillDwell = process.drillDwell,
            newOutput = widgetIndex === 0 ? [] : print.output,
            layerOut = [],
            printPoint,
            isNewMode,
            tool,
            toolDiam,
            toolDiamMove,
            toolProfile,
            feedRate,
            plungeRate,
            lastTool,
            lastMode,
            lastPoint,
            nextIsMove = true,
            spindle = 0,
            spindleMax = device.spindleMax,
            addOutput = print.addOutput,
            tip2tipEmit = print.tip2tipEmit,
            poly2polyEmit = print.poly2polyEmit,
            poly2polyDepthFirstEmit = print.poly2polyDepthFirstEmit;

        function newLayer() {
            if (layerOut.length < 2) return;
            newOutput.push(layerOut);
            layerOut = [];
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
        }

        function setTool(toolID, feed, plunge) {
            if (toolID !== lastTool) {
                tool = getToolById(settings, toolID);
                toolDiam = getToolDiameter(settings, toolID);
                toolDiamMove = toolDiam, // TODO validate w/ multiple models
                toolProfile = createToolProfile(settings, toolID, widget.topo);
                lastTool = toolID;
            }
            feedRate = feed;
            plungeRate = plunge;
        }

        function emitDrills(polys) {
            polys = polys.slice();
            for (;;) {
                var closestDist = Infinity,
                    closestI,
                    closest = null,
                    dist;

                for (var i=0; i<polys.length; i++) {
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
            // TODO emit in next-closest-order
            // polys.forEach(function(poly) {
            //     emitDrill(poly, drillDown, drillLift, drillDwell);
            // });
        }

        function emitDrill(poly, down, lift, dwell) {
            var remain = poly.first().z - poly.last().z,
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
            points.forEach(function(point, index) {
                camOut(point, 1);
                if (index < points.length - 1) {
                    if (dwell) camDwell(dwell);
                    if (lift) camOut(point.clone().setZ(point.z + lift), 0);
                }
            })
            camOut(point.clone().setZ(zmax));
            newLayer();
        }

        function camDwell(time) {
            layerPush(
                null,
                0,
                time,
                tool.number
            );
        }

        function camOut(point, cut) {
            point = point.clone();
            point.x += widget.mesh.position.x;
            point.y += widget.mesh.position.y;
            point.z += zadd;
            if (nextIsMove) {
                cut = 0;
                nextIsMove = false;
            }
            var rate = feedRate;
            // only when we have a previous point to compare to
            if (lastPoint) {
                var deltaXY = lastPoint.distTo2D(point),
                    deltaZ = point.z - lastPoint.z,
                    absDeltaZ = Math.abs(deltaZ),
                    isMove = !cut;
                // drop points too close together
                if (deltaXY < 0.001 && point.z === lastPoint.z) {
                    // console.trace(["drop dup",lastPoint,point]);
                    return;
                }
                if (isMove && deltaXY <= toolDiamMove) {
                    // convert short planar moves to cuts
                     if (absDeltaZ <= tolerance) {
                        cut = 1;
                        isMove = false;
                    } else if (deltaZ <= -tolerance) {
                        // move over before descending
                        layerPush(point.clone().setZ(lastPoint.z), 0, 0, tool.number);
                        // new pos for plunge calc
                        deltaXY = 0;
                    }
                } //else (TODO verify no else here b/c above could change isMove)
                // move over things
                if ((deltaXY > toolDiam || (deltaZ > toolDiam && deltaXY > tolerance)) && (isMove || absDeltaZ >= tolerance)) {
                    var maxz = MAX(
                            getTopoZPathMax(
                                widget,
                                toolProfile,
                                lastPoint.x,
                                lastPoint.y,
                                point.x,
                                point.y) + zadd,
                            point.z,
                            lastPoint.z),
                        mustGoUp = MAX(maxz - point.z, maxz - lastPoint.z) >= tolerance,
                        clearz = maxz;
                    // up if any point between higher than start/finish
                    if (mustGoUp) {
                        clearz = maxz + zclear;
                        layerPush(lastPoint.clone().setZ(clearz), 0, 0, tool.number);
                    }
                    // over to point above where we descend to
                    if (mustGoUp || point.z < maxz) {
                        layerPush(point.clone().setZ(clearz), 0, 0, tool.number);
                        // new pos for plunge calc
                        deltaXY = 0;
                    }
                }
                // synth new plunge rate
                if (deltaZ <= -tolerance) {
                    var threshold = MIN(deltaXY / 2, absDeltaZ),
                        modifier = threshold / absDeltaZ;
                    if (threshold && modifier && deltaXY > tolerance) {
                        // use modifier to speed up long XY move plunge rates
                        rate = Math.round(plungeRate + ((feedRate - plungeRate) * modifier));
                    } else {
                        rate = plungeRate;
                    }
                    // console.log({deltaZ: deltaZ, deltaXY: deltaXY, threshold:threshold, modifier:modifier, rate:rate, plungeRate:plungeRate});
                }
            } else {
                // before first point, move cutting head to point above it
                layerPush(point.clone().setZ(zmax), 0, 0, tool.number);
            }
            // todo synthesize move speed from feed / plunge accordingly
            layerPush(
                point,
                cut ? 1 : 0,
                rate,
                tool.number
            );
            lastPoint = point;
            layerOut.spindle = spindle;
        }

        // make top start offset configurable
        printPoint = firstPoint || origin;

        // accumulated data for depth-first optimiztions
        var depthData = {
            rough: [],
            finish: [],
            roughDiam: 0,
            finishDiam: 0,
            linearx: [],
            lineary: [],
            layer: 0,
            drill: []
        };

        // todo first move into positon
        slices.forEach(function(slice, sliceIndex) {
            depthData.layer++;
            isNewMode = slice.camMode != lastMode;
            lastMode = slice.camMode;
            nextIsMove = true;
            if (isNewMode) depthData.layer = 0;

            switch (slice.camMode) {
                case modes.FACING:
                    setTool(process.roughingTool, process.roughingSpeed, 0);
                    spindle = Math.min(spindleMax, process.roughingSpindle);
                    slice.tops.forEach(function(top) {
                        if (!top.traces) return;
                        var polys = [];
                        top.traces.forEach(function (poly) {
                            polys.push(poly);
                            if (poly.inner) {
                                poly.inner.forEach(function(inner) {
                                    polys.push(inner);
                                })
                            }
                        });
                        // set winding specified in output
                        POLY.setWinding(polys, process.outputClockwise, true);
                        printPoint = poly2polyEmit(polys, printPoint, function(poly, index, count) {
                            poly.forEachPoint(function(point, pidx, points, offset) {
                                camOut(point.clone(), offset !== 0);
                            }, true, index);
                        });
                        newLayer();
                    });
                    break;
                case modes.ROUGH:
                case modes.FINISH:
                    if (slice.camMode === modes.ROUGH) {
                        setTool(process.roughingTool, process.roughingSpeed, process.roughingPlunge);
                        spindle = Math.min(spindleMax, process.roughingSpindle);
                        depthData.roughDiam = toolDiam;
                    } else {
                        setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                        spindle = Math.min(spindleMax, process.finishingSpindle);
                        depthData.finishDiam = toolDiam;
                    }
                    // todo find closest next trace/trace-point
                    slice.tops.forEach(function(top) {
                        if (!top.poly) return;
                        if (!top.traces) return;
                        var polys = [];
                        POLY.flatten(top.traces, []).forEach(function (poly) {
                            if (depthFirst) poly = poly.clone(true);
                            poly.layer = depthData.layer;
                            polys.push(poly);
                        });
                        // set winding specified in output
                        POLY.setWinding(polys, process.outputClockwise, true);
                        if (depthFirst) {
                            (slice.camMode === modes.ROUGH ? depthData.rough : depthData.finish).append(polys);
                        } else {
                            printPoint = poly2polyEmit(polys, printPoint, function(poly, index, count) {
                                poly.forEachPoint(function(point, pidx, points, offset) {
                                    camOut(point.clone(), offset !== 0);
                                }, poly.isClosed(), index);
                            });
                            newLayer();
                        }
                    });
                    break;
                case modes.FINISH_X:
                case modes.FINISH_Y:
                    setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                    spindle = Math.min(spindleMax, process.finishingSpindle);
                    depthData.finishDiam = toolDiam;
                    // todo find closest next trace/trace-point
                    slice.tops.forEach(function(top) {
                        if (!top.traces) return;
                        var polys = [], poly, emit;
                        top.traces.forEach(function (poly) {
                            if (depthFirst) poly = poly.clone(true);
                            polys.push({first:poly.first(), last:poly.last(), poly:poly});
                        });
                        if (depthFirst) {
                            (slice.camMode === modes.FINISH_X ? depthData.linearx : depthData.lineary).appendAll(polys);
                        } else {
                            printPoint = tip2tipEmit(polys, printPoint, function(el, point, count) {
                                poly = el.poly;
                                if (poly.last() === point) poly.reverse();
                                poly.forEachPoint(function(point, pidx) {
                                    camOut(point.clone(), pidx > 0);
                                }, false);
                            });
                            newLayer();
                        }
                    });
                    break;
                case modes.DRILL:
                    setTool(process.drillTool, process.drillDownSpeed, process.drillDownSpeed);
                    // drilling is always depth-first
                    slice.tops.forEach(function(top) {
                        if (!top.traces) return;
                        depthData.drill.appendAll(top.traces);
                    });
                    break;
            }
            update(sliceIndex / slices.length);
        });

        // act on accumulated layer data
        if (depthFirst) {
            // roughing depth first
            if (depthData.rough.length > 0) {
                setTool(process.roughingTool, process.roughingSpeed, process.roughingPlunge);
                spindle = Math.min(spindleMax, process.roughingSpindle);
                printPoint = poly2polyDepthFirstEmit(depthData.rough, printPoint, function(poly, index, count, fromPoint) {
                    var last = null;
                    if (easeDown && poly.isClosed()) {
                        last = poly.forEachPointEaseDown(function(point, offset) {
                            camOut(point.clone(), offset > 0);
                        }, fromPoint);
                    } else {
                        poly.forEachPoint(function(point, pidx, points, offset) {
                            camOut(point.clone(), offset !== 0);
                        }, poly.isClosed(), index);
                    }
                    newLayer();
                    return last;
                }, depthData.roughDiam * process.roughingOver * 1.01);
            }
            // finishing depth first
            if (depthData.finish.length > 0) {
                setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                spindle = Math.min(spindleMax, process.finishingSpindle);
                printPoint = poly2polyDepthFirstEmit(depthData.finish, printPoint, function(poly, index, count, fromPoint) {
                    var last = null;
                    if (easeDown && poly.isClosed()) {
                        last = poly.forEachPointEaseDown(function(point, offset) {
                            camOut(point.clone(), offset > 0);
                        }, fromPoint);
                    } else {
                        poly.forEachPoint(function(point, pidx, points, offset) {
                            camOut(point.clone(), offset !== 0);
                        }, poly.isClosed(), index);
                    }
                    newLayer();
                    return last;
                }, depthData.finishDiam * 0.01);
            }
            // two modes for deferred finishing: x then y or combined
            if (process.finishCurvesOnly) {
                setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                spindle = Math.min(spindleMax, process.finishingSpindle);
                // combined deferred linear x and y finishing
                var linearxy = [].appendAll(depthData.linearx).appendAll(depthData.lineary);
                printPoint = tip2tipEmit(linearxy, printPoint, function(el, point, count) {
                    var poly = el.poly;
                    if (poly.last() === point) poly.reverse();
                    poly.forEachPoint(function(point, pidx) {
                        camOut(point.clone(), pidx > 0);
                    }, false);
                    newLayer();
                });
            } else {
                setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                spindle = Math.min(spindleMax, process.finishingSpindle);
                // deferred linear x finishing
                if (depthData.linearx.length > 0)
                printPoint = tip2tipEmit(depthData.linearx, printPoint, function(el, point, count) {
                    var poly = el.poly;
                    if (poly.last() === point) poly.reverse();
                    poly.forEachPoint(function(point, pidx) {
                        camOut(point.clone(), pidx > 0);
                    }, false);
                    newLayer();
                });
                // deferred linear y finishing
                if (depthData.lineary.length > 0)
                printPoint = tip2tipEmit(depthData.lineary, printPoint, function(el, point, count) {
                    var poly = el.poly;
                    if (poly.last() === point) poly.reverse();
                    poly.forEachPoint(function(point, pidx) {
                        camOut(point.clone(), pidx > 0);
                    }, false);
                    newLayer();
                });
            }
        }

        // drilling is always depth first
        if (depthData.drill.length > 0) {
            setTool(process.drillTool, process.drillDownSpeed, process.drillDownSpeed);
            emitDrills(depthData.drill);
        }

        // last layer/move is to zmax
        camOut(printPoint.clone().setZ(bounds.max.z + zclear), false);
        newOutput.push(layerOut);

        // replace output single flattened layer with all points
        print.output = newOutput;

        if (widgetIndex + 1 < widgetCount) printSetup(print, update, widgetIndex + 1, printPoint);
    };

    /**
     * @returns {Array} gcode lines
     */
    function printExport(print, online) {
        var widget = print.widgets[0];

        if (!widget) return;

        var i,
            time = 0,
            lines = 0,
            bytes = 0,
            output = [],
            spindle = 0,
            modes = CPRO,
            settings = print.settings,
            device = settings.device,
            gcodes = settings.device || {},
            space = gcodes.gcodeSpace,
            stripComments = gcodes.gcodeStrip || false,
            cmdToolChange = gcodes.gcodeChange || [ "M6 T{tool}" ],
            cmdSpindle = gcodes.gcodeSpindle || [ "M3 S{speed}" ],
            cmdDwell = gcodes.gcodeDwell || [ "G4 P{time}" ],
            bounds = widget.getCamBounds(settings),
            bed = settings.device,
            spro = settings.process,
            sout = settings.process,
            decimals = 4,
            pos = { x:null, y:null, z:null, f:null, t:null },
            line,
            cidx,
            mode = 0,
            point,
            points = 0,
            hasStock = spro.camStockZ && spro.camStockX && spro.camStockY,
            zmax = hasStock ? spro.camStockZ : bounds.max.z,
            runbox = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            },
            offset = sout.outputOriginCenter ? null : {
                    x: bounds.max.x, //bed.bedWidth/2,
                    y: bounds.max.y //bed.bedDepth/2
            },
            consts = {
                    tool: 0,
                    tool_name: "unknown",
                    top: offset ? bed.bedDepth : bed.bedDepth/2,
                    left: offset ? 0 : -bed.bedWidth/2,
                    right: offset ? bed.bedWidth : bed.bedWidth/2,
                    bottom: offset ? 0 : -bed.bedDepth/2,
                    time: 0
            },
            append;

        if (online) {
            append = function(line) {
                if (line) {
                    lines++;
                    bytes += line.length;
                    output.append(line);
                }
                if (!line || output.length > 1000) {
                    online(output.join("\n"));
                    output = [];
                }
            };
        } else {
            append = function(line) {
                if (!line) return;
                output.append(line);
                lines++;
                bytes += line.length;
            }
        }

        function filterEmit(array, consts) {
            if (!array) return;
            for (i=0; i<array.length; i++) {
                line = print.constReplace(array[i], consts);
                if (stripComments && (cidx = line.indexOf(";")) >= 0) {
                    line = line.substring(0, cidx).trim();
                    if (line.length === 0) continue;
                }
                append(line);
            }
        }

        function add0(val) {
            var s = val.toString(),
                d = s.indexOf(".");
            if (d < 0) {
                return s + '.0';
            } else {
                return s;
            }
        }

        function toolNameByNumber(number, tools) {
            for (var i=0; i<tools.length; i++) {
                if (tools[i].number === number) return tools[i].name;
            }
            return "unknown";
        }

        function moveTo(out) {
            var newpos = out.point;

            // no point == dwell
            // out.speed = time to dwell in ms
            if (!newpos) {
                time += out.speed;
                consts.time = out.speed;
                filterEmit(cmdDwell, consts);
                return;
            }

            newpos.x = UTIL.round(newpos.x, decimals);
            newpos.y = UTIL.round(newpos.y, decimals);
            newpos.z = UTIL.round(newpos.z, decimals);

            // on tool change
            if (out.tool != pos.t) {
                pos.t = out.tool;
                consts.tool = pos.t;
                consts.tool_name = toolNameByNumber(out.tool, settings.tools);
                filterEmit(cmdToolChange, consts);
            }

            var feed = out.speed,
                nl = [feed ? 'G1' : 'G0'],
                dx = newpos.x - pos.x,
                dy = newpos.y - pos.y,
                dz = newpos.z - pos.z,
                dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // drop dup points (all deltas are 0)
            if (!(dx || dy || dz)) {
                return;
            }

            if (newpos.x !== pos.x) {
                pos.x = newpos.x;
                runbox.min.x = Math.min(runbox.min.x, pos.x);
                runbox.max.x = Math.max(runbox.max.x, pos.x);
                nl.append(space).append("X").append(add0(pos.x));
            }
            if (newpos.y !== pos.y) {
                pos.y = newpos.y;
                runbox.min.y = Math.min(runbox.min.y, pos.y);
                runbox.max.y = Math.max(runbox.max.y, pos.y);
                nl.append(space).append("Y").append(add0(pos.y));
            }
            if (newpos.z !== pos.z) {
                pos.z = newpos.z;
                runbox.min.z = Math.min(runbox.min.z, pos.z);
                runbox.max.z = Math.max(runbox.max.z, pos.z);
                nl.append(space).append("Z").append(add0(pos.z));
            }
            if (feed && feed !== pos.f) {
                pos.f = feed;
                nl.append(space).append("F").append(feed);
            }

            // update time calculation
            time += pos.f / 60 * dist;

            // if (comment && !stripComments) {
            //     nl.append(" ; ").append(comment);
            //     nl.append(" ; ").append(points);
            // }

            append(nl.join(''));
            points++;
        }

        // emit gcode preamble
        filterEmit(gcodes.gcodePre, consts);

        // remap points as necessary for origins, offsets, inversions
        print.output.forEach(function(layer) {
            layer.forEach(function(out) {
                point = out.point;
                if (!point || point.mod) return;
                point.mod = 1;
                if (offset) {
                    point.x += offset.x;
                    point.y += offset.y;
                }
                if (sout.outputInvertX) point.x = -point.x;
                if (sout.outputInvertY) point.y = -point.y;
                if (sout.camOriginTop) point.z = point.z - zmax;
            });
        });

        // emit all points in layer/point order
        print.output.forEach(function (layerout) {
            if (mode !== layerout.mode) {
                if (mode && !stripComments) append("; ending " + MODES[mode] + " after " + Math.round(time/60) + " seconds");
                mode = layerout.mode;
                if (!stripComments) append("; starting " + MODES[mode]);
            }
            if (layerout.spindle && layerout.spindle !== spindle) {
                spindle = layerout.spindle;
                if (spindle > 0) {
                    filterEmit(cmdSpindle, {speed: Math.abs(spindle)});
                } else {
                    append("M4");
                }
                // append((spindle > 0 ? "M3" : "M4") + " S" + Math.abs(spindle));
            }
            layerout.forEach(function(out) {
                moveTo(out);
            });
        });
        if (mode && !stripComments) append("; ending " + MODES[mode] + " after " + Math.round(time/60) + " seconds");

        // emit gcode post
        filterEmit(gcodes.gcodePost, consts);

        // flush buffered gcode
        append();

        print.time = time;
        print.lines = lines;
        print.bytes = bytes + lines - 1;
        print.bounds = runbox;

        return online ? null : output.join("\n");
    };

})();
