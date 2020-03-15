/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_cam = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.CAM) return;

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        CAM = KIRI.driver.CAM = {
            slice,
            printSetup,
            printExport,
            getToolById,
            getToolDiameter
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
        HPI = Math.PI/2,
        SLICER = KIRI.slicer,
        newLine = BASE.newLine,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        time = UTIL.time;

    function getToolById(settings, id) {
        for (let i=0, t=settings.tools; i<t.length; i++) {
            if (t[i].id === id) return t[i];
        }
        return null;
    };

    function getToolDiameter(settings, id) {
        let tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.flute_diam;
    };

    function getToolTipDiameter(settings, id) {
        let tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.taper_tip;
    };

    function getToolShaftDiameter(settings, id) {
        let tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.shaft_diam;
    };

    function getToolShaftOffset(settings, id) {
        let tool = getToolById(settings, id);
        if (!tool) return 0;
        return (tool.metric ? 1 : 25.4) * tool.flute_len;
    };

    function createToolProfile(settings, id, topo) {
        // generate tool profile
        let tool = getToolById(settings, id),
            ball = tool.type === "ballmill",
            taper = tool.type === "tapermill",
            shaft_diameter = getToolShaftDiameter(settings, id),
            shaft_radius = shaft_diameter / 2,
            shaft_pix_float = shaft_diameter / topo.resolution,
            shaft_pix_int = Math.round(shaft_pix_float),
            shaft_radius_pix_float = shaft_pix_float / 2,
            shaft_offset = getToolShaftOffset(settings, id),
            flute_diameter = getToolDiameter(settings, id),
            flute_radius = flute_diameter / 2,
            flute_pix_float = flute_diameter / topo.resolution,
            // flute_pix_int = Math.round(flute_pix_float),
            flute_radius_pix_float = flute_pix_float / 2,
            tip_diameter = getToolTipDiameter(settings, id),
            tip_pix_float = tip_diameter / topo.resolution,
            tip_radius_pix_float = tip_pix_float / 2,
            tip_max_radius_offset = flute_radius_pix_float - tip_radius_pix_float,
            profile_pix_iter = shaft_pix_int + (1 - shaft_pix_int % 2),
            toolCenter = (shaft_pix_int - (shaft_pix_int % 2)) / 2,
            toolOffset = [],
            larger_shaft = shaft_diameter - flute_diameter > 0.001;

        // console.log({
        //     tool: tool.name,
        //     rez: topo.resolution,
        //     diam: flute_diameter,
        //     pix: flute_pix_float.toFixed(2),
        //     rad: flute_radius_pix_float.toFixed(2),
        //     tocks: profile_pix_iter,
        //     shaft_offset,
        //     larger_shaft
        // });

        // for each point in tool profile, check inside radius
        for (let x = 0; x < profile_pix_iter; x++) {
            for (let y = 0; y < profile_pix_iter; y++) {
                let dx = x - toolCenter,
                    dy = y - toolCenter,
                    dist_from_center = Math.sqrt(dx * dx + dy * dy);
                if (dist_from_center <= flute_radius_pix_float) {
                    // console.log({x,y,dx,dy,dist:dist_from_center,ln:dbl.length})
                    // flute offset points
                    let z_offset = 0;
                    if (ball) {
                        z_offset = (1 - Math.cos((dist_from_center / flute_radius_pix_float) * HPI)) * -flute_radius;
                    } else if (taper && dist_from_center >= tip_radius_pix_float) {
                        z_offset = ((dist_from_center - tip_radius_pix_float) / tip_max_radius_offset) * -shaft_offset;
                    }
                    toolOffset.push(dx, dy, z_offset);
                } else if (shaft_offset && larger_shaft && dist_from_center <= shaft_radius_pix_float) {
                    // shaft offset points
                    toolOffset.push(dx, dy, -shaft_offset);
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

        let topo = widget.topo,
            rez = topo.resolution,
            bounds = widget.getBoundingBox(),
            dx = x2-x1,
            dy = y2-y1,
            md = Math.max(Math.abs(dx),Math.abs(dy)),
            mi = md / rez,
            ix = dx / mi,
            iy = dy / mi,
            zmax = 0;

        // implement fast grid fingerprinting. if no z variance within
        // the scan area (or min scan delta set from last point), then
        // use the last computed zmax and carry on
        while (mi-- > 0) {
            let tx1 = Math.round((x1 - bounds.min.x) / rez),
                ty1 = Math.round((y1 - bounds.min.y) / rez);
            zmax = Math.max(zmax, getMaxTopoToolZ(topo, profile, tx1, ty1, true));
            x1 += ix;
            y1 += iy;
        }

        return zmax;
    };

    const lastTopo = {
        lx:0,
        ly:0,
        lr:undefined
    };

    /**
     * x,y are in topo grid int coordinates
     */
    function getMaxTopoToolZ(topo, profile, x, y, floormax) {
        let tv, tx, ty, tz, gv, i = 0, mz = -1;

        const sx = topo.stepsx, sy = topo.stepsy;

        let {lx, ly, lr} = lastTopo;
        let dx = x - lx;
        let dy = y - ly;

        while (i < profile.length) {
            // tool profile point x, y, and z offsets
            let tx = profile[i++];
            let ty = profile[i++];
            let tz = profile[i++];
            // only check points in the direction of travel
            if (dx == -1 && tx > 0) continue;
            if (dx ==  1 && tx < 0) continue;
            if (dy == -1 && ty > 0) continue;
            if (dy ==  1 && ty < 0) continue;
            // update with tool profile point offset
            tx += x;
            ty += y;
            // if outside max topo steps, skip
            if (tx < 0 || tx >= sx || ty < 0 || ty >= sy) {
                continue;
            }
            // lookup grid value @ tx, ty
            gv = topo.data[tx * sy + ty];
            // outside the topo
            if (gv === undefined) {
                console.log("outside");
                continue;
            }
            // inside the topo but off the part
            if (floormax && gv === 0) {
                // console.log("off topo");
                // return topo.bounds.max.z;
                gv = topo.bounds.max.z;
            }
            // update the rest
            mz = Math.max(tz + gv, mz);
        }

        lastTopo.lx = x;
        lastTopo.ly = y;
        lastTopo.lr = Math.max(mz,0);//mz >= 0.0 ? mz : topo.bounds.max.z;

        return lastTopo.lr;
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
        let union, tops, last;

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
        let selected = null,
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
        let last, zlastout, emitted = [];

        function emit(slice) {
            // prevent double emit at end
            if (last === slice) return;
            last = slice;
            if (slice.camMode) {
                // clone to prevent double emit
                let nuslice = newSlice(slice.z);
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
        let forced = [];
        slices.forEach(function(slice) {
            if (slice.hasFlats) forced.push(slice);
        })

        let mid = [];
        forced.forEachPair(function(s1, s2) {
            // skip last to first pair
            if (s2.z > s1.z) return;
            let delta = Math.abs(s2.z - s1.z),
                inc = delta / step,
                nstep = step,
                dec = inc - Math.floor(inc),
                slop = step * 0.02; // allow 2% over/under on step alignment
            // skip if delta close to step
            if (Math.abs(delta - step) < slop) return;
            // add another step if decimal too high
            if (dec > slop) nstep = delta / Math.ceil(inc);
            // find closest slices in-between
            for (let zv = s1.z - nstep; zv >= s2.z + nstep/2; zv -= nstep) {
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
     * @param {Widget} widget
     * @param {Object} settings
     * @param {Function} ondone
     * @param {Function} onupdate
     */
    function generateTopoMap(widget, settings, ondone, onupdate) {
        let mesh = widget.mesh,
            proc = settings.process,
            outp = settings.process,
            units = settings.controller.units === 'in' ? 25.4 : 1,
            resolution = outp.camTolerance * units,
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
            let gridx = 0,
                gridy,
                gridi, // index
                gridv, // value
                miny = bounds.min.y,
                maxy = bounds.max.y,
                zMin = MAX(bounds.min.z, outp.camZBottom) + 0.0001,
                x, y, tv, ltv;

            // for each Y slice, find z grid value (x/z swapped)
            for (let j=0; j<slices.length; j++) {
                let slice = slices[j],
                    lines = slice.lines;
                gridy = 0;
                // slices have x/z swapped
                for (y = miny; y <= maxy; y += resolution) {
                    gridi = gridx * stepsy + gridy;
                    gridv = data[gridi] || 0;
                    // strategy using raw lines (faster slice, but more lines)
                    for (let i=0; i<lines.length; i++) {
                        // let {p1, p2} = lines[i];
                        let line = lines[i], p1 = line.p1, p2 = line.p2;
                        if (
                            (p1.z > zMin || p2.z > zMin) && // one endpoint above 0
                            (p1.z > gridv || p2.z > gridv) && // one endpoint above gridv
                            ((p1.y <= y && p2.y >= y) || // one endpoint left
                             (p2.y <= y && p1.y >= y)) // one endpoint right
                        ) {
                            let dy = p1.y - p2.y,
                                dz = p1.z - p2.z,
                                pct = (p1.y - y) / dy,
                                nz = p1.z - (dz * pct);
                            if (nz > gridv) {
                                gridv = data[gridi] = Math.max(nz, zMin);
                            }
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
                    ly = gridy = 0;
                    slice = newSlice(gridx, mesh.newGroup ? mesh.newGroup() : null);
                    slice.camMode = CPRO.FINISH_X;
                    slice.lines = newlines = [];
                    newtop = slice.addTop(newPolygon().setOpen()).poly;
                    newtrace = newPolygon().setOpen();
                    let sliceout = slice.tops[0].traces = [ ];
                    let latent;
                    for (y = bounds.min.y; y < bounds.max.y; y += resolution) {
                        gridv = data[gridx * stepsy + gridy];
                        if (gridv === undefined) {
                            // off topo (why?)
                            gridy++;
                            continue;
                        }
                        if (gridv === 0) {
                            // off part
                            if (latent) {
                                newtrace.push(latent);
                            }
                            if (newtrace.length > 0) {
                                sliceout.push(newtrace);
                                newtrace = newPolygon().setOpen();
                                latent = null;
                                ly = 0;
                            }
                            gridy++;
                            continue;
                        }
                        if (gridy === 0 || newtrace.length === 0) {
                            ltv = undefined;
                        }
                        tv = maxzat(gridx, gridy);
                        if (ly) {
                            if (mesh) newlines.push(newLine(
                                newPoint(x,ly,lv),
                                newPoint(x,y,gridv)
                            ));
                            let ang = Math.abs((Math.atan2(ltv - tv, resolution) * R2A) % 90);
                            // over max angle, turn into square edge (up or down)
                            if (ang > maxangle) {
                                if (latent) {
                                    newtrace.push(latent);
                                    latent = null;
                                }
                                if (ltv > tv) {
                                    // down = forward,down
                                    newtrace.push(newPoint(x,y,ltv));
                                } else {
                                    // up = up,forward
                                    newtrace.push(newPoint(x,ly,tv));
                                }
                            }
                        }
                        if (tv === ltv) {
                            latent = newPoint(x,y,tv);
                        } else {
                            if (latent) {
                                newtrace.push(latent);
                                latent = null;
                            }
                            newtrace.push(newPoint(x,y,tv));
                        }
                        ly = y;
                        lv = gridv;
                        ltv = tv;
                        gridy++;
                    }
                    if (latent) {
                        newtrace.push(latent);
                    }
                    if (newtrace.length > 0) {
                        sliceout.push(newtrace);
                    }
                    if (sliceout.length > 0) {
                        newslices.push(slice);
                    }
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
                    let sliceout = slice.tops[0].traces = [ ];
                    let latent;
                    for (x = bounds.min.x; x <= bounds.max.x; x += resolution) {
                        gridv = data[gridx * stepsy + gridy];
                        if (gridv === undefined) {
                            // off topo (why?)
                            gridx++;
                            continue;
                        }
                        if (gridv === 0) {
                            // off part
                            if (latent) {
                                newtrace.push(latent);
                            }
                            if (newtrace.length > 0) {
                                sliceout.push(newtrace);
                                newtrace = newPolygon().setOpen();
                                latent = null;
                                lx = 0;
                            }
                            gridx++;
                            continue;
                        }
                        tv = maxzat(gridx, gridy);
                        if (gridx === 0 || newtrace.length === 0) {
                            ltv = undefined;
                        }
                        if (lx) {
                            if (mesh) newlines.push(newLine(
                                newPoint(lx,y,lv),
                                newPoint(x,y,gridv)
                            ));
                            let ang = Math.abs((Math.atan2(ltv - tv, resolution) * R2A) % 90);
                            // over max angle, turn into square edge (up or down)
                            if (ang > maxangle) {
                                if (latent) {
                                    newtrace.push(latent);
                                    latent = null;
                                }
                                if (ltv > tv) {
                                    // down = forward,down
                                    newtrace.push(newPoint(x,y,ltv));
                                } else {
                                    // up = up,forward
                                    newtrace.push(newPoint(lx,y,tv));
                                }
                            }
                        }
                        if (tv === ltv) {
                            latent = newPoint(x,y,tv);
                        } else {
                            if (latent) {
                                newtrace.push(latent);
                                latent = null;
                            }
                            newtrace.push(newPoint(x,y,tv));
                        }
                        lx = x;
                        lv = gridv;
                        ltv = tv;
                        gridx++;
                    }
                    if (latent) {
                        newtrace.push(latent);
                    }
                    if (newtrace.length > 0) {
                        sliceout.push(newtrace);
                    }
                    if (sliceout.length > 0) {
                        newslices.push(slice);
                        // console.log(sliceout.map(v => v.length))
                    }
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
        let outer = [],
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
        let tops = slice.gatherTopPolys([]).clone(true),
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
     * Find top paths to trace when using ball and taper mills
     * in waterline finishing and tracing modes.
     */
    function findTracingPaths(widget, slice, tool, profile, partial) {
        // for now, only emit completed polys and not segments
        // TODO consider limiting to nup path lengths that are >= tool radius
        let only_whole = !partial;
        // check for ball and taper mills paths and add to top[0].inner
        let polys = [];
        let nups = [];
        let cull = [];
        slice.gatherTopPolys([]).forEach(poly => poly.flattenTo(polys));
        polys.forEach(poly => {
            let pz = poly.first().z;
            let mz = -Infinity;
            let np = newPolygon().setOpen();
            let mp = 0;
            // find top poly segments that are not significantly offset
            // from tool profile and add to new polygons which accumulate
            // to the top inner array
            poly.forEachSegment((p1,p2) => {
                let nz = getTopoZPathMax(widget, profile, p1.x, p1.y, p2.x, p2.y);
                if (nz > mz) {
                    mz = nz;
                }
                // this # should be computed from topo resolution
                if (nz - pz < 0.01) {
                    mp++
                    if (np.length) {
                        if (!np.first().isEqual(p2)) {
                            np.append(p2);
                        } else {
                            np.setClosed();
                        }
                    } else {
                        np.append(p1).append(p2);
                    }
                } else if (np.length) {
                    if (!only_whole) {
                        nups.append(np);
                    }
                    np = newPolygon().setOpen();
                }
            });
            if (np.length) {
                if (np.length === poly.length) {
                    np.setClosed();
                }
                // if a trace poly has no interruptions for an endmill
                // and it's an inner poly, eliminate it from the parent
                // so it won't be offset.
                let parent = poly.parent;
                if (np.isClosed() && parent) {
                    // console.log(slice.z,'cull',poly);
                    if (parent.inner) {
                        parent.inner = parent.inner.filter(p => p !== poly);
                    }
                    if (only_whole) {
                        nups.append(np);
                    }
                }
                if (!only_whole) {
                    nups.append(np);
                }
            }
        });
        if (nups.length) {
            // console.log(slice.z,'nups',nups.length);
            slice.tops[0].inner = nups;
        }
    }

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

        let tops = slice.gatherTopPolys([]).clone(true),
            offset = POLY.expand(tops, diameter / 2, slice.z);

        // when pocket only, drop first outer poly
        // if it matches the shell and promote inner polys
        if (pocket) {
            offset = POLY.filter(POLY.diff(shell, offset, slice.z), [], function(poly) {
                if (poly.area() < 1) return null;
                for (let sp=0; sp<shell.length; sp++) {
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

        slice.tops[0].traces = output;

        // append inner traces from findTracingPaths
        let inner = slice.tops[0].inner;
        if (inner) {
            // console.log(slice.z,'inner',inner.length)
            // output.append(...inner);
            // slice.tops[0].inner = null;
        }
    };

    /**
     * DRIVER SLICE CONTRACT
     *
     * @param {Object} settings
     * @param {Widget} widget
     * @param {Function} output
     */
    function slice(settings, widget, onupdate, ondone) {
        let conf = settings,
            proc = conf.process,
            sliceAll = widget.slices = [],
            unitsName = settings.controller.units,
            units = unitsName === 'in' ? 25.4 : 1,
            roughToolDiam = getToolDiameter(conf, proc.roughingTool),
            finishToolDiam = getToolDiameter(conf, proc.finishingTool),
            drillToolDiam = getToolDiameter(conf, proc.drillTool),
            procRough = proc.roughingOn && proc.roughingDown && roughToolDiam,
            procFinish = proc.finishingOn && proc.finishingDown && finishToolDiam,
            procFinishX = proc.finishingXOn && proc.finishingPlunge && finishToolDiam,
            procFinishY = proc.finishingYOn && proc.finishingPlunge && finishToolDiam,
            anyFinish = procFinish || procFinishX || procFinishY,
            procFacing = proc.roughingOn && proc.camZTopOffset,
            procDrill = proc.drillingOn && proc.drillDown && proc.drillDownSpeed,
            sliceDepth = MAX(0.1, MIN(proc.roughingDown, proc.finishingDown) / 3) * units,
            // pocketOnly = proc.camPocketOnly,
            pocketOnlyRough = proc.camPocketOnlyRough,
            pocketOnlyFinish = proc.camPocketOnlyFinish,
            // addTabs = proc.camTabsOn && !pocketOnly,
            addTabsRough = procRough && proc.camTabsOn && !pocketOnlyRough,
            addTabsFinish = procFinish && proc.camTabsOn && !pocketOnlyFinish,
            tabWidth = proc.camTabsWidth * units,
            tabHeight = proc.camTabsHeight * units,
            mesh = widget.mesh,
            bounds = widget.getBoundingBox(),
            zMin = MAX(bounds.min.z, proc.camZBottom) * units,
            shellRough,
            shellFinish,
            facePolys;

        if (sliceDepth <= 0.05) {
            return ondone(`invalid slice depth (${sliceDepth.toFixed(2)} ${unitsName})`);
        }

        if (!(procRough || anyFinish || procFacing || procDrill)) {
            return ondone("no processes selected");
        }

        // cut outside traces at the right points
        const addCutoutTabs = function(slice, toolDiam) {
            // too high
            if (slice.z > zMin + tabHeight) return;
            // no tops / traces
            if (slice.tops.length === 0) return;

            let trace, index, maxArea = 0, tmpArea;

            // find trace with greatest area
            slice.tops[0].traces.forEach(function(trc, idx) {
                if ((tmpArea = trc.area()) > maxArea) {
                    maxArea = tmpArea;
                    index = idx;
                    trace = trc;
                }
            });

            // required to match computed order of cutouts
            trace.setClockwise();

            let count = proc.camTabsCount;
            let angle = proc.camTabsAngle;
            let angle_inc = 360 / count;
            let center = BASE.newPoint(0,0,slice.z);
            let offset = (tabWidth + toolDiam) / 2;
            let ints = [];
            let segs = [];
            while (count-- > 0) {
                let slope = BASE.newSlopeFromAngle(angle);
                let normal = BASE.newSlopeFromAngle(angle + 90);
                let c1 = center.projectOnSlope(normal, offset);
                let c2 = center.projectOnSlope(normal, -offset);
                let o1 = c1.projectOnSlope(slope, 10000);
                let o2 = c2.projectOnSlope(slope, 10000);
                let int1 = trace.intersections(c1, o1).pop();
                let int2 = trace.intersections(c2, o2).pop();
                if (int1 && int2) {
                    ints.push(int1);
                    ints.push(int2);
                }
                angle -= angle_inc;
                // segs.push(newPolygon([c1,o1]));
                // segs.push(newPolygon([c2,o2]));
            }
            if (ints.length) {
                ints.push(ints.shift());
                for (let i=0; i<ints.length; i+=2) {
                    segs.push(trace.emitSegment(ints[i], ints[i+1]));
                }
                // replace intersected trace with segments
                slice.tops[0].traces.splice(index, 1, ...segs);
            } else {
                console.log(`unable to compute tabs for slice @ ${slice.z}`);
            }
        }

        // called when horizontal slicing complete
        const camSlicesDone = function(slices) {

            const camShell = pancake(slices, function(update) {
                onupdate(0.25 + update * 0.15, "shelling");
            });

            const camShellPolys = shellRough = facePolys = camShell.gatherTopPolys([]);

            if (procRough && !pocketOnlyRough) {
                // expand shell by half tool diameter + stock to leave
                shellRough = facePolys = POLY.expand(shellRough, (roughToolDiam / 2) + proc.roughingStock, 0);
            }

            if (anyFinish && pocketOnlyRough && !pocketOnlyFinish) {
                facePolys = POLY.expand(shellRough, (roughToolDiam / 2) + proc.roughingStock, 0);
            }

            if (anyFinish && pocketOnlyFinish) {
                shellFinish = POLY.expand(camShellPolys, -finishToolDiam/2, 0);
            }

            // hollow area from top of stock to top of part
            if (procFacing) {
                let ztop = bounds.max.z,
                    zpos = ztop + (proc.camZTopOffset * units),
                    zstep = proc.roughingDown * units;

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
                let selected = [];
                selectSlices(slices, proc.roughingDown * units, CPRO.ROUGH, selected);
                sliceAll.appendAll(selected);
            }

            if (procFinish) {
                let selected = [];
                selectSlices(slices, proc.finishingDown * units, CPRO.FINISH, selected);
                sliceAll.appendAll(selected);
            }

            if (procDrill) {
                let drills = [],
                    centerDiff = drillToolDiam * 0.1,
                    area = (drillToolDiam/2) * (drillToolDiam/2) * Math.PI,
                    areaDelta = area * 0.05;

                slices.forEach(function(slice) {
                    let inner = slice.gatherTopPolyInners([]);
                    inner.forEach(function(poly) {
                        if (poly.circularity() >= 0.985 && Math.abs(poly.area() - area) <= areaDelta) {
                            let center = poly.circleCenter(),
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
                    let center = drill.center(true),
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
        doSlicing(widget, {height: sliceDepth, cam:true, zmin:proc.camZBottom}, camSlicesDone, function(update) {
            onupdate(0.0 + update * 0.25, "slicing");
        });

        // we need topo for safe travel moves when roughing and finishing
        // not generated when drilling-only. then all z moves use bounds max
        if (procRough || anyFinish)
        generateTopoMap(widget, settings, function(slices) {
            sliceAll.appendAll(slices);
            // todo union rough / finish shells
            // todo union rough / finish tabs
            // todo append to generated topo map
        }, function(update, msg) {
            onupdate(0.40 + update * 0.50, msg || "create topo");
        });

        // prepare for tracing paths
        let tool;
        let profile;
        if (procFinish) {
            tool = getToolById(conf, proc.finishingTool);
            if (tool.type !== 'endmill') {
                profile = createToolProfile(conf, proc.finishingTool, widget.topo);
            }
        }

        // for each final slice, do post-processing
        sliceAll.forEach(function(slice, index) {
            // re-index
            slice.index = index;
            switch (slice.camMode) {
                case CPRO.FACING:
                    createFacingSlices(slice, facePolys, roughToolDiam, proc.roughingOver, pocketOnlyRough);
                    break;
                case CPRO.ROUGH:
                    createRoughingSlices(slice, shellRough, roughToolDiam, proc.roughingStock * units, proc.roughingOver, pocketOnlyRough);
                    if (addTabsRough) addCutoutTabs(slice, roughToolDiam);
                    break;
                case CPRO.FINISH:
                    if (profile) findTracingPaths(widget, slice, tool, profile);
                    createFinishingSlices(slice, shellFinish, finishToolDiam, pocketOnlyFinish);
                    if (addTabsFinish) addCutoutTabs(slice, finishToolDiam);
                    break;
            }
            onupdate(0.90 + (index / sliceAll.length) * 0.10, "finishing")
        }, "cam post");

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
        let getTool = getToolById,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            stock = settings.stock,
            outer = settings.bounds,
            widgetIndex = index || 0,
            widgetArray = print.widgets,
            widgetCount = widgetArray.length,
            widget = widgetArray[widgetIndex],
            alignTop = settings.controller.alignTop;

        if (widgetIndex >= widgetCount || !widget) return;
        let slices = widget.slices,
            bounds = widget.getCamBounds(settings),
            units = settings.controller.units === 'in' ? 25.4 : 1,
            hasStock = process.camStockZ && process.camStockX && process.camStockY,
            startCenter = process.outputOriginCenter,
            zclear = (process.camZClearance || 1) * units,
            zadd_outer = hasStock ? stock.z - outer.max.z : alignTop ? outer.max.z - outer.max.z : 0,
            zmax_outer = hasStock ? stock.z + zclear : outer.max.z + zclear,
            zadd = hasStock ? stock.z - bounds.max.z : alignTop ? outer.max.z - bounds.max.z : 0,
            zmax = hasStock ? stock.z + zclear : bounds.max.z + zclear,
            originx = startCenter ? 0 : hasStock ? -stock.x / 2 : bounds.min.x,
            originy = startCenter ? 0 : hasStock ? -stock.y / 2 : bounds.min.y,
            origin = hasStock ? newPoint(originx, originy, stock.z) : newPoint(originx, originy, bounds.max.z + zclear),
            output = print.output,
            modes = CPRO,
            depthFirst = process.camDepthFirst,
            easeDown = process.camEaseDown,
            tolerance = process.camTolerance * units,
            drillDown = process.drillDown * units,
            drillLift = process.drillLift * units,
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

        // console.log({index, zadd, zmax, sz:stock.z, bz:bounds.max.z, oz:outer.max.z, at:alignTop});

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
                toolDiamMove = toolDiam; // TODO validate w/ multiple models
                if (widget.topo) {
                    toolProfile = createToolProfile(settings, toolID, widget.topo);
                }
                lastTool = toolID;
            }
            feedRate = feed;
            plungeRate = plunge;
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
            // TODO emit in next-closest-order
            // polys.forEach(function(poly) {
            //     emitDrill(poly, drillDown, drillLift, drillDwell);
            // });
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
            let rate = feedRate;
            // only when we have a previous point to compare to
            if (lastPoint) {
                let deltaXY = lastPoint.distTo2D(point),
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
                    let maxz = toolProfile ? MAX(
                            getTopoZPathMax(
                                widget,
                                toolProfile,
                                lastPoint.x,
                                lastPoint.y,
                                point.x,
                                point.y) + zadd,
                            point.z,
                            lastPoint.z) : zmax + zadd,
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
                    let threshold = MIN(deltaXY / 2, absDeltaZ),
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
                layerPush(point.clone().setZ(zmax_outer + zadd_outer), 0, 0, tool.number);
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
        let depthData = {
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
                        let polys = [];
                        top.traces.forEach(function (poly) {
                            polys.push(poly);
                            if (poly.inner) {
                                poly.inner.forEach(function(inner) {
                                    polys.push(inner);
                                })
                            }
                        });
                        // set winding specified in output
                        POLY.setWinding(polys, process.outputClockwise, false);
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
                    let dir = process.outputClockwise;
                    if (slice.camMode === modes.ROUGH) {
                        setTool(process.roughingTool, process.roughingSpeed, process.roughingPlunge);
                        spindle = Math.min(spindleMax, process.roughingSpindle);
                        depthData.roughDiam = toolDiam;
                    } else {
                        setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                        spindle = Math.min(spindleMax, process.finishingSpindle);
                        depthData.finishDiam = toolDiam;
                        if (!process.camPocketOnlyFinish) {
                            dir = !dir;
                        }
                    }
                    // todo find closest next trace/trace-point
                    slice.tops.forEach(function(top) {
                        if (!top.poly) return;
                        if (!top.traces) return;
                        let polys = [], t = [], c = [];
                        POLY.flatten(top.traces, top.inner || []).forEach(function (poly) {
                            let child = poly.parent;
                            if (depthFirst) poly = poly.clone(true);
                            if (child) c.push(poly); else t.push(poly);
                            poly.layer = depthData.layer;
                            polys.push(poly);
                        });
                        // set cut direction on outer polys
                        POLY.setWinding(t, dir);
                        // set cut direction on inner polys
                        POLY.setWinding(c, !dir);
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
                    if (isNewMode || !printPoint) {
                        // force start at lower left corner
                        printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);
                    }
                    setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                    spindle = Math.min(spindleMax, process.finishingSpindle);
                    depthData.finishDiam = toolDiam;
                    // todo find closest next trace/trace-point
                    slice.tops.forEach(function(top) {
                        if (!top.traces) return;
                        let polys = [], poly, emit;
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
                                return lastPoint;
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
                    let last = null;
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
                    let last = null;
                    if (easeDown && poly.isClosed()) {
                        last = poly.forEachPointEaseDown(function(point, offset) {
                            camOut(point.clone(), offset > 0);
                        }, fromPoint);
                    } else {
                        poly.forEachPoint(function(point, pidx, points, offset) {
                            camOut(point.clone(), offset !== 0);
                            last = point;
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
                let linearxy = [].appendAll(depthData.linearx).appendAll(depthData.lineary);
                printPoint = tip2tipEmit(linearxy, printPoint, function(el, point, count) {
                    let poly = el.poly;
                    if (poly.last() === point) {
                        poly.reverse();
                    }
                    poly.forEachPoint(function(point, pidx) {
                        camOut(point.clone(), pidx > 0);
                    }, false);
                    newLayer();
                    return lastPoint;
                });
            } else {
                setTool(process.finishingTool, process.finishingSpeed, process.finishingPlunge);
                spindle = Math.min(spindleMax, process.finishingSpindle);
                // deferred linear x finishing
                if (depthData.linearx.length > 0) {
                    // force start at lower left corner
                    // printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);
                    printPoint = tip2tipEmit(depthData.linearx, printPoint, function(el, point, count) {
                        let poly = el.poly;
                        if (poly.last() === point) poly.reverse();
                        poly.forEachPoint(function(point, pidx) {
                            camOut(point.clone(), pidx > 0);
                        }, false);
                        newLayer();
                        return lastPoint;
                    });
                }
                // deferred linear y finishing
                if (depthData.lineary.length > 0) {
                    // force start at lower left corner
                    // printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);
                    printPoint = tip2tipEmit(depthData.lineary, printPoint, function(el, point, count) {
                        let poly = el.poly;
                        if (poly.last() === point) poly.reverse();
                        poly.forEachPoint(function(point, pidx) {
                            camOut(point.clone(), pidx > 0);
                        }, false);
                        newLayer();
                        return lastPoint;
                    });
                }
            }
        }

        // drilling is always depth first
        if (depthData.drill.length > 0) {
            setTool(process.drillTool, process.drillDownSpeed, process.drillDownSpeed);
            emitDrills(depthData.drill);
        }

        // last layer/move is to zmax
        // printPoint = lastPoint.clone();
        // lastPoint = null;
        camOut(printPoint.clone().setZ(bounds.max.z + zclear), false);
        newOutput.push(layerOut);

        // replace output single flattened layer with all points
        print.output = newOutput;

        if (widgetIndex + 1 < widgetCount) {
            printSetup(print, update, widgetIndex + 1, printPoint);
        }
    };

    /**
     * @returns {Array} gcode lines
     */
    function printExport(print, online) {
        let widget = print.widgets[0];

        if (!widget) return;

        let i,
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
            units = 1,//settings.controller.units === 'in' ? 25.4 : 1,
            spro = settings.process,
            dev = settings.device,
            decimals = 4,
            pos = { x:null, y:null, z:null, f:null, t:null },
            line,
            cidx,
            mode = 0,
            point,
            points = 0,
            hasStock = spro.camStockZ && spro.camStockX && spro.camStockY,
            zmax = hasStock ? settings.stock.z : bounds.max.z,
            runbox = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            },
            offset = {
                    x: -settings.origin.x,
                    y:  settings.origin.y
            },
            consts = {
                    tool: 0,
                    tool_name: "unknown",
                    top: (offset ? dev.bedDepth : dev.bedDepth/2) * units,
                    left: (offset ? 0 : -dev.bedWidth/2) * units,
                    right: (offset ? dev.bedWidth : dev.bedWidth/2) * units,
                    bottom: (offset ? 0 : -dev.bedDepth/2) * units,
                    time_sec: 0,
                    time_ms: 0,
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
            let s = val.toString(),
                d = s.indexOf(".");
            if (d < 0) {
                return s + '.0';
            } else {
                return s;
            }
        }

        function toolNameByNumber(number, tools) {
            for (let i=0; i<tools.length; i++) {
                if (tools[i].number === number) return tools[i].name;
            }
            return "unknown";
        }

        function moveTo(out) {
            let newpos = out.point;

            // no point == dwell
            // out.speed = time to dwell in ms
            if (!newpos) {
                time += out.speed;
                consts.time_sec = out.speed / 1000;
                consts.time_ms = out.speed;
                consts.time = consts.time_sec;
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

            let speed = out.speed,
                feed = speed || spro.camFastFeed,
                nl = [speed ? 'G1' : 'G0'],
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
                nl.append(space).append("X").append(add0(pos.x * units));
            }
            if (newpos.y !== pos.y) {
                pos.y = newpos.y;
                runbox.min.y = Math.min(runbox.min.y, pos.y);
                runbox.max.y = Math.max(runbox.max.y, pos.y);
                nl.append(space).append("Y").append(add0(pos.y * units));
            }
            if (newpos.z !== pos.z) {
                pos.z = newpos.z;
                runbox.min.z = Math.min(runbox.min.z, pos.z);
                runbox.max.z = Math.max(runbox.max.z, pos.z);
                nl.append(space).append("Z").append(add0(pos.z * units));
            }
            if (feed && feed !== pos.f) {
                pos.f = feed;
                nl.append(space).append("F").append(feed * units);
            }

            // update time calculation
            time += (dist / (pos.f || 1000)) * 60;

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
                if (spro.outputInvertX) point.x = -point.x;
                if (spro.outputInvertY) point.y = -point.y;
                if (spro.camOriginTop) point.z = point.z - zmax;
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
