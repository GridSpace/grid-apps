/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.point
// dep: geo.polygons
// dep: kiri.slice
// dep: kiri-mode.cam.driver
// use: kiri-mode.cam.slicer
// use: kiri-mode.cam.slicer2
// use: kiri-mode.cam.ops
gapp.register("kiri-mode.cam.slice", (root, exports) => {

const { base, kiri } = root;
const { util } = base;
const { driver, newSlice, setSliceTracker } = kiri;
const { polygons, newPoint, newPolygon } = base;
const { CAM } = driver;
const { OPS } = CAM;

const PRO = CAM.process;
const POLY = polygons;

/**
 * DRIVER SLICE CONTRACT
 *
 * @param {Object} settings
 * @param {Widget} widget
 * @param {Function} output
 */
CAM.slice = async function(settings, widget, onupdate, ondone) {
    let proc = settings.process,
        stock = settings.stock || {},
        isIndexed = proc.camStockIndexed,
        camOps = widget.camops = [],
        sliceAll = widget.slices = [],
        bounds = widget.getBoundingBox(),
        track = widget.track,
        { camZTop, camZBottom, camZThru } = proc,
        // widget top z as defined by setTopz()
        wztop = track.top,
        // distance between top of part and top of stock
        ztOff = isIndexed ? 0 : (stock.z - wztop),
        // distance between bottom of part and bottom of stock
        zbOff = isIndexed ? 0 : (wztop - track.box.d),
        // defined z bottom offset by distance to stock bottom
        // keeps the z bottom relative to the part when z align changes
        zBottom = isIndexed ? camZBottom : camZBottom - zbOff,
        // greater of widget bottom and z bottom
        zMin = isIndexed ? bounds.min.z : Math.max(bounds.min.z, zBottom),
        zMax = bounds.max.z,
        zThru = camZThru,
        zTop = zMax + ztOff,
        minToolDiam = Infinity,
        maxToolDiam = -Infinity,
        dark = settings.controller.dark ? true : false,
        color = dark ? 0xbbbbbb : 0,
        tabs = widget.anno.tab,
        unsafe = proc.camExpertFast,
        units = settings.controller.units === 'in' ? 25.4 : 1,
        axisRotation,
        axisIndex,
        // new work area tracking
        part_size = bounds.dim,
        bottom_gap = zbOff,
        bottom_part = 0,
        bottom_stock = -bottom_gap,
        bottom_thru = zThru,
        bottom_z = Math.max(
            (camZBottom ? bottom_stock + camZBottom : bottom_part) - bottom_thru,
            (camZBottom ? bottom_stock + camZBottom : bottom_stock - bottom_thru)
        ),
        bottom_cut = Math.max(bottom_z, -zThru),
        top_stock = zTop,
        top_part = zMax,
        top_gap = ztOff,
        top_z = camZTop ? bottom_stock + camZTop : top_stock,
        workarea = util.round({
            top_stock,
            top_part,
            top_gap,
            top_z,
            bottom_stock,
            bottom_part,
            bottom_gap,
            bottom_z,
            bottom_cut
        }, 3);

    // console.table({ workarea });
    // console.table({ part_size });
    // console.table({ stock });

    if (tabs) {
        // make tab polygons
        tabs.forEach(tab => {
            let zero = newPoint(0,0,0),
                point = newPoint(tab.pos.x, tab.pos.y, tab.pos.z),
                poly = newPolygon().centerRectangle(zero, tab.dim.x, tab.dim.y),
                [ rx, ry, rz, rw ] = tab.rot,
                m4 = new THREE.Matrix4().makeRotationFromQuaternion(
                    new THREE.Quaternion(rx, ry, rz, rw)
                );
            poly.points = poly.points
                .map(p => new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(m4))
                .map(v => newPoint(v.x, v.y, v.z));
            poly.move(point);
            tab.poly = poly;
            // tslice.output().setLayer("tabs", 0xff0000).addPoly(poly);
            // sliceAll.push(tslice);
        });
    }

    function error(msg) {
        ondone(msg);
    }

    if (unsafe) {
        console.log("disabling overhang safeties");
    }

    if (!proc.ops || proc.ops.length === 0) {
        return error('no processes specified');
    }

    if (stock.x && stock.y && stock.z) {
        if (stock.x + 0.00001 < bounds.max.x - bounds.min.x) {
            return error('stock X too small for part. resize stock or use offset stock');
        }

        if (stock.y + 0.00001 < bounds.max.y - bounds.min.y) {
            return error('stock Y too small for part. resize stock or use offset stock');
        }

        if (stock.z + 0.00001 < bounds.max.z - bounds.min.z) {
            return error('stock Z too small for part. resize stock or use offset stock');
        }
    }

    if (zMin >= bounds.max.z) {
        return error(`invalid z bottom ${(zMin/units).round(3)} >= bounds z max ${(zMax/units).round(3)}`);
    }

    let mark = Date.now();
    let slicer = new kiri.cam_slicer(widget);

    function updateToolDiams(toolDiam) {
        minToolDiam = Math.min(minToolDiam, toolDiam);
        maxToolDiam = Math.max(maxToolDiam, toolDiam);
    }

    let shadows = {};

    function shadowAt(z) {
        let cached = shadows[z];
        if (cached) {
            return cached;
        }
        // find closest shadow above and use to speed up delta shadow gen
        let minZabove;
        let zover = Object.keys(shadows).map(v => parseFloat(v)).filter(v => v > z);
        for (let zkey of zover) {
            if (minZabove && zkey < minZabove) {
                minZabove = zkey;
            } else {
                minZabove = zkey;
            }
        }
        let shadow = CAM.shadowAt(widget, z, minZabove);
        if (minZabove) {
            // const merge = shadow.length;
            // const plus = shadows[minZabove].length;
            // const mark = Date.now();
            shadow = POLY.union([...shadow, ...shadows[minZabove]], 0.001, true);
            // console.log({merge, plus, equals: shadow.length, time: Date.now() - mark});
        }
        return shadows[z] = POLY.setZ(shadow, z);
    }

    function setAxisIndex(degrees = 0, absolute = true) {
        axisIndex = absolute ? degrees : axisIndex + degrees;
        axisRotation = (Math.PI / 180) * axisIndex;
        widget.setAxisIndex(isIndexed ? -axisIndex : 0);
        return isIndexed ? -axisIndex : 0;
    }

    function addPolyIndexing(poly, a) {
        if (!poly) {
            return;
        }
        if (Array.isArray(poly)) {
            for (let p of poly) {
                addPolyIndexing(p, a);
            }
            return;
        }
        for (let point of poly.points) {
            point.a = a;
        }
        addPolyIndexing(poly.inner, a);
    }

    function addSlices(slices, addIndexing = isIndexed) {
        if (!Array.isArray(slices)) {
            slices = [ slices ];
        }
        sliceAll.appendAll(slices);
        if (addIndexing && axisIndex !== undefined) {
            // update slice cam lines to add axis indexing
            for (let slice of slices.filter(s => s.camLines)) {
                addPolyIndexing(slice.camLines, -axisIndex);
            }
        }
    }

    let state = {
        settings,
        widget,
        bounds,
        tabs,
        cutTabs,
        cutPolys,
        healPolys,
        shadowAt,
        slicer,
        addSlices,
        isIndexed,
        setAxisIndex,
        updateToolDiams,
        zBottom,
        zThru,
        ztOff,
        zMax,
        zTop,
        unsafe,
        color,
        dark,
        // workarea
    };

    let opList = [
        // silently preface op list with OpShadow
        new CAM.OPS.shadow(state, { type: "shadow", silent: true })
    ];

    if (false) {
        opList.push(new CAM.OPS.xray(state, { type: "xray" }));
    }

    let opSum = 0;
    let opTot = opList.length ? opList.map(op => op.weight()).reduce((a,v) => a + v) : 0;

    // determing # of steps and step weighting for progress bar
    for (let op of proc.ops.filter(op => !op.disabled)) {
        if (op.type === '|') {
            break;
        }
        let opfn = OPS[op.type];
        if (opfn) {
            let opin = new opfn(state, op);
            opList.push(opin);
            opTot += opin.weight();
        }
    }

    // give ops access to entire sequence
    state.ops = opList;

    // call slice() function on all ops in order
    let tracker = setSliceTracker({ rotation: 0 });
    let workarea_orig = structuredClone(workarea);
    setAxisIndex();
    for (let op of opList) {
        let weight = op.weight();
        // apply operation override vars
        let workover = structuredClone(workarea_orig);
        let valz = op.op;
        if (valz.ov_topz) workover.top_z = bottom_stock + valz.ov_topz;
        if (valz.ov_botz) {
            workover.bottom_z = bottom_stock + valz.ov_botz;
            workover.bottom_cut = Math.max(workover.bottom_z, -zThru);
        }
        state.workarea = workover;
        await op.slice((progress, message) => {
            onupdate((opSum + (progress * weight)) / opTot, message || op.type());
        });
        tracker.rotation = isIndexed ? axisRotation : 0;
        // setup new state when indexing the workspace
        if (op.op.type === "index") {
            widget.topo = undefined;
            // let points = base.verticesToPoints();
            state.slicer = new kiri.cam_slicer(widget);
            shadows = {};
            await new CAM.OPS.shadow(state, { type: "shadow", silent: true }).slice(progress => {
                // console.log('reshadow', progress.round(3));
            });
        }
        camOps.push(op);
        opSum += weight;
    }
    setSliceTracker();

    // reindex
    sliceAll.forEach((slice, index) => slice.index = index);

    // used in printSetup()
    // used in CAM.prepare.getZClearPath()
    // add tabs to terrain tops so moves avoid them
    if (tabs) {
        state.terrain.forEach(slab => {
            tabs.forEach(tab => {
                if (tab.pos.z + tab.dim.z/2 >= slab.z) {
                    let all = [...slab.tops, tab.poly];
                    slab.tops = POLY.union(all, 0, true);
                    // slab.slice.output()
                    //     .setLayer("debug-tabs", {line: 0x880088, thin: true })
                    //     .addPolys(POLY.setZ(slab.tops.clone(true), slab.z), { thin: true });
                }
            });
        });
    }

    // add shadow perimeter to terrain to catch outside moves off part
    let tabpoly = tabs ? tabs.map(tab => tab.poly) : [];
    let allpoly = POLY.union([...state.shadow.base, ...tabpoly], 0, true);
    let shadowOff = maxToolDiam < 0 ? allpoly :
        POLY.offset(allpoly, [minToolDiam/2,maxToolDiam/2], { count: 2, flat: true, minArea: 0 });
    state.terrain.forEach(level => level.tops.appendAll(shadowOff));

    widget.terrain = state.skipTerrain ? null : state.terrain;
    widget.minToolDiam = minToolDiam;
    widget.maxToolDiam = maxToolDiam;

    ondone();
};

CAM.addDogbones = function(poly, dist, reverse) {
    if (Array.isArray(poly)) {
        return poly.forEach(p => CAM.addDogbones(p, dist));
    }
    let open = poly.open;
    let isCW = poly.isClockwise();
    if (reverse || poly.parent) isCW = !isCW;
    let oldpts = poly.points.slice();
    let lastpt = oldpts[oldpts.length - 1];
    let lastsl = lastpt.slopeTo(oldpts[0]).toUnit();
    let length = oldpts.length + (open ? 0 : 1);
    let newpts = [ ];
    for (let i=0; i<length; i++) {
        let nextpt = oldpts[i % oldpts.length];
        let nextsl = lastpt.slopeTo(nextpt).toUnit();
        let adiff = lastsl.angleDiff(nextsl, true);
        let bdiff = ((adiff < 0 ? (180 - adiff) : (180 + adiff)) / 2) + 180;
        if (!open || (i > 1 && i < length)) {
            if (isCW && adiff > 45) {
                let newa = base.newSlopeFromAngle(lastsl.angle + bdiff);
                newpts.push(lastpt.projectOnSlope(newa, dist));
                newpts.push(lastpt.clone());
            } else if (!isCW && adiff < -45) {
                let newa = base.newSlopeFromAngle(lastsl.angle - bdiff);
                newpts.push(lastpt.projectOnSlope(newa, dist));
                newpts.push(lastpt.clone());
            }
        }
        lastsl = nextsl;
        lastpt = nextpt;
        if (i < oldpts.length) {
            newpts.push(nextpt);
        }
    }
    poly.points = newpts;
    if (poly.inner) {
        CAM.addDogbones(poly.inner, dist, true);
    }
};

CAM.traces = async function(settings, widget, single) {
    if (widget.traces && widget.trace_single === single) {
        // do no work if cached
        return false;
    }
    let slicer = new kiri.cam_slicer(widget);
    let zees = Object.assign({}, slicer.zFlat, slicer.zLine);
    let indices = [...new Set(Object.keys(zees)
            .map(kv => parseFloat(kv).round(5))
            .appendAll(Object.entries(single ? slicer.zLine : {}).map(ze => {
                let [ zk, zv ] = ze;
                return zv > 1 ? parseFloat(zk).round(5) : null;
            })
            .filter(v => v !== null))
        )]
        .sort((a,b) => b - a);
    let traces = [];
    // find and trim polys (including open) to shadow
    let oneach = data => {
        if (single) {
            for (let line of data.lines) {
                if (line.p1.distTo2D(line.p2) > 1) {
                    traces.push(newPolygon().append(line.p1).append(line.p2).setOpen());
                }
            }
        } else
        base.polygons.flatten(data.tops).forEach(poly => {
            poly.inner = null;
            poly.parent = null;
            let z = poly.getZ();
            for (let i=0, il=traces.length; i<il; i++) {
                let trace = traces[i];
                let dz = Math.abs(z - trace.getZ());
                // only compare polys farther apart in Z
                if (dz > 0.01) {
                    continue;
                }
                // do not add duplicates
                if (traces[i].isEquivalent(poly) && dz < 0.1) {
                    // console.log({ dup: poly });
                    return;
                }
            }
            traces.push(poly);
        });
    };
    let opts = { each: oneach, over: false, flatoff: 0, edges: true, openok: true, lines: true };
    await slicer.slice(indices, opts);
    // pick up bottom features
    opts.over = true;
    await slicer.slice(indices, opts);
    widget.traces = traces;
    widget.trace_single = single;
    return true;
};

function cutTabs(tabs, offset, z, inter) {
    tabs = tabs.filter(tab => z < tab.pos.z + tab.dim.z/2).map(tab => tab.off).flat();
    return cutPolys(tabs, offset, z, false);
}

function cutPolys(polys, offset, z, inter) {
    let noff = [];
    offset.forEach(op => noff.appendAll( op.cut(POLY.union(polys, 0, true), inter) ));
    return healPolys(noff);
}

function healPolys(noff) {
    if (noff.length > 1) {
        let heal = 0;
        // heal/rejoin open segments that share endpoints
        outer: for(;; heal++) {
            let ntmp = noff, tlen = ntmp.length;
            for (let i=0; i<tlen; i++) {
                let s1 = ntmp[i];
                if (!s1) continue;
                for (let j=i+1; j<tlen; j++) {
                    let s2 = ntmp[j];
                    if (!s2) continue;
                    // require polys at same Z to heal
                    if (Math.abs(s1.getZ() - s2.getZ()) > 0.01) {
                        continue;
                    }
                    if (!(s1.open && s2.open)) continue;
                    if (s1.last().isMergable2D(s2.first())) {
                        s1.addPoints(s2.points.slice(1));
                        ntmp[j] = null;
                        continue outer;
                    }
                    if (s2.last().isMergable2D(s1.first())) {
                        s2.addPoints(s1.points.slice(1));
                        ntmp[i] = null;
                        continue outer;
                    }
                    if (s1.first().isMergable2D(s2.first())) {
                        s1.reverse();
                        s1.addPoints(s2.points.slice(1));
                        ntmp[j] = null;
                        continue outer;
                    }
                    if (s1.last().isMergable2D(s2.last())) {
                        s2.reverse();
                        s1.addPoints(s2.points.slice(1));
                        ntmp[j] = null;
                        continue outer;
                    }
                }
            }
            break;
        }
        if (heal > 0) {
            // cull nulls
            noff = noff.filter(o => o);
        }
        // close poly if head meets tail
        for (let poly of noff) {
            if (poly.open && poly.first().isMergable2D(poly.last())) {
                poly.points.pop();
                poly.open = false;
            }
        }
    }
    return noff;
}

});
