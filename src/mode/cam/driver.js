/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.CAM) return;

    const KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        CAM = KIRI.driver.CAM = {
            init,
            slice,
            sliceRender,
            printSetup,
            printExport,
            printRender,
            getToolById,
            getToolDiameter,
        },
        CPRO = CAM.process = {
            LEVEL: 1,
            ROUGH: 2,
            OUTLINE: 3,
            CONTOUR_X: 4,
            CONTOUR_Y: 5,
            TRACE: 6,
            DRILL: 7
        },
        MODES = [
            "unset",
            "level",
            "rough",
            "outline",
            "contour-x",
            "contour-y",
            "trace",
            "drill"
        ],
        HPI = Math.PI/2,
        SLICER = KIRI.slicer,
        newLine = BASE.newLine,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        time = UTIL.time;

    function init(kiri, api) {
        api.event.on("mode.set", (mode) => {
            let isCAM = mode === 'CAM';
            $('set-tools').style.display = isCAM ? '' : 'none';
            kiri.space.platform.setColor(isCAM ? 0xeeeeee : 0xcccccc);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.camTabs.marker.style.display = proc.camTabsOn ? 'flex' : 'none';
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
        });
    }

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

    /**
     * x,y are in topo grid int coordinates
     */
    function getMaxTopoToolZ(topo, profile, x, y, floormax) {
        let tv, tx, ty, tz, gv, i = 0, mz = -1;

        const sx = topo.stepsx, sy = topo.stepsy, xl = sx - 1, yl = sy - 1;

        while (i < profile.length) {
            // tool profile point x, y, and z offsets
            let tx = profile[i++] + x;
            let ty = profile[i++] + y;
            let tz = profile[i++];
            if (tx < 0 || tx > xl || ty < 0 || ty > yl) {
                // if outside max topo steps, use 0
                gv = 0;
            } else {
                // lookup grid value @ tx, ty
                gv = topo.data[tx * sy + ty] || 0;
            }
            // inside the topo but off the part
            if (floormax && gv === 0) {
                // return topo.bounds.max.z;
                gv = topo.bounds.max.z;
            }
            // update the rest
            mz = Math.max(tz + gv, mz);
        }

        return Math.max(mz,0);
    };

    /**
     * call out to slicer
     */
    function doSlicing(widget, options, ondone, onupdate) {
        SLICER.sliceWidget(widget, options, ondone, onupdate);
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
            diameter = getToolDiameter(settings, proc.camContourTool),
            tool = getToolById(settings, proc.camContourTool),
            toolStep = diameter * proc.camContourOver,
            traceJoin = diameter / 2,
            pocketOnly = proc.camOutlinePocket,
            bounds = widget.getBoundingBox().clone(),
            minX = bounds.min.x,// - diameter,
            maxX = bounds.max.x,// + diameter,
            minY = bounds.min.y,// - diameter,
            maxY = bounds.max.y,// + diameter,
            zBottom = outp.camZBottom * units,
            boundsX = maxX - minX,
            boundsY = maxY - minY,
            maxangle = proc.camContourAngle,
            curvesOnly = proc.camContourCurves,
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
            toolOffset = createToolProfile(settings, proc.camContourTool, topo),
            newslices = [],
            newlines,
            newtop,
            newtrace,
            sliceout,
            latent,
            lastP,
            slice, lx, ly,
            startTime = time();

        // return highest z within tools radius
        function maxzat(x,y) {
            return getMaxTopoToolZ(topo, toolOffset, x, y);
        }

        function push_point(x,y,z) {
            let newP = newPoint(x,y,z);
            if (lastP && lastP.z === z) {
                if (curvesOnly) {
                    end_poly();
                } else {
                    latent = newP;
                }
            } else {
                if (latent) {
                    newtrace.push(latent);
                    latent = null;
                }
                newtrace.push(newP);
            }
            lastP = newP;
        }

        function end_poly() {
            if (latent) {
                newtrace.push(latent);
            }
            if (newtrace.length > 0) {
                // add additional constraint on min perimeter()
                if (newtrace.length > 1) {
                    sliceout.push(newtrace);
                }
                newtrace = newPolygon().setOpen();
            }
            latent = undefined;
            lastP = undefined;
        }

        function topoSlicesDone(slices) {
            let gridx = 0,
                gridy,
                gridi, // index
                gridv, // value
                zMin = Math.max(bounds.min.z, zBottom) + 0.0001,
                x, y, tv, ltv;

            // for each Y slice, find z grid value (x/z swapped)
            for (let j=0, jl=slices.length; j<jl; j++) {
                let slice = slices[j],
                    lines = slice.lines;
                gridy = 0;
                // slices have x/z swapped
                for (y = minY; y < maxY && gridy < stepsy; y += resolution) {
                    gridi = gridx * stepsy + gridy;
                    gridv = data[gridi] || 0;
                    // strategy using raw lines (faster slice, but more lines)
                    for (let i=0, il=lines.length; i<il; i++) {
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
                onupdate(0.20 + (gridx/stepsx) * 0.50, "trace surface");
            }

            // x contouring
            if (proc.camContourXOn) {
                startTime = time();
                // emit slice per X
                for (x = minX; x <= maxX; x += toolStep) {
                    gridx = Math.round(((x - minX) / boundsX) * stepsx);
                    ly = gridy = 0;
                    slice = newSlice(gridx, mesh.newGroup ? mesh.newGroup() : null);
                    slice.camMode = CPRO.CONTOUR_X;
                    slice.lines = newlines = [];
                    newtop = slice.addTop(newPolygon().setOpen()).poly;
                    newtrace = newPolygon().setOpen();
                    sliceout = slice.tops[0].traces = [ ];
                    for (y = minY; y < maxY; y += resolution) {
                        if (pocketOnly && (data[gridx * stepsy + gridy] || 0) === 0) {
                            end_poly();
                            gridy++;
                            ly = 0;
                            continue;
                        }
                        tv = maxzat(gridx, gridy);
                        if (tv === 0) {
                            end_poly();
                            gridy++;
                            ly = 0;
                            continue;
                        }
                        if (ly) {
                            if (mesh) newlines.push(newLine(
                                newPoint(x,ly,ltv),
                                newPoint(x,y,tv)
                            ));
                            let ang = Math.abs((Math.atan2(ltv - tv, resolution) * R2A) % 90);
                            // over max angle, turn into square edge (up or down)
                            if (ang > maxangle) {
                                if (ltv > tv) {
                                    // down = forward,down
                                    push_point(x,y,ltv);
                                } else {
                                    // up = up,forward
                                    push_point(x,ly,tv);
                                }
                            }
                        }
                        push_point(x,y,tv);
                        ly = y;
                        ltv = tv;
                        gridy++;
                    }
                    end_poly();
                    if (sliceout.length > 0) {
                        newslices.push(slice);
                    }
                    onupdate(0.70 + (gridx/stepsx) * 0.15, "contour x");
                }
            }

            // y contouring
            if (proc.camContourYOn) {
                startTime = time();
                // emit slice per Y
                for (y = minY; y <= maxY; y += toolStep) {
                    gridy = Math.round(((y - minY) / boundsY) * stepsy);
                    lx = gridx = 0;
                    slice = newSlice(gridy, mesh.newGroup ? mesh.newGroup() : null);
                    slice.camMode = CPRO.CONTOUR_Y;
                    slice.lines = newlines = [];
                    newtop = slice.addTop(newPolygon().setOpen()).poly;
                    newtrace = newPolygon().setOpen();
                    sliceout = slice.tops[0].traces = [ ];
                    for (x = minX; x <= maxX; x += resolution) {
                        if (pocketOnly && (data[gridx * stepsy + gridy] || 0) === 0) {
                            end_poly();
                            gridx++;
                            ly = 0;
                            continue;
                        }
                        tv = maxzat(gridx, gridy);
                        if (tv === 0) {
                            end_poly();
                            gridx++;
                            lx = 0;
                            continue;
                        }
                        if (lx) {
                            if (mesh) newlines.push(newLine(
                                newPoint(lx,y,ltv),
                                newPoint(x,y,tv)
                            ));
                            let ang = Math.abs((Math.atan2(ltv - tv, resolution) * R2A) % 90);
                            // over max angle, turn into square edge (up or down)
                            if (ang > maxangle) {
                                if (ltv > tv) {
                                    // down = forward,down
                                    push_point(x,y,ltv);
                                } else {
                                    // up = up,forward
                                    push_point(lx,y,tv);
                                }
                            }
                        }
                        push_point(x,y,tv);
                        lx = x;
                        ltv = tv;
                        gridx++;
                    }
                    end_poly();
                    if (sliceout.length > 0) {
                        newslices.push(slice);
                    }
                    onupdate(0.85 + (gridy/stepsy) * 0.15, "contour y");
                }
            }

            ondone(newslices);
        }

        // slices progress left-to-right along the X axis
        doSlicing(widget, {height:resolution, swapX:true, topo:true}, topoSlicesDone, function(update) {
            onupdate(0.0 + update * 0.20, "topo slice");
        });
    }

    /**
     * Find top paths to trace when using ball and taper mills
     * in waterline outlining and tracing modes.
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

    // cut outside traces at the right points
    function addCutoutTabs(slice, toolDiam, tabWidth, tabCount, tabAngle) {
        // skip if no tops | traces
        if (slice.tops.length === 0) return;

        let notabs = 0;
        let nutrace = [];

        // find trace with greatest area
        slice.tops[0].traces.forEach(function(trace, index) {

            // required to match computed order of cutouts
            trace.setClockwise();

            let count = tabCount,
                angle = tabAngle,
                angle_inc = 360 / count,
                center = trace.bounds.center(slice.z),
                offset = (tabWidth + toolDiam) / 2,
                ints = [],
                segs = [];

            while (count-- > 0) {
                let slope = BASE.newSlopeFromAngle(angle),
                    normal = BASE.newSlopeFromAngle(angle + 90),
                    c1 = center.projectOnSlope(normal, offset),
                    c2 = center.projectOnSlope(normal, -offset),
                    o1 = c1.projectOnSlope(slope, 10000),
                    o2 = c2.projectOnSlope(slope, 10000),
                    int1 = trace.intersections(c1, o1).pop(),
                    int2 = trace.intersections(c2, o2).pop();
                if (int1 && int2) {
                    ints.push(int1);
                    ints.push(int2);
                }
                angle -= angle_inc;
            }

            if (ints.length) {
                ints.push(ints.shift());
                for (let i=0; i<ints.length; i+=2) {
                    segs.push(trace.emitSegment(ints[i], ints[i+1]));
                }
                // check for and eliminate overlaps
                for (let i=0, il=segs.length; i < il; i++) {
                    let si = segs[i];
                    for (let j=i+1; j<il; j++) {
                        let sj = segs[j];
                        if (sj.overlaps(si)) {
                            if (sj.perimeter() > si.perimeter()) {
                                sj._overlap = true;
                            }
                        }
                    }
                }
                // replace intersected trace with non-overlapping segments
                nutrace.appendAll(segs.filter(seg => !seg._overlap));
            } else {
                nutrace.push(trace);
                notabs++;
            }

        });

        if (notabs) {
            console.log(`unable to compute tabs for ${notabs} traces @ z=${slice.z}`);
        }

        slice.tops[0].traces = nutrace;
    }

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
            roughToolDiam = getToolDiameter(conf, proc.camRoughTool),
            outlineToolDiam = getToolDiameter(conf, proc.camOutlineTool),
            contourToolDiam = getToolDiameter(conf, proc.camContourTool),
            procFacing = proc.camRoughOn && proc.camZTopOffset,
            procRough = proc.camRoughOn && proc.camRoughDown && roughToolDiam,
            procOutlineIn = proc.camOutlineIn,
            procOutlineOn = proc.camOutlineOn,
            procOutlineWide = proc.camOutlineWide,
            procOutline = procOutlineOn && proc.camOutlineDown && outlineToolDiam,
            procContourX = proc.camContourXOn && proc.camOutlinePlunge && contourToolDiam,
            procContourY = proc.camContourYOn && proc.camOutlinePlunge && contourToolDiam,
            procContour = procContourX || procContourY,
            procDrill = proc.camDrillingOn && proc.camDrillDown && proc.camDrillDownSpeed,
            procDrillReg = proc.camDrillReg,
            procTrace = proc.camTraceOn,
            roughDown = procRough ? proc.camRoughDown : Infinity,
            outlineDown = procOutline ? proc.camOutlineDown : Infinity,
            sliceDepth = Math.max(0.1, Math.min(roughDown, outlineDown) / 3 * units),
            addTabsOutline = procOutlineOn && proc.camTabsOn,
            tabWidth = proc.camTabsWidth * units,
            tabHeight = proc.camTabsHeight * units,
            bounds = widget.getBoundingBox(),
            mesh = widget.mesh,
            zBottom = proc.camZBottom * units,
            zMin = Math.max(bounds.min.z, zBottom),
            zMax = bounds.max.z,
            zThru = zBottom === 0 ? (proc.camZThru || 0) * units : 0,
            ztOff = proc.camZTopOffset * units,
            camRoughStock = proc.camRoughStock * units,
            camRoughDown = proc.camRoughDown * units,
            sliceIndex = 0,
            thruHoles;

        if (settings.stock.x + 0.00001 < bounds.max.x - bounds.min.x) {
            return ondone('stock X too small for part. disable stock or use offset stock');
        }

        if (settings.stock.y + 0.00001 < bounds.max.y - bounds.min.y) {
            return ondone('stock Y too small for part. disable stock or use offset stock');
        }

        if (settings.stock.z + 0.00001 < bounds.max.z - bounds.min.z) {
            return ondone('stock Z too small for part. disable stock or use offset stock');
        }

        if (sliceDepth <= 0.05) {
            return ondone(`invalid slice depth (${sliceDepth.toFixed(2)} ${unitsName})`);
        }

        if (!(procFacing || procRough || procOutline || procContour || procDrill || procDrillReg)) {
            return ondone("no processes selected");
        }

        if (zMin >= bounds.max.z) {
            return ondone(`invalid z bottom >= bounds z max ${bounds.max.z}`);
        }

        // TODO cache terrain slicer info in widget
        // TODO pass widget.isModified() on slice and re-use if false
        // TODO pre-slice in background from client signal
        // TODO same applies to topo map generation
        let slicer = new KIRI.slicer2(widget.getPoints(), {
            zlist: true,
            zline: true
        });
        let tslices = [];
        let tshadow = [];
        let tzindex = slicer.interval(1, { fit: true, off: 0.01, down: true }); // bottom up 1mm steps
        let terrain = slicer.slice(tzindex, { each: (data, index, total) => {
            console.log('terrain', index, total, data);
            tshadow = POLY.union(tshadow.appendAll(data.tops), 0.01, true);
            tslices.push(data.slice);
            // let slice = data.slice;
            // slice.z = data.z;
            // slice.index = sliceIndex++;
            // slice.camMode = CPRO.LEVEL;
            // slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
            // sliceAll.push(slice);
            onupdate(0.0 + (index/total) * 0.1, "mapping");
        }, genso: true });
        let shadowTop = terrain[terrain.length - 1];
        console.log({slicer, tzindex, tshadow, terrain});

        if (procDrillReg) {
            sliceDrillReg(settings, widget, sliceAll, zThru);
        }

        if (procDrill) {
            sliceDrill(settings, widget, tslices, sliceAll);
        }

        // identify through holes
        thruHoles = tshadow.map(p => p.inner || []).flat();
        console.log({tshadow, thruHoles: thruHoles.clone(true)});

        // create facing slices
        if (procFacing) {
            let shadow = shadowTop.tops.clone();
            let inset = POLY.offset(shadow, (roughToolDiam / 4));
            let facing = POLY.offset(inset, -(roughToolDiam * proc.camRoughOver), { count: 999, flat: true });
            let zdiv = ztOff / roughDown;
            let zstep = (zdiv % 1 > 0) ? ztOff / (Math.floor(zdiv) + 1) : roughDown;
            for (let z = zMax + ztOff - zstep; z >= zMax; z -= zstep) {
                let slice = shadowTop.slice.clone(false);
                slice.z = z;
                slice.index = sliceIndex++;
                slice.camMode = CPRO.LEVEL;
                slice.tops[0].traces = POLY.setZ(facing.clone(), slice.z);
                sliceAll.push(slice);
            }
        }

        // create roughing slices
        if (procRough) {
            let shadow = [];
            let slices = [];
            slicer.slice(slicer.interval(roughDown, { down: true, min: zBottom }), { each: (data, index, total) => {
                shadow = POLY.union(shadow.appendAll(data.tops), 0.01, true);
                data.shadow = shadow.clone(true);
                data.slice.camMode = CPRO.ROUGH;
                data.slice.shadow = data.shadow;
                // data.slice.tops[0].inner = data.shadow;
                // data.slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
                slices.push(data.slice);
                onupdate(0.1 + (index/total) * 0.1, "roughing");
            }, genso: true });

            shadow = POLY.union(shadow.appendAll(shadowTop.tops), 0.01, true);

            // inset or eliminate thru holes from shadow
            shadow = POLY.flatten(shadow.clone(true), [], true);
            thruHoles.forEach(hole => {
                shadow = shadow.map(p => {
                    if (p.isEquivalent(hole)) {
                        // eliminate thru holes when roughing voids enabled
                        if (proc.camRoughVoid) {
                            return undefined;
                        }
                        let po = POLY.offset([p], -(roughToolDiam + camRoughStock));
                        return po ? po[0] : undefined;
                    } else {
                        return p;
                    }
                }).filter(p => p);
            });
            shadow = POLY.nest(shadow);

            // expand shadow by half tool diameter + stock to leave
            let shell = POLY.offset(shadow, (roughToolDiam / 4) + camRoughStock);

            slices.forEach(slice => {
                let shadow = slice.shadow;
                let offset = [shell.clone(true),shadow.clone(true)].flat();
                let flat = POLY.flatten(offset, [], true);
                let nest = POLY.setZ(POLY.nest(flat), slice.z);
                // slice.tops[0].inner = nest;
                // slice.tops[0].inner = POLY.setZ(shell.clone(true), slice.z);

                // inset offset array by 1/2 diameter then by tool overlap %
                offset = POLY.offset(nest, [-(roughToolDiam / 2 + camRoughStock), -roughToolDiam * proc.camRoughOver], {
                    z: slice.z,
                    count: 999,
                    flat: true,
                    call: (polys, count, depth) => {
                        // used in depth-first path creation
                        polys.forEach(p => {
                            p.depth = depth;
                            if (p.inner) {
                                p.inner.forEach(p => p.depth = depth);
                            }
                        });
                    }
                });

                slice.tops[0].traces = offset;
                slice.index = sliceIndex++;
            });
            sliceAll.appendAll(slices);
        }

        // create outline slices
        if (procOutline) {
            let shadow = [];
            let slices = [];
            slicer.slice(slicer.interval(outlineDown, { down: true, min: zBottom }), { each: (data, index, total) => {
                shadow = POLY.union(shadow.appendAll(data.tops), 0.01, true);
                data.shadow = shadow.clone(true);
                data.slice.camMode = CPRO.OUTLINE;
                data.slice.shadow = data.shadow;
                // data.slice.tops[0].inner = data.shadow;
                // data.slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
                slices.push(data.slice);
                onupdate(0.2 + (index/total) * 0.1, "outlines");
            }, genso: true });
            shadow = POLY.union(shadow.appendAll(shadowTop.tops), 0.01, true);

            // extend cut thru (only when z bottom is 0)
            if (zThru) {
                let last = slices[slices.length-1];
                let add = last.clone(true);
                add.camMode = last.camMode;
                add.tops.forEach(top => {
                    top.poly.setZ(add.z);
                });
                add.shadow = last.shadow.clone(true);
                add.z -= zThru;
                slices.push(add);
            }

            slices.forEach(slice => {
                let tops = slice.shadow;//.clone(true);
                let offset = POLY.expand(tops, outlineToolDiam / 2, slice.z);
                // when pocket only, drop first outer poly
                // if it matches the shell and promote inner polys
                if (procOutlineIn) {
                    let shell = POLY.expand(tops.clone(), outlineToolDiam / 2);
                    offset = POLY.filter(offset, [], function(poly) {
                        if (poly.area() < 1) {
                            return null;
                        }
                        for (let sp=0; sp<shell.length; sp++) {
                            // eliminate shell only polys
                            if (poly.isEquivalent(shell[sp])) {
                                if (poly.inner) return poly.inner;
                                return null;
                            }
                        }
                        return poly;
                    });
                } else {
                    if (procOutlineWide) {
                        offset.slice().forEach(op => {
                            POLY.expand([op], outlineToolDiam * 0.5, slice.z, offset, 1);
                        });
                    }
                }

                slice.tops[0].traces = offset;
                slice.index = sliceIndex++;

                if (addTabsOutline && slice.z <= zMin + tabHeight) {
                    addCutoutTabs(slice, outlineToolDiam, tabWidth, proc.camTabsCount, proc.camTabsAngle);
                }
            });
            sliceAll.appendAll(slices);
        }

        // we need topo for safe travel moves when roughing and outlining
        // not generated when drilling-only. then all z moves use bounds max.
        // also generates x and y contouring when selected
        if (procContour)
        generateTopoMap(widget, settings, function(slices) {
            sliceAll.appendAll(slices);
        }, function(update, msg) {
            onupdate(0.40 + update * 0.50, msg || "create topo");
        });

        // prepare for tracing paths
        let traceTool;
        let traceToolProfile;
        if (procTrace) {
            traceTool = getToolById(conf, proc.camTraceTool);
            if (traceTool.type !== 'endmill') {
                traceToolProfile = createToolProfile(conf, proc.camTraceTool, widget.topo);
            }
        }

        ondone();
    };

    // drilling op
    function sliceDrill(settings, widget, slices, output) {
        let drills = [],
            drillToolDiam = getToolDiameter(settings, settings.process.camDrillTool),
            centerDiff = drillToolDiam * 0.1,
            area = (drillToolDiam/2) * (drillToolDiam/2) * Math.PI,
            areaDelta = area * 0.05;

        // for each slice, look for polygons with 98.5% circularity whose
        // area is within the tolerance of a circle matching the tool diameter
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

        // drill points to use center (average of all points) of the polygon
        drills.forEach(function(drill) {
            let center = drill.center(true),
                slice = newSlice(0,null);
            drill.points.forEach(function(point) {
                point.x = center.x;
                point.y = center.y;
            });
            slice.camMode = CPRO.DRILL;
            slice.addTop(null).traces = [ drill ];
            output.append(slice);
        });
    }

    // drill registration holes
    function sliceDrillReg(settings, widget, output, zThru) {
        let proc = settings.process,
            stock = settings.stock,
            bounds = settings.bounds,
            mx = (bounds.max.x + bounds.min.x) / 2,
            my = (bounds.max.y + bounds.min.y) / 2,
            mz = zThru || 0,
            dx = (stock.x - (bounds.max.x - bounds.min.x)) / 4,
            dy = (stock.y - (bounds.max.y - bounds.min.y)) / 4,
            dz = stock.z,
            points = [];

        switch(proc.camDrillReg) {
            case "x axis":
                points.push(newPoint(bounds.min.x - dx, my, 0));
                points.push(newPoint(bounds.max.x + dx, my, 0));
                break;
            case "y axis":
                points.push(newPoint(mx, bounds.min.y - dy, 0));
                points.push(newPoint(mx, bounds.max.y + dy, 0));
                break;
        }

        if (points.length) {
            let slice = newSlice(0,null), polys = [];
            points.forEach(point => {
                polys.push(newPolygon()
                    .append(point.clone().setZ(bounds.max.z))
                    .append(point.clone().setZ(bounds.max.z - stock.z - mz)));
            });
            slice.camMode = CPRO.DRILL;
            slice.addTop(null).traces = polys;
            output.append(slice);
        }
    }

    // runs in browser main
    function sliceRender(widget) {
        let slices = widget.slices;
        if (!slices) return;

        slices.forEach(function(slice) {
            let tops = slice.tops,
                layers = slice.layers,
                outline = layers.outline,
                open = (slice.camMode === CPRO.CONTOUR_X || slice.camMode === CPRO.CONTOUR_Y);

            layers.outline.clear(); // slice raw edges
            layers.trace.clear();   // roughing
            layers.solid.clear();   // outline
            layers.bridge.clear();  // outline x
            layers.flat.clear();    // outline y
            layers.fill.clear();    // facing

            tops.forEach(function(top) {
                outline.poly(top.poly, 0x999900, true, open);
                // if (top.inner) outline.poly(top.inner, 0xdddddd, true);
                if (top.inner) outline.poly(top.inner, 0xff0000, true);
            });

            // various outlining
            let layer;
            slice.tops.forEach(function(top) {
                switch (slice.camMode) {
                    case CPRO.OUTLINE:
                        layer = layers.solid;
                        break;
                    case CPRO.CONTOUR_X:
                        layer = layers.bridge;
                        break;
                    case CPRO.CONTOUR_Y:
                        layer = layers.flat;
                        break;
                    default: // roughing
                        layer = layers.trace;
                        break;
                }
                if (top.traces) {
                    layer.poly(top.traces, 0x010101, true, null);
                }
            });

            // facing (previously separate. now part of roughing)
            layer = slice.layers.fill;
            slice.tops.forEach(function(top) {
                if (top.fill_lines) {
                    layer.lines(top.fill_lines, fill_color);
                }
            });

            outline.render();
            layers.trace.render();
            layers.solid.render();
            layers.bridge.render();
            layers.flat.render();
            layers.fill.render();
        });
    }

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Object} print state object
     * @param {Function} update incremental callback
     * @param {Number} [index] into widget array
     * @param {Object} [firstPoint] starting point
     */
    function printSetup(print, update, index, firstPoint) {
        let widgetIndex = index || 0,
            widgetArray = print.widgets,
            widgetCount = widgetArray.length,
            widget = widgetArray[widgetIndex];

        if (widgetIndex >= widgetCount || !widget) return;

        let getTool = getToolById,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            stock = settings.stock,
            outer = settings.bounds,
            outerz = outer.max.z,
            slices = widget.slices,
            bounds = widget.getCamBounds(settings),
            boundsz = bounds.max.z,
            units = settings.controller.units === 'in' ? 25.4 : 1,
            hasStock = process.camStockOffset || (process.camStockZ && process.camStockX && process.camStockY),
            startCenter = process.outputOriginCenter,
            alignTop = settings.controller.alignTop,
            zclear = (process.camZClearance || 1) * units,
            zmax_outer = hasStock ? stock.z + zclear : outerz + zclear,
            ztOff = process.camZTopOffset * units,
            zadd = hasStock ? stock.z - boundsz : alignTop ? outerz - boundsz : 0,
            zmax = outerz + zclear,
            wmpos = widget.mesh.position,
            wmx = wmpos.x,
            wmy = wmpos.y,
            originx = startCenter ? 0 : hasStock ? -stock.x / 2 : bounds.min.x,
            originy = startCenter ? 0 : hasStock ? -stock.y / 2 : bounds.min.y,
            origin = newPoint(originx + wmx, originy + wmy, zmax),
            output = print.output,
            modes = CPRO,
            easeDown = process.camEaseDown,
            depthFirst = process.camDepthFirst,
            tolerance = process.camTolerance * units,
            drillDown = process.camDrillDown * units,
            drillLift = process.camDrillLift * units,
            drillDwell = process.camDrillDwell,
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
            if (layerOut.length < 2) {
                return;
            }
            newOutput.push(layerOut);
            layerOut = [];
            layerOut.spindle = spindle;
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
            feedRate = feed * units;
            plungeRate = plunge * units;
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
            point.x += wmx;
            point.y += wmy;
            point.z += zadd;

            if (nextIsMove) {
                cut = 0;
                nextIsMove = false;
            }
            let rate = feedRate;

            if (!lastPoint) {
                let above = point.clone().setZ(zmax + zadd);
                // before first point, move cutting head to point above it
                layerPush(above, 0, 0, tool.number);
                // then set that as the lastPoint
                lastPoint = above;
            }

            let deltaXY = lastPoint.distTo2D(point),
                deltaZ = point.z - lastPoint.z,
                absDeltaZ = Math.abs(deltaZ),
                isMove = !cut;
            // drop points too close together
            if (deltaXY < 0.001 && point.z === lastPoint.z) {
                console.trace(["drop dup",lastPoint,point]);
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
                let maxz = (toolProfile ? Math.max(
                        getTopoZPathMax(
                            widget,
                            toolProfile,
                            lastPoint.x - wmx,
                            lastPoint.y - wmy,
                            point.x - wmx,
                            point.y - wmy),
                        point.z,
                        lastPoint.z) : zmax) + ztOff + zadd,
                    mustGoUp = Math.max(maxz - point.z, maxz - lastPoint.z) >= tolerance,
                    clearz = maxz;
                // up if any point between higher than start/outline
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
                let threshold = Math.min(deltaXY / 2, absDeltaZ),
                    modifier = threshold / absDeltaZ;
                if (threshold && modifier && deltaXY > tolerance) {
                    // use modifier to speed up long XY move plunge rates
                    rate = Math.round(plungeRate + ((feedRate - plungeRate) * modifier));
                } else {
                    rate = plungeRate;
                }
                // console.log({deltaZ: deltaZ, deltaXY: deltaXY, threshold:threshold, modifier:modifier, rate:rate, plungeRate:plungeRate});
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
                case modes.LEVEL:
                    setTool(process.camRoughTool, process.camRoughSpeed, 0);
                    spindle = Math.min(spindleMax, process.camRoughSpindle);
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
                        POLY.setWinding(polys, process.camConventional, false);
                        printPoint = poly2polyEmit(polys, printPoint, function(poly, index, count) {
                            poly.forEachPoint(function(point, pidx, points, offset) {
                                camOut(point.clone(), offset !== 0);
                            }, true, index);
                        });
                        newLayer();
                    });
                    break;
                case modes.ROUGH:
                case modes.OUTLINE:
                    let dir = process.camConventional;
                    if (slice.camMode === modes.ROUGH) {
                        setTool(process.camRoughTool, process.camRoughSpeed, process.camRoughPlunge);
                        spindle = Math.min(spindleMax, process.camRoughSpindle);
                        depthData.roughDiam = toolDiam;
                    } else {
                        setTool(process.camOutlineTool, process.camOutlineSpeed, process.camOutlinePlunge);
                        spindle = Math.min(spindleMax, process.camOutlineSpindle);
                        depthData.outlineDiam = toolDiam;
                        if (!process.camOutlinePocket) {
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
                            (slice.camMode === modes.ROUGH ? depthData.rough : depthData.outline).append(polys);
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
                case modes.CONTOUR_X:
                case modes.CONTOUR_Y:
                    if (isNewMode || !printPoint) {
                        // force start at lower left corner
                        printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);
                    }
                    setTool(process.camContourTool, process.camContourSpeed, process.camFastFeedZ);
                    spindle = Math.min(spindleMax, process.camContourSpindle);
                    depthData.outlineDiam = toolDiam;
                    // todo find closest next trace/trace-point
                    slice.tops.forEach(function(top) {
                        if (!top.traces) return;
                        let polys = [], poly, emit;
                        top.traces.forEach(function (poly) {
                            if (depthFirst) poly = poly.clone(true);
                            polys.push({first:poly.first(), last:poly.last(), poly:poly});
                        });
                        if (depthFirst) {
                            (slice.camMode === modes.CONTOUR_X ? depthData.contourx : depthData.contoury).appendAll(polys);
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
                    setTool(process.camDrillTool, process.camDrillDownSpeed, process.camDrillDownSpeed);
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
                lastMode = CPRO.ROUGH;
                setTool(process.camRoughTool, process.camRoughSpeed, process.camRoughPlunge);
                spindle = Math.min(spindleMax, process.camRoughSpindle);
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
                }, depthData.roughDiam * process.camRoughOver * 1.01);
            }
            // outline depth first
            if (depthData.outline.length > 0) {
                lastMode = CPRO.OUTLINE;
                setTool(process.camOutlineTool, process.camOutlineSpeed, process.camOutlinePlunge);
                spindle = Math.min(spindleMax, process.camOutlineSpindle);
                printPoint = poly2polyDepthFirstEmit(depthData.outline, printPoint, function(poly, index, count, fromPoint) {
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
                }, depthData.outlineDiam * 0.01);
            }
            // two modes for deferred outlining: x then y or combined
            if (process.camContourCurves) {
                lastMode = CPRO.CONTOUR_X;
                setTool(process.camContourTool, process.camContourSpeed, process.camContourPlunge);
                spindle = Math.min(spindleMax, process.camContourSpindle);
                // combined deferred contour x and y outlining
                let contourxy = [].appendAll(depthData.contourx).appendAll(depthData.contoury);
                printPoint = tip2tipEmit(contourxy, printPoint, function(el, point, count) {
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
                setTool(process.camContourTool, process.camContourSpeed, process.camContourPlunge);
                spindle = Math.min(spindleMax, process.camContourSpindle);
                // deferred contour x outlining
                if (depthData.contourx.length > 0) {
                    lastMode = CPRO.CONTOUR_X;
                    // force start at lower left corner
                    // printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);
                    printPoint = tip2tipEmit(depthData.contourx, printPoint, function(el, point, count) {
                        let poly = el.poly;
                        if (poly.last() === point) poly.reverse();
                        poly.forEachPoint(function(point, pidx) {
                            camOut(point.clone(), pidx > 0);
                        }, false);
                        newLayer();
                        return lastPoint;
                    });
                }
                // deferred contour y outlining
                if (depthData.contoury.length > 0) {
                    lastMode = CPRO.CONTOUR_Y;
                    // force start at lower left corner
                    printPoint = tip2tipEmit(depthData.contoury, printPoint, function(el, point, count) {
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

        // drilling is always depth first, and always output last (change?)
        if (depthData.drill.length > 0) {
            lastMode = CPRO.DRILL;
            setTool(process.camDrillTool, process.camDrillDownSpeed, process.camDrillDownSpeed);
            emitDrills(depthData.drill);
        }

        // last layer/move is to zmax
        // injected into the last layer generated
        if (lastPoint)
        addOutput(newOutput[newOutput.length-1], printPoint = lastPoint.clone().setZ(zmax_outer), 0, 0, tool.number);

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
            factor = 1,
            output = [],
            spindle = 0,
            modes = CPRO,
            settings = print.settings,
            device = settings.device,
            gcodes = settings.device || {},
            tools = settings.tools,
            space = gcodes.gcodeSpace ? ' ' : '',
            stripComments = gcodes.gcodeStrip || false,
            cmdToolChange = gcodes.gcodeChange || [ "M6 T{tool}" ],
            cmdSpindle = gcodes.gcodeSpindle || [ "M3 S{speed}" ],
            cmdDwell = gcodes.gcodeDwell || [ "G4 P{time}" ],
            bounds = widget.getCamBounds(settings),
            dev = settings.device,
            spro = settings.process,
            units = settings.controller.units === 'in' ? 25.4 : 1,
            maxZd = spro.camFastFeedZ * units,
            maxXYd = spro.camFastFeed * units,
            decimals = BASE.config.gcode_decimals || 4,
            pos = { x:null, y:null, z:null, f:null, t:null },
            line,
            cidx,
            mode = 0,
            point,
            points = 0,
            hasStock = spro.camStockOffset || (spro.camStockZ && spro.camStockX && spro.camStockY),
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
                top: (offset ? dev.bedDepth : dev.bedDepth/2),
                left: (offset ? 0 : -dev.bedWidth/2),
                right: (offset ? dev.bedWidth : dev.bedWidth/2),
                bottom: (offset ? 0 : -dev.bedDepth/2),
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
                if (line.indexOf('G20') === 0) {
                    factor = 1/25.4;
                    consts.top = (offset ? dev.bedDepth : dev.bedDepth/2) * factor;
                    consts.left = (offset ? 0 : -dev.bedWidth/2) * factor;
                    consts.right = (offset ? dev.bedWidth : dev.bedWidth/2) * factor;
                    consts.bottom = (offset ? 0 : -dev.bedDepth/2) * factor;
                } else if (line.indexOf('G21') === 0) {
                    factor = 1;
                }
                append(line);
            }
        }

        function add0(val, opt) {
            let s = val.toString(),
                d = s.indexOf(".");
            if (d < 0) {
                return opt ? s : s + '.0';
            } else {
                return val.toFixed(decimals);
            }
        }

        function toolByNumber(number) {
            for (let i=0; i<tools.length; i++) {
                if (tools[i].number === number) return tools[i];
            }
            return undefined;
        }

        function toolNameByNumber(number) {
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
                time += out.speed / 60;
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
                consts.tool_name = toolNameByNumber(out.tool);
                filterEmit(cmdToolChange, consts);
            }

            // first point out sets the current position (but not Z)
            // hacky AF way to split initial x,y,z into z then x,y
            if (points === 0) {
                pos.x = pos.y = pos.z = 0;
                points++;
                moveTo({
                    tool: out.tool,
                    point: { x: 0, y: 0, z: newpos.z }
                });
                moveTo({
                    tool: out.tool,
                    point: { x: newpos.x, y: newpos.y, z: newpos.z }
                });
                points--;
                return;
            }

            let speed = out.speed,
                nl = [speed ? 'G1' : 'G0'],
                dx = newpos.x - pos.x,
                dy = newpos.y - pos.y,
                dz = newpos.z - pos.z,
                maxf = dz ? maxZd : maxXYd,
                feed = Math.min(speed || maxf, maxf),
                dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // drop dup points (all deltas are 0)
            if (!(dx || dy || dz)) {
                return;
            }

            if (newpos.x !== pos.x) {
                pos.x = newpos.x;
                runbox.min.x = Math.min(runbox.min.x, pos.x);
                runbox.max.x = Math.max(runbox.max.x, pos.x);
                nl.append(space).append("X").append(add0(pos.x * factor));
            }
            if (newpos.y !== pos.y) {
                pos.y = newpos.y;
                runbox.min.y = Math.min(runbox.min.y, pos.y);
                runbox.max.y = Math.max(runbox.max.y, pos.y);
                nl.append(space).append("Y").append(add0(pos.y * factor));
            }
            if (newpos.z !== pos.z) {
                pos.z = newpos.z;
                runbox.min.z = Math.min(runbox.min.z, pos.z);
                runbox.max.z = Math.max(runbox.max.z, pos.z);
                nl.append(space).append("Z").append(add0(pos.z * factor));
            }
            if (feed && feed !== pos.f) {
                pos.f = feed;
                nl.append(space).append("F").append(add0(feed * factor, true));
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

        if (!stripComments) {
            append(`; Generated by Kiri:Moto ${KIRI.version}`);
            append(`; ${new Date().toString()}`);
            filterEmit(["; Bed left:{left} right:{right} top:{top} bottom:{bottom}"], consts);
            append(`; Target: ${settings.filter[settings.mode]}`);
            append("; --- process ---");
            for (let pk in spro) {
                append("; " + pk + " = " + spro[pk]);
            }
        }

        // collect tool info to add to header
        let toolz = {}, ctool;

        // remap points as necessary for origins, offsets, inversions
        print.output.forEach(function(layer) {
            layer.forEach(function(out) {
                if (out.tool && out.tool !== ctool) {
                    ctool = toolByNumber(out.tool);
                    toolz[out.tool] = ctool;
                }
                point = out.point;
                if (!point || point.mod) return;
                // ensure not point is modified twice
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

        if (!stripComments) {
            // emit tools used in comments
            append("; --- tools ---");
            Object.keys(toolz).sort().forEach(tn => {
                let tool = toolz[tn];
                append(`; tool=${tn} flute=${tool.flute_diam} len=${tool.flute_len} metric=${tool.metric}`);
            });
        }

        // emit gcode preamble
        filterEmit(gcodes.gcodePre, consts);

        // emit all points in layer/point order
        print.output.forEach(function (layerout) {
            if (mode !== layerout.mode) {
                if (mode && !stripComments) append("; ending " + MODES[mode] + " pass after " + Math.round(time/60) + " seconds");
                mode = layerout.mode;
                if (!stripComments) append("; starting " + MODES[mode] + " pass");
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
        if (mode && !stripComments) append("; ending " + MODES[mode] + " pass after " + Math.round(time/60) + " seconds");

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

    function printRender(print) {
        return KIRI.driver.FDM.printRender(print, {aslines: true, color: 0x010101, move_color: 0xcc3333});
    }

})();
