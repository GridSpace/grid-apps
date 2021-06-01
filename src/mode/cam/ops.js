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
                z = bounds.max.z - (op.down || 0);

            if (stock.x && stock.y && stock.z) {
                x1 = -stock.x / 2;
                y1 = -stock.y / 2;
                x2 = -x1;
                y2 = -y1;
                z = zMax + ztOff - (op.down || 0);
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
            let { settings, widget, slicer, sliceAll, unsafe } = state;
            let { updateToolDiams, thruHoles, tabs, cutTabs, cutPolys } = state;
            let { tshadow, shadowTop, ztOff, zBottom, zMax } = state;
            let { process, stock } = settings;

            if (op.down <= 0) {
                throw `invalid step down "${op.down}"`;
            }

            let roughIn = op.inside;
            let roughTop = op.top;
            let roughDown = op.down;
            let roughLeave = op.leave;
            let toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
            let trueShadow = process.camTrueShadow === true;

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
                    .map(v => parseFloat(v).round(5))
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
                shadow = unsafe ? data.tops : POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
                if (flats.indexOf(data.z) >= 0) {
                    // exclude flats injected to complete shadow
                    return;
                }
                data.shadow = trueShadow ? CAM.shadowAt(widget, data.z) : shadow.clone(true);
                data.slice.shadow = data.shadow;
                // data.slice.tops[0].inner = data.shadow;
                // data.slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
                slices.push(data.slice);
                progress((index / total) * 0.5);
            }, genso: true });

            if (trueShadow) {
                shadow = tshadow.clone(true);
            } else {
                shadow = POLY.union(shadow.appendAll(shadowTop.tops), 0.01, true);
            }

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

            // shell = shadow expanded by half tool diameter + leave stock
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
                    const outside = POLY.offset(shadow.clone(), toolDiam / 2, {z: slice.z});
                    if (outside) {
                        outside.forEach(p => p.depth = -p.depth);
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

                if (process.camStockClipTo && stock.x && stock.y && stock.center) {
                    let rect = newPolygon().centerRectangle(stock.center, stock.x, stock.y);
                    offset = cutPolys([rect], offset, slice.z, true);
                }

                // elimate double inset on inners
                offset.forEach(op => {
                    if (op.inner) {
                        let pv1 = op.perimeter();
                        let newinner = [];
                        op.inner.forEach(oi => {
                            let pv2 = oi.perimeter();
                            let pct = pv1 > pv2 ? pv2/pv1 : pv1/pv2;
                            if (pct < 0.98) {
                                newinner.push(oi);
                            }
                        });
                        op.inner = newinner;
                    }
                });

                slice.camLines = offset;
                if (false) slice.output()
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
            let { process, controller } = settings;

            let danger = controller.danger;
            let easeDown = process.camEaseDown;
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

            function isNeg(v) {
                return v < 0 || (v === 0 && 1/v === -Infinity);
            }

            if (depthFirst) {
                let ease = danger && op.down && easeDown ? op.down : 0;
                let ins = depthData.map(a => a.filter(p => !isNeg(p.depth)));
                let itops = ins.map(level => {
                    return POLY.nest(level.filter(poly => poly.depth === 0).clone());
                });
                let outs = depthData.map(a => a.filter(p => isNeg(p.depth)));
                let otops = outs.map(level => {
                    return POLY.nest(level.filter(poly => poly.depth === 0).clone());
                });
                printPoint = depthRoughPath(printPoint, 0, ins, itops, polyEmit, false, ease);
                printPoint = depthRoughPath(printPoint, 0, outs, otops, polyEmit, false, ease);
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
            let { settings, widget, slicer, sliceAll, tshadow, thruHoles, unsafe } = state;
            let { updateToolDiams, zThru, zBottom, shadowTop, tabs, cutTabs, cutPolys } = state;
            let { process, stock } = settings;

            if (op.down <= 0) {
                throw `invalid step down "${op.down}"`;
            }

            let toolDiam = this.toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
            updateToolDiams(toolDiam);

            let shadow = [];
            let slices = [];
            let indices = slicer.interval(op.down, { down: true, min: zBottom, fit: true, off: 0.01 });
            let trueShadow = process.camTrueShadow === true;
            // shift out first (top-most) slice
            indices.shift();
            // add flats to shadow
            const flats = Object.keys(slicer.zFlat)
                .map(v => (parseFloat(v) - 0.01).round(5))
                .filter(v => v > 0 && indices.indexOf(v) < 0);
            indices = indices.appendAll(flats).sort((a,b) => b-a);
            // console.log('indices', ...indices, {zBottom, slicer});
            if (op.outside && !op.inside) {
                // console.log({outline_bypass: indices, down: op.down});
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
                shadow = unsafe ? data.tops : POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
                if (flats.indexOf(data.z) >= 0) {
                    // exclude flats injected to complete shadow
                    return;
                }
                data.shadow = trueShadow ? CAM.shadowAt(widget, data.z) : shadow.clone(true);
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
                for (let zneg of BASE.util.lerp(0, zThru, op.down)) {
                    let add = last.clone(true);
                    add.tops.forEach(top => top.poly.setZ(add.z));
                    add.shadow = last.shadow.clone(true);
                    add.z -= zneg;
                    slices.push(add);
                }
            }

            slices.forEach(slice => {
                let tops = slice.shadow;

                // outside only (use tshadow for entire cut)
                if (op.outside) {
                    tops = tshadow;
                }

                if (op.omitthru) {
                    // eliminate thru holes from shadow
                    for (let hole of thruHoles) {
                        for (let top of tops) {
                            if (!top.inner) continue;
                            top.inner = top.inner.filter(innr => {
                                return !innr.isEquivalent(hole);
                            });
                        }
                    }
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

                if (process.camStockClipTo && stock.x && stock.y && stock.center) {
                    let rect = newPolygon().centerRectangle(stock.center, stock.x, stock.y);
                    offset = cutPolys([rect], offset, slice.z, true);
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
            let { process, controller } = settings;

            let danger = controller.danger;
            let easeDown = process.camEaseDown;
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
                    // experimental start of ease down
                    let ease = danger && op.down && easeDown ? op.down : 0;
                    printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, false, ease);
                    printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, true, ease);
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

            let toolDiam = this.toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
            let stepover = toolDiam * op.step * 2;
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
                            camOut(point.clone(), pidx > 0, stepover);
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
                        camOut(point.clone(), pidx > 0, stepover);
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
            let { tool, rate, down, plunge, offset } = op;
            let { settings, widget, sliceAll, zMax, zTop, tabs } = state;
            let { updateToolDiams, cutTabs, cutPolys, healPolys } = state;
            let { process, stock } = settings;
            let poly2polyEmit = BASE.util.poly2polyEmit;
            // generate tracing offsets from chosen features
            let sliceOut = this.sliceOut = [];
            let areas = op.areas[widget.id] || [];
            let toolDiam = new CAM.Tool(settings, tool).fluteDiameter();
            let toolOver = toolDiam * op.step;
            let cutdir = process.camConventional;
            let polys = [];
            let stockRect = stock.center && stock.x && stock.y ?
                newPolygon().centerRectangle(stock.center, stock.x, stock.y) : undefined;
            updateToolDiams(toolDiam);
            if (tabs) {
                tabs.forEach(tab => {
                    tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
                });
            }
            for (let arr of areas) {
                let poly = newPolygon().fromArray(arr);
                POLY.setWinding([ poly ], cutdir, false);
                polys.push(poly);
            }
            function newSliceOut(z) {
                let slice = newSlice(z);
                sliceAll.push(slice);
                sliceOut.push(slice);
                return slice;
            }
            function followZ(poly) {
                let z = poly.getZ();
                let slice = newSliceOut(z);
                slice.camTrace = { tool, rate, plunge };
                if (tabs) {
                    slice.camLines = cutTabs(tabs, [poly], z);
                } else {
                    slice.camLines = [ poly ];
                }
                if (process.camStockClipTo && stockRect) {
                    slice.camLines = cutPolys([stockRect], slice.camLines, z, true);
                }
                slice.output()
                    .setLayer("follow", {line: 0xaa00aa}, false)
                    .addPolys(slice.camLines)
            }
            function clearZ(polys, z, down) {
                let zs = down ? BASE.util.lerp(zTop, z, down) : [ z ];
                let nested = POLY.nest(polys);
                for (let poly of nested) {
                    for (let z of zs) {
                        let slice = newSliceOut(z);
                        slice.camTrace = { tool, rate, plunge };
                        POLY.offset([ poly ], -toolOver, {
                            count:999, outs: slice.camLines = [], flat:true, z
                        });
                        if (tabs) {
                            slice.camLines = cutTabs(tabs, POLY.flatten(slice.camLines, null, true), z);
                        } else {
                            slice.camLines = POLY.flatten(slice.camLines, null, true);
                        }
                        POLY.setWinding(slice.camLines, cutdir, false);
                        slice.output()
                            .setLayer("clear", {line: 0xaa00aa}, false)
                            .addPolys(slice.camLines)
                    }
                }
            }
            // connect selected segments if open and touching
            polys = healPolys(polys);
            switch (op.mode) {
                case "follow":
                    let routed = [];
                    poly2polyEmit(polys, newPoint(0,0,0), (poly, index, count, spoint) => {
                        routed.push(poly);
                    });
                    for (let poly of routed) {
                        let offdist = 0;
                        switch (offset) {
                            case "outside": offdist = toolDiam / 2; break;
                            case "inside": offdist = -toolDiam / 2; break;
                        }
                        if (offdist) {
                            let pnew = POLY.offset([poly], offdist);
                            if (pnew) {
                                poly = POLY.setZ(pnew, poly.getZ());
                            } else {
                                continue;
                            }
                        } else {
                            poly = [ poly ];
                        }
                        for (let pi of poly)
                        if (down) {
                            for (let z of BASE.util.lerp(zTop, pi.getZ(), down)) {
                                followZ(pi.clone().setZ(z));
                            }
                        } else {
                            followZ(pi);
                        }
                    }
                    break;
                case "clear":
                    let zmap = {};
                    for (let poly of polys) {
                        let z = poly.getZ();
                        (zmap[z] = zmap[z] || []).push(poly);
                    }
                    for (let [zv, polys] of Object.entries(zmap)) {
                        clearZ(polys, parseFloat(zv), down);
                    }
            }
        }

        prepare(ops, progress) {
            let { op, state } = this;
            let { settings } = state;
            let { setTool, setSpindle } = ops;

            setTool(op.tool, op.rate);
            setSpindle(op.spindle);
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
            let { settings, widget, sliceAll, tslices, updateToolDiams, zBottom } = state;

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
                if (slice.z < zBottom) return;
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
            let { settings, widget, sliceAll, updateToolDiams } = state;
            let { setTool, setSpindle, setDrill, emitDrills } = ops;

            setTool(op.tool, undefined, op.rate);
            setDrill(op.down, op.lift, op.dwell);
            setSpindle(op.spindle);
            emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
        }
    }

    class OpRegister extends CamOp {
        constructor(state, op) {
            super(state, op);
        }

        slice(progress) {
            let { op, state } = this;
            let { settings, widget, bounds, sliceAll, zMax, zThru } = state;
            let { updateToolDiams } = state;

            let tool = new CAM.Tool(settings, op.tool);
            let sliceOut = this.sliceOut = [];

            updateToolDiams(tool.fluteDiameter());

            let { stock } = settings,
                tz = widget.track.pos.z,
                lx = bounds.min.x,
                hx = bounds.max.x,
                ly = bounds.min.y,
                hy = bounds.max.y,
                o3 = tool.fluteDiameter() * 2,
                mx = (lx + hx) / 2,
                my = (ly + hy) / 2,
                mz = zThru || 0,
                dx = (stock.x - (hx - lx)) / 4,
                dy = (stock.y - (hy - ly)) / 4,
                dz = stock.z,
                points = [],
                wo = stock.z - bounds.max.z,
                z1 = bounds.max.z + wo + tz,
                z2 = tz - mz;

            if (!(stock.x && stock.y && stock.z)) {
                return;
            }

            switch (op.axis) {
                case "X":
                case "x":
                    if (op.points == 3) {
                        points.push(newPoint(lx - dx, my, 0));
                        points.push(newPoint(hx + dx, my - o3, 0));
                        points.push(newPoint(hx + dx, my + o3, 0));
                    } else {
                        points.push(newPoint(lx - dx, my, 0));
                        points.push(newPoint(hx + dx, my, 0));
                    }
                    break;
                case "Y":
                case "y":
                    if (op.points == 3) {
                        points.push(newPoint(mx, ly - dy, 0));
                        points.push(newPoint(mx - o3, hy + dy, 0));
                        points.push(newPoint(mx + o3, hy + dy, 0));
                    } else {
                        points.push(newPoint(mx, ly - dy, 0));
                        points.push(newPoint(mx, hy + dy, 0));
                    }
                    break;
                case "-":
                    let o2 = o3 / 2,
                        x0 = lx - dx,
                        x1 = hx + dx,
                        y0 = ly - dy - o2,
                        y1 = hy + dy + o2,
                        x4 = (x1 - x0 - o2) / 4,
                        y4 = (y1 - y0 - o2 * 3) / 4,
                        poly, cp, cz;
                    function start(z) {
                        cz = z;
                        cp = {x:x0 + o2 * 0.5, y:y0 + o2 * 1.5};
                        poly = newPolygon().add(cp.x, cp.y, z);
                    }
                    function move(dx, dy) {
                        cp.x += dx;
                        cp.y += dy;
                        poly.add(cp.x, cp.y, cz);
                    }
                    function rept(count, tv, fn) {
                        while (count-- > 0) {
                            fn(tv, count === 0);
                            tv = -tv;
                        }
                    }
                    for (let z of BASE.util.lerp(z1, z2, op.down)) {
                        let slice = newSlice(z);
                        sliceAll.push(slice);
                        sliceOut.push(slice);
                        start(z);
                        rept(4, o2, oy => {
                            move(0, -oy);
                            move(x4, 0);
                        });
                        rept(4, o2, ox => {
                            move(ox, 0);
                            move(0, y4);
                        });
                        rept(4, o2, oy => {
                            move(0, oy);
                            move(-x4, 0);
                        });
                        rept(4, o2, ox => {
                            move(-ox, 0);
                            move(0, -y4);
                        });
                        poly.points.pop();
                        poly.length--;
                        slice.camTrace = { tool: tool.getID(), rate: op.feed, plunge: op.rate };
                        slice.camLines = [ poly ];
                        slice.output()
                            .setLayer("register", {line: 0xaa00aa}, false)
                            .addPolys(slice.camLines)
                    }
                    break;
            }

            if (points.length) {
                let slice = newSlice(0,null), polys = [];
                points.forEach(point => {
                    polys.push(newPolygon()
                        .append(point.clone().setZ(z1))
                        .append(point.clone().setZ(z2)));
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
            let { settings, widget, sliceAll, updateToolDiams } = state;
            let { setTool, setSpindle, setDrill, emitDrills } = ops;

            if (op.axis === '-') {
                setTool(op.tool, op.feed, op.rate);
                setSpindle(op.spindle);
                for (let slice of this.sliceOut) {
                    ops.emitTrace(slice);
                }
            } else {
                setTool(op.tool, undefined, op.rate);
                setDrill(op.down, op.lift, op.dwell);
                setSpindle(op.spindle);
                emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
            }
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
            let { ops, slicer, widget, unsafe, sliceAll } = state;

            let real = ops.map(rec => rec.op).filter(op => op);
            let rough = real.filter(op => op.type === 'rough').length > 0;
            let outline = real.filter(op => op.type === 'outline').length > 0;
            let outlineOut = real.filter(op => op.type === 'outline' && op.outside).length > 0;
            let trueShadow = state.settings.process.camTrueShadow === true;

            let minStepDown = real
                .map(op => (op.down || 3) / (trueShadow ? 1 : 3))
                .reduce((a,v) => Math.min(a, v, 1));

            let tslices = [];
            let tshadow = [];
            let tzindex = slicer.interval(minStepDown, { fit: true, off: 0.01, down: true, flats: true });
            let complex = tzindex.length > 50 || widget.vertices.length > 1000000;
            let skipTerrain = unsafe || (!rough && !outline && complex);

            if (skipTerrain) {
                console.log("skipping terrain generation");
                tzindex = [ tzindex.pop() ];
            }

            let lsz; // only shadow up to bottom of last shadow for progressive union
            let terrain = slicer.slice(tzindex, { each: (data, index, total) => {
                let shadowAt = trueShadow ? CAM.shadowAt(widget, data.z, lsz) : [];
                tshadow = POLY.union(tshadow.slice().appendAll(data.tops).appendAll(shadowAt), 0.01, true);
                tslices.push(data.slice);
                if (false) {
                    const slice = data.slice;
                    sliceAll.push(slice);
                    slice.output()
                        .setLayer("shadow", {line: 0x888800, thin: true })
                        .addPolys(POLY.setZ(tshadow.clone(true), data.z), { thin: true });
                    slice.output()
                        .setLayer("slice", {line: 0x886622, thin: true })
                        .addPolys(POLY.setZ(data.tops.clone(true), data.z), { thin: true });
                    // let p1 = [], p2 = [], cp = p1;
                    // for (let line of data.lines) {
                    //     cp.push(line.p1);
                    //     cp.push(line.p2);
                    //     cp = (cp === p1 ? p2 : p1);
                    // }
                    // slice.output()
                    //     .setLayer("lines1", {line: 0x884444, thin: true })
                    //     .addLines(p1, { thin: true });
                    // slice.output()
                    //     .setLayer("lines2", {line: 0x444488, thin: true })
                    //     .addLines(p2, { thin: true });
                }
                lsz = data.z;
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

    CAM.shadowAt = function(widget, z, ztop) {
        let geo = widget.cache.geo || new THREE.BufferGeometry()
            .setAttribute('position', new THREE.BufferAttribute(widget.vertices, 3));
        widget.cache.geo = geo;
        let rad = (Math.PI / 180);
        let deg = (180 / Math.PI);
        let angle = rad * 1;
        let thresh = -Math.sin(angle);
        let found = [];
        let { position } = geo.attributes;
        let { itemSize, count, array } = position;
        for (let i = 0; i<count; i += 3) {
            let ip = i * itemSize;
            let a = new THREE.Vector3(array[ip++], array[ip++], array[ip++]);
            let b = new THREE.Vector3(array[ip++], array[ip++], array[ip++]);
            let c = new THREE.Vector3(array[ip++], array[ip++], array[ip++]);
            let where = undefined;
            if (ztop && a.z > ztop && b.z > ztop && c.z > ztop) {
                // skip faces over top threshold
                continue;
            }
            if (a.z < z && b.z < z && c.z < z) {
                // skip faces under threshold
                continue;
            } else if (a.z > z && b.z > z && c.z > z) {
                // limit to selected faces over threshold
                let norm = THREE.computeFaceNormal(a,b,c);
                if (norm.z < thresh) {
                    continue;
                }
                found.push([a,b,c]);
                continue;
            } else {
                // check faces straddling threshold
                where = {under: [], over: [], on: []};
            }
            if (where) {
                let { checkOverUnderOn, intersectPoints } = self.kiri.slicer2;
                checkOverUnderOn(newPoint(a.x, a.y, a.z), z, where);
                checkOverUnderOn(newPoint(b.x, b.y, b.z), z, where);
                checkOverUnderOn(newPoint(c.x, c.y, c.z), z, where);
                if (where.on.length === 0 && (where.over.length === 2 || where.under.length === 2)) {
                    // compute two point intersections and construct line
                    let line = intersectPoints(where.over, where.under, z);
                    if (line.length === 2) {
                        if (where.over.length === 2) {
                            found.push([where.over[0], line[0], line[1]]);
                            found.push([where.over[1], line[0], line[1]]);
                            found.push([where.over[0], where.over[1], line[1]]);
                            found.push([where.over[0], where.over[1], line[0]]);
                        } else {
                            found.push([where.over[0], line[0], line[1]]);
                        }
                    } else {
                        console.log({msg: "invalid ips", line: line, where: where});
                    }
                }
                continue;
            } else {
                continue;
            }
            found.push([a,b,c]);
        }
        let polys = found.map(a => {
            return newPolygon()
                .add(a[0].x,a[0].y,a[0].z)
                .add(a[1].x,a[1].y,a[1].z)
                .add(a[2].x,a[2].y,a[2].z);
        });
        return POLY.union(polys, 0.0001, true);
    };

    CAM.OPS = CamOp.MAP = {
        "xray": OpXRay,
        "shadow": OpShadow,
        "level": OpLevel,
        "rough": OpRough,
        "outline": OpOutline,
        "contour": OpContour,
        "trace": OpTrace,
        "drill": OpDrill,
        "register": OpRegister,
        "flip": CamOp
    };

})();
