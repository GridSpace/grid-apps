/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        POLY = BASE.polygons,
        newSlice = KIRI.newSlice,
        newLine = BASE.newLine,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        noop = function() {};

    class Topo {
        constructor(widget, settings, options) {
            const opt = options || {},
                ondone = opt.ondone || noop,
                onupdate = opt.onupdate || noop,
                shadow = opt.shadow,
                proc = settings.process,
                inside = proc.camContourIn,
                resolution = proc.camTolerance,
                tool = new CAM.Tool(settings, proc.camContourTool),
                toolOffset = tool.generateProfile(resolution).profile,
                toolDiameter = tool.fluteDiameter(),
                toolStep = toolDiameter * proc.camContourOver,
                traceJoin = toolDiameter / 2,
                pocketOnly = proc.camOutlinePocket,
                bounds = widget.getBoundingBox().clone(),
                minX = bounds.min.x,
                maxX = bounds.max.x,
                minY = bounds.min.y,
                maxY = bounds.max.y,
                zBottom = proc.camZBottom,
                zMin = Math.max(bounds.min.z, zBottom) + 0.0001,
                boundsX = maxX - minX,
                boundsY = maxY - minY,
                maxangle = proc.camContourAngle,
                curvesOnly = proc.camContourCurves,
                R2A = 180 / Math.PI,
                stepsx = Math.ceil(boundsX / resolution),
                stepsy = Math.ceil(boundsY / resolution),
                data = new Float32Array(stepsx * stepsy),
                topo = this.topo = widget.topo = {
                    data: data,
                    stepsx: stepsx,
                    stepsy: stepsy,
                    bounds: bounds,
                    diameter: toolDiameter,
                    resolution: resolution,
                    profile: toolOffset,
                    widget: widget
                },
                newslices = [],
                tabsOn = proc.camTabsOn,
                tabHeight = proc.camTabsHeight,
                clipTab = tabsOn ? [] : null,
                clipTo = inside ? shadow : POLY.expand(shadow, toolDiameter + resolution),
                partOff = inside ? 0 : toolDiameter / 2 + resolution,
                gridDelta = Math.floor(partOff / resolution);

            if (proc.camTabsOn) {
                CAM.createTabLines(
                    clipTo[0].bounds.center(),
                    toolDiameter,
                    proc.camTabsWidth,
                    proc.camTabsCount,
                    proc.camTabsAngle
                ).forEach(tab => {
                    const { o1, o2, c1, c2 } = tab;
                    const poly = newPolygon().addPoints([
                        o1, c1, c2, o2
                    ]);
                    clipTab.push(poly);
                });
            }

            let newtop,
                newtrace,
                sliceout,
                latent,
                lastP,
                slice, lx, ly,
                startTime = time(),
                stepsTaken = 0,
                stepsTotal = 0;

            // return the touching z given topo x,y and a tool profile
            function toolTipZ(x,y) {
                const profile = toolOffset,
                    sx = stepsx,
                    sy = stepsy,
                    xl = sx - 1,
                    yl = sy - 1;

                let tv, tx, ty, tz, gv, i = 0, mz = -1;

                while (i < profile.length) {
                    // tool profile point x, y, and z offsets
                    let tx = profile[i++] + x;
                    let ty = profile[i++] + y;
                    let tz = profile[i++];
                    if (tx < 0 || tx > xl || ty < 0 || ty > yl) {
                        // if outside max topo steps, use zMin
                        gv = zMin;
                    } else {
                        // lookup grid value @ tx, ty
                        gv = topo.data[tx * sy + ty] || zMin;
                    }
                    // update the rest
                    mz = Math.max(tz + gv, mz);
                }

                return Math.max(mz,0);
            }

            function push_point(x,y,z) {
                const newP = newPoint(x,y,z);
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

            function processSlices(slices) {
                let gridx = 0,
                    gridy,
                    gridi, // index
                    gridv, // value
                    i, il, j, jl, x, y, tv, ltv;

                // for each Y slice, find z grid value (x/z swapped)
                for (j=0, jl=slices.length; j<jl; j++) {
                    const slice = slices[j];
                    const lines = slice.lines;
                    gridy = 0;
                    // slices have x/z swapped
                    for (y = minY; y < maxY && gridy < stepsy; y += resolution) {
                        gridi = gridx * stepsy + gridy;
                        gridv = data[gridi] || 0;
                        // strategy using raw lines (faster slice, but more lines)
                        for (i=0, il=lines.length; i<il; i++) {
                            const line = lines[i], p1 = line.p1, p2 = line.p2;
                            if (
                                (p1.z > zMin || p2.z > zMin) && // one endpoint above 0
                                (p1.z > gridv || p2.z > gridv) && // one endpoint above gridv
                                ((p1.y <= y && p2.y >= y) || // one endpoint left
                                 (p2.y <= y && p1.y >= y)) // one endpoint right
                            ) {
                                const dy = p1.y - p2.y,
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
                    onupdate(++stepsTaken, stepsTotal, "trace surface");
                }

                const checkr = newPoint(0,0);
                const inClip = function(polys) {
                    checkr.x = x;
                    checkr.y = y;
                    for (let i=0; i<polys.length; i++) {
                        if (checkr.isInPolygon(polys[i])) {
                            return true;
                        }
                    }
                    return false;
                };

                // x contouring
                if (proc.camContourXOn) {
                    startTime = time();
                    // emit slice per X
                    for (x = minX - partOff; x <= maxX + partOff; x += toolStep) {
                        gridx = Math.round(((x - minX) / boundsX) * stepsx);
                        ly = gridy = -gridDelta;
                        slice = newSlice(gridx);
                        slice.camMode = PRO.CONTOUR_X;
                        newtop = slice.addTop(newPolygon().setOpen()).poly;
                        newtrace = newPolygon().setOpen();
                        sliceout = [];
                        for (y = minY - partOff; y < maxY + partOff; y += resolution) {
                            tv = toolTipZ(gridx, gridy);
                            if (tabsOn && tv < tabHeight && inClip(clipTab)) {
                                tv = tabHeight;
                            }
                            if (tv === 0 && clipTo && !inClip(clipTo)) {
                                end_poly();
                                gridy++;
                                ly = -gridDelta;
                                continue;
                            }
                            if (ly) {
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
                            slice.camLines = sliceout;
                            slice.output()
                                .setLayer("contour x", {face: 0, line: 0})
                                .addPolys(sliceout);
                        }
                        onupdate(++stepsTaken, stepsTotal, "contour x");
                    }
                }

                // y contouring
                if (proc.camContourYOn) {
                    startTime = time();
                    // emit slice per Y
                    for (y = minY - partOff; y <= maxY + partOff; y += toolStep) {
                        gridy = Math.round(((y - minY) / boundsY) * stepsy);
                        lx = gridx = -gridDelta;
                        slice = newSlice(gridy);
                        slice.camMode = PRO.CONTOUR_Y;
                        newtop = slice.addTop(newPolygon().setOpen()).poly;
                        newtrace = newPolygon().setOpen();
                        sliceout = [];
                        for (x = minX - partOff; x <= maxX + partOff; x += resolution) {
                            tv = toolTipZ(gridx, gridy);
                            if (tabsOn && tv < tabHeight && inClip(clipTab)) {
                                tv = tabHeight;
                            }
                            if (tv === 0 && clipTo && !inClip(clipTo)) {
                                end_poly();
                                gridx++;
                                lx = -gridDelta;
                                continue;
                            }
                            if (lx) {
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
                            slice.camLines = sliceout;
                            slice.output()
                                .setLayer("contour y", {face: 0, line: 0})
                                .addPolys(sliceout);
                        }
                        onupdate(++stepsTaken, stepsTotal, "contour y");
                    }
                }

                ondone(newslices);
            }

            let slicer = new KIRI.slicer2(widget.getPoints(), { swapX: true });
            let sindex = slicer.interval(resolution);
            stepsTotal += sindex.length * 2;
            if (proc.camContourXOn) stepsTotal += (maxX-minX) / toolStep;
            if (proc.camContourYOn) stepsTotal += (maxY-minY) / toolStep;

            let slices = slicer.slice(sindex, { each: (data, index, total) => {
                onupdate(++stepsTaken, stepsTotal, "topo slice");
            }, genso: true });

            processSlices(slices.filter(s => s.lines).map(data => data.slice));
        }
    }

    CAM.Topo = Topo;

})();
