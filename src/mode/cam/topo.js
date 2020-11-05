/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CAM = KIRI.driver.CAM,
        CPRO = CAM.process,
        newSlice = KIRI.newSlice,
        newLine = BASE.newLine,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        noop = function() {};

    class Topo {
        constructor(widget, settings, options) {
            let opt = options || {},
                ondone = opt.ondone || noop,
                onupdate = opt.onupdate || noop,
                mesh = widget.mesh,
                proc = settings.process,
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
                newlines,
                newtop,
                newtrace,
                sliceout,
                latent,
                lastP,
                slice, lx, ly,
                startTime = time();

            // return the touching z given topo x,y and a tool profile
            function toolTipZ(x,y) {
                let profile = toolOffset,
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
                        // if outside max topo steps, use 0
                        gv = 0;
                    } else {
                        // lookup grid value @ tx, ty
                        gv = topo.data[tx * sy + ty] || 0;
                    }
                    // inside the topo but off the part
                    // if (floormax && gv === 0) {
                    //     // return topo.bounds.max.z;
                    //     gv = topo.bounds.max.z;
                    // }
                    // update the rest
                    mz = Math.max(tz + gv, mz);
                }

                return Math.max(mz,0);
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

            function processSlices(slices) {
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
                            tv = toolTipZ(gridx, gridy);
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
                            tv = toolTipZ(gridx, gridy);
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

            let slicer = new KIRI.slicer2(widget.getPoints(), { swapX: true });
            let sindex = slicer.interval(resolution);
            let slices = slicer.slice(sindex, { each: (data, index, total) => {
                onupdate(0.0 + (index/total) * 0.20, "topo slice");
            }, genso: true });

            // ondone(slices.map(data => data.slice));
            processSlices(slices.map(data => data.slice));
        }
    }

    CAM.Topo = Topo;

})();
