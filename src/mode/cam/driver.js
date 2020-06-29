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
            ROUGH: 1,
            OUTLINE: 2,
            CONTOUR_X: 3,
            CONTOUR_Y: 4,
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
            api.ui.camDrill.marker.style.display = proc.camDrillingOn ? 'flex' : 'none';
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
     * top down progressive union
     */
    function pancake(slices, onupdate) {
        let union, tops, last;

        slices.forEach(function(slice,index) {
            tops = slice.gatherTopPolys([]).clone(true);
            if (!union) {
                union = tops;
            } else {
                // replace slice's tops with unioned tops
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
     * bottom up progressive intersection of holes
     */
    function holes(slices, offset, onupdate) {
        let last;

        slices.reverse().forEach(function(slice,index) {
            let holes = slice.gatherTopPolyInners([]).clone();
            if (last) {
                let inter = [];
                // find intersection of hole below and hole in this layer
                holes.forEach(hole => {
                    last.forEach(hole_under => {
                        inter.appendAll(hole.intersect(hole_under));
                    });
                });
                // filter dup polygons (which intersect can produce)
                last = inter.filter((poly, index, arr) => {
                    for (let i=index+1, il=arr.length; i<il; i++) {
                        if (arr[i].isEquivalent(poly)) return false;
                    }
                    return true;
                });
            } else {
                last = holes;
            }
            // console.log('holes', slice.z, index, holes, last);
            if (onupdate) onupdate(index/slices.length);
        });

        let out = [];
        POLY.expand(last, -offset*1.1, 0, out, 1);

        return out;
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

        // - find mandatory slices (with flats)
        // - divide space between by step (interpolate)
        // - select smallest divisible gap
        let forced = [ slices[0] ];
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
            if (Math.abs(delta - step) < slop) {
                return;
            }
            // add another step if decimal too high
            if (dec > slop) nstep = delta / Math.ceil(inc);
            // find closest slices in-between
            for (let zv = s1.z - nstep; zv >= s2.z + nstep/2; zv -= nstep) {
                mid.push(closestSliceToZ(slices, zv));
            }
        }, 1);

        forced.appendAll(mid);
        forced.sort(function(s1, s2) { return s2.z - s1.z; });

        // drop first/top slice. it's not an actual cut. it was
        // added in the beginning to force layer interpolation.
        forced = forced.slice(1);
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
            diameter = getToolDiameter(settings, proc.camOutlineTool),
            tool = getToolById(settings, proc.camOutlineTool),
            toolStep = diameter * proc.camContourOver,
            traceJoin = diameter / 2,
            pocketOnly = proc.camOutlinePocket,
            bounds = widget.getBoundingBox().clone(),
            minX = bounds.min.x,// - diameter,
            maxX = bounds.max.x,// + diameter,
            minY = bounds.min.y,// - diameter,
            maxY = bounds.max.y,// + diameter,
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
            toolOffset = createToolProfile(settings, proc.camOutlineTool, topo),
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
                zMin = Math.max(bounds.min.z, outp.camZBottom) + 0.0001,
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
                onupdate(0.20 + (gridx/stepsx) * 0.50, "topo tracing");
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
                    onupdate(0.70 + (gridx/stepsx) * 0.15, "linear x");
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
    function createLevelPaths(slice, shell, diameter, overlap, pocket) {
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
    function createRoughPaths(slice, shell, diameter, stock, overlap, pocket, holes) {
        let tops = slice.gatherTopPolys([]).clone(true),
            outer = [],
            offset = [];

        // when holes present, use them as fake top offsets
        // to prevent clearing out the entire thru pocket
        if (holes) {
            tops.appendAll(holes);
        }

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
    function createOutlinePaths(slice, shell, diameter, pocket) {
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
            roughToolDiam = getToolDiameter(conf, proc.camRoughTool),
            outlineToolDiam = getToolDiameter(conf, proc.camOutlineTool),
            contourToolDiam = getToolDiameter(conf, proc.camContourTool),
            drillToolDiam = getToolDiameter(conf, proc.camDrillTool),
            procFacing = proc.camRoughOn && proc.camZTopOffset,
            procRough = proc.camRoughOn && proc.camRoughDown && roughToolDiam,
            procOutline = proc.camOutlineOn && proc.camOutlineDown && outlineToolDiam,
            procContourX = proc.camContourXOn && proc.camOutlinePlunge && contourToolDiam,
            procContourY = proc.camContourYOn && proc.camOutlinePlunge && contourToolDiam,
            procContour = procContourX || procContourY,
            procDrill = proc.camDrillingOn && proc.camDrillDown && proc.camDrillDownSpeed,
            procTrace = proc.camTraceOn,
            sliceDepth = Math.max(0.1, Math.min(proc.camRoughDown, proc.camOutlineDown) / 3) * units,
            pocketOnlyRough = proc.camRoughPocket,
            pocketOnlyOutline = proc.camOutlinePocket,
            addTabsRough = procRough && proc.camTabsOn && !pocketOnlyRough,
            addTabsOutline = procOutline && proc.camTabsOn && !pocketOnlyOutline,
            tabWidth = proc.camTabsWidth * units,
            tabHeight = proc.camTabsHeight * units,
            bounds = widget.getBoundingBox(),
            mesh = widget.mesh,
            zMin = Math.max(bounds.min.z, proc.camZBottom) * units,
            camRoughStock = proc.camRoughStock * units,
            shellRough,
            shellOutline,
            facePolys,
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

        if (!(procFacing || procRough || procOutline || procContour || procDrill)) {
            return ondone("no processes selected");
        }

        // cut outside traces at the right points
        const addCutoutTabs = function(slice, toolDiam) {
            // too high
            if (slice.z > zMin + tabHeight) return;
            // skip if no tops | traces
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

            let count = proc.camTabsCount,
                angle = proc.camTabsAngle,
                angle_inc = 360 / count,
                center = BASE.newPoint(0,0,slice.z),
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

        // called when z-index slicing complete
        const camSlicesDone = function(slices) {

            // return outermost (bottom layer) "top" polys
            const camShell = pancake(slices, function(update) {
                onupdate(0.25 + update * 0.15, "shelling");
            });

            // set all default shells
            const camShellPolys = shellRough = shellOutline = facePolys = camShell.gatherTopPolys([]);

            if (procRough) {
                if (pocketOnlyRough) {
                    // expand shell minimally triggering a clean
                    shellRough = POLY.expand(shellRough, 0.01, 0);
                } else {
                    // expand shell by half tool diameter + stock to leave
                    shellRough = facePolys = POLY.expand(shellRough, (roughToolDiam / 2) + camRoughStock, 0);
                }
            }

            if (procOutline) {
                if (pocketOnlyOutline) {
                    // expand shell minimally triggering a clean
                    shellOutline = POLY.expand(shellOutline, -outlineToolDiam / 2, 0);
                } else {
                    // expand shell by half tool diameter (not needed because only one offset)
                    // shellOutline = POLY.expand(shellOutline, outlineToolDiam / 2, 0);
                }
            }

            // clear area from top of stock to top of part
            if (procFacing) {
                let ztop = bounds.max.z,
                    zpos = ztop + (proc.camZTopOffset * units),
                    zstep = proc.camRoughDown * units;

                while (zpos >= ztop) {
                    zpos = zpos - Math.min(zstep, zpos - ztop);

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
                selectSlices(slices, proc.camRoughDown * units, CPRO.ROUGH, selected);
                sliceAll.appendAll(selected);
                if (!proc.camRoughVoid) {
                    thruHoles = holes(slices, roughToolDiam + camRoughStock);
                }
            }

            if (procOutline) {
                let selected = [];
                selectSlices(slices, proc.camOutlineDown * units, CPRO.OUTLINE, selected);
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
        doSlicing(widget, {height: sliceDepth, cam:true, zmin:proc.camZBottom, noEmpty:true}, camSlicesDone, function(update) {
            onupdate(0.0 + update * 0.25, "slicing");
        });

        // we need topo for safe travel moves when roughing and finishing
        // not generated when drilling-only. then all z moves use bounds max.
        // also generates x and y contouring when selected
        if (procRough || procOutline || procContour)
        generateTopoMap(widget, settings, function(slices) {
            sliceAll.appendAll(slices);
            // todo union rough / finish shells
            // todo union rough / finish tabs
            // todo append to generated topo map
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

        // for each final slice, do post-processing
        sliceAll.forEach(function(slice, index) {
            // re-index
            slice.index = index;
            let modekey = "?mode?";
            switch (slice.camMode) {
                case CPRO.FACING:
                    modekey = "facing";
                    createLevelPaths(slice, facePolys, roughToolDiam, proc.camRoughOver, pocketOnlyRough);
                    break;
                case CPRO.ROUGH:
                    modekey = "roughing";
                    createRoughPaths(slice, shellRough, roughToolDiam, camRoughStock, proc.camRoughOver, pocketOnlyRough, thruHoles);
                    if (addTabsRough) addCutoutTabs(slice, roughToolDiam);
                    break;
                case CPRO.OUTLINE:
                    modekey = "finishing";
                    createOutlinePaths(slice, shellOutline, outlineToolDiam, pocketOnlyOutline);
                    if (addTabsOutline) addCutoutTabs(slice, outlineToolDiam);
                    if (traceToolProfile) findTracingPaths(widget, slice, traceTool, traceToolProfile);
                    break;
            }
            onupdate(0.90 + (index / sliceAll.length) * 0.10, modekey);
        }, "cam post");

        ondone();
    };

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
            layers.solid.clear();   // finish
            layers.bridge.clear();  // finish x
            layers.flat.clear();    // finish y
            layers.fill.clear();    // facing

            tops.forEach(function(top) {
                outline.poly(top.poly, 0x999900, true, open);
                if (top.inner) outline.poly(top.inner, 0xdddddd, true);
            });

            // various finishing
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
                    layer.poly(top.traces, 0x0, true, null);
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
            hasStock = process.camStockZ && process.camStockX && process.camStockY,
            startCenter = process.outputOriginCenter,
            alignTop = settings.controller.alignTop,
            zclear = (process.camZClearance || 1) * units,
            zmax_outer = hasStock ? stock.z + zclear : outerz + zclear,
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
            point.x += wmx;
            point.y += wmy;
            point.z += zadd;

            if (nextIsMove) {
                cut = 0;
                nextIsMove = false;
            }
            let rate = feedRate;

            if (!lastPoint) {
                // before first point, move cutting head to point above it
                layerPush(point.clone().setZ(zmax), 0, 0, tool.number);
                // then set that as the lastPoint
                lastPoint = point;
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
                let maxz = toolProfile ? Math.max(
                        getTopoZPathMax(
                            widget,
                            toolProfile,
                            lastPoint.x - wmx,
                            lastPoint.y - wmy,
                            point.x - wmx,
                            point.y - wmy) + zadd,
                        point.z,
                        lastPoint.z) : zmax,
                    mustGoUp = Math.max(maxz - point.z, maxz - lastPoint.z) >= tolerance,
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
                        depthData.finishDiam = toolDiam;
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
                case modes.CONTOUR_X:
                case modes.CONTOUR_Y:
                    if (isNewMode || !printPoint) {
                        // force start at lower left corner
                        printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);
                    }
                    setTool(process.camContourTool, process.camContourSpeed, process.camFastFeedZ);
                    spindle = Math.min(spindleMax, process.camContourSpindle);
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
                            (slice.camMode === modes.CONTOUR_X ? depthData.linearx : depthData.lineary).appendAll(polys);
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
            // finishing depth first
            if (depthData.finish.length > 0) {
                setTool(process.camOutlineTool, process.camOutlineSpeed, process.camOutlinePlunge);
                spindle = Math.min(spindleMax, process.camOutlineSpindle);
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
            if (process.camContourCurves) {
                setTool(process.camOutlineTool, process.camOutlineSpeed, process.camOutlinePlunge);
                spindle = Math.min(spindleMax, process.camOutlineSpindle);
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
                setTool(process.camOutlineTool, process.camOutlineSpeed, process.camOutlinePlunge);
                spindle = Math.min(spindleMax, process.camOutlineSpindle);
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
            output = [],
            spindle = 0,
            modes = CPRO,
            settings = print.settings,
            device = settings.device,
            gcodes = settings.device || {},
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
                consts.tool_name = toolNameByNumber(out.tool, settings.tools);
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

        // emit gcode preamble
        filterEmit(gcodes.gcodePre, consts);

        // remap points as necessary for origins, offsets, inversions
        print.output.forEach(function(layer) {
            layer.forEach(function(out) {
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

    function printRender(print) {
        return KIRI.driver.FDM.printRender(print, {aslines: true});
    }

})();
