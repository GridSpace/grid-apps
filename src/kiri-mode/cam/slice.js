/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.line
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
const { polygons, newLine, newPoint, newPolygon } = base;
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
        sliceAll = widget.slices = [],
        camOps = widget.camops = [],
        isIndexed = proc.camStockIndexed;

    let stock, bounds, track,
        camZTop, camZBottom, camZThru, wztop, ztOff, zbOff,
        zBottom, zMin, zMax, zThru, zTop,
        minToolDiam, maxToolDiam, dark, color, tabs, unsafe, units,
        axisRotation, axisIndex,
        part_size,
        bottom_gap, bottom_part, bottom_stock, bottom_thru, bottom_z, bottom_cut,
        top_stock, top_part, top_gap, top_z,
        workarea;

    // allow recomputing later if widget or settings changes
    const var_compute = () => {
        let { camStockX, camStockY, camStockZ, camStockOffset } = proc;
        bounds = widget.getBoundingBox();
        stock = camStockOffset ? {
            x: bounds.dim.x + camStockX,
            y: bounds.dim.y + camStockY,
            z: bounds.dim.z + camStockZ,
        } : {
            x: camStockX,
            y: camStockY,
            z: camStockZ
        }
        track = widget.track;
        ({ camZTop, camZBottom, camZThru } = proc);
        wztop = track.top;
        ztOff = isIndexed ? (stock.z - bounds.dim.z) / 2 : (stock.z - wztop);
        zbOff = isIndexed ? (stock.z - bounds.dim.z) / 2 : (wztop - track.box.d);
        zBottom = isIndexed ? camZBottom : camZBottom - zbOff;
        zMin = isIndexed ? bounds.min.z : Math.max(bounds.min.z, zBottom);
        zMax = bounds.max.z;
        zThru = camZThru;
        zTop = zMax + ztOff;
        minToolDiam = Infinity;
        maxToolDiam = -Infinity;
        dark = !!settings.controller.dark;
        color = dark ? 0xbbbbbb : 0;
        tabs = widget.anno.tab;
        unsafe = proc.camExpertFast;
        units = settings.controller.units === 'in' ? 25.4 : 1;
        axisRotation = axisIndex = undefined;
        part_size = bounds.dim;
        bottom_gap = zbOff;
        bottom_part = 0;
        bottom_stock = -bottom_gap;
        bottom_thru = zThru;
        bottom_z = isIndexed ? zBottom : Math.max(
            (camZBottom ? bottom_stock + camZBottom : bottom_part) - bottom_thru,
            (camZBottom ? bottom_stock + camZBottom : bottom_stock - bottom_thru)
        );
        bottom_cut = Math.max(bottom_z, -zThru);
        top_stock = zTop;
        top_part = zMax;
        top_gap = ztOff;
        top_z = camZTop ? bottom_stock + camZTop : top_stock;
        workarea = util.round({
            top_stock, top_part, top_gap, top_z,
            bottom_stock, bottom_part, bottom_gap,
            bottom_z, bottom_cut
        }, 3);

        return structuredClone(workarea);
    };

    // initial setup
    var_compute();

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

    if (stock.x === 0 || stock.y === 0 || stock.z === 0) {
        return error("one or more stock dimensions is zero<br>offset stock or set to non zero value");
    }

    if (stock.x && stock.y && stock.z && !isIndexed) {
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
    let opList = [];
    let opSum = 0;
    let opTot = 0;
    let shadows = {};
    let slicer;
    let state = {
        settings,
        widget,
        bounds,
        tabs,
        cutTabs,
        cutPolys,
        contourPolys,
        healPolys,
        shadowAt,
        slicer,
        addSlices,
        isIndexed,
        setAxisIndex,
        updateToolDiams,
        updateSlicer,
        computeShadows,
        zBottom,
        zThru,
        ztOff,
        zMax,
        zTop,
        unsafe,
        color,
        dark,
        ops: opList
    };
    let tracker = setSliceTracker({ rotation: 0 });

    function updateSlicer() {
        slicer = state.slicer = new kiri.cam_slicer(widget);
    }

    async function computeShadows() {
        shadows = {};
        await new CAM.OPS.shadow(state, { type: "shadow", silent: true }).slice(progress => {
            // console.log('reshadow', progress.round(3));
        });
    }

    function updateToolDiams(toolDiam) {
        minToolDiam = Math.min(minToolDiam, toolDiam);
        maxToolDiam = Math.max(maxToolDiam, toolDiam);
    }

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

    if (false) {
        opList.push(new CAM.OPS.xray(state, { type: "xray" }));
    }

    let activeOps = proc.ops.filter(op => !op.disabled);

    // silently preface op list with OpShadow
    if (isIndexed) {
        if (activeOps.length === 0 || activeOps[0].type !== 'index')
        opList.push(new CAM.OPS.index(state, { type: "index", index: 0 }));
    } else {
        opList.push(new CAM.OPS.shadow(state, { type: "shadow", silent: true }));
    }

    // determing # of steps and step weighting for progress bar
    for (let op of activeOps) {
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

    // call slice() function on all ops in order
    setAxisIndex();
    updateSlicer();
    for (let op of opList) {
        let weight = op.weight();
        // apply operation override vars
        let workover = var_compute();
        let valz = op.op;
        if (valz.ov_topz) {
            workover.top_z = isIndexed ? valz.ov_topz : bottom_stock + valz.ov_topz;
        }
        if (valz.ov_botz) {
            workover.bottom_z = isIndexed ? valz.ov_botz : bottom_stock + valz.ov_botz;
            workover.bottom_cut = Math.max(workover.bottom_z, -zThru);
        }
        // state.workarea = workover;
        Object.assign(state, {
            zBottom,
            zThru,
            ztOff,
            zMax,
            zTop,
            workarea: workover
        });
        // console.log({
        //     op,
        //     workover,
        //     bounds: structuredClone(bounds),
        //     stock: structuredClone(stock)
        // });
        await op.slice((progress, message) => {
            onupdate((opSum + (progress * weight)) / opTot, message || op.type());
        });
        // update tracker rotation for next slice output() visualization
        tracker.rotation = isIndexed ? axisRotation : 0;
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
    if (widget.traces) {
        return false;
    }

    // --- points → line segments ---
    let edges = new THREE.EdgesGeometry(widget.mesh.geometry, settings.controller.edgeangle ?? 20);
    let array = edges.attributes.position.array;
    let pcache = {};
    let points = new Array(2);
    let lines = new Array(points.length / 2);
    for (let i=0, j=0, k=0, l=array.length; i<l; ) {
        let ps = [ array[i++], array[i++], array[i++] ];
        let key = ps.map(v => (v * 10000) | 0).join(',');
        let point = pcache[key];
        if (!point) {
            point = newPoint(ps[0], ps[1], ps[2], key);
            point.lines = [];
            pcache[key] = point;
        }
        points[j++ % 2] = point;
        if (j % 2 === 0) {
            let [ p0, p1 ] = points;
            let line = lines[k++] = newLine(p0, p1);
            p0.lines.push(line);
            p1.lines.push(line);
        }
    }

    // --- segments → chains (bidirectional walk) ---
    let chains = [];
    {
        const segs = lines.slice();        // shallow copy
        segs.forEach(s => (s.visited = false));

        function step(dirPoint, prevSeg, pushFront, chain) {
            let curr = dirPoint;
            let prev = prevSeg;

            while (curr.lines.length === 2) {           // stay inside the arc
                const next = curr.lines.find(l => !l.visited && l !== prev);
                if (!next) break;                       // should not happen

                next.visited = true;
                if (pushFront) chain.unshift(next);     // prepend or append?
                else chain.push(next);

                curr = next.p1 === curr ? next.p2 : next.p1;
                prev = next;
            }
        }

        for (const seed of segs) {
            if (seed.visited) continue;

            seed.visited = true;        // always include the seed
            const chain = [seed];

            // grow backwards from p1  (prepend)
            step(seed.p1, seed, true, chain);

            // grow forwards  from p2  (append)
            step(seed.p2, seed, false, chain);

            chains.push(chain);
        }
    }

    // --- chains → polylines ---
    const polylines = [];

    for (const chain of chains) {
        const poly = newPolygon().setOpen();

        // choose any node whose degree !== 2; if none, it’s a closed loop
        let start = null;
        for (const s of chain) {
            if (s.p1.lines.length !== 2) { start = s.p1; break; }
            if (s.p2.lines.length !== 2) { start = s.p2; break; }
        }
        if (!start) start = chain[0].p1;          // closed loop

        let curr = start, prevSeg = null;
        poly.push(curr);                          // first point

        while (true) {
            const nextSeg = curr.lines.find(
                l => l !== prevSeg && chain.includes(l)
            );
            if (!nextSeg) break;                  // open end reached

            curr = nextSeg.p1 === curr ? nextSeg.p2 : nextSeg.p1;
            poly.push(curr);                      // << push *before* test
            if (curr === start) break;            // loop closed

            prevSeg = nextSeg;
        }
        polylines.push(poly);
    }

    widget.traces = polylines;

    return true;
};

/**
 * Generate a list of holes in the model based on the given diameter.
 *
 * @param {Object} settings - settings object
 * @param {Object} widget - widget object
 * @param {boolean} individual - if true, drill holes individually
 * @param {Object} rec - DrillOp record
 * @param {Function} onProgress - callback function to report progress
 * @returns {Array} list of hole centers as objects with `x`, `y`, `z`, `depth`, and `selected` properties.
 */
CAM.holes = async function(settings, widget, individual, rec,onProgress) {

    let {tool,mark,precision} = rec //TODO: display some visual difference if mark is selected
    let toolDiam = new CAM.Tool(settings,tool).fluteDiameter()
    let diam = individual ? 1 : toolDiam; // sets default diameter when select individual used

    let proc = settings.process,
        stock = settings.stock || {},
        isIndexed = proc.camStockIndexed,
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
        zBottom = isIndexed ? camZBottom : camZBottom - zbOff;


    let slicerOpts = {flatoff: 0.001}
    let slicer = new kiri.cam_slicer(widget,slicerOpts);
    let zFlats = Object.keys(slicer.zFlat).map(Number).map(z=>[z,z-0.002]).flat()

    precision = Math.max( 0, precision )
    let intervals = (precision == 0) ? [] : slicer.interval(
        precision,
        { 
            fit: false, off: -0.01, flats: true
        }
    )

    let zees = [...zFlats,...intervals]
    let indices = [...new Set(zees
        .map(kv => parseFloat(kv).round(5))
        .filter(z => z !== null)
    )]
    let centerDiff = diam * 0.1,
        area = (diam/2) * (diam/2) * Math.PI,
        circles = [],
        slices = [];

    function onEach(slice) {
        slices.push(slice);
    }
    let opts = { each: onEach, progress: (num,total)=> onProgress(num/total*0.5,"slice") };
    await slicer.slice(indices, opts);
    let shadowedDrills = false;
    // console.log("slices",slices)
    for (let [i,slice] of slices.entries()) {
        for(let top of slice.tops){
            // console.log("slicing",slice.z,top)
            slice.shadow = CAM.shadowAt(widget, slice.z, 0)
            let inner = top.inner;
            if (!inner) { //no holes
                continue;
            }
            for (let poly of inner) {
                if ( poly.points.length < 7 ) continue;
                let center = poly.calcCircleCenter();
                center.area = poly.area();
                center.overlapping = [center]
                center.depth = 0;
                // console.log("center",center)
                if ( poly.circularity() < 0.985 ){
                    // if not circular, don't add to holes
                    continue;
                }
                if (center.isInPolygon(slice.shadow)) {
                    // if shadowed, don't add, and inform client
                    shadowedDrills = true;
                    continue;
                }
                let overlap = false;
                for (let [i,circle] of circles.entries()) {
                    let dist = circle.distTo2D(center)

                    // //if on the same xy point, 
                    if (dist <= centerDiff ) {
                        // console.log("overlap",center,circle);
                        circle.overlapping.push(center);
                        // if overlapping, don't add and continue
                        overlap = true;
                        continue;
                    }
                }
                if (!overlap) circles.push(center);
            }
        }
        onProgress(0.5+(i/slices.length*0.25),"recognize circles")
    }

    let drills = []

    for (let [i,c] of circles.entries()) {
        let overlapping = c.overlapping

        let last = overlapping.shift();
        while (overlapping.length) {
            let circ = overlapping.shift();
            let aveArea = (circ.area + last.area) / 2;
            let areaDelta = Math.abs(circ.area -last.area)
            if (areaDelta < aveArea * 0.05){ // if area delta less than 5% of average area
              //keep top circle selected
              last.depth = last.z - circ.z;
            }else{ // if not the same area
              //push and move on
              drills.push(last);
              last = circ;
            }
        }
        if (last.depth != 0) drills.push(last) //add last circle
        onProgress(0.75+(i/circles.length*0.25),"assemble holes")
    }
    drills.forEach( h=>{
        if(rec.fromTop){
            // set z top if selected
            h.depth += wztop - h.z
            h.z = wztop
        }
        delete h.overlapping //for encoding
        h.diam = toolDiam // for mesh generation
        h.selected = (!individual && Math.abs(h.area - area) <= area * 0.05 ); //for same size selection
    }) 

    // console.log("unfiltered circles",circles)
    // console.log("drills",drills)
    drills = drills.filter(drill => drill.depth > 0)
    widget.shadowedDrills = shadowedDrills
    widget.drills = drills;
    return drills;
}

function cutTabs(tabs, offset, z, inter) {
    tabs = tabs.filter(tab => z < tab.pos.z + tab.dim.z/2).map(tab => tab.off).flat();
    return cutPolys(tabs, offset, z, false);
}

function cutPolys(polys, offset, z, inter) {
    let noff = [];
    offset.forEach(op => noff.appendAll( op.cut(POLY.union(polys, 0, true), inter) ));
    return healPolys(noff);
}

function contourPolys(widget, polys) {
    const raycaster = new THREE.Raycaster();
    raycaster.ray.direction.set(0, 0, -1);  // ray pointing down Z
    for (let poly of polys) {
        for (let point of poly.points) {
            raycaster.ray.origin.set(point.x, point.y, 10000);
            const intersects = raycaster.intersectObject(widget.mesh, false);
            const firstHit = intersects[0] || null;
            point.z = firstHit.point.z;
        }
    }
}

function healPolys(noff) {
    for (let p of noff) {
        if (p.appearsClosed()) {
            p.points.pop();
            p.setClosed();
        }
    }
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
