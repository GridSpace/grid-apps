/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.point
// dep: geo.polygons
// dep: kiri.slice
// dep: kiri-mode.cam.driver
// use: kiri-mode.cam.slicer
// use: kiri-mode.cam.slicer2
// use: kiri-mode.cam.ops
gapp.register("kiri-mode.cam.slice", [], (root, exports) => {

const { base, kiri } = root;
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
    let mesh = widget.mesh,
        proc = settings.process,
        stock = settings.stock || {},
        hasStock = stock.x && stock.y && stock.z && proc.camStockOn,
        isIndexed = hasStock && proc.camStockIndexed,
        camOps = widget.camops = [],
        sliceAll = widget.slices = [],
        bounds = widget.getBoundingBox(),
        track = widget.track,
        // widget top z as defined by setTopz()
        wztop = track.top,
        // distance between top of part and top of stock
        ztOff = isIndexed ? 0 : (hasStock ? stock.z - wztop : 0),
        // distance between bottom of part and bottom of stock
        zbOff = isIndexed ? 0 : (hasStock ? wztop - track.box.d : 0),
        // defined z bottom offset by distance to stock bottom
        // keeps the z bottom relative to the part when z align changes
        zBottom = isIndexed ? proc.camZBottom : proc.camZBottom - zbOff,
        // greater of widget bottom and z bottom
        zMin = isIndexed ? bounds.min.z : Math.max(bounds.min.z, zBottom),
        zMax = bounds.max.z,
        zThru = proc.camZBottom ? 0 : (proc.camZThru || 0),
        zTop = zMax + ztOff,
        minToolDiam = Infinity,
        maxToolDiam = -Infinity,
        dark = settings.controller.dark ? true : false,
        color = dark ? 0xbbbbbb : 0,
        tabs = widget.anno.tab,
        unsafe = proc.camExpertFast,
        units = settings.controller.units === 'in' ? 25.4 : 1,
        axisRotation,
        axisIndex;

    if (tabs) {
        // make tab polygons
        tabs.forEach(tab => {
            let zero = newPoint(0,0,0);
            let point = newPoint(tab.pos.x, tab.pos.y, tab.pos.z);
            let poly = newPolygon().centerRectangle(zero, tab.dim.x, tab.dim.y);
            let tslice = newSlice(0);
            let m4 = new THREE.Matrix4().makeRotationFromQuaternion(
                new THREE.Quaternion(tab.rot._x, tab.rot._y, tab.rot._z, tab.rot._w)
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

    if (unsafe) {
        console.log("disabling overhang safeties");
    }

    if (!proc.ops || proc.ops.length === 0) {
        throw 'no processes specified';
    }

    if (stock.x && stock.y && stock.z) {
        if (stock.x + 0.00001 < bounds.max.x - bounds.min.x) {
            throw 'stock X too small for part. disable stock or use offset stock';
        }

        if (stock.y + 0.00001 < bounds.max.y - bounds.min.y) {
            throw 'stock Y too small for part. disable stock or use offset stock';
        }

        if (stock.z + 0.00001 < bounds.max.z - bounds.min.z) {
            throw 'stock Z too small for part. disable stock or use offset stock';
        }
    }

    if (zMin >= bounds.max.z) {
        throw `invalid z bottom ${(zMin/units).round(3)} >= bounds z max ${(zMax/units).round(3)}`;
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

    function addSlices(slices) {
        if (!Array.isArray(slices)) {
            slices = [ slices ];
        }
        sliceAll.appendAll(slices);
        if (isIndexed && axisIndex !== undefined) {
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
        dark
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
    setAxisIndex();
    for (let op of opList) {
        let weight = op.weight();
        await op.slice((progress, message) => {
            onupdate((opSum + (progress * weight)) / opTot, message || op.type());
        });
        tracker.rotation = isIndexed ? axisRotation : 0;
        // setup new state when indexing the workspace
        if (true && op.op.type === "index") {
            // let points = base.verticesToPoints();
            state.slicer = new kiri.cam_slicer(widget);
            shadows = {};
            new CAM.OPS.shadow(state, { type: "shadow", silent: true }).slice(progress => {
                // console.log('reshadow', progress.round(3));
            });
            widget.topo = undefined;
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
    let allpoly = POLY.union([...state.shadowTop.tops, ...tabpoly, ...state.shadowTop.slice.shadow], 0, true);
    let shadowOff = maxToolDiam < 0 ? allpoly :
        POLY.offset(allpoly, [minToolDiam/2,maxToolDiam/2], { count: 2, flat: true });
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
    if (poly.open) return;
    let isCW = poly.isClockwise();
    if (reverse || poly.parent) isCW = !isCW;
    let oldpts = poly.points.slice();
    let lastpt = oldpts[oldpts.length - 1];
    let lastsl = lastpt.slopeTo(oldpts[0]).toUnit();
    let newpts = [ ];
    for (let i=0; i<oldpts.length + 1; i++) {
        let nextpt = oldpts[i % oldpts.length];
        let nextsl = lastpt.slopeTo(nextpt).toUnit();
        let adiff = lastsl.angleDiff(nextsl, true);
        let bdiff = ((adiff < 0 ? (180 - adiff) : (180 + adiff)) / 2) + 180;
        if (isCW && adiff > 45) {
            let newa = base.newSlopeFromAngle(lastsl.angle + bdiff);
            newpts.push(lastpt.projectOnSlope(newa, dist));
            newpts.push(lastpt.clone());
        } else if (!isCW && adiff < -45) {
            let newa = base.newSlopeFromAngle(lastsl.angle - bdiff);
            newpts.push(lastpt.projectOnSlope(newa, dist));
            newpts.push(lastpt.clone());
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
    let indices = [...new Set(Object.keys(slicer.zFlat)
        .map(kv => parseFloat(kv).round(5))
        // .appendAll(Object.entries(slicer.zLine).map(ze => {
        //     let [ zk, zv ] = ze;
        //     return zv > 1 ? parseFloat(zk).round(5) : null;
        // })
        // .filter(v => v !== null))
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
        base.polygons.flatten(data.tops,null,true).forEach(poly => {
            poly.inner = null;
            poly.parent = null;
            let z = poly.getZ();
            for (let i=0, il=traces.length; i<il; i++) {
                let trace = traces[i];
                let dz = Math.abs(z - trace.getZ());
                // only compare polys farther apart in Z
                if (dz < 0.01) {
                    continue;
                }
                // do not add duplicates
                if (traces[i].isEquivalent(poly) && dz < 0.1) {
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
