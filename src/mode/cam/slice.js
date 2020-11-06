/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        POLY = BASE.polygons,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon;

    /**
     * DRIVER SLICE CONTRACT
     *
     * @param {Object} settings
     * @param {Widget} widget
     * @param {Function} output
     */
    CAM.slice = function(settings, widget, onupdate, ondone) {
        let conf = settings,
            proc = conf.process,
            sliceAll = widget.slices = [],
            unitsName = settings.controller.units,
            roughTool = new CAM.Tool(conf, proc.camRoughTool),
            roughToolDiam = roughTool.fluteDiameter(),
            drillTool = new CAM.Tool(conf, proc.camDrillTool),
            drillToolDiam = drillTool.fluteDiameter(),
            procFacing = proc.camRoughOn && proc.camZTopOffset,
            procRough = proc.camRoughOn && proc.camRoughDown,
            procOutlineIn = proc.camOutlineIn,
            procOutlineOn = proc.camOutlineOn,
            procOutlineWide = proc.camOutlineWide,
            procOutline = procOutlineOn && proc.camOutlineDown,
            procContourX = proc.camContourXOn && proc.camOutlinePlunge,
            procContourY = proc.camContourYOn && proc.camOutlinePlunge,
            procContour = procContourX || procContourY,
            procDrill = proc.camDrillingOn && proc.camDrillDown && proc.camDrillDownSpeed,
            procDrillReg = proc.camDrillReg,
            procTrace = proc.camTraceOn,
            roughDown = procRough ? proc.camRoughDown : Infinity,
            outlineDown = procOutline ? proc.camOutlineDown : Infinity,
            sliceDepth = Math.max(0.1, Math.min(roughDown, outlineDown) / 3),
            addTabsOutline = procOutlineOn && proc.camTabsOn,
            tabWidth = proc.camTabsWidth,
            tabHeight = proc.camTabsHeight,
            bounds = widget.getBoundingBox(),
            mesh = widget.mesh,
            zBottom = proc.camZBottom,
            zMin = Math.max(bounds.min.z, zBottom),
            zMax = bounds.max.z,
            zThru = zBottom === 0 ? (proc.camZThru || 0) : 0,
            ztOff = proc.camZTopOffset,
            camRoughStock = proc.camRoughStock,
            camRoughDown = proc.camRoughDown,
            minStepDown = Math.min(1, roughDown, outlineDown),
            maxToolDiam = 0,
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

        // TODO pass widget.isModified() on slice and re-use cache if false
        // TODO pre-slice in background from client signal
        // TODO same applies to topo map generation
        let slicer = new KIRI.slicer2(widget.getPoints(), {
            zlist: true,
            zline: true
        });
        let tslices = [];
        let tshadow = [];
        let tzindex = slicer.interval(minStepDown, { fit: true, off: 0.01, down: true });
        let terrain = slicer.slice(tzindex, { each: (data, index, total) => {
            tshadow = POLY.union(tshadow.appendAll(data.tops), 0.01, true);
            tslices.push(data.slice);
            // let slice = data.slice;
            // slice.z = data.z;
            // slice.index = sliceIndex++;
            // slice.camMode = PRO.LEVEL;
            // slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
            // sliceAll.push(slice);
            onupdate(0.0 + (index/total) * 0.1, "mapping");
        }, genso: true });
        let shadowTop = terrain[terrain.length - 1];

        if (procDrillReg) {
            maxToolDiam = Math.max(maxToolDiam, drillToolDiam);
            sliceDrillReg(settings, sliceAll, zThru);
        }

        if (procDrill) {
            maxToolDiam = Math.max(maxToolDiam, drillToolDiam);
            sliceDrill(drillTool, tslices, sliceAll);
        }

        // identify through holes
        thruHoles = tshadow.map(p => p.inner || []).flat();

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
                slice.camMode = PRO.LEVEL;
                slice.tops[0].traces = POLY.setZ(facing.clone(), slice.z);
                sliceAll.push(slice);
            }
        }

        // create roughing slices
        if (procRough) {
            maxToolDiam = Math.max(maxToolDiam, roughToolDiam);
            let shadow = [];
            let slices = [];
            slicer.slice(slicer.interval(roughDown, { down: true, min: zBottom }), { each: (data, index, total) => {
                shadow = POLY.union(shadow.appendAll(data.tops), 0.01, true);
                data.shadow = shadow.clone(true);
                data.slice.camMode = PRO.ROUGH;
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
            let outlineTool = new CAM.Tool(conf, proc.camOutlineTool);
            let outlineToolDiam = outlineTool.fluteDiameter();
            maxToolDiam = Math.max(maxToolDiam, outlineToolDiam);

            let shadow = [];
            let slices = [];
            slicer.slice(slicer.interval(outlineDown, { down: true, min: zBottom }), { each: (data, index, total) => {
                shadow = POLY.union(shadow.appendAll(data.tops), 0.01, true);
                data.shadow = shadow.clone(true);
                data.slice.camMode = PRO.OUTLINE;
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
                            // clone removes inners but the real solution is
                            // to limit expanded shells to through holes
                            POLY.expand([op.clone()], outlineToolDiam * 0.5, slice.z, offset, 1);
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
        if (procContour) {
            new CAM.Topo(widget, settings, {
                onupdate: (update, msg) => {
                    onupdate(0.40 + update * 0.50, msg || "create topo");
                },
                ondone: (slices) => {
                    sliceAll.appendAll(slices);
                }
            });
        }

        // prepare for tracing paths
        let traceTool;
        let traceToolProfile;
        if (procTrace) {
            traceTool = getToolById(conf, proc.camTraceTool);
            if (traceTool.type !== 'endmill') {
                traceToolProfile = createToolProfile(conf, proc.camTraceTool, widget.topo);
            }
        }

        // used in printSetup()
        widget.terrain = terrain;
        widget.maxToolDiam = maxToolDiam;

        ondone();
    };

    // drilling op
    function sliceDrill(tool, slices, output) {
        let drills = [],
            drillToolDiam = tool.flueDiameter(),
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
            slice.camMode = PRO.DRILL;
            slice.addTop(null).traces = [ drill ];
            output.append(slice);
        });
    }

    // drill registration holes
    function sliceDrillReg(settings, output, zThru) {
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
            slice.camMode = PRO.DRILL;
            slice.addTop(null).traces = polys;
            output.append(slice);
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

})();
