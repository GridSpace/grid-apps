/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.paths
// dep: geo.point
// dep: geo.polygons
// dep: geo.slicer
// dep: kiri.slice
// use: kiri-mode.cam.topo
// use: kiri-mode.cam.topo4
gapp.register("kiri-mode.cam.ops", (root, exports) => {

const { base, kiri } = root;
const { paths, polygons, newPoint, newPolygon, sliceConnect } = base;
const { poly2polyEmit, tip2tipEmit, segmentNormal, vertexNormal } = paths;
const { driver, newSlice } = kiri;
const { CAM } = driver;

const POLY = polygons;

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

    async slice() { }

    prepare() { }
}

class OpIndex extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    slice() {
        let { op, state } = this;
        if (!state.isIndexed) {
            throw 'index op requires indexed stock';
        }
        this.degrees = state.setAxisIndex(op.degrees, op.absolute);
    }

    prepare(ops, progress) {
        const { lastPoint, zmax, zclear, camOut, stock } = ops;
        let last = lastPoint();
        if (last) {
            // max point of stock corner radius when rotating (safe z when indexing)
            const rzmax = (Math.max(stock.y, stock.z) * Math.sqrt(2)) / 2 + zclear;
            const zmove = Math.max(rzmax, zmax);
            // move above rotating stock
            camOut(last = last.clone().setZ(zmove), 0);
            // issue rotation command
            camOut(last = last.clone().setY(0).setA(this.degrees), 0);
        }
    }
}

class OpGCode extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    prepare(ops, progress) {
        ops.addGCode(this.op.gcode);
    }
}

class OpLaserOn extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    prepare(ops, progress) {
        const { printPoint, setPrintPoint, setTool, zmax, camOut } = ops;
        this.op.silent = true;
        setTool(0);
        ops.addGCode(this.op.enable);
        ops.setLasering(true, this.op.power);
    }
}

class OpLaserOff extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    prepare(ops, progress) {
        const { printPoint, zmax, camOut } = ops;
        this.op.silent = true;
        ops.addGCode(this.op.disable);
        ops.setLasering(false);
        camOut(printPoint.clone().setZ(zmax), 0);
    }
}

class OpLevel extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, widget, addSlices } = state;
        let { updateToolDiams, tabs, cutTabs } = state;
        let { bounds, zMax, ztOff, color, tshadow } = state;
        let { stock } = settings;

        let toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
        let stepOver = this.stepOver = toolDiam * op.step;
        let z = zMax + ztOff - op.down;

        updateToolDiams(toolDiam);

        let points = [];
        let clear = op.stock ?
            [ newPolygon().centerRectangle({x:0,y:0,z:0}, stock.x, stock.y) ] :
            POLY.outer(POLY.offset(tshadow, toolDiam * (op.over || 0)));

        POLY.fillArea(clear, 90, stepOver, points);

        let lines = this.lines = [];
        for (let i=0; i<points.length; i += 2) {
            let slice = newSlice(z);
            lines.push( newPolygon().setOpen().addPoints([ points[i], points[i+1] ]).setZ(z) );
            slice.output()
                .setLayer("level", {face: color, line: color})
                .addPolys(this.lines);
            addSlices(slice);
        }
    }

    prepare(ops, progress) {
        let { op, state, lines, stepOver } = this;
        let { setTool, setSpindle, printPoint, setPrintPoint } = ops;
        let { polyEmit, newLayer, tip2tipEmit, camOut } = ops;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);
        lines = lines.map(p => { return { first: p.first(), last: p.last(), poly: p } });
        printPoint = tip2tipEmit(lines, printPoint, (el, point, count) => {
            let poly = el.poly;
            if (poly.last() === point) {
                poly.reverse();
            }
            poly.forEachPoint((point, pidx) => {
                camOut(point.clone(), true, stepOver);
            }, false);
        });
        setPrintPoint(printPoint);

        newLayer();
    }
}

class OpRough extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, slicer, addSlices, unsafe, color } = state;
        let { updateToolDiams, thruHoles, tabs, cutTabs, cutPolys } = state;
        let { ztOff, zMax, shadowAt, isIndexed} = state;
        let { workarea } = state;
        let { process, stock } = settings;

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }

        let roughIn = op.inside;
        let roughDown = op.down;
        let roughLeave = op.leave || 0;
        let roughLeaveZ = op.leavez || 0;
        let roughStock = op.all && isIndexed;
        let toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
        let trueShadow = process.camTrueShadow === true;

        updateToolDiams(toolDiam);

        // clear the stock above the area to be roughed out
        if (workarea.top_z > workarea.top_part) {
            let shadow = state.shadow.base.clone();
            let step = toolDiam * op.step;
            let inset = roughStock ?
                POLY.offset([ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ], step) :
                POLY.offset(shadow, roughIn ? step : step + roughLeave + toolDiam / 2);
            let facing = POLY.offset(inset, -step, { count: 999, flat: true });
            if (isIndexed) {
                ztOff = (stock.z / 2) - zMax;
            }
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
                let slice = newSlice();
                slice.z = z;
                slice.camLines = POLY.setZ(facing.clone(true), slice.z + roughLeaveZ);
                slice.output()
                    .setLayer("face", {face: color, line: color})
                    .addPolys(slice.camLines);
                addSlices(slice);
                camFaces.push(slice);
                z -= zstep;
            }
        }

        // create roughing slices
        let flats = [];
        let shadow = [];
        let slices = [];
        let indices = slicer.interval(roughDown, {
            down: true, min: 0, fit: true, off: 0.01
        });

        // shift out first (top-most) slice
        indices.shift();

        // find flats and add to indices for slicing
        if (op.flats) {
            let flatArea = (Math.PI * (toolDiam/2) * (toolDiam/2)) / 2;
            let flats = Object.entries(slicer.zFlat)
                .filter(row => row[1] > flatArea)
                .map(row => row[0])
                .map(v => parseFloat(v).round(5))
                .filter(v => v >= workarea.bottom_z);
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

        indices = indices.filter(v => v >= workarea.bottom_z);
        // console.log('indices', ...indices, {zBottom});

        let cnt = 0;
        let tot = 0;
        await slicer.slice(indices, { each: data => {
            shadow = unsafe ? data.tops : POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
            if (flats.indexOf(data.z) >= 0) {
                // exclude flats injected to complete shadow
                return;
            }
            if (data.z > workarea.top_z) {
                return;
            }
            data.shadow = trueShadow ? shadowAt(data.z) : shadow.clone(true);
            data.slice.shadow = data.shadow;
            slices.push(data.slice);
            progress(0.25 + 0.25 * (++cnt / tot));
        }, progress: (index, total) => {
            tot = total;
            progress((index / total) * 0.25);
        } });

        if (trueShadow) {
            shadow = state.shadow.base.clone(true);
        } else {
            shadow = POLY.union(shadow.appendAll(state.shadow.base), 0.01, true);
        }

        // inset or eliminate thru holes from shadow
        shadow = POLY.flatten(shadow.clone(true), [], true);
        thruHoles.forEach(hole => {
            shadow = shadow.map(p => {
                if (p.isEquivalent(hole)) {
                    let po = POLY.offset([p], -(toolDiam / 2 + roughLeave + 0.01));
                    return po ? po[0] : undefined;
                } else {
                    return p;
                }
            }).filter(p => p);
        });
        shadow = POLY.nest(shadow);
        if (op.voids) {
            // eliminate voids from shadow when "clear voids" enables
            for (let s of shadow) s.inner = undefined;
        }

        // shell = shadow expanded by half tool diameter + leave stock
        const sadd = roughIn ? toolDiam / 2 : toolDiam / 2;
        const shell = roughStock ?
            POLY.offset([ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ], sadd) :
            POLY.offset(shadow, sadd + roughLeave);

        slices.forEach((slice, index) => {
            let offset = [shell.clone(true),slice.shadow.clone(true)].flat();
            let flat = POLY.flatten(offset, [], true);
            let nest = POLY.setZ(POLY.nest(flat), slice.z);

            // inset offset array by 1/2 diameter then by tool overlap %
            offset = POLY.offset(nest, [-(toolDiam / 2 + roughLeave), -toolDiam * op.step], {
                minArea: Math.min(0.01, toolDiam * op.step / 4),
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
            if (!roughIn && !roughStock) {
                const outside = POLY.offset(shadow.clone(), toolDiam / 2 + roughLeave, {z: slice.z});
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
            if (roughLeaveZ) {
                // offset roughing in Z as well to minimize
                // tool marks on curved surfaces
                // const roughLeaveZ = 1 * Math.min(roughDown, roughLeave / 2);
                slice.camLines.forEach(p => {
                    p.setZ(p.getZ() + roughLeaveZ);
                });
            }
            if (false) slice.output()
                .setLayer("slice", {line: 0xaaaa00}, true)
                .addPolys(slice.topPolys())
                // .setLayer("top shadow", {line: 0x0000aa})
                // .addPolys(tshadow)
                // .setLayer("rough shadow", {line: 0x00aa00})
                // .addPolys(shadow)
                .setLayer("rough shell", {line: 0xaa0000})
                .addPolys(shell);
            progress(0.5 + 0.5 * (index / slices.length));
        });

        let last = slices[slices.length-1];

        if (workarea.bottom_z < 0)
        for (let zneg of base.util.lerp(0, -workarea.bottom_cut, op.down)) {
            if (!last) continue;
            let add = last.clone(true);
            add.z -= zneg;
            add.camLines = last.camLines.clone(true);
            add.camLines.forEach(p => p.setZ(add.z + roughLeaveZ));
            // add.tops.forEach(top => top.poly.setZ(add.z));
            // add.shadow = last.shadow.clone(true);
            slices.push(add);
        }

        slices.forEach(slice => {
            slice.output()
                .setLayer("roughing", {face: color, line: color})
                .addPolys(slice.camLines);
        });
        this.sliceOut = slices.filter(slice => slice.camLines);

        addSlices(this.sliceOut);
    }

    prepare(ops, progress) {
        let { op, state, sliceOut, camFaces } = this;
        let { setTool, setSpindle, setPrintPoint, sliceOutput } = ops;
        let { camOut, newLayer, printPoint } = ops;
        let { settings } = state;
        let { process } = settings;

        let easeDown = process.camEaseDown;
        let cutdir = op.ov_conv;
        let depthFirst = process.camDepthFirst && !state.isIndexed;
        let depthData = [];

        setTool(op.tool, op.rate, op.plunge);
        setSpindle(op.spindle);

        // output the clearing of stock above roughing
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
                const factor = count === 1 ? 0.5 : 1;
                poly.forEachPoint(function(point, pidx, points, offset) {
                    camOut(point.clone(), offset !== 0, undefined, factor);
                }, true, index);
            });
            newLayer();
        }

        // output the roughing passes
        setPrintPoint(printPoint);
        sliceOutput(sliceOut, {
            cutdir,
            depthFirst,
            easeDown: op.down && easeDown ? 0.001 : 0,
            progress: (n,m) => progress(n/m, "routing")
        });
    }
}

class OpOutline extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, widget, slicer, addSlices, tshadow, thruHoles, unsafe, color } = state;
        let { updateToolDiams, tabs, cutTabs, cutPolys, workarea } = state;
        let { zMax } = state;
        let { process, stock } = settings;

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }
        let toolDiam = this.toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
        updateToolDiams(toolDiam);

        let shadow = [];
        let slices = [];
        let intopt = {
            off: 0.01,
            fit: true,
            down: true,
            min: Math.max(0, workarea.bottom_z),
            max: workarea.top_z
        };
        let indices = slicer.interval(op.down, intopt);
        let trueShadow = process.camTrueShadow === true;
        // shift out first (top-most) slice
        indices.shift();
        // add flats to shadow
        const flats = Object.keys(slicer.zFlat)
            .map(v => (parseFloat(v) - 0.01).round(5))
            .filter(v => v > 0 && indices.indexOf(v) < 0);
        indices = indices.appendAll(flats).sort((a,b) => b-a);

        let cnt = 0;
        let tot = 0;
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
        await slicer.slice(indices, { each: data => {
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
            progress(0.5 + 0.5 * (++cnt / tot));
        }, progress: (index, total) => {
            tot = total;
            progress((index / total) * 0.5);
        } });
        shadow = POLY.union(shadow.appendAll(state.shadow.base), 0.01, true);

        // start slices at top of stock when `clear top` enabled
        if (op.top) {
            let first = slices[0];
            let zlist = slices.map(s => s.z);
            for (let z of indices.filter(v => v >= zMax)) {
                if (zlist.contains(z)) {
                    continue;
                }
                let add = first.clone(true);
                add.tops.forEach(top => top.poly.setZ(add.z));
                add.shadow = first.shadow.clone(true);
                add.z = z;
                slices.splice(0,0,add);
            }
        }

        // extend cut thru (only when z bottom is 0)
        if (workarea.bottom_z < 0) {
            let last = slices[slices.length-1];
            for (let zneg of base.util.lerp(0, -workarea.bottom_cut, op.down)) {
                if (!last) continue;
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
                            return !innr.isEquivalent(hole, false, 0.1);
                        });
                    }
                }
            }

            if (op.omitvoid) {
                for (let top of tops) {
                    delete top.inner;
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
                    for (let c = (op.steps || 1); c > 0; c--)
                    offset.slice().forEach(op => {
                        // clone removes inners but the real solution is
                        // to limit expanded shells to through holes
                        POLY.expand([op.clone(true)], stepover, slice.z, offset, 1);
                    });
                }
            }

            if (op.dogbones && !op.wide) {
                CAM.addDogbones(offset, toolDiam / 5);
            }

            if (tabs) {
                tabs.forEach(tab => {
                    tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
                });
                offset = cutTabs(tabs, offset, slice.z);
            }

            if (process.camStockClipTo && stock.x && stock.y && stock.center) {
                let rect = newPolygon().centerRectangle(stock.center, stock.x, stock.y);
                offset = cutPolys([rect], offset, slice.z, true);
            }

            // offset.xout(`slice ${slice.z}`);
            slice.camLines = offset;
        });

        // when top expand fails above, it creates an empty slice
        slices = slices.filter(s => s.camLines);

        // project empty up and render
        for (let slice of slices) {
            if (false) slice.output()
                .setLayer("slice", {line: 0xaaaa00}, false)
                .addPolys(slice.topPolys())
            slice.output()
                .setLayer("outline", {face: color, line: color})
                .addPolys(slice.camLines);
        }

        addSlices(slices);
        this.sliceOut = slices;
    }

    prepare(ops, progress) {
        let { op, state, sliceOut } = this;
        let { setTool, setSpindle, setPrintPoint } = ops;
        let { polyEmit, depthOutlinePath } = ops;
        let { camOut, newLayer, printPoint } = ops;
        let { settings, widget } = state;
        let { process, controller } = settings;

        let easeDown = process.camEaseDown;
        let toolDiam = this.toolDiam;
        let cutdir = op.ov_conv;//process.camConventional;
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
                }, { swapdir: false });
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
                let ease = op.down && easeDown ? 0.001 : 0;
                printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, false, ease);
                printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, true, ease);
            }
        }

        setPrintPoint(printPoint);
    }
}

function createFilter(op) {
    let filter = slices => slices;
    if (op.filter) {
        try {
            const obj = eval(`( ${op.filter.join('\n')} )`);
            let idx = 0;
            if (obj && obj.slices) {
                const nadd = [];
                filter = function(slices) {
                    for (let slice of slices) {
                        if (obj.slices(slice, idx++)) {
                            nadd.push(slice);
                        }
                    }
                    return nadd;
                };
            }
        } catch (e) {
            console.log('filter parse error', e, op.filter);
        }
    }
    return filter;
}

class OpContour extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices } = state;
        let filter = createFilter(op);
        // we need topo for safe travel moves when roughing and outlining
        // not generated when drilling-only. then all z moves use bounds max.
        // also generates x and y contouring when selected
        let topo = await CAM.Topo({
            // onupdate: (update, msg) => {
            onupdate: (index, total, msg) => {
                progress(index / total, msg);
            },
            ondone: (slices) => {
                slices = filter(slices);
                this.sliceOut = slices;
                addSlices(slices);
            },
            contour: op,
            state: state
        });
        // computed if set to 0
        this.tolerance = topo.tolerance;
    }

    prepare(ops, progress) {
        let { op, state, sliceOut } = this;
        let { settings, widget } = state;
        let { process } = settings;

        let { setTolerance, setTool, setSpindle, setPrintPoint } = ops;
        let { camOut, polyEmit, newLayer, printPoint, lastPoint } = ops;
        let { bounds, zmax } = ops;

        let toolDiam = this.toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
        let stepover = toolDiam * op.step * 2;
        let depthFirst = process.camDepthFirst;
        let depthData = [];

        setTool(op.tool, op.rate, process.camFastFeedZ);
        setSpindle(op.spindle);
        setTolerance(this.tolerance);

        printPoint = newPoint(bounds.min.x,bounds.min.y,zmax);

        for (let slice of sliceOut) {
            // ignore debug slices
            if (!slice.camLines) {
                continue;
            }
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

class OpLathe extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices } = state;
        let filter = createFilter(op);

        this.topo = await CAM.Topo4({
            op,
            state,
            onupdate: (pct, msg) => {
                progress(pct, msg);
            },
            ondone: (slices) => {
                slices = filter(slices);
                this.slices = slices;
                addSlices(slices, false);
            }
        });
    }

    prepare(ops, progress) {
        let { op, state, slices, topo } = this;
        let { settings } = state;

        let { setTool, setSpindle, setPrintPoint } = ops;
        let { camOut, newLayer, printPoint } = ops;
        let { zmax } = ops;

        let toolDiam = new CAM.Tool(settings, op.tool).fluteDiameter();
        let stepover = toolDiam * op.step * 2;
        let rez = topo.resolution;

        setTool(op.tool, op.rate, op.plunge);
        setSpindle(op.spindle);

        // start top center, X = 0, Y = 0 closest to 4th axis chuck
        printPoint = newPoint(0, 0, zmax);

        for (let slice of slices) {
            // ignore debug slices
            if (!slice.camLines) {
                continue;
            }

            let last;
            for (let path of slice.camLines) {
                let latent;
                path.forEachPoint((point, pidx) => {
                    if (last) {
                        const dz = Math.abs(last.z - point.z);
                        if (dz < rez) {
                            // latent point should still be included in
                            // preview b/c arcs would look like straight lines
                            latent = point.clone();
                            return;
                        }
                        if (latent) {
                            camOut(latent, true, stepover);
                            latent = undefined;
                        }
                    }
                    camOut(last = point.clone(), pidx > 0, stepover);
                }, false);
                if (latent) {
                    camOut(latent, true, stepover);
                }
            }

            newLayer();
        }

        // move to safe height and reset A axis
        let last = ops.lastPoint();
        let amax = (Math.round(last.a / 360) * 360).round(2);
        // camOut(last = last.clone().setZ(zmax), 0);
        // camOut(last = last.clone().setA(amax), 0);
        newLayer();
        ops.addGCode([`G0 Z${zmax.round(2)}`,`G0 A${amax}`,"G92 A0"]);

        setPrintPoint(last);
    }
}

class OpTrace extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { tool, rate, down, plunge, offset, offover, thru } = op;
        let { ov_conv } = op;
        let { settings, widget, addSlices, zThru, tabs, workarea } = state;
        let { updateToolDiams, cutTabs, cutPolys, healPolys, color } = state;
        let { process, stock } = settings;
        let { camStockClipTo } = process;
        if (state.isIndexed) {
            throw 'trace op not supported with indexed stock';
        }
        // generate tracing offsets from chosen features
        let zTop = workarea.top_z;
        let zBottom = workarea.bottom_z;
        let sliceOut = this.sliceOut = [];
        let areas = op.areas[widget.id] || [];
        let camTool = new CAM.Tool(settings, tool);
        let toolDiam = camTool.fluteDiameter();
        let toolOver = toolDiam * op.step;
        let traceOffset = camTool.traceOffset()
        let cutdir = ov_conv;
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
        if (false) newSliceOut(0).output()
            .setLayer("polys", {line: 0xaaaa00}, false)
            .addPolys(polys);
        function newSliceOut(z) {
            let slice = newSlice(z);
            addSlices(slice);
            sliceOut.push(slice);
            return slice;
        }
        function minZ(z) {
            return zBottom ? Math.max(zBottom, z - thru) : z - thru;
        }
        function followZ(poly) {
            if (op.dogbone) {
                CAM.addDogbones(poly, toolDiam / 5, !op.revbone);
            }
            let z = poly.getZ();
            let slice = newSliceOut(z);
            slice.camTrace = { tool, rate, plunge };
            if (tabs) {
                slice.camLines = cutTabs(tabs, [poly], z);
            } else {
                slice.camLines = [ poly ];
            }
            if (camStockClipTo && stockRect) {
                slice.camLines = cutPolys([stockRect], slice.camLines, z, true);
            }
            slice.output()
                .setLayer("trace follow", {line: color}, false)
                .addPolys(slice.camLines)
        }
        function clearZ(polys, z, down) {
            let zs = down ? base.util.lerp(zTop, z, down) : [ z ];
            let nested = POLY.nest(polys);
            for (let poly of nested) {
                for (let z of zs) {
                    let slice = newSliceOut(z);
                    slice.camTrace = { tool, rate, plunge };
                    POLY.offset([ poly ], [ -toolDiam/2, -toolOver ], {
                        count:999, outs: slice.camLines = [], flat:true, z,
                        minArea: 0
                    });
                    if (tabs) {
                        slice.camLines = cutTabs(tabs, POLY.flatten(slice.camLines, null, true), z);
                    } else {
                        slice.camLines = POLY.flatten(slice.camLines, null, true);
                    }
                    POLY.setWinding(slice.camLines, cutdir, false);
                    slice.output()
                        .setLayer("trace clear", {line: color}, false)
                        .addPolys(slice.camLines)
                }
            }
        }
        function similar(v1, v2, epsilon = 0.01) {
            return Math.abs(v1-v2) <= epsilon;
        }
        function centerPoly(p1, p2) {
            // follow poly with most points
            if (p2.length > p1.length) {
                let t = p1;
                p1 = p2;
                p2 = t;
            }
            let np = newPolygon().setOpen(true);
            for (let p of p1.points) {
                let q = p2.findClosestPointTo(p);
                np.push(p.midPointTo3D(q.point));
            }
            return np;
        }
        function centerPolys(polys) {
            // select open polys and sort by length
            let ptst = polys.filter(p => p.isOpen()).sort((a,b) => b.perimeter() - a.perimeter());
            if (ptst.length < 2) {
                return polys;
            }
            let pt = newPoint(0,0,0);
            // ensure polys are ordered with start point closest to 0,0
            ptst.forEach(p => {
                if (p.last().distTo2D(pt) < p.first().distTo2D(pt)) {
                    p.reverse();
                }
            });
            let pout = polys.filter(p => p.isClosed());
            outer: for (let i=0,l=ptst.length; i<l-1; i++) {
                let p0 = ptst[i];
                if (!p0) continue;
                for (let j=i+1; j<l; j++) {
                    let p1 = ptst[j];
                    if (!p1) continue;
                    if (
                        similar(p0.perimeter(), p1.perimeter(), 0.1) &&
                        similar(p0.first().distTo2D(p1.first()), toolDiam) &&
                        similar(p0.last().distTo2D(p1.last()), toolDiam)
                    ) {
                        pout.push(centerPoly(p0, p1));
                        ptst[i] = undefined;
                        ptst[j] = undefined;
                        continue outer;
                    }
                }
            }
            pout.appendAll(ptst.filter(p => p));
            return pout;
        }
        // connect selected segments if open and touching
        polys = healPolys(polys);
        // find center line for open polys spaced by tool diameter
        polys = centerPolys(polys);
        switch (op.mode) {
            case "follow":
                let routed = [];
                poly2polyEmit(polys, newPoint(0,0,0), (poly, index, count, spoint) => {
                    routed.push(poly);
                });
                let output = [];
                for (let poly of POLY.nest(routed)) {
                    let offdist = offset !== 'none' ? offover : 0;
                    if (!offdist)
                    switch (offset) {
                        case "outside": offdist = traceOffset; break;
                        case "inside": offdist = -traceOffset; break;
                    } else if (offset === "inside") {
                        offdist = -offdist;
                    }
                    if (offdist) {
                        let pnew = POLY.offset([poly], offdist, { minArea: 0, open: true });
                        if (pnew) {
                            poly = POLY.setZ(pnew, poly.getZ());
                        } else {
                            continue;
                        }
                    } else {
                        poly = [ poly ];
                    }
                    for (let pi of POLY.flatten(poly, [], true))
                    if (down) {
                        let zto = minZ(pi.getZ());
                        if (zThru && similar(zto,0)) {
                            zto -= zThru;
                        }
                        for (let z of base.util.lerp(zTop, zto, down)) {
                            output.push(pi.clone().setZ(z));
                        }
                    } else {
                        if (thru) {
                            pi.setZ(pi.getZ() - thru);
                        }
                        output.push(pi);
                    }
                    if (!down && op.merge) {
                        let nest = POLY.nest(output);
                        let union = POLY.union(nest, 0, true);
                        output = POLY.flatten(union, [], true);
                    }
                }
                for (let poly of output) {
                    followZ(poly);
                }
                break;
            case "clear":
                const zbo = widget.track.top - widget.track.box.d;
                let zmap = {};
                for (let poly of polys) {
                    let z = minZ(poly.getZ());
                    if (offover) {
                        let pnew = POLY.offset([poly], -offover, { minArea: 0, open: true });
                        if (pnew) {
                            poly = POLY.setZ(pnew, poly.getZ());
                        } else {
                            continue;
                        }
                    } else {
                        poly = [ poly ];
                    }
                    (zmap[z] = zmap[z] || []).appendAll(poly);
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

class OpPocket extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        const pocket = this;
        const debug = false;
        let { op, state } = this;
        let { tool, rate, down, plunge, expand, contour, smooth, tolerance } = op;
        let { ov_botz, ov_conv } = op;
        let { settings, widget, addSlices, zBottom, zThru, tabs, color } = state;
        let { updateToolDiams, cutTabs, healPolys, shadowAt, workarea } = state;
        let { process } = settings;
        zBottom = ov_botz ? workarea.bottom_stock + ov_botz : zBottom;
        // generate tracing offsets from chosen features
        let sliceOut;
        let pockets = this.pockets = [];
        let camTool = new CAM.Tool(settings, tool);
        let toolDiam = camTool.fluteDiameter();
        let toolOver = toolDiam * op.step;
        let cutdir = ov_conv;
        let engrave = contour && op.engrave;
        let zTop = workarea.top_z;
        if (contour) {
            down = 0;
            this.topo = await CAM.Topo({
                // onupdate: (update, msg) => {
                onupdate: (index, total, msg) => {
                    progress((index / total) * 0.9, msg);
                },
                ondone: (slices) => {
                    // console.log({ contour: slices });
                },
                contour: {
                    tool,
                    tolerance,
                    inside: true,
                    axis: "-"
                },
                state: state
            });
        }
        updateToolDiams(toolDiam);
        if (tabs) {
            tabs.forEach(tab => {
                tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
            });
        }
        function newPocket() {
            pockets.push(sliceOut = []);
        }
        function newSliceOut(z) {
            let slice = newSlice(z);
            sliceOut.push(slice);
            return slice;
        }
        function clearZ(polys, z, down) {
            if (down) {
                // adjust step down to a value <= down that
                // ends on the lowest z specified
                let diff = zTop - z;
                down = diff / Math.ceil(diff / down);
            }
            let zs = down ? base.util.lerp(zTop, z, down) : [ z ];
            if (engrave) {
                toolDiam = toolOver;
            }
            if (contour) {
                expand = engrave ? 0 : expand;
            } else if (expand) {
                polys = POLY.offset(polys, expand);
            }
            let zpro = 0, zinc = 1 / (polys.length * zs.length);
            for (let poly of polys) {
                newPocket();
                for (let z of zs) {
                    let clip = [], shadow;
                    if (contour) {
                        if (smooth) {
                            clip = POLY.offset(POLY.offset([ poly ], smooth), -smooth);
                        } else {
                            clip = [ poly ];
                        }
                    } else {
                        shadow = shadowAt(z);
                        if (smooth) {
                            shadow = POLY.setZ(POLY.offset(POLY.offset(shadow, smooth), -smooth), z);
                        }
                        POLY.subtract([ poly ], shadow, clip, undefined, undefined, 0);
                        if (op.outline) {
                            POLY.clearInner(clip);
                        }
                    }
                    if (clip.length === 0) {
                        continue;
                    }
                    let slice = newSliceOut(z);
                    let count = engrave ? 1 : 999;
                    slice.camTrace = { tool, rate, plunge };
                    if (toolDiam) {
                        const offs = contour ?
                            [ expand || (-0.02), -toolOver ] :
                            [ -toolDiam / 2, -toolOver ];
                        POLY.offset(clip, offs, {
                            count, outs: slice.camLines = [], flat:true, z, minArea: 0
                        });
                    } else {
                        // when engraving with a 0 width tip
                        slice.camLines = clip;
                    }
                    if (tabs) {
                        slice.camLines = cutTabs(tabs, POLY.flatten(slice.camLines, null, true), z);
                    } else {
                        slice.camLines = POLY.flatten(slice.camLines, null, true);
                    }
                    POLY.setWinding(slice.camLines, cutdir, false);
                    if (contour) {
                        slice.camLines = pocket.conform(slice.camLines, op.refine, engrave, pct => {
                            progress(0.9 + (zpro + zinc * pct) * 0.1, "conform");
                        });
                    }
                    slice.output()
                        .setLayer("pocket", {line: color}, false)
                        .addPolys(slice.camLines)
                    if (debug && shadow) slice.output()
                        .setLayer("pocket shadow", {line: 0xff8811}, false)
                        .addPolys(shadow)
                    if (!contour) {
                        progress(zpro, "pocket");
                    }
                    zpro += zinc;
                    addSlices(slice);
                }
            }
        }
        let surfaces = op.surfaces[widget.id] || [];
        let vert = widget.getGeoVertices({ unroll: true, translate: true }).map(v => v.round(4));
        // let vert = widget.getVertices().array.map(v => v.round(4));
        let outline = [];
        let faces = CAM.surface_find(widget, surfaces, 0.1);
        let zmin = Infinity;
        let j=0, k=faces.length;
        for (let face of faces) {
            let i = face * 9;
            outline.push(newPolygon()
                .add(vert[i++], vert[i++], zmin = Math.min(zmin, vert[i++]))
                .add(vert[i++], vert[i++], zmin = Math.min(zmin, vert[i++]))
                .add(vert[i++], vert[i++], zmin = Math.min(zmin, vert[i++]))
            );
        }
        zmin = Math.max(zBottom, zmin);
        outline = POLY.union(outline, 0.0001, true);
        outline = POLY.setWinding(outline, cutdir, false);
        outline = healPolys(outline);
        if (smooth) {
            outline = POLY.offset(POLY.offset(outline, smooth), -smooth);
        }
        if (outline.length) {
            // option to skip interior features (holes, pillars)
            if (op.outline) {
                POLY.clearInner(outline);
            }
            if (debug) newSliceOut(zmin).output()
                .setLayer("pocket area", {line: 0x1188ff}, false)
                .addPolys(outline)
            clearZ(outline, zmin + 0.0001, down);
            progress(1, "pocket");
        }
    }

    // mold cam output lines to the surface of the topo offset by tool geometry
    conform(camLines, refine, engrave, progress) {
        const topo = this.topo;
        // re-segment polygon to a higher resolution
        const hirez = camLines.map(p => p.segment(topo.tolerance * 2));
        // walk points and offset from surface taking into account tool geometry
        let steps = hirez.length;
        let iter = 0;
        for (let poly of hirez) {
            for (let point of poly.points) {
                point.z = engrave ? topo.zAtXY(point.x, point.y) : topo.toolAtXY(point.x, point.y);
            }
            progress((iter++ / steps) * 0.8);
        }
        steps = steps * refine;
        iter = 0;
        // walk points noting z deltas and smoothing z sawtooth patterns
        for (let j=0; j<refine; j++) {
            for (let poly of hirez) {
                const points = poly.points, length = points.length;
                let sn = []; // segment normals
                for (let i=0; i<length; i++) {
                    let p1 = points[i];
                    let p2 = points[(i + 1) % length];
                    sn.push(segmentNormal(p1, p2));
                }
                let vn = []; // vertex normals
                for (let i=0; i<length; i++) {
                    let n1 = sn[(i + length - 1) % length];
                    let n2 = sn[i];
                    let vi = vertexNormal(n1, n2, 1);
                    vn.push(vi);
                    let vl = Math.abs(1 - vi.vl).round(2);
                    // vl should be close to zero on smooth / continuous curves
                    // factoring out hard turns, we smooth the z using the weighted
                    // z values of the points before and after the current point
                    if (vl === 0) {
                        let p0 = points[(i + length - 1) % length];
                        let p1 = points[i];
                        let p2 = points[(i + 1) % length];
                        p1.z = (p0.z + p2.z + p1.z) / 3;
                    }
                }

                progress((iter++ / steps) * 0.2 + 0.8);
            }
        }
        // return hirez.map(p => p.midpoints(topo.tolerance * 8));
        return hirez;
    }

    prepare(ops, progress) {
        let { op, state, pockets } = this;
        let { setTool, setSpindle, setTolerance, sliceOutput, getPrintPoint } = ops;
        let { process } = state.settings;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);

        if (this.topo) {
            setTolerance(this.topo.tolerance);
        }

        // eliminate empty pockets
        pockets = pockets.filter(p => p.length);

        // pockets is an [ array of an [ array of slices ] ]
        // each top level array is a pocket containing a [ z layer array of slices ]
        // follow each pocket to the next closest one from previous exit
        for (;;) {
            let printPoint = getPrintPoint();
            let min = {
                dist: Infinity,
                pocket: undefined
            };
            for (let pocket of pockets.filter(p => !p.used)) {
                let poly = pocket[0].camLines.slice().sort((a,b) => b.area() - a.area())[0];
                if (!poly) continue;
                let find = poly.findClosestPointTo(printPoint);
                if (find.distance < min.dist) {
                    min.pocket = pocket;
                    min.dist = find.distance;
                }
            }
            if (min.pocket) {
                min.pocket.used = true;
                sliceOutput(min.pocket, {
                    cutdir: op.ov_conv,
                    depthFirst: process.camDepthFirst && !state.isIndexed,
                    easeDown: op.down && process.easeDown ? op.down : 0,
                    progress: (n,m) => progress(n/m, "pocket")
                });
            } else {
                break;
            }
        }
    }
}

class OpDrill extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, addSlices, tslices, updateToolDiams } = state;
        let { zBottom, zThru, thruHoles, color } = state;

        let drills = [],
            drillTool = new CAM.Tool(settings, op.tool),
            drillToolDiam = drillTool.fluteDiameter(),
            centerDiff = drillToolDiam * 0.1,
            area = (drillToolDiam/2) * (drillToolDiam/2) * Math.PI,
            areaDelta = op.mark ? Infinity : area * 0.05,
            sliceOut = this.sliceOut = [];

        updateToolDiams(drillToolDiam);

        // for each slice, look for polygons with 98.5% circularity whose
        // area is within the tolerance of a circle matching the tool diameter
        for (let slice of tslices) {
            if (slice.z < zBottom) {
                continue;
            }
            let inner = slice.topPolyInners([]);
            for (let poly of inner) {
                if (poly.circularity() >= 0.985 && Math.abs(poly.area() - area) <= areaDelta) {
                    let center = poly.calcCircleCenter(),
                        merged = false,
                        closest = Infinity,
                        dist;
                    // TODO reject if inside camShellPolys (means there is material above)
                    if (center.isInPolygon(slice.shadow)) {
                        continue;
                    }
                    for (let drill of drills) {
                        if (merged) {
                            continue;
                        }
                        if ((dist = drill.last().distTo2D(center)) <= centerDiff) {
                            merged = true;
                            drill.push(center);
                        }
                        closest = Math.min(closest,dist);
                    }
                    if (!merged) {
                        drills.push(newPolygon().append(center));
                    }
                } else if (op.arcs) {
                    // find arcs
                    let arcs = poly.findArcCenters();
                    for (let arc of arcs) {
                        drills.push(newPolygon().add(arc.x,arc.y,arc.z||0));
                    }
                }
            }
        }

        // drill points to use center (average of all points) of the polygon
        drills.forEach(function(drill) {
            let center = drill.center(true),
                slice = newSlice(0,null);
            if (op.mark) {
                // replace points with single mark
                let points = drill.points;
                points = [
                    points[0],
                    points[0].clone().sub({x:0, y:0, z:op.down})
                ];
                drill.points = points;
            }
            drill.points.forEach(function(point) {
                point.x = center.x;
                point.y = center.y;
            });
            // for thru holes, follow z thru when set
            if (zThru && center.isInPolygon(thruHoles)) {
                drill.points.push(drill.points.last().sub({x:0,y:0,z:zThru}));
            }
            slice.camLines = [ drill ];
            slice.output()
                .setLayer("drill", {face: color, line: color})
                .addPolys(drill);
            addSlices(slice);
            sliceOut.push(slice);
        });
    }

    prepare(ops, progress) {
        let { op, state } = this;
        let { settings, widget, addSlices, updateToolDiams } = state;
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

    async slice(progress) {
        let { op, state } = this;
        let { settings, widget, bounds, addSlices, zMax, zThru, color } = state;
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
            mz = op.thru || zThru || 0,
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
                for (let z of base.util.lerp(z1, z2, op.down)) {
                    let slice = newSlice(z);
                    addSlices(slice);
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
                    slice.camTrace = { tool: tool.getID(), rate: op.feed, plunge: op.rate };
                    slice.camLines = [ poly ];
                    slice.output()
                        .setLayer("register", {line: color}, false)
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
                .setLayer("register", {face: color, line: color})
                .addPolys(polys);
            addSlices(slice);
            sliceOut.push(slice);
        }
    }

    prepare(ops, progress) {
        let { op, state } = this;
        let { settings, widget, addSlices, updateToolDiams } = state;
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

    async slice(progress) {
        let { widget, addSlices } = this.state;
        let slicer = new kiri.cam_slicer(widget);
        let xrayind = Object.keys(slicer.zLine)
            .map(v => parseFloat(v).round(5))
            .sort((a,b) => a-b);
        let xrayopt = { each: data => {
            let slice = newSlice(data.z);
            slice.addTops(data.tops);
            // data.tops.forEach(top => slice.addTop(top));
            slice.lines = data.lines;
            slice.xray();
            addSlices(slice);
        }, over: false, flatoff: 0, edges: true, openok: true };
        await slicer.slice(xrayind, xrayopt);
        // xrayopt.over = true;
        // slicer.slice(xrayind, xrayopt);
    }
}

/**
 * Computes the Part "shadow" and attaches relevant data to the "state" object
 *
 * The part shadow consists of top-cown layers at which the polygon shadow changes
 * shape. For curved or sloped surfaces, this is approximated and paths that clip
 * to it should use the next lower layer from current Z to ensure no part collisions.
 *
 * The shadow at each layer is computed by top-down unioning the part outline with
 * the shadow from the layer above.
 *
 * This operation is injected at the start of the operation chain before processing.
 */
class OpShadow extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let state = this.state;
        let { ops, slicer, widget, unsafe, addSlices, shadowAt } = state;

        let realOps = ops.map(rec => rec.op).filter(op => op);
        let trueShadow = state.settings.process.camTrueShadow === true;

        let minStepDown = realOps
            .map(op => (op.down || 3) / (trueShadow ? 1 : 3))
            .reduce((a,v) => Math.min(a, v, 1));

        let tslices = [];
        let tshadow = [];
        let tzindex = slicer.interval(minStepDown, {
            fit: true, off: 0.01, down: true, flats: true
        });
        let skipTerrain = unsafe;

        if (skipTerrain) {
            console.log("skipping terrain generation");
            tzindex = [ tzindex.pop() ];
        }

        let lsz; // only shadow up to bottom of last shadow for progressive union
        let cnt = 0;
        let tot = 0;

        // terrain is the "shadow stack" where index 0 = top of part
        // thus array.length -1 = bottom of part
        let terrain = await slicer.slice(tzindex, { each: data => {
            let shadow = trueShadow ? shadowAt(data.z, lsz) : [];
            tshadow = POLY.union(tshadow.slice().appendAll(data.tops).appendAll(shadow), 0.01, true);
            tslices.push(data.slice);
            // capture current shadow for this slice
            data.slice.shadow = tshadow;
            if (false) {
                const slice = data.slice;
                addSlices(slice);
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
            progress(0.5 + 0.5 * (++cnt / tot));
        }, progress: (index, total) => {
            tot = total;
            progress((index / total) * 0.5);
        } });

        if (terrain.length === 0) {
            throw `invalid widget shadow`;
        }

        // TODO: deprecate use of separate shadow vars in state
        state.center = tshadow[0].bounds.center();
        state.tshadow = tshadow;    // true shadow (base of part)
        state.terrain = terrain;    // stack of shadow slices stored in tops
        state.tslices = tslices;    // raw slicer 'data' layer outputs
        state.skipTerrain = skipTerrain;

        // TODO: refactor ops to use a unified shadow object
        state.shadow = {
            base: tshadow,          // computed shadow union at base of part
            stack: terrain,         // stack of shadow slices
            slices: tslices,        // raw slicer 'data' objects
            skip: skipTerrain
        };

        // identify through holes which are inner/child polygons
        // on the bottom-most layer of the shadow stack (tshadow, index == 0)
        state.thruHoles = tshadow.map(p => p.inner || []).flat();
    }
}

// union triangles > z (opt cap < ztop) into polygon(s)
CAM.shadowAt = function(widget, z, ztop) {
    const geo = widget.cache.geo;
    const length = geo.length;
    // cache faces with normals up
    if (!widget.cache.shadow) {
        const faces = [];
        for (let i=0, ip=0; i<length; i += 3) {
            const a = new THREE.Vector3(geo[ip++], geo[ip++], geo[ip++]);
            const b = new THREE.Vector3(geo[ip++], geo[ip++], geo[ip++]);
            const c = new THREE.Vector3(geo[ip++], geo[ip++], geo[ip++]);
            const n = THREE.computeFaceNormal(a,b,c);
            if (n.z > 0.001) {
                faces.push(a,b,c);
                // faces.push(newPoint(...a), newPoint(...b), newPoint(...c));
            }
        }
        widget.cache.shadow = faces;
    }
    const found = [];
    const faces = widget.cache.shadow;
    const { checkOverUnderOn, intersectPoints } = self.kiri.cam_slicer;
    for (let i=0; i<faces.length; ) {
        const a = faces[i++];
        const b = faces[i++];
        const c = faces[i++];
        let where = undefined;
        if (ztop && a.z > ztop && b.z > ztop && c.z > ztop) {
            // skip faces over top threshold
            continue;
        }
        if (a.z < z && b.z < z && c.z < z) {
            // skip faces under threshold
            continue;
        } else if (a.z > z && b.z > z && c.z > z) {
            found.push([a,b,c]);
        } else {
            // check faces straddling threshold
            const where = { under: [], over: [], on: [] };
            checkOverUnderOn(newPoint(a.x, a.y, a.z), z, where);
            checkOverUnderOn(newPoint(b.x, b.y, b.z), z, where);
            checkOverUnderOn(newPoint(c.x, c.y, c.z), z, where);
            if (where.on.length === 0 && (where.over.length === 2 || where.under.length === 2)) {
                // compute two point intersections and construct line
                let line = intersectPoints(where.over, where.under, z);
                if (line.length === 2) {
                    if (where.over.length === 2) {
                        found.push([where.over[1], line[0], line[1]]);
                        found.push([where.over[0], where.over[1], line[0]]);
                    } else {
                        found.push([where.over[0], line[0], line[1]]);
                    }
                } else {
                    console.log({msg: "invalid ips", line: line, where: where});
                }
            }
        }
    }

    // const lines = {};
    // function addline(p1, p2) {
    //     let key = p1.key < p2.key ? p1.key + ',' + p2.key : p2.key + ',' + p1.key;
    //     let rec = lines[key];
    //     if (rec) {
    //         rec.count++;
    //     } else {
    //         lines[key] = { p1, p2, count: 1 };
    //     }
    // }
    // for (let face of found) {
    //     addline(face[0], face[1]);
    //     addline(face[1], face[2]);
    //     addline(face[2], face[0]);
    // }
    // const singles = Object.entries(lines).filter(a => a[1].count === 1).map(a => a[1]);
    // const loops = POLY.nest(sliceConnect(singles, z));

    let polys = found.map(a => {
        return newPolygon()
            .add(a[0].x,a[0].y,a[0].z)
            .add(a[1].x,a[1].y,a[1].z)
            .add(a[2].x,a[2].y,a[2].z);
    });
    polys = POLY.union(polys, 0.001, true);
    // console.log({z, loops, polys});
    // return loops;
    return polys;
};

CAM.OPS = CamOp.MAP = {
    "xray":      OpXRay,
    "shadow":    OpShadow,
    "level":     OpLevel,
    "rough":     OpRough,
    "outline":   OpOutline,
    "contour":   OpContour,
    "pocket":    OpPocket,
    "lathe":     OpLathe,
    "trace":     OpTrace,
    "drill":     OpDrill,
    "register":  OpRegister,
    "laser on":  OpLaserOn,
    "laser off": OpLaserOff,
    "gcode":     OpGCode,
    "index":     OpIndex,
    "flip":      CamOp
};

});
