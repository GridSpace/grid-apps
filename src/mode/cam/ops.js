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

    class CamOp {
        constructor(state, op) {
            this.state = state;
            this.op = op
        }

        type() {
            return this.op.type;
        }

        weight() {
            return 1;
        }

        slice() { }

        prepare() { }
    }

    class OpLevel extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, sliceAll } = state;
            let { updateToolDiams, thruHoles, tabs, cutTabs } = state;
            let { bounds, zMax, ztOff } = state;
            let { stock } = settings;

            let toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
            let stepOver = toolDiam * op.step;
            updateToolDiams(toolDiam);

            let path = newPolygon().setOpen(),
                center = {x:0, y:0, z:0},
                x1 = bounds.min.x,
                y1 = bounds.min.y,
                x2 = bounds.max.x,
                y2 = bounds.max.y,
                z = bounds.max.z;

            if (stock.x && stock.y && stock.z) {
                x1 = -stock.x / 2;
                y1 = -stock.y / 2;
                x2 = -x1;
                y2 = -y1;
                z = zMax + ztOff;
            }

            let ei = 0,
                xd = x2 - x1,
                xi = xd / Math.floor(xd / stepOver);

            for (let x = x1, lx = x, ei = 0; x <= x2; x += xi, ei++, lx = x) {
                if (ei % 2 === 0) {
                    path.add(x,y1,z).add(x,y2,z);
                } else {
                    path.add(x,y2,z).add(x,y1,z);
                }
            }

            let slice = newSlice(z);
            this.lines = slice.camLines = [ path ];
            slice.output()
                .setLayer("level", {face: 0, line: 0})
                .addPolys(this.lines);
            sliceAll.push(slice);
        }

        prepare(ops, progress) {
            let { op, state, lines } = this;
            let { setTool, setSpindle } = ops;
            let { polyEmit, newLayer } = ops;

            setTool(op.tool, op.rate);
            setSpindle(op.spindle);
            polyEmit(lines[0]);
            newLayer();
        }
    }

    class OpRough extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, slicer, sliceAll } = state;
            let { updateToolDiams, thruHoles, tabs, cutTabs } = state;
            let { tshadow, shadowTop, ztOff, zBottom, zMax } = state;

            let roughIn = op.inside;
            let roughTop = op.top;
            let roughDown = op.down;
            let roughLeave = op.leave;
            let toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();

            // create facing slices
            if (roughTop) {
                let shadow = tshadow.clone();
                let inset = POLY.offset(shadow, (toolDiam / (roughIn ? 2 : 1)));
                let facing = POLY.offset(inset, -(toolDiam * op.step), { count: 999, flat: true });
                let zdiv = ztOff / roughDown;
                let zstep = (zdiv % 1 > 0) ? ztOff / (Math.floor(zdiv) + 1) : roughDown;
                if (ztOff === 0) {
                    // compensate for lack of z top offset in this scenario
                    ztOff = zstep;
                }
                let zsteps = Math.round(ztOff / zstep);
                let camFaces = this.camFaces = [];
                let zstart = zMax + ztOff - zstep;
                for (let z = zstart; zsteps > 0; zsteps--) {
                    let slice = shadowTop.slice.clone(false);
                    slice.z = z;
                    slice.camLines = POLY.setZ(facing.clone(true), slice.z);
                    slice.output()
                        .setLayer("face", {face: 0, line: 0})
                        .addPolys(slice.camLines);
                    sliceAll.push(slice);
                    camFaces.push(slice);
                    z -= zstep;
                }
            }

            // create roughing slices
            updateToolDiams(toolDiam);

            let flats = [];
            let shadow = [];
            let slices = [];
            let indices = slicer.interval(roughDown, {
                down: true, min: zBottom, fit: true, off: 0.01
            });
            // shift out first (top-most) slice
            indices.shift();
            if (op.flats) {
                let flats = Object.keys(slicer.zFlat)
                    .map(v => parseFloat(v).round(4))
                    .filter(v => v >= zBottom);
                flats.forEach(v => {
                    if (!indices.contains(v)) {
                        indices.push(v);
                    }
                });
                indices = indices.sort((a,b) => { return b - a });
                // if layer is not on a flat and next one is,
                // then move this layer up to mid-point to previous layer
                // this is not perfect. the best method is to interpolate
                // between flats so that each step is < step down. on todo list
                for (let i=1; i<indices.length-1; i++) {
                    const prev = indices[i-1];
                    const curr = indices[i];
                    const next = indices[i+1];
                    if (!flats.contains(curr) && flats.contains(next)) {
                        // console.log('move',curr,'up toward',prev,'b/c next',next,'is flat');
                        indices[i] = next + ((prev - next) / 2);
                    }
                }
            } else {
                // add flats to shadow
                flats = Object.keys(slicer.zFlat)
                    .map(v => (parseFloat(v) - 0.01).round(5))
                    .filter(v => v > 0 && indices.indexOf(v) < 0);
                indices = indices.appendAll(flats).sort((a,b) => b-a);
            }

            // console.log('indices', ...indices, {zBottom});
            slicer.slice(indices, { each: (data, index, total) => {
                shadow = POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
                if (flats.indexOf(data.z) >= 0) {
                    // exclude flats injected to complete shadow
                    return;
                }
                data.shadow = shadow.clone(true);
                data.slice.shadow = data.shadow;
                // data.slice.tops[0].inner = data.shadow;
                // data.slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
                slices.push(data.slice);
                progress((index / total) * 0.5);
            }, genso: true });

            shadow = POLY.union(shadow.appendAll(shadowTop.tops), 0.01, true);

            // inset or eliminate thru holes from shadow
            shadow = POLY.flatten(shadow.clone(true), [], true);
            thruHoles.forEach(hole => {
                shadow = shadow.map(p => {
                    if (p.isEquivalent(hole)) {
                        // eliminate thru holes when roughing voids enabled
                        if (op.voids) {
                            return undefined;
                        }
                        let po = POLY.offset([p], -(toolDiam / 2 + roughLeave + 0.01));
                        return po ? po[0] : undefined;
                    } else {
                        return p;
                    }
                }).filter(p => p);
            });
            shadow = POLY.nest(shadow);

            // expand shadow by half tool diameter + stock to leave
            const sadd = roughIn ? toolDiam / 2 : toolDiam / 2;
            const shell = POLY.offset(shadow, sadd + roughLeave);

            slices.forEach((slice, index) => {
                let offset = [shell.clone(true),slice.shadow.clone(true)].flat();
                let flat = POLY.flatten(offset, [], true);
                let nest = POLY.setZ(POLY.nest(flat), slice.z);

                // inset offset array by 1/2 diameter then by tool overlap %
                offset = POLY.offset(nest, [-(toolDiam / 2 + roughLeave), -toolDiam * op.step], {
                    minArea: 0,
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
                }) || [];

                // add outside pass if not inside only
                if (!roughIn) {
                    const outside = POLY.offset(shadow.clone(), toolDiam * op.step, {z: slice.z});
                    if (outside) {
                        offset.appendAll(outside);
                    }
                }

                if (tabs) {
                    tabs.forEach(tab => {
                        tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
                    });
                    offset = cutTabs(tabs, offset, slice.z);
                }

                if (!offset) return;

                // elimate double inset on inners
                offset.forEach(op => {
                    if (op.inner) {
                        let operim = op.perimeter();
                        let newinner = [];
                        op.inner.forEach(oi => {
                            if (Math.abs(oi.perimeter() - operim) > 0.01) {
                                newinner.push(oi);
                            }
                        });
                        op.inner = newinner;
                    }
                });

                slice.camLines = offset;
                if (true) slice.output()
                    .setLayer("slice", {line: 0xaaaa00}, true)
                    .addPolys(slice.topPolys())
                    // .setLayer("top shadow", {line: 0x0000aa})
                    // .addPolys(tshadow)
                    // .setLayer("rough shadow", {line: 0x00aa00})
                    // .addPolys(shadow)
                    // .setLayer("rough shell", {line: 0xaa0000})
                    // .addPolys(shell);
                slice.output()
                    .setLayer("roughing", {face: 0, line: 0})
                    .addPolys(offset);
                progress(0.5 + (index / slices.length) * 0.5);
            });

            this.sliceOut = slices.filter(slice => slice.camLines);
            sliceAll.appendAll(this.sliceOut);
        }

        prepare(ops, progress) {
            let { op, state, sliceOut, camFaces } = this;
            let { setTool, setSpindle, setPrintPoint } = ops;
            let { polyEmit, poly2polyEmit, depthRoughPath } = ops;
            let { camOut, newLayer, printPoint } = ops;
            let { settings, widget } = state;
            let { process } = settings;

            let cutdir = process.camConventional;
            let depthFirst = process.camDepthFirst;
            let depthData = [];

            setTool(op.tool, op.rate, op.plunge);
            setSpindle(op.spindle);

            for (let slice of (camFaces || [])) {
                const level = [];
                for (let poly of slice.camLines) {
                    level.push(poly);
                    if (poly.inner) {
                        poly.inner.forEach(function(inner) {
                            level.push(inner);
                        });
                    }
                }
                // set winding specified in output
                POLY.setWinding(level, cutdir, false);
                printPoint = poly2polyEmit(level, printPoint, function(poly, index, count) {
                    poly.forEachPoint(function(point, pidx, points, offset) {
                        camOut(point.clone(), offset !== 0);
                    }, true, index);
                });
                newLayer();
            }

            for (let slice of sliceOut) {
                let polys = [], t = [], c = [];
                POLY.flatten(slice.camLines).forEach(function (poly) {
                    let child = poly.parent;
                    if (depthFirst) { poly = poly.clone(); poly.parent = child ? 1 : 0 }
                    if (child) c.push(poly); else t.push(poly);
                    poly.layer = depthData.layer;
                    polys.push(poly);
                });

                // set cut direction on outer polys
                POLY.setWinding(t, cutdir);
                // set cut direction on inner polys
                POLY.setWinding(c, !cutdir);

                if (depthFirst) {
                    depthData.push(polys);
                } else {
                    printPoint = poly2polyEmit(polys, printPoint, function(poly, index, count) {
                        poly.forEachPoint(function(point, pidx, points, offset) {
                            camOut(point.clone(), offset !== 0);
                        }, poly.isClosed(), index);
                    });
                    newLayer();
                }
            }

            if (depthFirst) {
                let tops = depthData.map(level => {
                    return POLY.nest(level.filter(poly => poly.depth === 0).clone());
                });
                printPoint = depthRoughPath(printPoint, 0, depthData, tops, polyEmit);
            }

            setPrintPoint(printPoint);
        }
    }

    class OpOutline extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, slicer, sliceAll, tshadow } = state;
            let { updateToolDiams, zThru, zBottom, shadowTop, tabs, cutTabs } = state;

            let toolDiam = this.toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
            updateToolDiams(toolDiam);

            let shadow = [];
            let slices = [];
            let indices = slicer.interval(op.down, { down: true, min: zBottom, fit: true, off: 0.01 });
            // shift out first (top-most) slice
            indices.shift();
            // add flats to shadow
            const flats = Object.keys(slicer.zFlat)
                .map(v => (parseFloat(v) - 0.01).round(5))
                .filter(v => v > 0 && indices.indexOf(v) < 0);
            indices = indices.appendAll(flats).sort((a,b) => b-a);
            // console.log('indices', ...indices, {zBottom, slicer});
            if (op.outside && !op.inside) {
                console.log({outline_bypass: indices, down: op.down});
                indices.forEach((ind,i) => {
                    if (flats.indexOf(ind) >= 0) {
                        // exclude flats
                        return;
                    }
                    let slice = newSlice(ind);
                    slice.shadow = shadow.clone(true);
                    slices.push(slice);
                });
            } else
            slicer.slice(indices, { each: (data, index, total) => {
                shadow = POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
                if (flats.indexOf(data.z) >= 0) {
                    // exclude flats injected to complete shadow
                    return;
                }
                data.shadow = shadow.clone(true);
                data.slice.shadow = data.shadow;
                // data.slice.tops[0].inner = data.shadow;
                // data.slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
                slices.push(data.slice);
                // data.slice.xray();
                // onupdate(0.2 + (index/total) * 0.1, "outlines");
                progress((index / total) * 0.5);
            }, genso: true });
            shadow = POLY.union(shadow.appendAll(shadowTop.tops), 0.01, true);

            // extend cut thru (only when z bottom is 0)
            if (zThru) {
                let last = slices[slices.length-1];
                let add = last.clone(true);
                add.tops.forEach(top => {
                    top.poly.setZ(add.z);
                });
                add.shadow = last.shadow.clone(true);
                add.z -= zThru;
                slices.push(add);
            }

            slices.forEach(slice => {
                let tops = slice.shadow;

                // outside only (use tshadow for entire cut)
                if (op.outside) {
                    tops = tshadow;
                }

                let offset = POLY.expand(tops, toolDiam / 2, slice.z);
                if (!(offset && offset.length)) {
                    return;
                }

                // when pocket only, drop first outer poly
                // if it matches the shell and promote inner polys
                if (op.inside) {
                    let shell = POLY.expand(tops.clone(), toolDiam / 2);
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
                    if (op.wide) {
                        let stepover = toolDiam * op.step;
                        offset.slice().forEach(op => {
                            // clone removes inners but the real solution is
                            // to limit expanded shells to through holes
                            POLY.expand([op.clone(true)], stepover, slice.z, offset, 1);
                        });
                    }
                }

                if (tabs) {
                    tabs.forEach(tab => {
                        tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
                    });
                    offset = cutTabs(tabs, offset, slice.z);
                }

                if (op.dogbones && !op.wide) {
                    CAM.addDogbones(offset, toolDiam / 5);
                }

                // offset.xout(`slice ${slice.z}`);
                slice.camLines = offset;
                if (false) slice.output()
                    .setLayer("slice", {line: 0xaaaa00}, false)
                    .addPolys(slice.topPolys())
                slice.output()
                    .setLayer("outline", {face: 0, line: 0})
                    .addPolys(offset);
            });

            sliceAll.appendAll(slices);
            this.sliceOut = slices;
        }

        prepare(ops, progress) {
            let { op, state, sliceOut } = this;
            let { setTool, setSpindle, setPrintPoint } = ops;
            let { polyEmit, poly2polyEmit, depthOutlinePath } = ops;
            let { camOut, newLayer, printPoint } = ops;
            let { settings, widget } = state;
            let { process } = settings;

            let toolDiam = this.toolDiam;
            let cutdir = process.camConventional;
            let depthFirst = process.camDepthFirst;
            let depthData = [];

            setTool(op.tool, op.rate, op.plunge);
            setSpindle(op.spindle);

            if (!process.camOutlinePocket) {
                cutdir = !cutdir;
            }

            for (let slice of sliceOut) {
                let polys = [], t = [], c = [];
                POLY.flatten(slice.camLines).forEach(function (poly) {
                    let child = poly.parent;
                    if (depthFirst) { poly = poly.clone(); poly.parent = child ? 1 : 0 }
                    if (child) c.push(poly); else t.push(poly);
                    poly.layer = depthData.layer;
                    polys.push(poly);
                });

                // set cut direction on outer polys
                POLY.setWinding(t, cutdir);
                // set cut direction on inner polys
                POLY.setWinding(c, !cutdir);

                if (depthFirst) {
                    depthData.push(polys);
                } else {
                    printPoint = poly2polyEmit(polys, printPoint, function(poly, index, count) {
                        poly.forEachPoint(function(point, pidx, points, offset) {
                            camOut(point.clone(), offset !== 0);
                        }, poly.isClosed(), index);
                    });
                    newLayer();
                }
            }

            if (depthFirst) {
                let flatLevels = depthData.map(level => {
                    return POLY.flatten(level.clone(true), [], true).filter(p => !(p.depth = 0));
                }).filter(l => l.length > 0);
                if (flatLevels.length && flatLevels[0].length) {
                    // start with the smallest polygon on the top
                    printPoint = flatLevels[0]
                        .sort((a,b) => { return a.area() - b.area() })[0]
                        .average();
                    printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, false);
                    printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, true);
                }
            }

            setPrintPoint(printPoint);
        }
    }

    class OpContour extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { sliceAll } = state;
            // we need topo for safe travel moves when roughing and outlining
            // not generated when drilling-only. then all z moves use bounds max.
            // also generates x and y contouring when selected
            let topo = new CAM.Topo({
                // onupdate: (update, msg) => {
                onupdate: (index, total, msg) => {
                    progress(index / total, msg);
                },
                ondone: (slices) => {
                    this.sliceOut = slices;
                    sliceAll.appendAll(slices);
                },
                contour: op,
                state: state
            });
            // computed if set to 0
            this.tolerance = topo.tolerance;
        }

        prepare(ops, progress) {
            let { op, state, sliceOut } = this;
            let { setTolerance, setTool, setSpindle, setPrintPoint } = ops;
            let { polyEmit, poly2polyEmit, tip2tipEmit } = ops;
            let { camOut, newLayer, printPoint, lastPoint } = ops;
            let { bounds, zmax } = ops;
            let { settings, widget } = state;
            let { process } = settings;

            let toolDiam = this.toolDiam;
            let cutdir = process.camConventional;
            let depthFirst = process.camDepthFirst;
            let depthData = [];

            setTool(op.tool, op.rate, op.plunge);
            setSpindle(op.spindle);
            setTolerance(this.tolerance);

            printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);

            for (let slice of sliceOut) {
                if (!slice.camLines) continue;
                let polys = [], poly, emit;
                slice.camLines.forEach(function (poly) {
                    if (depthFirst) poly = poly.clone(true);
                    polys.push({first:poly.first(), last:poly.last(), poly:poly});
                });
                if (depthFirst) {
                    depthData.appendAll(polys);
                } else {
                    printPoint = tip2tipEmit(polys, printPoint, function(el, point, count) {
                        poly = el.poly;
                        if (poly.last() === point) {
                            poly.reverse();
                        }
                        poly.forEachPoint(function(point, pidx) {
                            camOut(point.clone(), pidx > 0);
                        }, false);
                    });
                    newLayer();
                }
            }

            if (depthFirst) {
                printPoint = tip2tipEmit(depthData, printPoint, function(el, point, count) {
                    let poly = el.poly;
                    if (poly.last() === point) {
                        poly.reverse();
                    }
                    poly.forEachPoint(function(point, pidx) {
                        camOut(point.clone(), pidx > 0);
                    }, false);
                    newLayer();
                    return lastPoint();
                });
            }

            setPrintPoint(printPoint);
        }
    }

    class OpTrace extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, sliceAll, updateToolDiams } = state;
            // generate tracing offsets from chosen features
            let sliceOut = this.sliceOut = [];
            let areas = op.areas[widget.id] || [];
            let { tool, rate, plunge } = op;
            let traceTool = new CAM.Tool(settings, tool);
            let traceToolDiam = traceTool.fluteDiameter();
            updateToolDiams(traceToolDiam);
            areas.forEach(arr => {
                let slice = newSlice();
                let poly = newPolygon().fromArray(arr);
                slice.addTop(poly);
                slice.camLines = [ poly ];
                slice.camTrace = { tool, rate, plunge };
                if (true) slice.output()
                    .setLayer("trace", {line: 0xaa00aa}, false)
                    .addPolys(slice.camLines)
                sliceAll.push(slice);
                sliceOut.push(slice);
            });
        }

        prepare(ops, progress) {
            for (let slice of this.sliceOut) {
                ops.emitTrace(slice);
            }
        }
    }

    class OpDrill extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, sliceAll, tslices, updateToolDiams } = state;

            let drills = [],
                drillTool = new CAM.Tool(settings, op.tool),
                drillToolDiam = drillTool.fluteDiameter(),
                centerDiff = drillToolDiam * 0.1,
                area = (drillToolDiam/2) * (drillToolDiam/2) * Math.PI,
                areaDelta = area * 0.05,
                sliceOut = this.sliceOut = [];

            updateToolDiams(drillToolDiam);

            // for each slice, look for polygons with 98.5% circularity whose
            // area is within the tolerance of a circle matching the tool diameter
            tslices.forEach(function(slice) {
                let inner = slice.topPolyInners([]);
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
                slice.camLines = [ drill ];
                slice.output()
                    .setLayer("drill", {face: 0, line: 0})
                    .addPolys(drill);
                sliceAll.push(slice);
                sliceOut.push(slice);
            });
        }

        prepare(ops, progress) {
            let { op, state } = this;
            let { settings, widget, sliceAll, tslices, updateToolDiams } = state;
            let { setTool, setDrill, emitDrills } = ops;

            setTool(op.tool, op.down, op.rate);
            setDrill(op.down, op.lift, op.dwell);
            emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
        }
    }

    class OpRegister extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, bounds, sliceAll, tslices, updateToolDiams, zThru } = state;

            let tool = new CAM.Tool(settings, op.tool);
            let sliceOut = this.sliceOut = [];

            updateToolDiams(tool.fluteDiameter());

            let { stock } = settings,
                o3 = tool.fluteDiameter() * 2,
                mx = (bounds.max.x + bounds.min.x) / 2,
                my = (bounds.max.y + bounds.min.y) / 2,
                mz = zThru || 0,
                dx = (stock.x - (bounds.max.x - bounds.min.x)) / 4,
                dy = (stock.y - (bounds.max.y - bounds.min.y)) / 4,
                dz = stock.z,
                points = [];

            switch (op.axis) {
                case "X":
                case "x":
                    if (op.points == 3) {
                        points.push(newPoint(bounds.min.x - dx, my, 0));
                        points.push(newPoint(bounds.max.x + dx, my - o3, 0));
                        points.push(newPoint(bounds.max.x + dx, my + o3, 0));
                    } else {
                        points.push(newPoint(bounds.min.x - dx, my, 0));
                        points.push(newPoint(bounds.max.x + dx, my, 0));
                    }
                    break;
                case "Y":
                case "y":
                    if (op.points == 3) {
                        points.push(newPoint(mx, bounds.min.y - dy, 0));
                        points.push(newPoint(mx - o3, bounds.max.y + dy, 0));
                        points.push(newPoint(mx + o3, bounds.max.y + dy, 0));
                    } else {
                        points.push(newPoint(mx, bounds.min.y - dy, 0));
                        points.push(newPoint(mx, bounds.max.y + dy, 0));
                    }
                    break;
            }

            if (points.length) {
                let slice = newSlice(0,null), polys = [];
                points.forEach(point => {
                    polys.push(newPolygon()
                        .append(point.clone().setZ(bounds.max.z))
                        .append(point.clone().setZ(bounds.max.z - stock.z - mz)));
                });
                slice.camLines = polys;
                slice.output()
                    .setLayer("register", {face: 0, line: 0})
                    .addPolys(polys);
                sliceAll.push(slice);
                sliceOut.push(slice);
            }
        }

        prepare(ops, progress) {
            let { op, state } = this;
            let { settings, widget, sliceAll, tslices, updateToolDiams } = state;
            let { setTool, setDrill, emitDrills } = ops;

            setTool(op.tool, op.down, op.rate);
            setDrill(op.down, op.lift, op.dwell);
            emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
        }
    }

    class OpXRay extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { widget, sliceAll } = this.state;
            let slicer = new KIRI.slicer2(widget.getPoints(), {
                zlist: true,
                zline: true
            });
            let xrayind = Object.keys(slicer.zLine)
                .map(v => parseFloat(v).round(5))
                .sort((a,b) => a-b);
            let xrayopt = { each: (data, index, total) => {
                let slice = newSlice(data.z);
                slice.addTops(data.tops);
                // data.tops.forEach(top => slice.addTop(top));
                slice.lines = data.lines;
                slice.xray();
                sliceAll.push(slice);
            }, over: false, flatoff: 0, edges: true, openok: true };
            slicer.slice(xrayind, xrayopt);
            // xrayopt.over = true;
            // slicer.slice(xrayind, xrayopt);
        }
    }

    class OpShadow extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let state = this.state;
            let { ops, slicer } = state;

            let real = ops.map(rec => rec.op).filter(op => op);
            let rough = real.map(op => op.type === 'rough').length > 0;
            let outlineIn = real.map(op => op.type === 'outline' && op.inside).length > 0;

            let minStepDown = real
                .map(op => (op.down || 3) / 3)
                .reduce((a,v) => Math.min(a, v, 1));

            let tslices = [];
            let tshadow = [];
            let tzindex = slicer.interval(minStepDown, { fit: true, off: 0.01, down: true, flats: true });
            let skipTerrain = !(rough || outlineIn) && tzindex.length > 50;

            if (skipTerrain) {
                console.log("skipping terrain generation for speed");
                tzindex = [ tzindex.pop() ];
            }

            let terrain = slicer.slice(tzindex, { each: (data, index, total) => {
                tshadow = POLY.union(tshadow.slice().appendAll(data.tops), 0.01, true);
                tslices.push(data.slice);
                if (false) {
                    const slice = data.slice;
                    sliceAll.push(slice);
                    slice.output()
                        .setLayer("terrain", {line: 0x888800, thin: true })
                        .addPolys(POLY.setZ(tshadow.clone(true), data.z), { thin: true });
                }
                progress(index / total);
            }, genso: true });

            state.shadowTop = terrain[terrain.length - 1];
            state.center = tshadow[0].bounds.center();
            state.tshadow = tshadow;
            state.terrain = terrain;
            state.tslices = tslices;
            state.skipTerrain = skipTerrain;

            // identify through holes
            state.thruHoles = tshadow.map(p => p.inner || []).flat();
        }
    }

    CAM.OPS = CamOp.MAP = {
        "xray": OpXRay,
        "shadow": OpShadow,
        "level": OpLevel,
        "rough": OpRough,
        "outline": OpOutline,
        "contour": OpContour,
        "trace": OpTrace,
        "drill": OpDrill,
        "register": OpRegister
    };

})();
