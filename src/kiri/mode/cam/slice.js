/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CAM } from './driver-be.js';
import { newLine } from '../../../geo/line.js';
import { newPoint } from '../../../geo/point.js';
import { newPolygon } from '../../../geo/polygon.js';
import { ops as OPS } from './ops.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { setSliceTracker } from '../../core/slice.js';
import { Slicer as cam_slicer } from './slicer_cam.js';
import { Tool } from './tool.js';
import { util } from '../../../geo/base.js';

/**
 * DRIVER SLICE CONTRACT
 *
 * @param {Object} settings
 * @param {Widget} widget
 * @param {Function} output
 */
export async function cam_slice(settings, widget, onupdate, ondone) {
    if (widget.track.synth) return ondone();

    // get tab widgets
    let tabW = widget.group.filter(w => w != widget);

    // merge overlapping tabs
    for (let i=0; i<tabW.length; i++) {
        for (let j=i+1; j<tabW.length; j++) {
            let t1 = tabW[i];
            let t2 = tabW[j];
            let b1 = t1.mesh.getBoundingBox();
            let b2 = t2.mesh.getBoundingBox();
            if (b1.intersectsBox(b2)) {
                let a = t1.getVertices().array;
                let b = t2.getVertices().array;
                let arr = new Float32Array(a.length + b.length);
                arr.set(a, 0);
                arr.set(b, a.length);
                t1.loadVertices(arr);
                t2.del = true;
            }
        }
    }
    // filter merged tabs
    tabW = tabW.filter(tw => !tw.del);

    let proc = settings.process,
        camOps = widget.camops = [],
        sliceAll = widget.slices = [],
        isIndexed = proc.camStockIndexed;

    let axisRotation, axisIndex,
        bounds, dark, color, stock, tabs, track, tool, unsafe, units, workarea,
        camZTop, camZBottom, camZThru, minToolDiam, maxToolDiam,
        bottom_gap, bottom_part, bottom_stock, bottom_z,
        top_stock, top_part, top_gap, top_z,
        zBottom, zMin, zMax, zTop,
        ztOff, zbOff, wztop;

    axisRotation = axisIndex = undefined;
    dark = settings.controller.dark;
    color = dark ? 0xbbbbbb : 0;
    minToolDiam = Infinity;
    maxToolDiam = -Infinity;
    tabs = widget.anno.tab ?? [];
    unsafe = proc.camExpertFast;
    units = settings.controller.units === 'in' ? 25.4 : 1;

    // allow recomputing later if widget or settings changes
    const var_compute = () => {
        let { camStockX, camStockY, camStockZ, camStockOffset } = proc;
        ({ camZTop, camZBottom, camZThru } = proc);
        bounds = widget.getBoundingBox();
        let pos = widget.track.pos;
        stock = camStockOffset ? {
            x: bounds.dim.x + camStockX,
            y: bounds.dim.y + camStockY,
            z: bounds.dim.z + camStockZ,
            center: newPoint(pos.x, pos.y, pos.z)
        } : {
            x: camStockX,
            y: camStockY,
            z: camStockZ,
            center: newPoint(pos.x, pos.y, pos.z)
        };
        if (!camStockOffset && axisIndex && isIndexed) {
            if (axisIndex === 0 || axisIndex === 180) {
                // do nothing
            } else if (axisIndex === 90 || axisIndex === 270) {
                // swap YZ
                let tmp = stock.y;
                stock.y = stock.z;
                stock.z = tmp;
                stock.center = newPoint(pos.x, pos.z, pos.y);
            } else {
                // compute YZ hypotenuse
                let p = new THREE.Vector2(stock.y, stock.z);
                let center = new THREE.Vector2(0, 0);
                p.rotateAround(center, axisRotation);
                stock.y = p.y;
                stock.z = p.z;
            }
        }
        track = widget.track;
        wztop = track.top;
        ztOff = isIndexed ? (stock.z - bounds.dim.z) / 2 : (stock.z - wztop);
        zbOff = isIndexed ? (stock.z - bounds.dim.z) / 2 : (wztop - track.box.d);
        zBottom = isIndexed ? camZBottom : camZBottom - zbOff;
        zMin = isIndexed ? bounds.min.z : Math.max(bounds.min.z, zBottom);
        zMax = bounds.max.z;
        zTop = zMax + ztOff;
        bottom_gap = zbOff;
        bottom_part = 0;
        bottom_stock = -bottom_gap;
        bottom_z = isIndexed ? zBottom : Math.max(
            (camZBottom ? bottom_stock + camZBottom : bottom_part),
            (camZBottom ? bottom_stock + camZBottom : bottom_stock)
        );
        top_stock = zTop;
        top_part = zMax;
        top_gap = ztOff;
        top_z = camZTop ? bottom_stock + camZTop : top_stock;
        workarea = util.round({
            top_stock, top_part, top_gap, top_z,
            bottom_stock, bottom_part, bottom_gap, bottom_z,
        }, 3);

        // console.log({ bounds, stock, track, workarea });

        return structuredClone(workarea);
    };

    // initial setup
    var_compute();

    function error(msg) {
        ondone(msg);
    }

    function alert(msg) {
        onupdate(null,null,msg);
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
        let maxDelta = 1e-3;

        if (stock.x + maxDelta < (bounds.max.x - bounds.min.x)) {
            alert('stock X too small for part');
        }

        if (stock.y + maxDelta < (bounds.max.y - bounds.min.y)) {
            alert('stock Y too small for part');
        }

        if (stock.z + maxDelta < (bounds.max.z - bounds.min.z)) {
            alert('stock Z too small for part');
        }
    }

    if (zMin >= bounds.max.z) {
        alert(`invalid z bottom ${(zMin / units).round(3)} >= bounds z max ${(zMax / units).round(3)}`);
    }

    let opList = [];
    let opSum = 0;
    let opTot = 0;
    let slicer;
    let state = {
        addSlices,
        bounds,
        color,
        computeShadows,
        contourPolys,
        cutTabs,
        dark,
        isIndexed,
        newSlicer,
        ops: opList,
        setAxisIndex,
        setToolDiam,
        settings,
        shadowAt(z) { return widget.shadowAt(z) },
        slicer,
        stock,
        tabs,
        tool,
        unsafe,
        updateSlicer,
        updateToolDiams,
        widget,
        zBottom,
        zMax,
        ztOff,
        zTop
    };
    let tracker = setSliceTracker({ rotation: 0 });

    async function updateTab(tab) {
        tab.setAxisIndex(isIndexed ? -axisIndex : 0)
        let ts = new cam_slicer(tab);
        let si = Object.keys(ts.zList).map(k => parseFloat(k));
        si = [ ...si.map(v => v-0.01), ...si.map(v => v+0.01) ];
        let zt = Math.max(...si);
        let zb = Math.min(...si);
        let shadow;
        await ts.slice(si, { each: data => {
            if (shadow) {
                shadow = POLY.union([...shadow, ...data.polys]);
            } else {
                shadow = data.polys;
            }
        }});
        return {
            top: zt,
            poly: shadow[0],
            pos: { z: (zt+zb)/2 },
            dim: { z: (zt-zb) },
            NEW: true
        }
    }

    function newSlicer(opts) {
        return new cam_slicer(widget, opts);
    }

    function updateSlicer(opts) {
        return slicer = state.slicer = new cam_slicer(widget, opts);
    }

    async function computeShadows() {
        // console.log('(re)compute shadows');
        await new OPS.shadow(state, { type: "shadow", silent: true }).slice(progress => {
            // console.log('reshadowing', progress.round(3));
        });
    }

    function setToolDiam(toolDiam) {
        updateToolDiams(toolDiam);
        if (tabs) {
            tabs.forEach(tab => {
                tab.off = POLY.expand([ tab.poly ], toolDiam / 2).flat();
            });
        }
    }

    function updateToolDiams(toolDiam) {
        minToolDiam = Math.min(minToolDiam, toolDiam);
        maxToolDiam = Math.max(maxToolDiam, toolDiam);
    }

    async function setAxisIndex(degrees = 0, absolute = true) {
        axisIndex = absolute ? degrees : (axisIndex || 0) + degrees;
        axisRotation = (Math.PI / 180) * axisIndex;
        widget.setAxisIndex(isIndexed ? -axisIndex : 0);
        state.tabs = tabs = [];
        for (let tab of tabW) {
            tabs.push(await updateTab(tab));
        }
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
            slices = [slices];
        }
        sliceAll.appendAll(slices);
        if (addIndexing && axisIndex !== undefined) {
            for (let slice of slices) {
                slice.angle = axisIndex;
            }
            // update slice cam lines to add axis indexing
            for (let slice of slices.filter(s => s.camLines)) {
                addPolyIndexing(slice.camLines, -axisIndex);
            }
        }
    }

    if (false) {
        opList.push(new OPS.xray(state, { type: "xray" }));
    }

    let activeOps = proc.ops.filter(op => !op.disabled);

    if (isIndexed) {
        // preface op list with OpIndex
        if (activeOps.length === 0 || activeOps[0].type !== 'index') {
            opList.push(new OPS.index(state, { type: "index", degrees: 0, absolute: true }));
            opTot += opList.peek().weight();

        }
    } else {
        // preface op list with OpShadow
        opList.push(new OPS.shadow(state, { type: "shadow", silent: true }));
        opTot += opList.peek().weight();
    }

    // determine # of steps and step weighting for progress bar
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
    await setAxisIndex();
    updateSlicer();
    for (let op of opList) {
        let weight = op.weight();
        // apply operation override vars
        let workover = var_compute();
        let valz = op.op;
        let { ov_topz, ov_botz } = valz;
        if (ov_topz) {
            workover.top_z = isIndexed ? ov_topz : bottom_stock + ov_topz;
        }
        if (ov_botz) {
            workover.bottom_z = isIndexed ? ov_botz : bottom_stock + ov_botz;
        }
        if (workover.bottom_z >= workover.top_z) {
            return error("Z Bottom cannot be above or equal to Z Top");
        }
        if (valz.tool) {
            tool = new Tool(settings, valz.tool);
        }
        let { note, type } = op.op;
        let named = note ? note.split(' ').filter(v => v.charAt(0) === '#') : [];
        let layername = named.length ? named : (note ? `${type} (${note})` : type);
        Object.assign(state, {
            layername,
            stock,
            tool,
            zBottom,
            ztOff,
            zMax,
            zTop,
            workarea: workover
        });
        let operr;
        await op.slice((progress, message) => {
            onupdate((opSum + (progress * weight)) / opTot, message || op.type());
        }).catch(e => {
            operr = e;
            console.trace(e);
        });
        if (operr) {
            return error(operr);
        }
        // update tracker rotation for next slice output() visualization
        tracker.rotation = isIndexed ? axisRotation : 0;
        camOps.push(op);
        opSum += weight;
    }
    setSliceTracker();

    // reindex
    sliceAll.forEach((slice, index) => slice.index = index);

    widget.minToolDiam = minToolDiam;
    widget.maxToolDiam = maxToolDiam;

    ondone();
};

export async function traces(settings, widget) {
    if (widget.traces) {
        return false;
    }

    // --- points → line segments ---
    let edges = new THREE.EdgesGeometry(widget.mesh.geometry, settings.controller.edgeangle ?? 20);
    let array = edges.attributes.position.array;
    let pcache = {};
    let points = new Array(2);
    let lines = new Array(points.length / 2);
    for (let i = 0, j = 0, k = 0, l = array.length; i < l;) {
        let ps = [array[i++], array[i++], array[i++]];
        let key = ps.map(v => (v * 10000) | 0).join(',');
        let point = pcache[key];
        if (!point) {
            point = newPoint(ps[0], ps[1], ps[2], key);
            point.lines = [];
            pcache[key] = point;
        }
        points[j++ % 2] = point;
        if (j % 2 === 0) {
            let [p0, p1] = points;
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
}

/**
 * Returns an array of arrays of perpindicular triangles in the mesh.
 * Each sub-array is a list of triangle data that are part of the same
 * cylinder.
 *
 * @param {object} settings - settings object
 * @param {object} widget - widget object
 * @param {object} opts - options object
 * @return {array} - array of arrays of triangle data
 */
export async function cylinders(settings, widget, opts) {
    let { } = opts ?? {};
    let { array: verts } = widget.mesh.geometry.attributes.position;
    let perpTriangles = [];

    //iterate over all triangles
    for (let i = 0; i < verts.length; i += 9) {
        let a = [verts[i], verts[i + 1], verts[i + 2]],
            b = [verts[i + 3], verts[i + 4], verts[i + 5]],
            c = [verts[i + 6], verts[i + 7], verts[i + 8]];

        //calculate normal
        let normal = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2])
            .cross(new THREE.Vector3(b[0] - c[0], b[1] - c[1], b[2] - c[2]))
            .normalize();

        // if perpindicular normal, and at least 2 Zs are the same
        if (normal.z.round(5) == 0 && !(a[2] != b[2] && b[2] != c[2])) {
            let minZ = Math.min(a[2], b[2], c[2]),
                maxZ = Math.max(a[2], b[2], c[2]);
            if (minZ == maxZ) { // all Zs are the same indicated malformed geometry
                continue;
            }
            perpTriangles.push({ ...[a, b, c], normal, minZ, maxZ, i: index });
        }

    }
    //map where zmax, zmin -> triangleData
    let cylinderTriangles = new Map();
    for (let t of perpTriangles) {
        let hash = `${t.minZ.round(5)},${t.maxZ.round(5)}`;
        if (!cylinderTriangles.has(hash)) {
            cylinderTriangles.set(hash, []);
        }
        cylinderTriangles.get(hash).push(t);
    }

    return Array.from(cylinderTriangles.values());
}

/**
 * Find all triangles that are part of the same cylinder as the given triangle
 * @param {Widget} widget - widget object
 * @param {number} face - index of face in triangle vertex data
 * @return {array} - array of all triangle data that belong to the same cylinder
 * @requires surface_prep must be called first
 */
export function cylinder_find (widget, face){
    CAM.surface_prep(widget,false);
    return widget.tool.findCylinderSurface(face);
}

export function cylinder_poly_find(widget, face) {
    let faces = cylinder_find(widget, face);
    let vert = widget.getGeoVertices({ unroll: true, translate: true }).map(v => v.round(4));
    let slicer = new cam_slicer(widget, {});
    let firstOffset = faces[0] * 9;
    let [x1, y1, z1, x2, y2, z2, x3, y3, z3] = Array.from(vert.subarray(firstOffset, firstOffset + 9));
    let zs = [z1, z2, z3].map(z => z.round(5));
    let zmin = Math.min(...zs);
    let zmax = Math.max(...zs);
    let zmid = (zmin + zmax) / 2;
    let cylVerts = new Float32Array(faces.length * 9);
    let opts = {
        dedup: true,
        edges: false,
        over: true
    };

    let i = 0
    //for each cylinder face index
    for (let index of faces) {
        let off = index * 9;
        //copy the 9 triangle vertices floats in
        for (let j = 0; j < 9; j++) {
            cylVerts[i] = vert[off + j];
            i++;
        }
    }

    //slice the poly at the midpoint
    let poly = slicer.sliceZ(zmid, cylVerts, opts)?.polys?.at(0);
    if (!poly) throw "slicing returned no poly";

    let circular = poly.circularity() > 0.98;
    // console.log({ zmid, cylVerts, opts, poly, circularity: poly.circularity() });

    //throw error if not circular
    if (!circular) throw "faces must be circular";

    //calculate circle properties
    let area = poly.area(),
        diam = Math.sqrt(area / Math.PI) * 2,
        center = poly.calcCircleCenter();

    //find direction using normal to center point
    let point = newPoint(x1, y1, z1),
        delta = point.setZ(center.z).sub(center),
        normal = new THREE.Vector3(x1 - x2, y1 - y2, z1 - z2)
            .cross(new THREE.Vector3(x2 - x3, y2 - y3, z2 - z3)),
        dotProd = normal.dot(delta),
        interior = dotProd < 0

    return { faces, zmin, zmax, poly, circular, area, diam, center, interior }
}

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
export async function holes(settings, widget, individual, rec, onProgress) {

    let { tool, precision } = rec //TODO: display some visual difference if mark is selected
    let toolDiam = new Tool(settings, tool).fluteDiameter()
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

    let slicerOpts = { flatoff: 0.001 };
    let slicer = new cam_slicer(widget, slicerOpts);
    let zFlats = Object.keys(slicer.zFlat).map(Number).map(z => [z, z - 0.002]).flat();

    precision = Math.max(0, precision)
    let intervals = (precision == 0) ? [] : slicer.interval(
        precision,
        {
            fit: false, off: -0.01, flats: true
        }
    )

    let zees = [...zFlats, ...intervals];
    let indices = [...new Set(zees
        .map(kv => parseFloat(kv).round(5))
        .filter(z => z !== null)
    )];
    let centerDiff = diam * 0.1,
        area = (diam / 2) * (diam / 2) * Math.PI,
        circles = [],
        slices = [];

    function onEach(slice) {
        slices.push(slice);
    }
    let opts = { each: onEach, progress: (num, total) => onProgress(num / total * 0.5, "slice") };
    await slicer.slice(indices, opts);
    let shadowedDrills = false;

    for (let [i, slice] of slices.entries()) {
        for (let top of slice.tops) {
            // console.log("slicing",slice.z,top)
            slice.shadow = await widget.shadowAt(slice.z);
            let inner = top.inner;
            if (!inner) { //no holes
                continue;
            }
            for (let poly of inner) {
                if (poly.points.length < 7) {
                    continue;
                }
                let center = poly.calcCircleCenter();
                center.area = poly.area();
                center.overlapping = [center];
                center.depth = 0;
                if (poly.circularity() < 0.98) {
                    // if not circular, don't add to holes
                    continue;
                }
                if (center.isInPolygon(slice.shadow)) {
                    // if shadowed, don't add, and inform client
                    shadowedDrills = true;
                    continue;
                }
                let overlap = false;
                for (let [i, circle] of circles.entries()) {
                    let dist = circle.distTo2D(center);
                    // if on the same xy point,
                    if (dist <= centerDiff) {
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
        onProgress(0.5 + (i / slices.length * 0.25), "recognize circles");
    }
    let drills = [];

    for (let [i, c] of circles.entries()) {
        let overlapping = c.overlapping;
        let last = overlapping.shift();
        while (overlapping.length) {
            let circ = overlapping.shift();
            let aveArea = (circ.area + last.area) / 2;
            let areaDelta = Math.abs(circ.area - last.area);
            if (areaDelta < aveArea * 0.05) { // if area delta less than 5% of average area
                //keep top circle selected
                last.depth = last.z - circ.z;
            } else { // if not the same area
                //push and move on
                drills.push(last);
                last = circ;
            }
        }
        if (last.depth != 0) drills.push(last); // add last circle
        onProgress(0.75 + (i / circles.length * 0.25), "assemble holes");
    }
    drills.forEach(h => {
        if (rec.fromTop) {
            // set z top if selected
            h.depth += wztop - h.z;
            h.z = wztop;
        }
        delete h.overlapping; //for encoding
        h.diam = toolDiam; // for mesh generation
        h.selected = (!individual && Math.abs(h.area - area) <= area * 0.05); // for same size selection
    })

    // console.log("unfiltered circles",circles);
    // console.log("drills",drills);

    drills = drills.filter(drill => drill.depth > 0);
    widget.shadowedDrills = shadowedDrills;
    widget.drills = drills;
    return drills;
}

function cutTabs(tabs, offset) {
    let out = [];
    for (let tab of tabs) {
        tab.top = tab.pos.z + tab.dim.z / 2;
    }
    for (let poly of offset) {
        let polyZ = poly.getZ();
        let cut = tabs.filter(tab => tab.top >= polyZ);
        let lo = poly.cut(cut.map(tab => tab.off).flat(), false);
        let hi = [];
        for (let tab of cut) {
            hi.appendAll(POLY.setZ(poly.cut(tab.off, true), tab.top));
        }
        if (hi.length) {
            let heal = POLY.reconnect([ ...lo, ...hi ], false);
            POLY.setWinding(heal, poly.isClockwise());
            out.push(...heal);
        } else {
            out.push(poly);
        }
    }
    return out;
}

function contourPolys(widget, polys) {
    const raycaster = new THREE.Raycaster();
    raycaster.ray.direction.set(0, 0, -1);  // ray pointing down Z
    for (let poly of polys) {
        for (let point of poly.points) {
            raycaster.ray.origin.set(point.x, point.y, 10000);
            const intersects = raycaster.intersectObject(widget.mesh, false);
            const firstHit = intersects[0] || null;
            if (firstHit) point.z = firstHit.point.z;
        }
    }
}
